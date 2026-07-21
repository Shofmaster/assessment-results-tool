import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FiEdit2, FiTrash2, FiCheckCircle, FiFileText } from 'react-icons/fi';
import { Badge, Button, Select } from '../ui';
import {
  ALL_MOD_EDGE_KINDS,
  MOD_EDGE_KIND_LABELS,
  MOD_TYPE_LABELS,
  type AircraftModification,
  type ModEdgeKind,
  type ModificationEdge,
} from '../../types/aircraftModification';
import {
  useAddModificationEdge,
  useRemoveAircraftModification,
  useRemoveModificationEdge,
  useUpdateAircraftModification,
} from '../../hooks/useConvexData';

interface ModDetailPanelProps {
  mod: AircraftModification;
  allMods: AircraftModification[];
  edges: ModificationEdge[];
  /** Convex document rows for the project (to resolve source-document names). */
  documents?: Array<{ _id: string; name: string }>;
  onEdit: () => void;
  onClose: () => void;
}

const EDGE_KIND_BADGE: Record<ModEdgeKind, 'info' | 'destructive' | 'warning' | 'default'> = {
  depends_on: 'info',
  conflicts_with: 'destructive',
  interfaces_with: 'warning',
  shared_system: 'default',
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-white/60 mb-1.5">{children}</p>
  );
}

