/**
 * Chat transcript for the splash Ask-an-Expert flow, including the per-turn
 * meta strip (routed agents / retrieved manuals / passage counts).
 * Extracted verbatim from SplashPage.tsx.
 */
import type { MutableRefObject } from 'react';
import type { AskSource } from '../../types/askSources';
import { AskSourcesPanel, renderLightMarkdown } from '../ask/AskMarkdown';
import type { AssistantTurnMeta, ChatTurn, RetrievedDocRef } from './chatModel';

function AssistantTurnMetaStrip({
  meta,
  onOpenDoc,
  isDarkMode,
}: {
  meta: AssistantTurnMeta;
  onOpenDoc: (doc: RetrievedDocRef) => void;
  isDarkMode: boolean;
}) {
  const hasAgents = meta.routedAgents.length > 0;
  const hasDocs = meta.retrievedDocs.length > 0;
  if (!hasAgents && !hasDocs && meta.passageCount === 0 && !meta.fallback) return null;
  const mutedClass = isDarkMode ? 'text-white/45' : 'text-slate-400';
  const strongClass = isDarkMode ? 'text-white/80' : 'text-slate-700';
  return (
    <div
      className={`mt-2 flex flex-col gap-1 border-t pt-2 text-[11px] ${
        isDarkMode ? 'border-white/10 text-white/55' : 'border-slate-200 text-slate-500'
      }`}
    >
      {hasAgents ? (
        <p>
          <span className={mutedClass}>Asked: </span>
          <span className={strongClass}>{meta.routedAgents.map((a) => a.name).join(' · ')}</span>
          {meta.manualRouting ? <span className={`ml-1 ${mutedClass}`}>(manual)</span> : null}
        </p>
      ) : null}
      {hasDocs ? (
        <p className="flex flex-wrap items-baseline gap-x-1">
          <span className={mutedClass}>Manuals: </span>
          {meta.retrievedDocs.map((doc, idx) => (
            <span key={`${doc.id || doc.name}-${idx}`} className="inline-flex items-baseline">
              <button
                type="button"
                onClick={() => onOpenDoc(doc)}
                className={`underline-offset-2 hover:underline ${isDarkMode ? 'text-sky-200' : 'text-sky-700'}`}
              >
                {doc.name}
              </button>
              {idx < meta.retrievedDocs.length - 1 ? (
                <span className={isDarkMode ? 'text-white/35' : 'text-slate-300'}> · </span>
              ) : null}
            </span>
          ))}
        </p>
      ) : null}
      {(meta.passageCount > 0 || meta.docCount > 0 || meta.fallback) ? (
        <p className={isDarkMode ? 'text-white/40' : 'text-slate-400'}>
          {meta.passageCount > 0 ? `${meta.passageCount} passages` : null}
          {meta.passageCount > 0 && meta.docCount > 0 ? ' · ' : null}
          {meta.docCount > 0 ? `${meta.docCount} docs` : null}
          {meta.fallback ? ' · fallback preview' : null}
        </p>
      ) : null}
    </div>
  );
}

export default function ChatThread({
  turns,
  bottomRef,
  isLoading,
  loadingPhase = null,
  onOpenDoc,
  onOpenSource,
  isDarkMode = true,
}: {
  turns: ChatTurn[];
  bottomRef: MutableRefObject<HTMLDivElement | null>;
  isLoading: boolean;
  /** When loading and no assistant tokens yet: searching docs vs generating. */
  loadingPhase?: 'searching' | 'answering' | null;
  onOpenDoc: (doc: RetrievedDocRef) => void;
  onOpenSource: (source: AskSource) => void;
  isDarkMode?: boolean;
}) {
  const streaming = isLoading && turns.length > 0 && turns[turns.length - 1]?.role === 'assistant';
  const thinking = isLoading && !streaming;
  const phaseLabel =
    loadingPhase === 'searching' ? 'Searching your documents…' : 'Generating answer…';
  const liveStatus = thinking
    ? phaseLabel
    : streaming
      ? 'Assistant is responding…'
      : '';

  const containerClass = isDarkMode
    ? 'border-white/10 bg-navy-900/45'
    : 'border-slate-200 bg-slate-50';
  const userBubbleClass = isDarkMode
    ? 'border border-sky/35 bg-sky/20 text-white'
    : 'border border-sky-300 bg-sky-50 text-slate-900';
  const assistantBubbleClass = isDarkMode
    ? 'border border-white/10 bg-navy-950/80 text-white/90'
    : 'border border-slate-200 bg-white text-slate-800';

  return (
    <div
      className={`mt-3 max-h-[min(45vh,640px)] w-full overflow-y-auto overflow-x-hidden rounded-xl border p-4 pr-3 [scrollbar-gutter:stable] xl:mx-auto xl:max-w-6xl 2xl:max-w-7xl ${containerClass}`}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>
      <div className="flex flex-col gap-3">
        {turns.map((turn, i) => (
          <div key={`${turn.role}-${i}`} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`w-fit max-w-[min(100%,54rem)] 2xl:max-w-[min(100%,60rem)] rounded-2xl px-4 py-3 ${
                turn.role === 'user' ? userBubbleClass : assistantBubbleClass
              }`}
            >
              <p
                className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
                  isDarkMode ? 'text-white/45' : 'text-slate-500'
                }`}
              >
                {turn.role === 'user' ? 'You' : 'Assistant'}
              </p>
              <div className="text-sm leading-6">
                {renderLightMarkdown(
                  turn.content,
                  turn.role === 'assistant' && turn.sources?.length
                    ? { byTag: new Map(turn.sources.map((s) => [s.tag, s])), onOpen: onOpenSource }
                    : undefined,
                )}
              </div>
              {turn.role === 'assistant' ? (
                <AskSourcesPanel content={turn.content} sources={turn.sources} onOpenSource={onOpenSource} />
              ) : null}
              {turn.role === 'assistant' && turn.meta ? (
                <AssistantTurnMetaStrip meta={turn.meta} onOpenDoc={onOpenDoc} isDarkMode={isDarkMode} />
              ) : null}
            </div>
          </div>
        ))}
        {thinking ? (
          <div className="flex justify-start">
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                isDarkMode
                  ? 'border-white/10 bg-navy-950/60 text-white/55'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky/80" aria-hidden />
                {phaseLabel}
              </span>
            </div>
          </div>
        ) : null}
        <div
          ref={(el) => {
            bottomRef.current = el;
          }}
          className="h-px w-full shrink-0"
          aria-hidden
        />
      </div>
    </div>
  );
}
