import { useEffect, useRef, useState } from 'react';
import { useAction } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { AskChunkSource, AskDocumentSource } from '../../types/askSources';
import { FiX, FiExternalLink } from 'react-icons/fi';

type SliceResult = {
  docName: string;
  category: string;
  before: string;
  span: string;
  after: string;
  sliceStart: number;
  sliceEnd: number;
  textLength: number;
};

/**
 * Shows the exact text a citation chip points at: the cited chunk span
 * highlighted inside its surrounding document context. Document-kind sources
 * (full-document grounding) have no span — the viewer opens at the top.
 */
export default function AskSourceModal({
  source,
  isDarkMode,
  onClose,
  onOpenLibrary,
}: {
  /** Record sources never reach the modal — chips navigate to their route instead. */
  source: AskChunkSource | AskDocumentSource;
  isDarkMode: boolean;
  onClose: () => void;
  onOpenLibrary: () => void;
}) {
  const getTextSlice = useAction(api.documents.getTextSlice);
  const [slice, setSlice] = useState<SliceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const markRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    setSlice(null);
    const startChar = source.kind === 'chunk' ? source.startChar : 0;
    const endChar = source.kind === 'chunk' ? source.endChar : 0;
    getTextSlice({
      documentId: source.documentId as Id<'documents'>,
      startChar,
      endChar,
    })
      .then((result) => {
        if (cancelled) return;
        if (!result) {
          setError('Source document is no longer available.');
        } else {
          setSlice(result as SliceResult);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the source text.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [source, getTextSlice]);

  useEffect(() => {
    if (slice?.span && markRef.current) {
      markRef.current.scrollIntoView({ block: 'center' });
    }
  }, [slice]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const panelClass = isDarkMode
    ? 'border-white/15 bg-navy-900 text-white'
    : 'border-slate-200 bg-white text-slate-900 shadow-2xl';
  const mutedClass = isDarkMode ? 'text-white/60' : 'text-slate-500';
  const bodyTextClass = isDarkMode ? 'text-white/80' : 'text-slate-700';
  const footerButtonClass = isDarkMode
    ? 'border-white/20 bg-white/5 text-white/90 hover:bg-white/10'
    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Source: ${source.docName}`}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-current/10 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              <span className={`mr-2 inline-flex h-5 items-center rounded-md px-1.5 text-[11px] font-bold ${
                isDarkMode ? 'bg-sky/25 text-sky-200' : 'bg-sky-100 text-sky-800'
              }`}>
                {source.tag}
              </span>
              {source.docName}
            </p>
            <p className={`mt-0.5 text-xs ${mutedClass}`}>
              {source.kind === 'chunk'
                ? `Cited passage ${source.chunkIndex + 1}${source.totalChunks ? ` of ${source.totalChunks}` : ''}`
                : 'Provided as full-document context — showing the beginning of the document'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close source viewer"
            className={`rounded-lg p-1.5 transition-colors ${
              isDarkMode ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
            }`}
          >
            <FiX className="text-lg" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky/80" aria-hidden />
              <span className={mutedClass}>Loading source text…</span>
            </div>
          ) : error ? (
            <p className={`py-6 text-sm ${isDarkMode ? 'text-rose-200' : 'text-rose-700'}`}>{error}</p>
          ) : slice ? (
            <p className={`whitespace-pre-wrap text-sm leading-7 ${bodyTextClass}`}>
              {slice.sliceStart > 0 ? <span className={mutedClass}>… </span> : null}
              {slice.before}
              {slice.span ? (
                <mark
                  ref={(el) => {
                    markRef.current = el;
                  }}
                  className={isDarkMode ? 'rounded bg-sky/30 px-0.5 text-white' : 'rounded bg-sky-200/80 px-0.5 text-slate-900'}
                >
                  {slice.span}
                </mark>
              ) : null}
              {slice.after}
              {slice.sliceEnd < slice.textLength ? <span className={mutedClass}> …</span> : null}
            </p>
          ) : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-current/10 px-5 py-3">
          <button
            type="button"
            onClick={onOpenLibrary}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${footerButtonClass}`}
          >
            <FiExternalLink aria-hidden /> Open in Library
          </button>
        </div>
      </div>
    </div>
  );
}
