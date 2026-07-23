import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvex } from 'convex/react';
import { FiSend } from 'react-icons/fi';
import {
  createClaudeMessage,
  createClaudeMessageStream,
  ClaudeRequestCancelledError,
  type ClaudeMessageParams,
  type ClaudeToolResultContent,
  type ClaudeToolUseBlock,
} from '../../services/claudeProxy';
import { searchProjectDocuments } from '../../services/driveSearchIntegration';
import { ASK_TOP_K } from '../../constants/search';
import { DEFAULT_CLAUDE_MODEL } from '../../constants/claude';
import { RECORD_TOOLS, MAX_RECORD_TOOL_CALLS, executeRecordTool } from '../../services/askRecordTools';
import { buildTaggedPassages } from '../../services/askContext';
import {
  createTagAllocator,
  segmentAnswerWithCitations,
  type AskSource,
  type AskChunkSource,
  type AskDocumentSource,
  type AskRecordSource,
} from '../../types/askSources';
import { askPerfLog, askPerfNow } from '../../utils/askPerf';
import { AskSourcesPanel, renderLightMarkdown } from './AskMarkdown';
import AskSourceModal from './AskSourceModal';

type PanelTurn = {
  role: 'user' | 'assistant';
  content: string;
  sources?: AskSource[];
};

export interface AskPanelScope {
  /** Restrict document retrieval to these documents (e.g. an open publication). */
  documentIds?: string[];
  /** Restrict retrieval to these categories (defaults to all indexed categories). */
  categories?: string[];
  /** Scope record tools to one aircraft; also steers the system prompt. */
  tailNumber?: string;
}

/**
 * Embedded Ask an Expert panel: scoped, citation-first Q&A for Library and
 * Fleet surfaces. In-memory conversation only (no draft persistence, no agent
 * picker) — the splash chat remains the full-featured surface.
 */
