import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useConvex } from 'convex/react';
import { FiSend } from 'react-icons/fi';
import {
  createClaudeMessage,
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
  const [turns, setTurns] = useState<PanelTurn[]>([]);
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrievalNote, setRetrievalNote] = useState<string | null>(null);
  const [activeSource, setActiveSource] = useState<AskChunkSource | AskDocumentSource | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const openSource = (source: AskSource) => {
    if (source.kind === 'record') navigate(source.route);
    else setActiveSource(source);
  };

  const handleAsk = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    setIsLoading(true);
    setError(null);
    setRetrievalNote(null);
    try {
      // 1. Retrieval. Unless the panel is explicitly scoped to certain categories,
      // search EVERY indexed category so any linked document can answer. The index
      // is auto-refreshed inside searchProjectDocuments when a document changed.
      let passages = { context: '', sources: [] as AskChunkSource[], docCount: 0 };
      let retrievalFailed = false;
      try {
        const retrieved = await searchProjectDocuments(convex, {
          projectId,
          query: trimmed,
          documentIds: scope?.documentIds?.length ? scope.documentIds : undefined,
          categories: scope?.categories?.length ? scope.categories : undefined,
          topK: ASK_TOP_K,
        });
        passages = buildTaggedPassages(retrieved.chunks);
      } catch {
        retrievalFailed = true;
      }
      // Gentle nudge when nothing matched: a doc you expected may not be indexed
      // yet (still building) or unreadable — Library's Search coverage shows which.
      if (!retrievalFailed && passages.sources.length === 0) {
        setRetrievalNote(
          'No matching passages were found in your linked documents. If you expected one, check Search coverage in Library — the index may still be building, or a document may be unreadable.',
        );
      }

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
        ...turns.map((t) => ({ role: t.role, content: t.content })),
        { role: 'user' as const, content: trimmed },
      ];

      // 3. Bounded tool-use loop (same protocol as the splash chat).
      let response = await createClaudeMessage({ ...baseParams, messages: loopMessages });
      let toolCallCount = 0;
      while (enableRecordTools && response.stop_reason === 'tool_use' && toolCallCount < MAX_RECORD_TOOL_CALLS) {
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
        response = await createClaudeMessage({ ...baseParams, messages: loopMessages });
      }

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

      setTurns((prev) => [
        ...prev,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: reply, ...(keptSources.length > 0 ? { sources: keptSources } : {}) },
      ]);
      setQuery('');
      window.setTimeout(() => bottomRef.current?.scrollIntoView({ block: 'nearest' }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ask request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = isDarkMode
    ? 'border-white/15 bg-navy-950/60 text-white placeholder-white/35'
    : 'border-slate-300 bg-white text-slate-900 placeholder-slate-400';

  return (
    <div className="flex min-h-0 flex-col">
      {turns.length > 0 ? (
        <div className="mb-3 max-h-[45vh] space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-navy-900/45 p-3">
          {turns.map((turn, i) => (
            <div key={`${turn.role}-${i}`} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`w-fit max-w-full rounded-2xl px-4 py-3 ${
                  turn.role === 'user'
                    ? 'border border-sky/35 bg-sky/20 text-white'
                    : 'border border-white/10 bg-navy-950/80 text-white/90'
                }`}
              >
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
          {isLoading ? (
            <p className="flex items-center gap-2 px-1 text-xs text-white/55">
              <span className="h-2 w-2 animate-pulse rounded-full bg-sky/80" aria-hidden />
              Thinking…
            </p>
          ) : null}
          <div ref={bottomRef} aria-hidden />
        </div>
      ) : null}
      <form onSubmit={handleAsk} className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder || 'Ask an Expert…'}
          disabled={isLoading}
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
      {error ? <p className="mt-1.5 text-xs text-rose-300">{error}</p> : null}
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
