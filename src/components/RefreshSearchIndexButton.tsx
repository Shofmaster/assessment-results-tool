import { useRef, useState } from 'react';
import { useConvex } from 'convex/react';
import { FiRefreshCw, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { buildProjectDriveIndex, type BuildIndexResult } from '../services/driveSearchIntegration';
import type { IndexProgress } from '../services/driveIndexBuilder';

/**
 * Builds / refreshes the project's Drive-hosted search index. Lives on the
 * Library/Documents view. Reads each document live, embeds it, and writes the
 * per-project `<projectId>.aqv.json` vector file to Drive — no document text is
 * stored, only vectors + offsets.
 */
export default function RefreshSearchIndexButton({
  projectId,
  className,
  onResult,
  documentIds,
  categories,
  label,
  hint,
}: {
  projectId: string | undefined;
  className?: string;
  /** Fired with the per-document outcome after a successful refresh. */
  onResult?: (result: BuildIndexResult) => void;
  /** When set, only these document IDs are refreshed (subset rebuild). */
  documentIds?: string[];
  /** When set, only documents in these categories are refreshed. */
  categories?: string[];
  /** Override the default button label. */
  label?: string;
  /** Override the idle hint under the button. */
  hint?: string;
}) {
  const convex = useConvex();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const subset =
    (documentIds && documentIds.length > 0) || (categories && categories.length > 0);
  const defaultLabel = subset
    ? documentIds && documentIds.length > 0
      ? `Refresh ${documentIds.length} selected`
      : 'Refresh this category'
    : 'Refresh search index';

  const handleClick = async () => {
    if (!projectId || busy) return;
    setBusy(true);
    setError(null);
    setStatus('Starting…');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const result = await buildProjectDriveIndex(
        convex,
        projectId,
        (p: IndexProgress) => {
          if (p.phase === 'embed') setStatus(`Embedding ${p.docName ?? ''} (${p.done}/${p.total})`);
          else if (p.phase === 'extract') setStatus(`Reading ${p.docName ?? ''} (${p.done}/${p.total})`);
          else if (p.phase === 'save') setStatus('Saving index to Drive…');
        },
        controller.signal,
        subset ? { documentIds, categories } : undefined,
      );
      setStatus(
        `Indexed ${result.indexed}, unchanged ${result.skippedUnchanged}` +
          (result.unavailable ? `, ${result.unavailable} unavailable` : '') +
          (result.removed ? `, removed ${result.removed}` : ''),
      );
      onResult?.(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh the search index.');
      setStatus(null);
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy || !projectId || (documentIds !== undefined && documentIds.length === 0)}
        className="inline-flex items-center gap-2 rounded-xl border border-sky-light/40 bg-sky/20 px-4 py-2 text-sm font-semibold text-sky-lighter transition-colors hover:bg-sky/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FiRefreshCw className={busy ? 'animate-spin' : ''} aria-hidden />
        {busy ? 'Refreshing search index…' : label ?? defaultLabel}
      </button>
      {!busy && !status && !error ? (
        <p className="mt-1.5 text-xs text-white/45">
          {hint ??
            (subset
              ? 'Only the selected documents (Drive-linked, no Convex text copy) are re-embedded.'
              : 'Edits made directly in Google Drive are picked up the next time you refresh.')}
        </p>
      ) : null}
      {status ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-white/60">
          {!busy && !error ? <FiCheck className="text-green-400" aria-hidden /> : null}
          {status}
        </p>
      ) : null}
      {error ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-300">
          <FiAlertCircle aria-hidden />
          {error}
        </p>
      ) : null}
    </div>
  );
}
