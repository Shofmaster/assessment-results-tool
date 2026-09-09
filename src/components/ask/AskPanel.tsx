import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useConvex } from 'convex/react';
import { FiSend } from 'react-icons/fi';
import {
  createClaudeMessage,
  createClaudeMessageStream,
  ClaudeRequestCancelledError,
  ClaudeRateLimitError,
  subscribeClaudePause,
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
import { armAskHangBudget, wasAskHangAbort, ASK_HANG_USER_MESSAGE } from '../../utils/askHangBudget';
import { applyCitationFaithfulness } from '../../utils/askCitationFaithfulness';
import {
  ASK_SPEC_GROUNDING_RULE,
  ASK_STEP_CITATION_RULE,
  applySpecGroundingGuard,
  buildSpecRefusal,
  isAircraftSpecQuery,
} from '../../utils/askSpecGrounding';
import { trackAskTurn } from '../../utils/askTelemetry';
import { ASK_MAX_OUTPUT_TOKENS, ASK_MAX_TOOL_RESULT_CHARS } from '../../utils/askSpendLimits';
import { useIsAskRerankEnabled } from '../../hooks/useConvexData';
import { AskSourcesPanel, renderLightMarkdown } from './AskMarkdown';
import AskSourceModal from './AskSourceModal';
import AskWorkPackageCard from './AskWorkPackageCard';
import LinkedFolderAccessBanner from '../LinkedFolderAccessBanner';
import { expandFullAnswerQuery, runAskWorkPackage, workPackageToMarkdown } from '../../services/askWorkPackage';
import type { AskWorkPackage } from '../../types/askWorkPackage';

type PanelTurn = {
  role: 'user' | 'assistant';
  content: string;
  sources?: AskSource[];
  driveUnavailable?: boolean;
  underCited?: boolean;
  workPackage?: AskWorkPackage;
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
  const isAskRerankEnabled = useIsAskRerankEnabled();
  const [turns, setTurns] = useState<PanelTurn[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [askPhase, setAskPhase] = useState<'searching' | 'answering' | 'pausing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retrievalNote, setRetrievalNote] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<AskChunkSource | AskDocumentSource | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const askAbortRef = useRef<AbortController | null>(null);
  const askGenerationRef = useRef(0);
  const askModeRef = useRef<'ask' | 'fullAnswer'>('ask');

  useEffect(() => {
    return () => {
      askAbortRef.current?.abort();
      askAbortRef.current = null;
    };
  }, []);

  useEffect(() => {
    return subscribeClaudePause((info) => {
      if (info) setAskPhase('pausing');
      else setAskPhase((prev) => (prev === 'pausing' ? 'answering' : prev));
    });
  }, []);

  const openSource = (source: AskSource) => {
    if (source.kind === 'record') navigate(source.route);
    else setActiveSource(source);
  };

  const handleAsk = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    const askMode = askModeRef.current;
    askModeRef.current = 'ask';
    const generation = ++askGenerationRef.current;
    const isCurrent = () => askGenerationRef.current === generation;
    askAbortRef.current?.abort();
    const abortController = new AbortController();
    askAbortRef.current = abortController;
    const askSignal = abortController.signal;
    const disarmHangBudget = armAskHangBudget(abortController);
    setIsLoading(true);
    setAskPhase('searching');
    setError(null);
    setRetrievalNote(null);
    const priorTurns = turns;
    setTurns((prev) => [...prev, { role: 'user', content: trimmed }]);
    let driveUnavailable = false;
    try {
      // 1. Retrieval. Unless the panel is explicitly scoped to certain categories,
      // search EVERY indexed category so any linked document can answer. The index
      // is auto-refreshed inside searchProjectDocuments when a document changed.
      let passages = { context: '', sources: [] as AskChunkSource[], docCount: 0 };
      let retrievalFailed = false;
      try {
        const retrievalStarted = askPerfNow();
        const retrieved = await searchProjectDocuments(convex, {
          projectId,
          query: askMode === 'fullAnswer' ? expandFullAnswerQuery(trimmed) : trimmed,
          documentIds: scope?.documentIds?.length ? scope.documentIds : undefined,
          categories: scope?.categories?.length ? scope.categories : undefined,
          topK: ASK_TOP_K,
          allowRerank: isAskRerankEnabled,
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
          'Drive manuals not searched — linked reference manuals and standards could not be reached. Open Settings to test Drive, or Library for coverage.',
        );
      } else if (!retrievalFailed && passages.sources.length === 0) {
        // Gentle nudge when nothing matched: a doc you expected may not be indexed
        // yet (still building) or unreadable — Library's Search coverage shows which.
        setRetrievalNote(
          'No matching passages were found in your linked documents. If you expected one, check Search coverage in Library — the index may still be building, or a document may be unreadable.',
        );
      }

      setAskPhase('answering');

      const specQuery = isAircraftSpecQuery(trimmed);
      // Aircraft-spec questions with nothing to cite: refuse without calling the model.
      if (specQuery && (retrievalFailed || passages.sources.length === 0)) {
        const refusal = buildSpecRefusal({ driveUnavailable });
        trackAskTurn({
          cited: false,
          citedCount: 0,
          groundedSourceCount: 0,
          underCited: false,
          driveUnavailable,
          demotedCitations: 0,
          panel: true,
        });
        setTurns((prev) => [...prev, { role: 'assistant', content: refusal, ...(driveUnavailable ? { driveUnavailable: true } : {}) }]);
        setQuery('');
        window.setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'nearest' }), 50);
        return;
      }

      if (askMode === 'fullAnswer') {
        const workPackage = await runAskWorkPackage({
          query: trimmed,
          sources: passages.sources,
          passageContext: passages.context || undefined,
          aircraft: scope?.tailNumber ? { tailNumber: scope.tailNumber } : undefined,
          signal: askSignal,
        });
        if (!isCurrent()) return;
        const citedCount = workPackage.troubleshootingSteps.reduce((n, s) => n + s.refTags.length, 0);
        trackAskTurn({
          cited: citedCount > 0,
          citedCount,
          groundedSourceCount: passages.sources.length,
          underCited: passages.sources.length > 0 && citedCount === 0,
          driveUnavailable,
          demotedCitations: 0,
          panel: true,
        });
        setTurns((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: workPackageToMarkdown(workPackage),
            sources: passages.sources.length > 0 ? passages.sources : undefined,
            workPackage,
            ...(driveUnavailable ? { driveUnavailable: true } : {}),
            ...(passages.sources.length > 0 && citedCount === 0 ? { underCited: true } : {}),
          },
        ]);
        setQuery('');
        window.setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'nearest' }), 50);
        return;
      }

      // 2. System prompt (compact variant of the splash prompt).
      const systemLines = [
        'You are an aviation audit and compliance assistant for AeroGap, answering inside an embedded panel.',
        'Answer every aviation/compliance/maintenance process question directly and concisely; never reply that a topic is outside your scope for those questions.',
        scope?.tailNumber
          ? `This panel is scoped to aircraft ${scope.tailNumber}. Interpret questions as being about this aircraft unless stated otherwise, and pass tailNumber="${scope.tailNumber}" to record tools by default.`
          : '',
        ASK_SPEC_GROUNDING_RULE,
        retrievalFailed
          ? 'Document retrieval failed for this question. Do NOT claim no company document exists — for general regulatory/process questions, answer from industry knowledge and say retrieval was unavailable. For aircraft-specific specs, do not invent values.'
          : passages.context
            ? 'Use the retrieved company document passages below as primary evidence when relevant. If they lack an aircraft-specific fact, say so and do not invent it.'
            : 'No matching company document passages were retrieved for this question; for general regulatory/process questions answer from industry knowledge and note that. Never invent aircraft-specific specs.',
        driveUnavailable
          ? 'Note: linked reference manuals and standards could NOT be searched for this question (Google Drive was unavailable). If the answer depends on a manufacturer manual or compliance standard, state plainly that those sources could not be checked rather than implying the company has none.'
          : '',
        'When you rely on a provided source excerpt or tool-result row, cite it inline with its bracket tag, e.g. "Calibration is annual [S1]." Only use tags that appear in the sources or tool results — never invent a tag. Do not produce a separate "## Sources" section.',
        ASK_STEP_CITATION_RULE,
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
        max_tokens: ASK_MAX_OUTPUT_TOKENS,
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
      let toolResultChars = 0;
      let toolSpendCapped = false;
      if (enableRecordTools) {
        response = await createClaudeMessage(
          { ...baseParams, messages: loopMessages },
          { signal: askSignal },
        );
        let toolCallCount = 0;
        while (response.stop_reason === 'tool_use' && toolCallCount < MAX_RECORD_TOOL_CALLS) {
          if (askSignal.aborted || !isCurrent()) throw new ClaudeRequestCancelledError();
          if (toolResultChars >= ASK_MAX_TOOL_RESULT_CHARS) {
            toolSpendCapped = true;
            break;
          }
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
            toolResultChars += executed.resultForModel.length;
            const contentForModel =
              toolResultChars > ASK_MAX_TOOL_RESULT_CHARS
                ? `${executed.resultForModel}\n\n[Tool results truncated — Ask spend cap reached.]`
                : executed.resultForModel;
            if (toolResultChars > ASK_MAX_TOOL_RESULT_CHARS) toolSpendCapped = true;
            toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: contentForModel });
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
          if (toolSpendCapped) break;
        }
        disarmHangBudget();
        askPerfLog('claude', claudeStarted, { streamed: false, toolCalls: toolCallCount, panel: true });
      } else {
        // Spec queries: buffer until the grounding guard passes.
        let sawFirstToken = false;
        response = await createClaudeMessageStream(
          { ...baseParams, messages: loopMessages },
          {
            onText: (chunk) => {
              if (!isCurrent()) return;
              if (specQuery) {
                if (!sawFirstToken) {
                  disarmHangBudget();
                  askPerfLog('claude-ttft', claudeStarted, { panel: true });
                  sawFirstToken = true;
                  setAskPhase(null);
                }
                return;
              }
              if (!sawFirstToken) {
                disarmHangBudget();
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
        disarmHangBudget();
        askPerfLog('claude', claudeStarted, { streamed: true, panel: true });
      }

      if (!isCurrent()) return;

      const text = response.content
        .filter((block): block is { type: string; text?: string } => block.type === 'text')
        .map((block) => block.text || '')
        .join('\n')
        .trim();
      let reply =
        (text || 'No response returned.') +
        (toolSpendCapped
          ? '\n\n_…record-tool results were capped for this turn to control cost._'
          : '');

      const cited = new Set(segmentAnswerWithCitations(reply, [...passages.sources, ...recordSources]).citedTags);
      const preFaith: AskSource[] = [
        ...passages.sources,
        ...recordSources.filter((s) => cited.has(s.tag)),
      ];
      const faith = applyCitationFaithfulness(reply, preFaith);
      reply = faith.content;
      const citedAfter = new Set(segmentAnswerWithCitations(reply, faith.sources).citedTags);
      let keptSources: AskSource[] = [
        ...passages.sources,
        ...recordSources.filter((s) => citedAfter.has(s.tag)),
      ];
      const specGuard = applySpecGroundingGuard(reply, keptSources, { driveUnavailable });
      if (specGuard.blocked) {
        reply = specGuard.content;
        keptSources = [];
      }

      trackAskTurn({
        cited: !specGuard.blocked && faith.citedCount > 0,
        citedCount: specGuard.blocked ? 0 : faith.citedCount,
        groundedSourceCount: faith.groundedSourceCount,
        underCited: !specGuard.blocked && faith.underCited,
        driveUnavailable,
        demotedCitations: faith.demotedTags.length,
        panel: true,
      });

      const assistantTurn: PanelTurn = {
        role: 'assistant',
        content: reply,
        ...(keptSources.length > 0 ? { sources: keptSources } : {}),
        ...(driveUnavailable ? { driveUnavailable: true } : {}),
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
      disarmHangBudget();
      if (!isCurrent()) return;
      if (wasAskHangAbort(askSignal)) {
        trackAskTurn({
          cited: false,
          citedCount: 0,
          groundedSourceCount: 0,
          underCited: false,
          driveUnavailable,
          demotedCitations: 0,
          hangTimeout: true,
          panel: true,
        });
        setError(ASK_HANG_USER_MESSAGE);
        setTurns((prev) => {
          const last = prev[prev.length - 1];
          return last?.role === 'user' && last.content === trimmed ? prev.slice(0, -1) : prev;
        });
        return;
      }
      if (err instanceof ClaudeRequestCancelledError) return;
      if (err instanceof ClaudeRateLimitError) {
        setError('Still rate-limited after waiting — try again in a moment.');
      } else {
        setError(err instanceof Error ? err.message : 'Ask request failed.');
      }
      // Roll back the pending user turn so a retry doesn't duplicate it (the
      // typed query is still in the input — it only clears on success).
      setTurns((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === 'user' && last.content === trimmed ? prev.slice(0, -1) : prev;
      });
    } finally {
      disarmHangBudget();
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
    askPhase === 'searching'
      ? 'Searching your documents…'
      : askPhase === 'pausing'
        ? 'Pausing briefly…'
        : 'Generating answer…';
  const liveStatus = error
    ? error
    : thinking
      ? phaseLabel
      : streaming
        ? 'Assistant is responding…'
        : retrievalNote || '';

  return (
    <div className="flex min-h-0 flex-col">
      <LinkedFolderAccessBanner className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3" />
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
                {turn.role === 'assistant' && turn.workPackage ? (
                  <AskWorkPackageCard
                    package={turn.workPackage}
                    sources={turn.sources}
                    onOpenSource={openSource}
                  />
                ) : (
                  <>
                    <div className="text-sm leading-6">
                      {renderLightMarkdown(
                        turn.content,
                        turn.role === 'assistant' && turn.sources?.length
                          ? {
                              byTag: new Map(turn.sources.map((s) => [s.tag, s])),
                              onOpen: openSource,
                              markUncitedSteps: true,
                            }
                          : undefined,
                      )}
                    </div>
                    {turn.role === 'assistant' ? (
                      <AskSourcesPanel content={turn.content} sources={turn.sources} onOpenSource={openSource} />
                    ) : null}
                  </>
                )}
                {turn.role === 'assistant' && turn.driveUnavailable ? (
                  <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                    <span
                      className={
                        isDarkMode
                          ? 'rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-100'
                          : 'rounded-md border border-amber-500/40 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-900'
                      }
                    >
                      Drive manuals not searched
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate('/settings')}
                      className={`underline-offset-2 hover:underline ${isDarkMode ? 'text-sky-200' : 'text-sky-700'}`}
                    >
                      Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/library')}
                      className={`underline-offset-2 hover:underline ${isDarkMode ? 'text-sky-200' : 'text-sky-700'}`}
                    >
                      Library
                    </button>
                  </p>
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
      <form onSubmit={handleAsk} className="flex flex-wrap items-center gap-2">
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
        <button
          type="button"
          disabled={isLoading || !query.trim()}
          aria-label="Full answer"
          title="MEL, troubleshooting, references, and example log entries"
          onClick={() => {
            askModeRef.current = 'fullAnswer';
            const form = document.getElementById(inputId)?.closest('form');
            form?.requestSubmit();
          }}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-sky-light/30 bg-transparent px-3 text-sm font-semibold text-sky-lighter/90 transition-colors hover:bg-sky/15 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Full answer
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
