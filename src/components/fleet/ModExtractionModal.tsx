import { useEffect, useMemo, useState } from 'react';
import { useConvex } from 'convex/react';
import { toast } from 'sonner';
import { FiFileText, FiExternalLink } from 'react-icons/fi';
import { Badge, Button, GlassModal, Input, Select, Spinner } from '../ui';
import {
  ALL_MOD_TYPES,
  MOD_EDGE_KIND_LABELS,
  MOD_TYPE_LABELS,
  type AircraftModification,
  type ExtractedModification,
  type ModExtractionResult,
  type ModType,
  type ProposedEdgeRef,
} from '../../types/aircraftModification';
import {
  extractModificationsFromDocuments,
  type ExtractionAircraftContext,
} from '../../services/modificationExtraction';
import {
  hasExtractedTextContent,
  resolveExtractedTextForConvexDoc,
} from '../../utils/documentExtractedText';
import { SourceUnavailableError } from '../../services/documentSourceResolver';
import { ClaudeRequestCancelledError } from '../../services/claudeProxy';
import {
  useAddAircraftModifications,
  useDefaultClaudeModel,
  useDocuments,
} from '../../hooks/useConvexData';

interface ModExtractionModalProps {
  open: boolean;
  projectId: string;
  aircraftId: string;
  aircraft: ExtractionAircraftContext;
  existingMods: AircraftModification[];
  /** When set, skip document selection and review these drafts (337 import path). */
  preset?: ModExtractionResult | null;
  onClose: () => void;
}

type Step = 'pick' | 'extracting' | 'review';

