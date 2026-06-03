import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { FiAlertTriangle, FiClock, FiDownload } from 'react-icons/fi';
import { Button, GlassCard } from '../ui';
import { DctContextPill, DctDocumentSummary, DctReferencePills } from '../DctContextUi';
import type { Id } from '../../../convex/_generated/dataModel';
import type { DctApplicabilityState } from '../../utils/dctApplicability';

type UnsureSort = 'confidence_asc' | 'confidence_desc' | 'peerGroup' | 'dctFile';

/**
 * Findings tab: open gaps/mismatches list (left) + the "unsure" triage pool
 * (right) with sort controls, multi-select bulk actions, and per-row
 * applicable/N-A reclassification.
 */
export function FindingsTab({
  findingsQueue,
  unsureRows,
  sortedUnsureRows,
  classifiedByComparisonId,
  activeProjectId,
  unsureSort,
  setUnsureSort,
  unsureSelection,
  setUnsureSelection,
  onBuildReport,
  bulkPatchIds,
  patchComparison,
}: {
  findingsQueue: any[];
  unsureRows: any[];
  sortedUnsureRows: any[];
  classifiedByComparisonId: Map<string, any>;
  activeProjectId: string;
  unsureSort: UnsureSort;
  setUnsureSort: Dispatch<SetStateAction<UnsureSort>>;
  unsureSelection: Set<string>;
  setUnsureSelection: Dispatch<SetStateAction<Set<string>>>;
  onBuildReport: () => void | Promise<void>;
  bulkPatchIds: (
    ids: string[],
    patch: {
      applicabilityState?: DctApplicabilityState;
      status?: 'pending' | 'aligned' | 'gap' | 'mismatch';
      severity?: any;
      resolved?: boolean;
    },
    successMessage: string,
  ) => Promise<unknown>;
  patchComparison: (args: any) => Promise<unknown>;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <GlassCard>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <FiAlertTriangle className="text-red-300" /> Open findings
          <span className="ml-auto text-xs text-white/50 font-normal">{findingsQueue.length}</span>
        </h2>
        {findingsQueue.length === 0 ? (
          <p className="text-white/50 text-sm">No open gaps or mismatches.</p>
        ) : (
          <ul className="space-y-2 text-sm max-h-[520px] overflow-y-auto pr-1">
            {findingsQueue.slice(0, 30).map((row) => (
              <li key={row.comparison._id} className="border border-white/10 rounded-lg p-3 bg-white/[0.02]">
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      row.comparison.status === 'mismatch'
                        ? 'bg-red-500/20 text-red-200'
                        : 'bg-amber-500/20 text-amber-200'
                    }`}
                  >
                    {row.comparison.status}
                  </span>
                  <div className="min-w-0 flex-1">
                    <DctContextPill doc={row.dctDocument} />
                    {row.dctDocument.fileName ? (
                      <div className="text-[10px] text-white/40 truncate mt-0.5">{row.dctDocument.fileName}</div>
                    ) : null}
                  </div>
                </div>
                <div className="text-white mt-1.5 text-sm">{row.question.text}</div>
                <DctReferencePills question={row.question} />
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] text-sky-300/90 hover:text-sky-200 list-none">
                    Full DCT context…
                  </summary>
                  <DctDocumentSummary doc={row.dctDocument} question={row.question} />
                </details>
                {row.comparison.rationale ? (
                  <div className="text-white/50 mt-1 text-xs italic">{row.comparison.rationale}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </GlassCard>

      <GlassCard>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FiClock className="text-amber-300" /> Unsure pool
            <span className="ml-1 text-xs text-white/50 font-normal">{unsureRows.length}</span>
          </h2>
          <Button
            size="sm"
            icon={<FiDownload />}
            onClick={() => void onBuildReport()}
          >
            Build Report
          </Button>
        </div>
        {!sortedUnsureRows.length ? (
          <p className="text-white/50 text-sm">No unsure DCTs right now.</p>
        ) : (
          <>
            {/* Sort controls */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <label className="text-[10px] text-white/50 uppercase tracking-wide shrink-0">Sort:</label>
              <select
                className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-xs text-white"
                value={unsureSort}
                onChange={(e) => setUnsureSort(e.target.value as UnsureSort)}
              >
                <option value="confidence_desc" className="bg-navy-800">Confidence ↓ (most likely first)</option>
                <option value="confidence_asc" className="bg-navy-800">Confidence ↑ (least likely first)</option>
                <option value="peerGroup" className="bg-navy-800">Peer group A–Z</option>
                <option value="dctFile" className="bg-navy-800">DCT file A–Z</option>
              </select>
            </div>

            {/* Select-all */}
            <div className="flex items-center gap-2 mb-2">
              <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="accent-amber-400"
                  checked={
                    sortedUnsureRows.length > 0 &&
                    sortedUnsureRows.every((r) => unsureSelection.has(String(r.comparison._id)))
                  }
                  ref={(el) => {
                    if (el) {
                      const someSelected = sortedUnsureRows.some((r) => unsureSelection.has(String(r.comparison._id)));
                      const allSelected = sortedUnsureRows.every((r) => unsureSelection.has(String(r.comparison._id)));
                      el.indeterminate = someSelected && !allSelected;
                    }
                  }}
                  onChange={(e) => {
                    setUnsureSelection((prev) => {
                      const next = new Set(prev);
                      for (const r of sortedUnsureRows) {
                        if (e.target.checked) next.add(String(r.comparison._id));
                        else next.delete(String(r.comparison._id));
                      }
                      return next;
                    });
                  }}
                  aria-label="Select all unsure rows"
                />
                Select all
              </label>
              {unsureSelection.size > 0 && (
                <span className="text-xs text-white/50">{unsureSelection.size} selected</span>
              )}
            </div>

            {/* Bulk action bar */}
            {unsureSelection.size > 0 && (
              <div className="mb-3 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 flex flex-wrap items-center gap-2 text-xs text-amber-100">
                <span className="font-medium">{unsureSelection.size} selected</span>
                <span className="opacity-40">·</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void bulkPatchIds(
                      Array.from(unsureSelection),
                      { applicabilityState: 'applicable' },
                      'Marked applicable',
                    ).then(() => setUnsureSelection(new Set()))
                  }
                >
                  Mark all applicable
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    void bulkPatchIds(
                      Array.from(unsureSelection),
                      { applicabilityState: 'not_applicable' },
                      'Marked not applicable',
                    ).then(() => setUnsureSelection(new Set()))
                  }
                >
                  Mark all N/A
                </Button>
                <button
                  type="button"
                  onClick={() => setUnsureSelection(new Set())}
                  className="ml-auto underline hover:text-white"
                >
                  Clear
                </button>
              </div>
            )}

            <ul className="space-y-2 text-sm max-h-[520px] overflow-y-auto pr-1">
              {sortedUnsureRows.slice(0, 30).map((row) => {
                const rowId = String(row.comparison._id);
                const conf = classifiedByComparisonId.get(rowId)?.confidence;
                const isSelected = unsureSelection.has(rowId);
                return (
                  <li
                    key={row.comparison._id}
                    className={`border rounded-lg p-3 bg-white/[0.02] flex items-start gap-3 ${
                      isSelected ? 'border-amber-400/30 bg-amber-500/[0.04]' : 'border-white/10'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="accent-amber-400 mt-1 shrink-0"
                      checked={isSelected}
                      onChange={() => {
                        setUnsureSelection((prev) => {
                          const next = new Set(prev);
                          if (next.has(rowId)) next.delete(rowId);
                          else next.add(rowId);
                          return next;
                        });
                      }}
                      aria-label="Select for bulk action"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <DctContextPill doc={row.dctDocument} />
                        {conf !== undefined && (
                          <span
                            className="px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-500/10 text-amber-200 text-[10px] font-medium tabular-nums"
                            title="Applicability confidence"
                          >
                            {Math.round(conf * 100)}%
                          </span>
                        )}
                      </div>
                      {row.dctDocument.fileName ? (
                        <div className="text-[10px] text-white/40 truncate mt-0.5">{row.dctDocument.fileName}</div>
                      ) : null}
                      <div className="text-white mt-1 text-sm">{row.question.text}</div>
                      <DctReferencePills question={row.question} />
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[10px] text-sky-300/90 hover:text-sky-200 list-none">
                          Full DCT context…
                        </summary>
                        <DctDocumentSummary doc={row.dctDocument} question={row.question} />
                      </details>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await patchComparison({
                            projectId: activeProjectId as Id<'projects'>,
                            comparisonId: row.comparison._id,
                            status: row.comparison.status,
                            applicabilityState: 'applicable',
                            applicabilitySource: 'user',
                          });
                          toast.success('Moved to applicable pool');
                        }}
                      >
                        Mark applicable
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await patchComparison({
                            projectId: activeProjectId as Id<'projects'>,
                            comparisonId: row.comparison._id,
                            status: row.comparison.status,
                            applicabilityState: 'not_applicable',
                            applicabilitySource: 'user',
                          });
                          toast.success('Moved to not applicable');
                        }}
                      >
                        Mark N/A
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </GlassCard>
    </div>
  );
}
