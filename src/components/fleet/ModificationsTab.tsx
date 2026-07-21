import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FiCpu, FiPlus, FiDownload } from 'react-icons/fi';
import { Button, GlassModal, Input, Select, Spinner } from '../ui';
import {
  ALL_MOD_EDGE_KINDS,
  MOD_EDGE_KIND_LABELS,
  type AircraftModification,
  type ModEdgeKind,
  type ModExtractionResult,
  type ModificationEdge,
} from '../../types/aircraftModification';
import {
  useAircraftModifications,
  useDocuments,
  useForm337Records,
  useRemoveModificationEdge,
  useUpdateModificationEdge,
} from '../../hooks/useConvexData';
import { mapForm337RecordsToDrafts } from '../../utils/form337ToModification';
import { ModGraph } from './ModGraph';
import { ModDetailPanel } from './ModDetailPanel';
import { ModEditModal } from './ModEditModal';
import { ModExtractionModal } from './ModExtractionModal';
import { ModRequirementsSummary } from './ModRequirementsSummary';

interface ModificationsTabProps {
  aircraftId: string;
  projectId: string;
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
}

function EdgeEditorModal({
  edge,
  modTitleById,
  onClose,
}: {
  edge: ModificationEdge;
  modTitleById: Map<string, string>;
  onClose: () => void;
}) {
  const updateEdge = useUpdateModificationEdge();
  const removeEdge = useRemoveModificationEdge();
  const [kind, setKind] = useState<ModEdgeKind>(edge.kind);
  const [note, setNote] = useState(edge.note ?? '');
  const [ataChapter, setAtaChapter] = useState(edge.ataChapter ?? '');
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    setBusy(true);
    try {
      await updateEdge({
        edgeId: edge._id as any,
        kind,
        note: note.trim() || null,
        ataChapter: ataChapter.trim() || null,
      });
      toast.success('Relationship updated');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update relationship');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await removeEdge({ edgeId: edge._id as any });
      toast.success('Relationship removed');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove relationship');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassModal
      open
      title="Edit relationship"
      onClose={onClose}
      footer={
        <>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={busy}>
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-white/75">
          <span className="text-white">{modTitleById.get(edge.fromModId) ?? 'Unknown'}</span>
          {' → '}
          <span className="text-white">{modTitleById.get(edge.toModId) ?? 'Unknown'}</span>
        </p>
        <Select label="Kind" selectSize="sm" value={kind} onChange={(e) => setKind(e.target.value as ModEdgeKind)}>
          {ALL_MOD_EDGE_KINDS.map((k) => (
            <option key={k} value={k} className="bg-navy-800">
              {MOD_EDGE_KIND_LABELS[k]}
            </option>
          ))}
        </Select>
        {kind === 'shared_system' && (
          <Input
            label="ATA chapter"
            inputSize="sm"
            value={ataChapter}
            onChange={(e) => setAtaChapter(e.target.value)}
            placeholder="34"
          />
        )}
        <Input
          label="Note"
          inputSize="sm"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why these modifications relate"
        />
      </div>
    </GlassModal>
  );
}

export function ModificationsTab({
  aircraftId,
  projectId,
  tailNumber,
  make,
  model,
  serial,
}: ModificationsTabProps) {
  const data = useAircraftModifications(aircraftId) as
    | { mods: AircraftModification[]; edges: ModificationEdge[] }
    | undefined;
  const documents = useDocuments(projectId) as Array<{ _id: string; name: string }> | undefined;
  const form337Records = useForm337Records(projectId) as
    | Array<{ _id: string; aircraftId?: string; title: string; formData: Record<string, unknown> }>
    | undefined;

  const [selectedModId, setSelectedModId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<AircraftModification | null | 'new'>(null);
  const [extractionOpen, setExtractionOpen] = useState(false);
  const [importPreset, setImportPreset] = useState<ModExtractionResult | null>(null);
  const [editEdgeId, setEditEdgeId] = useState<string | null>(null);

  const mods = data?.mods ?? [];
  const edges = data?.edges ?? [];
  const selectedMod = mods.find((m) => m._id === selectedModId) ?? null;
  const editEdge = edges.find((e) => e._id === editEdgeId) ?? null;
  const modTitleById = useMemo(() => new Map(mods.map((m) => [m._id, m.title])), [mods]);
  const aircraftContext = { tailNumber, make, model, serial };

  const handleImport337 = () => {
    if (!form337Records) return;
    const linkedRecordIds = new Set(
      mods.map((m) => m.form337RecordId).filter((id): id is string => Boolean(id)),
    );
    const { drafts, skippedRepairs, skippedLinked } = mapForm337RecordsToDrafts(form337Records, {
      aircraftId,
      linkedRecordIds,
    });
    if (drafts.length === 0) {
      const detail = [
        skippedLinked && `${skippedLinked} already imported`,
        skippedRepairs && `${skippedRepairs} repair-only`,
      ]
        .filter(Boolean)
        .join(', ');
      toast.info(`No importable 337 alterations found${detail ? ` (${detail})` : ''}.`);
      return;
    }
    setImportPreset({ modifications: drafts, edges: [], warnings: [] });
    setExtractionOpen(true);
  };

  if (data === undefined) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" icon={<FiCpu />} onClick={() => { setImportPreset(null); setExtractionOpen(true); }}>
          Extract from documents
        </Button>
        <Button variant="secondary" size="sm" icon={<FiPlus />} onClick={() => setEditTarget('new')}>
          Add manually
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<FiDownload />}
          onClick={handleImport337}
          disabled={!form337Records?.length}
        >
          Import from 337s
        </Button>
      </div>

      {mods.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center">
          <p className="text-sm text-white/70 mb-1">No modifications recorded for {tailNumber}.</p>
          <p className="text-xs text-white/45">
            Extract from an STC certificate, Form 337, field approval, or AFM supplement in the
            Library — or add one manually — to build this aircraft's modification map.
          </p>
        </div>
      ) : (
        <>
          <ModGraph
            mods={mods}
            edges={edges}
            selectedModId={selectedModId}
            onSelectMod={setSelectedModId}
            onEdgeClick={setEditEdgeId}
          />
          {selectedMod && (
            <ModDetailPanel
              mod={selectedMod}
              allMods={mods}
              edges={edges}
              documents={documents}
              onEdit={() => setEditTarget(selectedMod)}
              onClose={() => setSelectedModId(null)}
            />
          )}
          <ModRequirementsSummary mods={mods} />
        </>
      )}

      <ModEditModal
        open={editTarget !== null}
        aircraftId={aircraftId}
        mod={editTarget === 'new' ? null : editTarget}
        onClose={() => setEditTarget(null)}
      />
      <ModExtractionModal
        open={extractionOpen}
        projectId={projectId}
        aircraftId={aircraftId}
        aircraft={aircraftContext}
        existingMods={mods}
        preset={importPreset}
        onClose={() => {
          setExtractionOpen(false);
          setImportPreset(null);
        }}
      />
      {editEdge && (
        <EdgeEditorModal edge={editEdge} modTitleById={modTitleById} onClose={() => setEditEdgeId(null)} />
      )}
    </div>
  );
}