export function ModExtractionModal({
  open,
  projectId,
  aircraftId,
  aircraft,
  existingMods,
  preset,
  onClose,
}: ModExtractionModalProps) {
  const convex = useConvex();
  const documents = useDocuments(projectId);
  const model = useDefaultClaudeModel();
  const addBatch = useAddAircraftModifications();

  const [step, setStep] = useState<Step>('pick');
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [docFilter, setDocFilter] = useState('');
  const [result, setResult] = useState<ModExtractionResult | null>(null);
  const [includedMods, setIncludedMods] = useState<boolean[]>([]);
  const [includedEdges, setIncludedEdges] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedDocIds(new Set());
    setDocFilter('');
    setSaving(false);
    if (preset) {
      setResult(preset);
      setIncludedMods(preset.modifications.map((m) => !m.dedupeMatch));
      setIncludedEdges(preset.edges.map(() => true));
      setStep('review');
    } else {
      setResult(null);
      setStep('pick');
    }
  }, [open, preset]);

  const filteredDocs = useMemo(() => {
    const rows = (documents ?? []) as Array<Record<string, any>>;
    const needle = docFilter.trim().toLowerCase();
    return rows.filter((d) => !needle || String(d.name ?? '').toLowerCase().includes(needle));
  }, [documents, docFilter]);

  const existingModById = useMemo(
    () => new Map(existingMods.map((m) => [m._id, m])),
    [existingMods],
  );

  const toggleDoc = (docId: string) =>
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });

  const handleExtract = async () => {
    const rows = ((documents ?? []) as Array<Record<string, any>>).filter((d) =>
      selectedDocIds.has(d._id),
    );
    if (rows.length === 0) return;
    const controller = new AbortController();
    setAbortController(controller);
    setStep('extracting');
    try {
      const docs: Array<{ id: string; name: string; text: string }> = [];
      const unavailable: string[] = [];
      for (const row of rows) {
        try {
          const text = await resolveExtractedTextForConvexDoc(row as any, convex);
          if (text.trim()) docs.push({ id: row._id, name: row.name ?? 'Untitled', text });
          else unavailable.push(row.name ?? 'Untitled');
        } catch (error) {
          if (error instanceof SourceUnavailableError) {
            unavailable.push(row.name ?? 'Untitled');
          } else {
            throw error;
          }
        }
      }
      if (unavailable.length) {
        toast.warning(`Skipped (no readable text): ${unavailable.join(', ')}`);
      }
      if (docs.length === 0) {
        toast.error('None of the selected documents have readable text.');
        setStep('pick');
        return;
      }
      const extraction = await extractModificationsFromDocuments({
        docs,
        aircraft,
        existingMods: existingMods.map((m) => ({
          id: m._id,
          modType: m.modType,
          title: m.title,
          approvalRef: m.approvalRef,
          ataChapters: m.ataChapters,
        })),
        model,
        signal: controller.signal,
      });
      if (extraction.modifications.length === 0) {
        toast.info('No modifications were found in the selected documents.');
        setStep('pick');
        return;
      }
      setResult(extraction);
      setIncludedMods(extraction.modifications.map((m) => !m.dedupeMatch));
      setIncludedEdges(extraction.edges.map(() => true));
      setStep('review');
    } catch (error) {
      if (!(error instanceof ClaudeRequestCancelledError)) {
        toast.error(error instanceof Error ? error.message : 'Extraction failed');
      }
      setStep('pick');
    } finally {
      setAbortController(null);
    }
  };

  const updateDraft = (index: number, patch: Partial<ExtractedModification>) =>
    setResult((r) =>
      r
        ? {
            ...r,
            modifications: r.modifications.map((m, i) => (i === index ? { ...m, ...patch } : m)),
          }
        : r,
    );

  const describeRef = (ref: ProposedEdgeRef): string => {
    if ('newIndex' in ref) {
      return result?.modifications[ref.newIndex]?.title ?? `New #${ref.newIndex + 1}`;
    }
    return existingModById.get(ref.existingModId)?.title ?? 'Existing modification';
  };

  const includedCount = includedMods.filter(Boolean).length;

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      // Remap original draft indices → indices within the included subset.
      const indexMap = new Map<number, number>();
      const modsPayload: Array<Record<string, unknown>> = [];
      result.modifications.forEach((mod, i) => {
        if (!includedMods[i]) return;
        indexMap.set(i, modsPayload.length);
        const { confidence, dedupeMatch: _dedupe, ...fields } = mod;
        modsPayload.push({
          ...fields,
          extractionConfidence: confidence,
          extractionModel: model,
          userVerified: false,
        });
      });
      const edgesPayload: Array<Record<string, unknown>> = [];
      result.edges.forEach((edge, i) => {
        if (!includedEdges[i]) return;
        const from =
          'newIndex' in edge.from
            ? indexMap.has(edge.from.newIndex)
              ? { fromIndex: indexMap.get(edge.from.newIndex) }
              : null
            : { fromModId: edge.from.existingModId };
        const to =
          'newIndex' in edge.to
            ? indexMap.has(edge.to.newIndex)
              ? { toIndex: indexMap.get(edge.to.newIndex) }
              : null
            : { toModId: edge.to.existingModId };
        if (!from || !to) return;
        edgesPayload.push({
          ...from,
          ...to,
          kind: edge.kind,
          ataChapter: edge.ataChapter,
          note: edge.note,
          source: 'ai',
        });
      });
      await addBatch({
        aircraftId: aircraftId as any,
        modifications: modsPayload as any,
        edges: edgesPayload as any,
      });
      toast.success(
        `Saved ${modsPayload.length} modification${modsPayload.length === 1 ? '' : 's'}`,
      );
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save modifications');
    } finally {
      setSaving(false);
    }
  };

  const title =
    step === 'review'
      ? preset
        ? 'Review 337 import'
        : 'Review extracted modifications'
      : 'Extract modifications from documents';

  return (
    <GlassModal
      open={open}
      title={title}
      sizeClassName="max-w-3xl"
      onClose={() => {
        abortController?.abort();
        onClose();
      }}
      footer={
        step === 'pick' ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleExtract} disabled={selectedDocIds.size === 0}>
              Extract from {selectedDocIds.size || ''} document{selectedDocIds.size === 1 ? '' : 's'}
            </Button>
          </>
        ) : step === 'review' ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving} disabled={includedCount === 0}>
              Save {includedCount} modification{includedCount === 1 ? '' : 's'}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              abortController?.abort();
              setStep('pick');
            }}
          >
            Cancel extraction
          </Button>
        )
      }
    >
      {step === 'pick' && (
        <div className="space-y-3">
          <p className="text-xs text-white/55">
            Select STC certificates, Form 337s, field approvals, AFM supplements, or ICA documents
            from this project's Library. Claude will extract structured modification records for
            you to review before anything is saved.
          </p>
          <Input
            inputSize="sm"
            placeholder="Filter documents…"
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value)}
          />
          {documents === undefined ? (
            <div className="flex justify-center py-6">
              <Spinner size="md" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <p className="text-sm text-white/50 py-4 text-center">
              No documents in this project's Library yet — upload the modification paperwork there
              first. <FiExternalLink className="inline" />
            </p>
          ) : (
            <ul className="space-y-1 max-h-64 overflow-y-auto scrollbar-thin pr-1">
              {filteredDocs.map((doc) => {
                const readable = hasExtractedTextContent(doc as any);
                return (
                  <li key={doc._id}>
                    <label
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors ${
                        readable
                          ? 'cursor-pointer hover:bg-white/5 text-white/85'
                          : 'opacity-40 cursor-not-allowed text-white/60'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-sky-400"
                        disabled={!readable}
                        checked={selectedDocIds.has(doc._id)}
                        onChange={() => toggleDoc(doc._id)}
                      />
                      <FiFileText className="shrink-0 text-white/40" />
                      <span className="flex-1 min-w-0 truncate">{doc.name}</span>
                      {doc.category && (
                        <Badge variant="outline" size="sm">
                          {doc.category}
                        </Badge>
                      )}
                      {!readable && <span className="text-[10px] text-white/40">no text</span>}
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {step === 'extracting' && (
        <div className="flex flex-col items-center gap-3 py-10">
          <Spinner size="lg" />
          <p className="text-sm text-white/65">Analyzing documents and extracting modifications…</p>
        </div>
      )}

      {step === 'review' && result && (
        <div className="space-y-3">
          {result.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 space-y-0.5">
              {result.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300">
                  {w}
                </p>
              ))}
            </div>
          )}
          {result.modifications.map((mod, i) => (
            <div
              key={i}
              className={`rounded-xl border p-3 space-y-2 ${
                includedMods[i] ? 'border-white/15 bg-white/[0.04]' : 'border-white/10 bg-white/[0.01] opacity-60'
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-sky-400"
                  checked={includedMods[i] ?? false}
                  onChange={() =>
                    setIncludedMods((prev) => prev.map((v, j) => (j === i ? !v : v)))
                  }
                  aria-label={`Include ${mod.title}`}
                />
                <span className="flex-1 min-w-0 text-sm font-medium text-white truncate">
                  {mod.title}
                </span>
                {mod.confidence !== undefined && (
                  <Badge
                    variant={mod.confidence >= 0.7 ? 'success' : 'warning'}
                    size="sm"
                    pill
                  >
                    {Math.round(mod.confidence * 100)}%
                  </Badge>
                )}
              </div>
              {mod.dedupeMatch && (
                <p className="text-xs text-amber-300">
                  Possible duplicate: {mod.dedupeMatch.reason} — included only if you check it.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Input
                  inputSize="sm"
                  aria-label="Title"
                  value={mod.title}
                  onChange={(e) => updateDraft(i, { title: e.target.value })}
                />
                <Input
                  inputSize="sm"
                  aria-label="Approval reference"
                  value={mod.approvalRef ?? ''}
                  placeholder="Approval ref"
                  onChange={(e) => updateDraft(i, { approvalRef: e.target.value || undefined })}
                />
                <Select
                  selectSize="sm"
                  aria-label="Modification type"
                  value={mod.modType}
                  onChange={(e) => updateDraft(i, { modType: e.target.value as ModType })}
                >
                  {ALL_MOD_TYPES.map((t) => (
                    <option key={t} value={t} className="bg-navy-800">
                      {MOD_TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/55">
                {(mod.ataChapters?.length ?? 0) > 0 && <span>ATA {mod.ataChapters!.join(', ')}</span>}
                {(mod.icaRequirements?.length ?? 0) > 0 && (
                  <span>{mod.icaRequirements!.length} ICA task(s)</span>
                )}
                {mod.afmSupplement?.required && <span>AFMS required</span>}
                {mod.weightBalance?.weightChangeLbs !== undefined && (
                  <span>
                    {mod.weightBalance.weightChangeLbs > 0 ? '+' : ''}
                    {mod.weightBalance.weightChangeLbs} lbs
                  </span>
                )}
                {(mod.placards?.length ?? 0) > 0 && <span>{mod.placards!.length} placard(s)</span>}
                {(mod.recurringInspections?.length ?? 0) > 0 && (
                  <span>{mod.recurringInspections!.length} recurring</span>
                )}
              </div>
              {mod.description && (
                <p className="text-xs text-white/60 line-clamp-3 whitespace-pre-wrap">{mod.description}</p>
              )}
            </div>
          ))}

          {result.edges.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                Proposed relationships
              </p>
              {result.edges.map((edge, i) => (
                <label key={i} className="flex items-start gap-2 text-xs text-white/75 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-sky-400 mt-0.5"
                    checked={includedEdges[i] ?? false}
                    onChange={() =>
                      setIncludedEdges((prev) => prev.map((v, j) => (j === i ? !v : v)))
                    }
                  />
                  <span>
                    <span className="text-white/90">{describeRef(edge.from)}</span>{' '}
                    <span className="text-sky-300">{MOD_EDGE_KIND_LABELS[edge.kind].toLowerCase()}</span>{' '}
                    <span className="text-white/90">{describeRef(edge.to)}</span>
                    {edge.note && <span className="text-white/45"> — {edge.note}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </GlassModal>
  );
}