export default function AskPanel({
  projectId,
  scope,
  isDarkMode,
  placeholder,
  contextLabel,
  enableRecordTools = false,
}: {
  projectId: string;
  scope?: AskPanelScope;
  isDarkMode: boolean;
  placeholder?: string;
  /** Short scope description shown under the input, e.g. "Scoped to N123AB". */
  contextLabel?: string;
  /** Caller decides (flag + fleet-data check) whether record tools attach. */
  enableRecordTools?: boolean;
}) {
  const convex = useConvex();
  const navigate = useNavigate();
  const inputId = useId();
  const [turns, setTurns] = useState<PanelTurn[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [askPhase, setAskPhase] = useState<'searching' | 'answering' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrievalNote, setRetrievalNote] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<AskChunkSource | AskDocumentSource | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const askAbortRef = useRef<AbortController | null>(null);
  const askGenerationRef = useRef(0);

  useEffect(() => {
    return () => {
      askAbortRef.current?.abort();
      askAbortRef.current = null;
    };
  }, []);

  const openSource = (source: AskSource) => {
    if (source.kind === 'record') navigate(source.route);
    else setActiveSource(source);
  };

  const handleAsk = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    const generation = ++askGenerationRef.current;
    const isCurrent = () => askGenerationRef.current === generation;
    askAbortRef.current?.abort();
    const abortController = new AbortController();
    askAbortRef.current = abortController;
    const askSignal = abortController.signal;
    setIsLoading(true);
    setAskPhase('searching');
    setError(null);
    setRetrievalNote(null);
    const priorTurns = turns;
    setTurns((prev) => [...prev, { role: 'user', content: trimmed }]);
    try {
      // 1. Retrieval. Unless the panel is explicitly scoped to certain categories,
      // search EVERY indexed category so any linked document can answer. The index
      // is auto-refreshed inside searchProjectDocuments when a document changed.
      let passages = { context: '', sources: [] as AskChunkSource[], docCount: 0 };
      let retrievalFailed = false;
      let driveUnavailable = false;
      try {
        const retrievalStarted = askPerfNow();
        const retrieved = await searchProjectDocuments(convex, {
          projectId,
          query: trimmed,
          documentIds: scope?.documentIds?.length ? scope.documentIds : undefined,
          categories: scope?.categories?.length ? scope.categories : undefined,
          topK: ASK_TOP_K,
          allowRerank: false,
        });
        askPerfLog('retrieval', retrievalStarted, {
          chunks: retrieved.chunks?.length ?? 0,
          panel: true,
        });
        passages = buildTaggedPassages(retrieved.chunks);
        // No-copy reference manuals/standards live ONLY in the Drive index; when
        // its half is unavailable they were silently skipped, so the answer may be
        // missing your most authoritative sources. Track it to warn + disclose.
        driveUnavailable = retrieved.meta?.driveUnavailable === true;
      } catch {
        retrievalFailed = true;
      }
      if (!isCurrent() || askSignal.aborted) return;
      if (driveUnavailable) {
        setRetrievalNote(
          'Linked reference manuals and standards could not be searched right now (Google Drive is unavailable), so this answer may be missing those sources. Check Drive access in Settings.',
        );
      } else if (!retrievalFailed && passages.sources.length === 0) {
        // Gentle nudge when nothing matched: a doc you expected may not be indexed
        // yet (still building) or unreadable — Library's Search coverage shows which.
        setRetrievalNote(
          'No matching passages were found in your linked documents. If you expected one, check Search coverage in Library — the index may still be building, or a document may be unreadable.',
        );
      }

      setAskPhase('answering');

      // 2. System prompt (compact variant of the splash prompt).
      const systemLines = [
        'You are an aviation audit and compliance assistant for AeroGap, answering inside an embedded panel.',
        'Answer every aviation/compliance/maintenance question directly and concisely; never reply that a topic is outside your scope.',
        scope?.tailNumber
          ? `This panel is scoped to aircraft ${scope.tailNumber}. Interpret questions as being about this aircraft unless stated otherwise, and pass tailNumber="${scope.tailNumber}" to record tools by default.`
          : '',
        retrievalFailed
          ? 'Document retrieval failed for this question. Do NOT claim no company document exists — answer from general knowledge and say retrieval was unavailable.'
          : passages.context
            ? 'Use the retrieved company document passages below as primary evidence when relevant.'
            : 'No matching company document passages were retrieved for this question; answer from general industry/regulatory knowledge and note that.',
        driveUnavailable
          ? 'Note: linked reference manuals and standards could NOT be searched for this question (Google Drive was unavailable). If the answer depends on a manufacturer manual or compliance standard, state plainly that those sources could not be checked rather than implying the company has none.'
          : '',
        'When you rely on a provided source excerpt or tool-result row, cite it inline with its bracket tag, e.g. "Calibration is annual [S1]." Only use tags that appear in the sources or tool results — never invent a tag. Do not produce a separate "## Sources" section.',
        'You are in a multi-turn chat: use earlier turns for context.',
      ];
      if (enableRecordTools) {
        systemLines.push(
          "You have records tools over this company's fleet: aircraft status, logbook entries, components, discrepancies, and coming-due items. Use them for questions about actual aircraft, maintenance history, parts, or due dates. Rows include a \"cite\" tag — cite them like [S7].",
        );
      }
      if (passages.context) {
        systemLines.push('', `Retrieved company document passages (${passages.sources.length} from ${passages.docCount} docs):`, passages.context);
      }

      const nextTag = createTagAllocator(passages.sources.length);
      const recordSources: AskRecordSource[] = [];
      const baseParams = {
        model: DEFAULT_CLAUDE_MODEL,
        max_tokens: 2000,
        temperature: 0.2,
        system: systemLines.filter(Boolean).join('\n'),
        ...(enableRecordTools ? { tools: RECORD_TOOLS } : {}),
      };
      let loopMessages: ClaudeMessageParams['messages'] = [
        ...priorTurns.map((t) => ({ role: t.role, content: t.content })),
        { role: 'user' as const, content: trimmed },
      ];

      // 3. Bounded tool-use loop, or stream when tools are off.
      const claudeStarted = askPerfNow();
      let response;
      if (enableRecordTools) {
        response = await createClaudeMessage(
          { ...baseParams, messages: loopMessages },
          { signal: askSignal },
        );
        let toolCallCount = 0;
        while (response.stop_reason === 'tool_use' && toolCallCount < MAX_RECORD_TOOL_CALLS) {
          if (askSignal.aborted || !isCurrent()) throw new ClaudeRequestCancelledError();
          const toolUses = response.content.filter(
            (block): block is ClaudeToolUseBlock => block.type === 'tool_use',
          );
          if (toolUses.length === 0) break;
          const toolResults: ClaudeToolResultContent[] = [];
          for (const toolUse of toolUses) {
            toolCallCount += 1;
            const input = { ...(toolUse.input || {}) };
            if (scope?.tailNumber && !input.tailNumber && toolUse.name !== 'list_upcoming_due') {
              input.tailNumber = scope.tailNumber;
            }
            const executed = await executeRecordTool(convex, projectId, toolUse.name, input, nextTag);
            recordSources.push(...executed.sources);
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: executed.resultForModel });
          }
          loopMessages = [
            ...loopMessages,
            { role: 'assistant', content: response.content as ClaudeMessageParams['messages'][number]['content'] },
            { role: 'user', content: toolResults },
          ];
          response = await createClaudeMessage(
            { ...baseParams, messages: loopMessages },
            { signal: askSignal },
          );
        }
        askPerfLog('claude', claudeStarted, { streamed: false, toolCalls: toolCallCount, panel: true });
      } else {
        let sawFirstToken = false;
        response = await createClaudeMessageStream(
          { ...baseParams, messages: loopMessages },
          {
            onText: (chunk) => {
              if (!isCurrent()) return;
              if (!sawFirstToken) {
                askPerfLog('claude-ttft', claudeStarted, { panel: true });
                sawFirstToken = true;
                setAskPhase(null);
                setTurns((prev) => [...prev, { role: 'assistant', content: chunk }]);
                return;
              }
              setTurns((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + chunk };
                }
                return next;
              });
            },
          },
          { signal: askSignal },
        );
        askPerfLog('claude', claudeStarted, { streamed: true, panel: true });
      }

      if (!isCurrent()) return;

      const text = response.content
        .filter((block): block is { type: string; text?: string } => block.type === 'text')
        .map((block) => block.text || '')
        .join('\n')
        .trim();
      const reply = text || 'No response returned.';

      const allSources: AskSource[] = [...passages.sources, ...recordSources];
      const cited = new Set(segmentAnswerWithCitations(reply, allSources).citedTags);
      const keptSources: AskSource[] = [
        ...passages.sources,
        ...recordSources.filter((s) => cited.has(s.tag)),
      ];

      const assistantTurn: PanelTurn = {
        role: 'assistant',
        content: reply,
        ...(keptSources.length > 0 ? { sources: keptSources } : {}),
      };
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = assistantTurn;
          return next;
        }
        return [...next, assistantTurn];
      });
      setQuery('');
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'nearest' }), 50);
    } catch (err) {
      if (!isCurrent()) return;
      if (err instanceof ClaudeRequestCancelledError) return;
      setError(err instanceof Error ? err.message : 'Ask request failed.');
      // Roll back the pending user turn so a retry doesn't duplicate it (the
      // typed query is still in the input — it only clears on success).
      setTurns((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === 'user' && last.content === trimmed ? prev.slice(0, -1) : prev;
      });
    } finally {
      if (askAbortRef.current === abortController) {
        askAbortRef.current = null;
      }
      if (isCurrent()) {
        setIsLoading(false);
        setAskPhase(null);
      }
    }
  };

  const inputClass = isDarkMode
    ? 'border-white/15 bg-navy-950/60 text-white placeholder-white/35'
    : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400';
  const transcriptClass = isDarkMode
    ? 'mb-3 max-h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-navy-900/45 p-3'
    : 'mb-3 max-h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3';
  const userBubbleClass = isDarkMode
    ? 'border border-sky/35 bg-sky/20 text-white'
    : 'border border-sky-300 bg-sky-50 text-slate-900';
  const assistantBubbleClass = isDarkMode
    ? 'border border-white/10 bg-navy-950/80 text-white/90'
    : 'border border-slate-200 bg-white text-slate-800';
  const errorClass = isDarkMode ? 'mt-1.5 text-xs text-rose-300' : 'mt-1.5 text-xs text-rose-700';
  const streaming = isLoading && turns.length > 0 && turns[turns.length - 1]?.role === 'assistant';
  const thinking = isLoading && !streaming;
  const phaseLabel =
    askPhase === 'searching' ? 'Searching your documents…' : 'Generating answer…';
  const liveStatus = error
    ? error
    : thinking
      ? phaseLabel
      : streaming
        ? 'Assistant is responding…'
        : retrievalNote || '';

  return (
    <div className="flex min-h-0 flex-col">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {liveStatus}
      </div>
      {turns.length > 0 ? (
        <div className={transcriptClass}>
          {turns.map((turn, i) => (
            <div key={`${turn.role}-${i}`} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`w-fit max-w-full rounded-2xl px-4 py-3 ${
                  turn.role === 'user' ? userBubbleClass : assistantBubbleClass
                }`}
              >
                <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-white/45' : 'text-slate-500'}`}>
                  {turn.role === 'user' ? 'You' : 'Assistant'}
                </p>
                <div className="text-sm leading-6">
                  {renderLightMarkdown(
                    turn.content,
                    turn.role === 'assistant' && turn.sources?.length
                      ? { byTag: new Map(turn.sources.map((s) => [s.tag, s])), onOpen: openSource }
                      : undefined,
                  )}
                </div>
                {turn.role === 'assistant' ? (
                  <AskSourcesPanel content={turn.content} sources={turn.sources} onOpenSource={openSource} />
                ) : null}
              </div>
            </div>
          ))}
          {thinking ? (
            <p className={`flex items-center gap-2 px-1 text-xs ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky/80" aria-hidden />
              {phaseLabel}
            </p>
          ) : null}
          <div ref={bottomRef} aria-hidden />
        </div>
      ) : null}
      <form onSubmit={handleAsk} className="flex items-center gap-2">
        <label htmlFor={inputId} className="sr-only">
          {placeholder || 'Ask an Expert'}
        </label>
        <input
          id={inputId}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || 'Ask an Expert…'}
          disabled={isLoading}
          aria-label={placeholder || 'Ask an Expert'}
          className={`h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none focus:border-sky/60 disabled:opacity-60 ${inputClass}`}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          aria-label="Ask"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-sky-light/40 bg-sky/20 px-4 text-sm font-semibold text-sky-lighter transition-colors hover:bg-sky/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FiSend aria-hidden /> Ask
        </button>
      </form>
      {contextLabel ? (
        <p className={`mt-1.5 text-[11px] ${isDarkMode ? 'text-white/40' : 'text-slate-500'}`}>{contextLabel}</p>
      ) : null}
      {error ? <p className={errorClass} role="alert">{error}</p> : null}
      {retrievalNote && !error ? (
        <p className={`mt-1.5 text-[11px] ${isDarkMode ? 'text-amber-200/70' : 'text-amber-700'}`}>{retrievalNote}</p>
      ) : null}
      {activeSource ? (
        <AskSourceModal
          source={activeSource}
          isDarkMode={isDarkMode}
          onClose={() => setActiveSource(null)}
          onOpenLibrary={() => {
            setActiveSource(null);
            navigate('/library');
          }}
        />
      ) : null}
    </div>
  );
}