export function ModDetailPanel({ mod, allMods, edges, documents, onEdit, onClose }: ModDetailPanelProps) {
  const updateMod = useUpdateAircraftModification();
  const removeMod = useRemoveAircraftModification();
  const addEdge = useAddModificationEdge();
  const removeEdge = useRemoveModificationEdge();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newEdgeTarget, setNewEdgeTarget] = useState('');
  const [newEdgeKind, setNewEdgeKind] = useState<ModEdgeKind>('depends_on');
  const [addingEdge, setAddingEdge] = useState(false);

  const touchingEdges = useMemo(
    () => edges.filter((e) => e.fromModId === mod._id || e.toModId === mod._id),
    [edges, mod._id],
  );
  const modTitleById = useMemo(() => new Map(allMods.map((m) => [m._id, m.title])), [allMods]);
  const docNameById = useMemo(
    () => new Map((documents ?? []).map((d) => [d._id, d.name])),
    [documents],
  );
  const otherMods = allMods.filter((m) => m._id !== mod._id);

  const needsReview = (mod.extractionConfidence ?? 1) < 0.7 && !mod.userVerified;
  const wb = mod.weightBalance;
  const hasWb =
    wb && (wb.weightChangeLbs !== undefined || wb.arm !== undefined || wb.momentChange !== undefined || wb.notes);

  const handleAddEdge = async () => {
    if (!newEdgeTarget) return;
    setAddingEdge(true);
    try {
      await addEdge({
        fromModId: mod._id as any,
        toModId: newEdgeTarget as any,
        kind: newEdgeKind,
        source: 'manual',
      });
      setNewEdgeTarget('');
      toast.success('Relationship added');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add relationship');
    } finally {
      setAddingEdge(false);
    }
  };

  const handleDelete = async () => {
    try {
      await removeMod({ modId: mod._id as any });
      toast.success('Modification deleted');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete modification');
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <Badge variant="info" size="sm" pill>
              {MOD_TYPE_LABELS[mod.modType]}
            </Badge>
            {mod.status !== 'installed' && (
              <Badge variant="warning" size="sm" pill>
                {mod.status}
              </Badge>
            )}
            {mod.userVerified && (
              <Badge variant="success" size="sm" pill>
                Verified
              </Badge>
            )}
          </div>
          <h3 className="text-base font-semibold text-white break-words">{mod.title}</h3>
          <p className="text-xs text-white/55 mt-0.5">
            {[mod.approvalRef, mod.holder, mod.dateInstalled && new Date(mod.dateInstalled).toLocaleDateString()]
              .filter(Boolean)
              .join(' · ') || 'No approval reference recorded'}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="ghost" size="sm" icon={<FiEdit2 />} onClick={onEdit} aria-label="Edit modification" />
          <Button
            variant={confirmDelete ? 'destructive' : 'ghost'}
            size="sm"
            icon={<FiTrash2 />}
            onClick={() => (confirmDelete ? handleDelete() : setConfirmDelete(true))}
            onBlur={() => setConfirmDelete(false)}
            aria-label={confirmDelete ? 'Confirm delete' : 'Delete modification'}
          >
            {confirmDelete ? 'Confirm?' : null}
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close details">
            ✕
          </Button>
        </div>
      </div>

      {needsReview && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2">
          <span className="text-xs text-amber-300">
            AI-extracted with low confidence — review the details before relying on them.
          </span>
          <Button
            variant="ghost"
            size="sm"
            icon={<FiCheckCircle />}
            onClick={async () => {
              try {
                await updateMod({ modId: mod._id as any, userVerified: true });
                toast.success('Marked verified');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Failed to update');
              }
            }}
          >
            Mark verified
          </Button>
        </div>
      )}

      {mod.description && <p className="text-sm text-white/75 whitespace-pre-wrap">{mod.description}</p>}

      {(mod.ataChapters?.length || mod.affectedSystems?.length) && (
        <div className="flex flex-wrap gap-1.5">
          {(mod.ataChapters ?? []).map((ata) => (
            <Badge key={`ata-${ata}`} variant="outline" size="sm">
              ATA {ata}
            </Badge>
          ))}
          {(mod.affectedSystems ?? []).map((sys) => (
            <Badge key={`sys-${sys}`} variant="default" size="sm">
              {sys}
            </Badge>
          ))}
        </div>
      )}

      {(mod.icaRequirements?.length ?? 0) > 0 && (
        <div>
          <SectionHeading>ICA requirements</SectionHeading>
          <ul className="space-y-1.5">
            {mod.icaRequirements!.map((ica, i) => (
              <li key={i} className="text-sm text-white/80 flex flex-wrap items-baseline gap-x-2">
                <span>{ica.description}</span>
                {ica.interval && <span className="text-xs text-sky-300">{ica.interval}</span>}
                {ica.reference && <span className="text-xs text-white/45">{ica.reference}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mod.afmSupplement && (mod.afmSupplement.required || mod.afmSupplement.limitations?.length) && (
        <div>
          <SectionHeading>AFM supplement</SectionHeading>
          <p className="text-sm text-white/80">
            {mod.afmSupplement.required ? 'Required' : 'Not required'}
            {mod.afmSupplement.reference ? ` — ${mod.afmSupplement.reference}` : ''}
          </p>
          {(mod.afmSupplement.limitations?.length ?? 0) > 0 && (
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              {mod.afmSupplement.limitations!.map((lim, i) => (
                <li key={i} className="text-sm text-violet-200">
                  {lim}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {hasWb && (
        <div>
          <SectionHeading>Weight &amp; balance</SectionHeading>
          <p className="text-sm text-white/80">
            {[
              wb!.weightChangeLbs !== undefined &&
                `${wb!.weightChangeLbs > 0 ? '+' : ''}${wb!.weightChangeLbs} lbs`,
              wb!.arm !== undefined && `arm ${wb!.arm} in`,
              wb!.momentChange !== undefined && `Δ moment ${wb!.momentChange}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {wb!.notes && <p className="text-xs text-white/55 mt-0.5">{wb!.notes}</p>}
        </div>
      )}

      {(mod.placards?.length ?? 0) > 0 && (
        <div>
          <SectionHeading>Placards</SectionHeading>
          <div className="flex flex-wrap gap-1.5">
            {mod.placards!.map((placard, i) => (
              <span
                key={i}
                className="rounded border border-rose-300/30 bg-rose-500/10 px-2 py-1 text-xs font-mono text-rose-200"
              >
                {placard}
              </span>
            ))}
          </div>
        </div>
      )}

      {mod.electricalLoadNotes && (
        <div>
          <SectionHeading>Electrical load</SectionHeading>
          <p className="text-sm text-white/80">{mod.electricalLoadNotes}</p>
        </div>
      )}

      {(mod.recurringInspections?.length ?? 0) > 0 && (
        <div>
          <SectionHeading>Recurring inspections</SectionHeading>
          <ul className="space-y-1.5">
            {mod.recurringInspections!.map((insp, i) => (
              <li key={i} className="text-sm text-white/80 flex flex-wrap items-baseline gap-x-2">
                <span>{insp.description}</span>
                {insp.interval !== undefined && (
                  <span className="text-xs text-emerald-300">
                    every {insp.interval} {(insp.intervalUnit ?? '').replace('_', ' ')}
                  </span>
                )}
                {insp.reference && <span className="text-xs text-white/45">{insp.reference}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <SectionHeading>Relationships</SectionHeading>
        {touchingEdges.length === 0 && (
          <p className="text-xs text-white/45 mb-2">No relationships recorded.</p>
        )}
        <ul className="space-y-1.5 mb-2">
          {touchingEdges.map((edge) => {
            const outbound = edge.fromModId === mod._id;
            const otherId = outbound ? edge.toModId : edge.fromModId;
            return (
              <li key={edge._id} className="flex items-center gap-2 text-sm text-white/80">
                <Badge variant={EDGE_KIND_BADGE[edge.kind]} size="sm">
                  {outbound
                    ? MOD_EDGE_KIND_LABELS[edge.kind]
                    : `${MOD_EDGE_KIND_LABELS[edge.kind]} (inbound)`}
                </Badge>
                <span className="flex-1 min-w-0 truncate">
                  {modTitleById.get(otherId) ?? 'Unknown modification'}
                  {edge.kind === 'shared_system' && edge.ataChapter ? ` (ATA ${edge.ataChapter})` : ''}
                </span>
                <button
                  type="button"
                  className="text-white/40 hover:text-red-400 transition-colors text-xs"
                  aria-label="Remove relationship"
                  onClick={async () => {
                    try {
                      await removeEdge({ edgeId: edge._id as any });
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : 'Failed to remove relationship');
                    }
                  }}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
        {otherMods.length > 0 && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <Select
                selectSize="sm"
                aria-label="Relationship kind"
                value={newEdgeKind}
                onChange={(e) => setNewEdgeKind(e.target.value as ModEdgeKind)}
              >
                {ALL_MOD_EDGE_KINDS.map((k) => (
                  <option key={k} value={k} className="bg-navy-800">
                    {MOD_EDGE_KIND_LABELS[k]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Select
                selectSize="sm"
                aria-label="Related modification"
                value={newEdgeTarget}
                onChange={(e) => setNewEdgeTarget(e.target.value)}
              >
                <option value="" className="bg-navy-800">
                  Select modification…
                </option>
                {otherMods.map((m) => (
                  <option key={m._id} value={m._id} className="bg-navy-800">
                    {m.title}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" variant="secondary" onClick={handleAddEdge} loading={addingEdge} disabled={!newEdgeTarget}>
              Add
            </Button>
          </div>
        )}
      </div>

      {(mod.sourceDocumentIds?.length ?? 0) > 0 && (
        <div>
          <SectionHeading>Source documents</SectionHeading>
          <ul className="space-y-1">
            {mod.sourceDocumentIds!.map((docId) => (
              <li key={docId} className="flex items-center gap-2 text-sm text-white/70">
                <FiFileText className="shrink-0 text-white/40" />
                {docNameById.get(docId) ?? 'Document no longer in Library'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
