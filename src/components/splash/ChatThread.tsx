/**
 * Chat transcript for the splash Ask-an-Expert flow, including the per-turn
 * meta strip (routed agents / retrieved manuals / passage counts).
 * Extracted verbatim from SplashPage.tsx.
 */
import type { MutableRefObject } from 'react';
import type { AskSource } from '../../types/askSources';
import { AskSourcesPanel, renderLightMarkdown } from '../ask/AskMarkdown';
import type { AssistantTurnMeta, ChatTurn, RetrievedDocRef } from './chatModel';

function AssistantTurnMetaStrip({ meta, onOpenDoc }: { meta: AssistantTurnMeta; onOpenDoc: (doc: RetrievedDocRef) => void }) {
  const hasAgents = meta.routedAgents.length > 0;
  const hasDocs = meta.retrievedDocs.length > 0;
  if (!hasAgents && !hasDocs && meta.passageCount === 0 && !meta.fallback) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2 text-[11px] text-white/55">
      {hasAgents ? (
        <p>
          <span className="text-white/45">Asked: </span>
          <span className="text-white/80">{meta.routedAgents.map((a) => a.name).join(' · ')}</span>
          {meta.manualRouting ? <span className="ml-1 text-white/45">(manual)</span> : null}
        </p>
      ) : null}
      {hasDocs ? (
        <p className="flex flex-wrap items-baseline gap-x-1">
          <span className="text-white/45">Manuals: </span>
          {meta.retrievedDocs.map((doc, idx) => (
            <span key={`${doc.id || doc.name}-${idx}`} className="inline-flex items-baseline">
              <button
                type="button"
                onClick={() => onOpenDoc(doc)}
                className="text-sky-200 underline-offset-2 hover:underline"
              >
                {doc.name}
              </button>
              {idx < meta.retrievedDocs.length - 1 ? <span className="text-white/35"> · </span> : null}
            </span>
          ))}
        </p>
      ) : null}
      {(meta.passageCount > 0 || meta.docCount > 0 || meta.fallback) ? (
        <p className="text-white/40">
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
  onOpenDoc,
  onOpenSource,
}: {
  turns: ChatTurn[];
  bottomRef: MutableRefObject<HTMLDivElement | null>;
  isLoading: boolean;
  onOpenDoc: (doc: RetrievedDocRef) => void;
  onOpenSource: (source: AskSource) => void;
}) {
  const streaming = isLoading && turns.length > 0 && turns[turns.length - 1]?.role === 'assistant';
  const thinking = isLoading && !streaming;
  const liveStatus = thinking ? 'Assistant is thinking…' : streaming ? 'Assistant is responding…' : '';

  return (
    <div className="mt-3 max-h-[min(45vh,640px)] w-full overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-navy-900/45 p-4 pr-3 [scrollbar-gutter:stable] xl:mx-auto xl:max-w-6xl 2xl:max-w-7xl">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>
      <div className="flex flex-col gap-3">
        {turns.map((turn, i) => (
          <div key={`${turn.role}-${i}`} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`w-fit max-w-[min(100%,54rem)] 2xl:max-w-[min(100%,60rem)] rounded-2xl px-4 py-3 ${
                turn.role === 'user'
                  ? 'border border-sky/35 bg-sky/20 text-white'
                  : 'border border-white/10 bg-navy-950/80 text-white/90'
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
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
                <AssistantTurnMetaStrip meta={turn.meta} onOpenDoc={onOpenDoc} />
              ) : null}
            </div>
          </div>
        ))}
        {thinking ? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-white/10 bg-navy-950/60 px-4 py-3 text-sm text-white/55">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky/80" aria-hidden />
                Thinking…
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
