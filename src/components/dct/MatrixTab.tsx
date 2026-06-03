import type { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';
import { FiGrid, FiRefreshCw } from 'react-icons/fi';
import { Button, GlassCard } from '../ui';
import { DctContextPill, DctDocumentSummary, DctReferencePills, purposePreview } from '../DctContextUi';
import { findingSeverityBadgeClass } from '../../utils/dctCompliancePresenter';
import { type DctApplicabilityState } from '../../utils/dctApplicability';
import { type DctFindingSeverity } from '../../services/dctDocumentCheckEngine';
import { getConvexErrorMessage } from '../../utils/convexError';
import type { Id } from '../../../convex/_generated/dataModel';
import type { DctFileSummary } from './CategoryTriageSection';

/**
 * Traceability matrix tab: filterable/selectable requirement grid with bulk
 * applicability/status/severity/resolution actions, a server-side applicability
 * re-stamp, a per-DCT-file filter list, and inline per-row editing.
 */
export function MatrixTab({
  filteredRows,
  enriched,
  defaultRunSelection,
  lastRunSelection,
  matrixFilter,
  setMatrixFilter,
  matrixStatus,
  setMatrixStatus,
  matrixApplicability,
  setMatrixApplicability,
  matrixDocFilterId,
  setMatrixDocFilterId,
  matrixSelection,
  setMatrixSelection,
  matrixBulkBusy,
  bulkPatchSelected,
  refreshingApplicability,
  setRefreshingApplicability,
  refreshApplicability,
  activeProjectId,
  toolDocuments,
  dctFileSummaries,
  classifiedByComparisonId,
  patchComparison,
  onReviewSelection,
}: {
  filteredRows: any[];
  enriched: any[] | undefined;
  defaultRunSelection: Set<string>;
  lastRunSelection: Set<string>;
  matrixFilter: string;
  setMatrixFilter: Dispatch<SetStateAction<string>>;
  matrixStatus: string;
  setMatrixStatus: Dispatch<SetStateAction<string>>;
  matrixApplicability: 'all' | DctApplicabilityState;
  setMatrixApplicability: Dispatch<SetStateAction<'all' | DctApplicabilityState>>;
  matrixDocFilterId: string | null;
  setMatrixDocFilterId: Dispatch<SetStateAction<string | null>>;
  matrixSelection: Set<string>;
  setMatrixSelection: Dispatch<SetStateAction<Set<string>>>;
  matrixBulkBusy: boolean;
  bulkPatchSelected: (
    patch: {
      applicabilityState?: DctApplicabilityState;
      status?: 'pending' | 'aligned' | 'gap' | 'mismatch';
      severity?: DctFindingSeverity;
      resolved?: boolean;
    },
    successMessage: string,
  ) => Promise<unknown>;
  refreshingApplicability: boolean;
  setRefreshingApplicability: Dispatch<SetStateAction<boolean>>;
  refreshApplicability: (args: any) => Promise<unknown>;
  activeProjectId: string;
  toolDocuments: any[] | undefined;
  dctFileSummaries: DctFileSummary[];
  classifiedByComparisonId: Map<string, any>;
  patchComparison: (args: any) => Promise<unknown>;
  onReviewSelection: () => void;
}) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <FiGrid /> Traceability matrix
        </h2>
        <span className="text-xs text-white/50">
          {filteredRows.length} of {enriched?.length ?? 0} requirements
        </span>
      </div>
      {defaultRunSelection.size > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 text-xs text-sky-100 flex items-center justify-between gap-3 flex-wrap">
          <span>
            <strong>{defaultRunSelection.size}</strong> row{defaultRunSelection.size === 1 ? '' : 's'} auto-selected for next run
            {lastRunSelection.size > 0 && lastRunSelection.size !== defaultRunSelection.size ? ' · last run used ' + lastRunSelection.size : ''}.
          </span>
          <button
            type="button"
            onClick={onReviewSelection}
            className="underline hover:text-white"
          >
            Review selection
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          className="flex-1 min-w-[200px] bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
          placeholder="Filter by requirement, Standard DCT ID, MLF, peer group, purpose, or CFR refs…"
          value={matrixFilter}
          onChange={(e) => setMatrixFilter(e.target.value)}
        />
        <select
          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
          value={matrixStatus}
          onChange={(e) => setMatrixStatus(e.target.value)}
        >
          {['all', 'pending', 'aligned', 'gap', 'mismatch'].map((s) => (
            <option key={s} value={s} className="bg-navy-800">
              Status: {s}
            </option>
          ))}
        </select>
        <select
          className="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm"
          value={matrixApplicability}
          onChange={(e) => setMatrixApplicability(e.target.value as 'all' | DctApplicabilityState)}
        >
          {['all', 'applicable', 'unsure', 'not_applicable'].map((s) => (
            <option key={s} value={s} className="bg-navy-800">
              Applicability: {s}
            </option>
          ))}
        </select>
        {matrixDocFilterId ? (
          <Button size="sm" variant="secondary" onClick={() => setMatrixDocFilterId(null)}>
            Clear DCT file filter
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          disabled={refreshingApplicability || !activeProjectId}
          title="Re-run applicability classifier server-side using current company profile, opspecs, and ratings."
          onClick={async () => {
            if (!activeProjectId) return;
            setRefreshingApplicability(true);
            try {
              const result = (await refreshApplicability({
                projectId: activeProjectId as Id<'projects'>,
              })) as unknown as {
                evaluated: number;
                changed: number;
                skippedUserSource: number;
                comparisonCount: number;
                opspecCount: number;
                ratingCount: number;
                capabilityCount: number;
                profileSource: 'company' | 'project' | 'none';
                applicabilityMode: string;
                buckets: { applicable: number; unsure: number; not_applicable: number };
              };
              const desc =
                `Profile: ${result.profileSource} · mode: ${result.applicabilityMode} · ` +
                `${result.opspecCount} opspec(s), ${result.ratingCount} rating(s), ${result.capabilityCount} capability(ies) used. ` +
                `Buckets → applicable ${result.buckets.applicable}, unsure ${result.buckets.unsure}, n/a ${result.buckets.not_applicable}` +
                (result.skippedUserSource
                  ? ` · ${result.skippedUserSource} row(s) skipped (manually overridden)`
                  : '');
              if (result.changed > 0) {
                toast.success(`Re-stamped ${result.changed} of ${result.evaluated} row(s).`, {
                  description: desc,
                });
              } else {
                toast(`Re-eval ran but no rows changed (${result.evaluated} evaluated).`, {
                  description: desc,
                });
              }
            } catch (e) {
              toast.error(getConvexErrorMessage(e) ?? 'Failed to refresh applicability');
            } finally {
              setRefreshingApplicability(false);
            }
          }}
        >
          <FiRefreshCw className={refreshingApplicability ? 'animate-spin' : ''} />
          <span className="ml-1">Refresh applicability</span>
        </Button>
      </div>

      {matrixSelection.size > 0 && (
        <div className="mb-3 px-3 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 flex flex-wrap items-center gap-2 text-xs text-sky-100">
          <span className="font-medium">
            {matrixSelection.size} selected
          </span>
          <span className="opacity-40">·</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={matrixBulkBusy}
            onClick={() =>
              void bulkPatchSelected(
                { applicabilityState: 'applicable' },
                'Marked applicable',
              )
            }
          >
            Mark applicable
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={matrixBulkBusy}
            onClick={() =>
              void bulkPatchSelected(
                { applicabilityState: 'unsure' },
                'Marked unsure',
              )
            }
          >
            Mark unsure
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={matrixBulkBusy}
            onClick={() =>
              void bulkPatchSelected(
                { applicabilityState: 'not_applicable' },
                'Marked not applicable',
              )
            }
          >
            Mark not applicable
          </Button>
          <span className="opacity-40">·</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={matrixBulkBusy}
            onClick={() =>
              void bulkPatchSelected({ resolved: true }, 'Marked resolved')
            }
          >
            Mark resolved
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={matrixBulkBusy}
            onClick={() =>
              void bulkPatchSelected(
                { resolved: false },
                'Marked unresolved',
              )
            }
          >
            Mark unresolved
          </Button>
          <span className="opacity-40 ml-auto">·</span>
          <button
            type="button"
            onClick={() => setMatrixSelection(new Set())}
            className="underline hover:text-white"
            disabled={matrixBulkBusy}
          >
            Clear selection
          </button>
        </div>
      )}

      <details className="mb-4 rounded-lg border border-white/10 bg-white/[0.02] p-3 group">
        <summary className="cursor-pointer text-sm text-white/85 font-medium list-none flex items-center gap-2 select-none">
          <span className="transition-transform group-open:rotate-90 text-white/50">▸</span>
          DCT files in this project ({toolDocuments?.length ?? 0})
          <span className="text-white/40 font-normal text-xs ml-1">— click a row to filter the matrix</span>
        </summary>
        <div className="mt-3 space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {!dctFileSummaries.length ? (
            <p className="text-xs text-white/50">
              No ingested DCT files yet. Upload XML in Library, then use Sync from library on Overview.
            </p>
          ) : (
            dctFileSummaries.map(({ doc, applicable, unsure, notApplicable, total }) => {
              const selected = matrixDocFilterId === String(doc._id);
              const prev = purposePreview(doc.purpose, 160);
              return (
                <button
                  key={String(doc._id)}
                  type="button"
                  onClick={() =>
                    setMatrixDocFilterId((cur) => (cur === String(doc._id) ? null : String(doc._id)))
                  }
                  className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                    selected
                      ? 'border-sky-400/50 bg-sky-500/10'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]'
                  }`}
                >
                  <DctContextPill doc={doc} />
                  {doc.fileName ? (
                    <div className="text-[10px] text-white/40 truncate mt-0.5" title={doc.fileName}>
                      {doc.fileName}
                    </div>
                  ) : null}
                  {prev ? (
                    <p className="text-[11px] text-white/55 mt-1 line-clamp-2">{prev}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-white/50">
                    <span>
                      Req: <span className="text-white/70">{total}</span>
                    </span>
                    <span className="text-emerald-200/90">App: {applicable}</span>
                    <span className="text-amber-200/90">Unsure: {unsure}</span>
                    <span className="text-white/40">N/A: {notApplicable}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </details>

      {(() => {
        const visibleRows = filteredRows.slice(0, 200);
        const visibleIds = visibleRows.map((r) => String(r.comparison._id));
        const allVisibleSelected =
          visibleIds.length > 0 &&
          visibleIds.every((id) => matrixSelection.has(id));
        const someVisibleSelected =
          !allVisibleSelected &&
          visibleIds.some((id) => matrixSelection.has(id));
        const toggleAllVisible = () => {
          setMatrixSelection((prev) => {
            const next = new Set(prev);
            if (allVisibleSelected) {
              for (const id of visibleIds) next.delete(id);
            } else {
              for (const id of visibleIds) next.add(id);
            }
            return next;
          });
        };
        const toggleRow = (id: string) => {
          setMatrixSelection((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          });
        };
        return (
      <div className="overflow-x-auto max-h-[560px] overflow-y-auto rounded-lg border border-white/10">
        <table className="min-w-full text-left text-xs table-fixed">
          <thead className="bg-white/5 sticky top-0 backdrop-blur z-10">
            <tr>
              <th className="p-2 text-white/60 font-medium w-10">
                <label className="flex items-center justify-center" title={allVisibleSelected ? 'Deselect all visible rows' : 'Select all visible rows'}>
                  <input
                    type="checkbox"
                    className="accent-sky-500"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected;
                    }}
                    onChange={toggleAllVisible}
                    aria-label="Select all visible matrix rows"
                  />
                </label>
              </th>
              <th className="p-2 text-white/60 font-medium w-[18%] min-w-[180px]">DCT</th>
              <th className="p-2 text-white/60 font-medium min-w-[360px]">Requirement</th>
              <th className="p-2 text-white/60 font-medium w-[14%] min-w-[120px]">References</th>
              <th className="p-2 text-white/60 font-medium w-[90px]">Status</th>
              <th className="p-2 text-white/60 font-medium w-[90px]">Severity</th>
              <th className="p-2 text-white/60 font-medium w-[170px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const rowId = String(row.comparison._id);
              const classified = classifiedByComparisonId.get(rowId);
              const effectiveApplicability: DctApplicabilityState =
                (row.comparison.applicabilityState as DctApplicabilityState | undefined) ??
                classified?.applicability ??
                'unsure';
              const applicabilityStored = classified?.stored === true;
              const isSelected = matrixSelection.has(rowId);
              return (
              <tr
                key={row.comparison._id}
                className={`border-t border-white/5 hover:bg-white/[0.03] ${isSelected ? 'bg-sky-500/[0.06]' : ''}`}
              >
                <td className="p-2 align-top">
                  <input
                    type="checkbox"
                    className="accent-sky-500"
                    checked={isSelected}
                    onChange={() => toggleRow(rowId)}
                    aria-label="Select row"
                  />
                </td>
                <td className="p-2 text-white/80 align-top min-w-0">
                  <DctContextPill doc={row.dctDocument} />
                  {defaultRunSelection.has(rowId) && (
                    <span
                      className="inline-block mt-1 px-1.5 py-0.5 rounded border border-sky-500/40 bg-sky-500/10 text-sky-200 text-[9px] uppercase tracking-wide"
                      title="This row is auto-selected for the next run"
                    >
                      Selected
                    </span>
                  )}
                  {row.dctDocument.fileName ? (
                    <div
                      className="text-[10px] text-white/40 mt-1 break-all"
                      title={row.dctDocument.fileName}
                    >
                      {row.dctDocument.fileName}
                    </div>
                  ) : null}
                </td>
                <td className="p-2 text-white/90 align-top min-w-0">
                  <div
                    className="whitespace-pre-wrap break-words leading-snug text-[12px]"
                    title={row.question.text ?? ''}
                  >
                    {row.question.text ?? ''}
                  </div>
                  {row.question.noteToUser ? (
                    <p className="text-white/50 mt-1 text-[11px] italic whitespace-pre-wrap break-words">{row.question.noteToUser}</p>
                  ) : null}
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-[10px] text-sky-300/90 hover:text-sky-200 list-none">
                      Full DCT context…
                    </summary>
                    <DctDocumentSummary doc={row.dctDocument} question={row.question} />
                  </details>
                </td>
                <td className="p-2 align-top min-w-0">
                  <DctReferencePills question={row.question} />
                  {!row.question.references?.length ? (
                    <span className="text-white/35 text-[10px]">—</span>
                  ) : null}
                </td>
                <td className="p-2 align-top">
                  <span
                    className={
                      row.comparison.status === 'aligned'
                        ? 'text-emerald-300'
                        : row.comparison.status === 'mismatch'
                          ? 'text-red-300'
                          : row.comparison.status === 'gap'
                            ? 'text-amber-300'
                            : 'text-white/50'
                    }
                  >
                    {row.comparison.status}
                  </span>
                </td>
                <td className="p-2 align-top">
                  {row.comparison.severity ? (
                    <span className={`inline-flex px-2 py-0.5 rounded border text-[10px] uppercase ${findingSeverityBadgeClass(row.comparison.severity as DctFindingSeverity)}`}>
                      {row.comparison.severity}
                    </span>
                  ) : (
                    <span className="text-white/40">—</span>
                  )}
                </td>
                <td className="p-2 align-top space-y-1">
                  <select
                    className="bg-white/10 border border-white/15 rounded px-1 py-0.5 w-full"
                    value={effectiveApplicability}
                    title={
                      applicabilityStored
                        ? 'Stored applicability'
                        : 'Inferred — change to persist a user override.'
                    }
                    onChange={async (e) => {
                      await patchComparison({
                        projectId: activeProjectId as Id<'projects'>,
                        comparisonId: row.comparison._id,
                        status: row.comparison.status,
                        applicabilityState: e.target.value as DctApplicabilityState,
                        applicabilitySource: 'user',
                      });
                    }}
                  >
                    {['applicable', 'unsure', 'not_applicable'].map((s) => (
                      <option key={s} value={s} className="bg-navy-800">
                        {s}
                      </option>
                    ))}
                  </select>
                  {!applicabilityStored && (() => {
                    const conf = classifiedByComparisonId.get(rowId)?.confidence;
                    if (conf === undefined) return null;
                    return (
                      <div className="flex items-center">
                        <span
                          className="px-1.5 py-0.5 rounded border border-white/15 bg-white/5 text-white/50 text-[9px] tabular-nums"
                          title="Inferred applicability confidence"
                        >
                          {Math.round(conf * 100)}% conf.
                        </span>
                      </div>
                    );
                  })()}
                  <select
                    className="bg-white/10 border border-white/15 rounded px-1 py-0.5 w-full"
                    value={row.comparison.status}
                    onChange={async (e) => {
                      await patchComparison({
                        projectId: activeProjectId as Id<'projects'>,
                        comparisonId: row.comparison._id,
                        status: e.target.value as any,
                      });
                    }}
                  >
                    {['pending', 'aligned', 'gap', 'mismatch'].map((s) => (
                      <option key={s} value={s} className="bg-navy-800">
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    className="bg-white/10 border border-white/15 rounded px-1 py-0.5 w-full"
                    value={(row.comparison.severity as DctFindingSeverity | undefined) ?? 'observation'}
                    onChange={async (e) => {
                      await patchComparison({
                        projectId: activeProjectId as Id<'projects'>,
                        comparisonId: row.comparison._id,
                        status: row.comparison.status,
                        severity: e.target.value as DctFindingSeverity,
                      });
                    }}
                  >
                    {['critical', 'major', 'minor', 'observation'].map((s) => (
                      <option key={s} value={s} className="bg-navy-800">
                        {s}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-white/50">
                    <input
                      type="checkbox"
                      checked={row.comparison.resolved === true}
                      onChange={async (e) => {
                        await patchComparison({
                          projectId: activeProjectId as Id<'projects'>,
                          comparisonId: row.comparison._id,
                          status: row.comparison.status,
                          resolved: e.target.checked,
                        });
                      }}
                    />
                    Resolved
                  </label>
                </td>
              </tr>
              );
            })}
            {!filteredRows.length ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-white/40">
                  No requirements match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {filteredRows.length > 200 ? (
          <p className="p-2 text-white/40 text-xs">Showing first 200 rows — narrow filters to see more.</p>
        ) : null}
      </div>
        );
      })()}
    </GlassCard>
  );
}
