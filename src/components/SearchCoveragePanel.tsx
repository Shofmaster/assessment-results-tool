import { useCallback, useEffect, useState } from 'react';
import { useConvex } from 'convex/react';
import { FiCheckCircle, FiAlertTriangle, FiRefreshCw, FiEye } from 'react-icons/fi';
import {
  loadProjectIndexCoverage,
  type CoverageRow,
} from '../services/driveSearchIntegration';
import type { IndexDocReport, IndexDocStatus } from '../services/driveIndexBuilder';

/**
 * Read-only "Search coverage" panel for the Library: shows, per project document,
 * whether it is currently searchable (in the Drive index) and flags documents that
 * are not — so a user can tell at a glance whether Ask an Expert can see a given
 * file. Optionally enriched with the last refresh's per-document reasons
 * (unreachable / no text extracted) passed down from RefreshSearchIndexButton.
 */
export default function SearchCoveragePanel({
  projectId,
  report,
}: {
  projectId: string | undefined;
  /** Per-document outcome from the most recent index refresh, if any. */
  report?: IndexDocReport[] | null;
}) {
  const convex = useConvex();
  const [rows, setRows] = useState<CoverageRow[] | null>(null);
  const [indexBuilt, setIndexBuilt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setBusy(true);
    setError(null);
    try {
      const coverage = await loadProjectIndexCoverage(convex, projectId);
      setRows(coverage.rows);
      setIndexBuilt(coverage.indexBuilt);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load search coverage.');
    } finally {
      setBusy(false);
    }
  }, [convex, projectId]);

  // Reload when the project changes or a refresh just reported new results.
  useEffect(() => {
    void load();
  }, [load, report]);

  if (!projectId) return null;

  const statusByDoc = new Map<string, IndexDocStatus>(
    (report ?? []).map((r) => [r.documentId, r.status]),
  );

  const notSearchable = (rows ?? []).filter((r) => !r.inIndex);
  const searchable = (rows ?? []).filter((r) => r.inIndex);

  const reasonFor = (row: CoverageRow): { label: string; tone: 'warn' } => {
    const status = statusByDoc.get(row.documentId);
    if (status === 'unavailable') return { label: 'Source unreachable', tone: 'warn' };
    if (status === 'no-text') return { label: 'No text could be extracted', tone: 'warn' };
    return { label: 'Not indexed yet — run Refresh search index', tone: 'warn' };
  };

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-navy-950/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white/85">
          <FiEye aria-hidden /> Search coverage
        </h3>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-2.5 py-1 text-xs text-white/70 transition-colors hover:bg-white/5 disabled:opacity-50"
        >
          <FiRefreshCw className={busy ? 'animate-spin' : ''} aria-hidden /> Check
        </button>
      </div>

      {error ? <p className="text-xs text-rose-300">{error}</p> : null}

      {!error && rows ? (
        rows.length === 0 ? (
          <p className="text-xs text-white/55">No documents linked to this project yet.</p>
        ) : (
          <>
            <p className="mb-3 text-xs text-white/55">
              {searchable.length} of {rows.length} document{rows.length === 1 ? '' : 's'} searchable.
              {!indexBuilt ? ' Index not built yet — it builds automatically on your next question.' : ''}
            </p>

            {notSearchable.length > 0 ? (
              <ul className="mb-3 space-y-1.5">
                {notSearchable.map((row) => {
                  const reason = reasonFor(row);
                  return (
                    <li key={row.documentId} className="flex items-start gap-2 text-xs">
                      <FiAlertTriangle className="mt-0.5 shrink-0 text-amber-300" aria-hidden />
                      <span className="min-w-0">
                        <span className="text-white/85">{row.name}</span>
                        <span className="text-amber-200/70"> — {reason.label}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            <details className="text-xs">
              <summary className="cursor-pointer text-white/55 hover:text-white/75">
                {searchable.length} searchable document{searchable.length === 1 ? '' : 's'}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {searchable.map((row) => (
                  <li key={row.documentId} className="flex items-start gap-2">
                    <FiCheckCircle className="mt-0.5 shrink-0 text-green-400" aria-hidden />
                    <span className="min-w-0 text-white/80">
                      {row.name}
                      {row.searchableVia === 'convex' ? (
                        <span className="text-white/45"> · stored in app</span>
                      ) : (
                        <>
                          {row.searchableVia === 'drive' ? (
                            <span className="text-white/45"> · via Google Drive</span>
                          ) : null}
                          {row.scanned ? <span className="text-white/45"> · OCR</span> : null}
                          <span className="text-white/40"> · {row.chunkCount} passage{row.chunkCount === 1 ? '' : 's'}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )
      ) : null}

      {!rows && !error ? <p className="text-xs text-white/55">Loading coverage…</p> : null}
    </div>
  );
}
