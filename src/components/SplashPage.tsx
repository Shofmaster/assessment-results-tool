import { FormEvent, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AUDIT_AGENTS } from '../services/auditAgents';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { useAppStore } from '../store/appStore';
import {
  useCreateChecklistRunFromSelectedDocs,
  useDocuments,
  useEntityProfile,
  usePaperworkReviewAgentId,
  useSimulationResults,
} from '../hooks/useConvexData';
import { AUDIT_CHECKLIST_TEMPLATES } from '../config/auditChecklistTemplates';
import { downloadPlainTextPdf } from '../utils/exportPlainTextPdf';

type SearchTarget = 'agents' | 'claude' | 'web' | 'internal';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

type InternalDestination = {
  path: string;
  label: string;
  description: string;
  keywords: string[];
};

function renderInlineMarkdown(text: string): Array<string | JSX.Element> {
  const nodes: Array<string | JSX.Element> = [];
  const tokenRegex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = null;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`link-${match.index}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
        >
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(<strong key={`strong-${match.index}`} className="font-semibold text-white">{match[4]}</strong>);
    } else if (match[5]) {
      nodes.push(
        <code key={`code-${match.index}`} className="rounded bg-white/10 px-1 py-0.5 text-xs text-white">
          {match[5]}
        </code>
      );
    } else if (match[6]) {
      nodes.push(<em key={`em-${match.index}`} className="italic text-white/95">{match[6]}</em>);
    }
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderLightMarkdown(text: string): JSX.Element {
  const lines = text.split('\n');
  const blocks: JSX.Element[] = [];
  const bulletLines: string[] = [];

  const flushBullets = (keySuffix: number) => {
    if (bulletLines.length === 0) return;
    blocks.push(
      <ul key={`ul-${keySuffix}`} className="mb-3 list-disc space-y-1 pl-5 text-sm text-white/90">
        {bulletLines.map((line, idx) => (
          <li key={`li-${keySuffix}-${idx}`}>{renderInlineMarkdown(line)}</li>
        ))}
      </ul>
    );
    bulletLines.length = 0;
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushBullets(idx);
      return;
    }

    const bullet = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (bullet) {
      bulletLines.push(bullet[1]);
      return;
    }

    flushBullets(idx);

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1 ? 'text-lg font-semibold text-white' : level === 2 ? 'text-base font-semibold text-white' : 'text-sm font-semibold text-white/95';
      blocks.push(
        <p key={`h-${idx}`} className={`mb-2 mt-1 ${cls}`}>
          {renderInlineMarkdown(heading[2])}
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="mb-2 text-sm leading-7 text-white/90">
        {renderInlineMarkdown(line)}
      </p>
    );
  });

  flushBullets(lines.length + 1);
  return <div>{blocks}</div>;
}

function formatChatAsMarkdown(turns: ChatTurn[]): string {
  return turns
    .map((t) => (t.role === 'user' ? `**You:**\n${t.content}` : `**Assistant:**\n${t.content}`))
    .join('\n\n---\n\n');
}

function stripMarkdownSourcesSection(text: string): string {
  const idx = text.search(/^##\s+sources\s*$/im);
  if (idx === -1) return text;
  return text.slice(0, idx).trimEnd();
}

function truncateForChecklistName(s: string, max = 72): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

type ChecklistItemDraft = { section: string; title: string; severity: 'major' };

function extractChecklistItemsFromAnswer(answer: string): ChecklistItemDraft[] {
  const lines = answer
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const bulletLike = lines
    .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter((line) => line.length > 8 && line.length <= 180);
  const source =
    bulletLike.length > 0
      ? bulletLike
      : answer
          .split(/[.!?]\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 18 && s.length <= 180)
          .slice(0, 8);

  const dedup = new Set<string>();
  return source
    .filter((title) => {
      const key = title.toLowerCase();
      if (dedup.has(key)) return false;
      dedup.add(key);
      return true;
    })
    .slice(0, 12)
    .map((title) => ({
      section: 'AI Recommended Actions',
      title,
      severity: 'major' as const,
    }));
}

async function extractChecklistItemsViaClaude(userQuestion: string, answerBody: string): Promise<ChecklistItemDraft[]> {
  const body = stripMarkdownSourcesSection(answerBody).slice(0, 14000);
  const response = await createClaudeMessage({
    model: DEFAULT_CLAUDE_MODEL,
    max_tokens: 2000,
    temperature: 0.15,
    system: [
      'You turn an aviation compliance Q&A into a concise checklist.',
      'Reply with ONLY a JSON array (no markdown fences, no commentary).',
      'Each element must be an object: {"title": string}.',
      'Between 4 and 12 items. Short imperative titles (under 180 characters).',
      'Reflect actionable points from the assistant answer, in context of the user question.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: `User question:\n${userQuestion.slice(0, 2000)}\n\nAssistant answer:\n${body}`,
      },
    ],
  });
  const text = response.content
    .filter((block): block is { type: string; text?: string } => block.type === 'text')
    .map((block) => block.text || '')
    .join('\n')
    .trim();
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ChecklistItemDraft[] = [];
  const seen = new Set<string>();
  for (const row of parsed) {
    if (!row || typeof row !== 'object') continue;
    const title = typeof (row as { title?: unknown }).title === 'string' ? (row as { title: string }).title.trim() : '';
    if (title.length < 6 || title.length > 220) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ section: 'AI Recommended Actions', title, severity: 'major' });
    if (out.length >= 12) break;
  }
  return out;
}

const SPLASH_DRAFT_STORAGE_PREFIX = 'aerogap_splash_draft_v1:';

function splashDraftStorageKey(userId: string): string {
  return `${SPLASH_DRAFT_STORAGE_PREFIX}${userId}`;
}

function ChatThread({
  turns,
  bottomRef,
  isLoading,
}: {
  turns: ChatTurn[];
  bottomRef: MutableRefObject<HTMLDivElement | null>;
  isLoading: boolean;
}) {
  return (
    <div className="mt-3 max-h-[min(60vh,520px)] overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-navy-900/45 p-4 pr-3 [scrollbar-gutter:stable]">
      <div className="flex flex-col gap-3">
        {turns.map((turn, i) => (
          <div key={`${turn.role}-${i}`} className={`flex ${turn.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[min(100%,42rem)] rounded-2xl px-4 py-3 ${
                turn.role === 'user'
                  ? 'border border-sky/35 bg-sky/20 text-white'
                  : 'border border-white/10 bg-navy-950/80 text-white/90'
              }`}
            >
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">
                {turn.role === 'user' ? 'You' : 'Assistant'}
              </p>
              <div className="text-sm leading-7">{renderLightMarkdown(turn.content)}</div>
            </div>
          </div>
        ))}
        {isLoading ? (
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

const INTERNAL_DESTINATIONS: InternalDestination[] = [
  { path: '/logbook', label: 'Logbook Management', description: 'Project setup and operational records', keywords: ['logbook', 'project', 'records'] },
  { path: '/audit', label: 'Audit Simulation', description: 'Run multi-agent audit conversations', keywords: ['audit', 'simulation', 'agents'] },
  { path: '/guided-audit', label: 'Guided Audit', description: 'Step-by-step guided compliance review', keywords: ['guided', 'checklist', 'review'] },
  { path: '/review', label: 'Paperwork Review', description: 'Compare documents and generate findings', keywords: ['paperwork', 'documents', 'findings'] },
  { path: '/analysis', label: 'Analysis', description: 'Deep AI analysis of uploaded data', keywords: ['analysis', 'insights', 'ai'] },
  { path: '/library', label: 'Library', description: 'Reference and standards document library', keywords: ['library', 'references', 'standards'] },
  { path: '/schedule', label: 'Schedule', description: 'Recurring inspection planning and tracking', keywords: ['schedule', 'inspection', 'recurring'] },
  { path: '/entity-issues', label: 'CARs & Issues', description: 'Corrective action tracking', keywords: ['cars', 'issues', 'corrective'] },
];

export default function SplashPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const profile = useEntityProfile(activeProjectId || undefined) as any;
  const projectDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const simulationResults = (useSimulationResults(activeProjectId || undefined) || []) as any[];
  const paperworkReviewAgentId = usePaperworkReviewAgentId();
  const createChecklistRunFromSelectedDocs = useCreateChecklistRunFromSelectedDocs();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<SearchTarget>('agents');
  const [isLoading, setIsLoading] = useState(false);
  const [claudeChat, setClaudeChat] = useState<ChatTurn[]>([]);
  const [agentChat, setAgentChat] = useState<ChatTurn[]>([]);
  const [isCreatingChecklist, setIsCreatingChecklist] = useState(false);
  const [splashDraftHydrated, setSplashDraftHydrated] = useState(false);
  const agentChatBottomRef = useRef<HTMLDivElement>(null);
  const claudeChatBottomRef = useRef<HTMLDivElement>(null);

  const latestAgentAssistant = [...agentChat].reverse().find((m) => m.role === 'assistant');
  const agentResponse = latestAgentAssistant?.content ?? '';

  useEffect(() => {
    if (target !== 'agents') return;
    agentChatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [target, agentChat, isLoading]);

  useEffect(() => {
    if (target !== 'claude') return;
    claudeChatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [target, claudeChat, isLoading]);

  useEffect(() => {
    if (!user?.id) {
      setSplashDraftHydrated(false);
      return;
    }

    setSplashDraftHydrated(false);
    setAgentChat([]);
    setClaudeChat([]);

    try {
      const raw = localStorage.getItem(splashDraftStorageKey(user.id));
      if (raw) {
        const parsed = JSON.parse(raw) as { query?: unknown; target?: unknown };
        if (typeof parsed.query === 'string') setQuery(parsed.query);
        const t = parsed.target;
        if (
          t === 'internal' ||
          t === 'agents' ||
          t === 'claude' ||
          t === 'web'
        ) {
          setTarget(t);
        }
      } else {
        setQuery('');
        setTarget('agents');
      }
    } catch {
      setQuery('');
      setTarget('agents');
    }
    setSplashDraftHydrated(true);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !splashDraftHydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          splashDraftStorageKey(user.id),
          JSON.stringify({ query, target })
        );
      } catch {
        /* quota / private mode */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [user?.id, query, target, splashDraftHydrated]);

  const normalizedQuery = query.trim().toLowerCase();
  const latestSimulation = useMemo(() => {
    if (!simulationResults.length) return null;
    return simulationResults
      .slice()
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))[0];
  }, [simulationResults]);

  const entityTypeContext = useMemo(() => {
    const selectedPerspective = paperworkReviewAgentId || 'generic';
    const faaParts: string[] = Array.isArray((latestSimulation as any)?.faaConfig?.partsScope)
      ? ((latestSimulation as any).faaConfig.partsScope as string[])
      : [];
    const publicUseEntityType = (latestSimulation as any)?.publicUseConfig?.entityType as string | undefined;
    const publicUseFocus = (latestSimulation as any)?.publicUseConfig?.auditFocus as string | undefined;

    const labels: string[] = [];
    if (selectedPerspective !== 'generic') labels.push(`perspective=${selectedPerspective}`);
    if (faaParts.length) labels.push(`faaParts=${faaParts.join(',')}`);
    if (publicUseEntityType) labels.push(`publicUseEntityType=${publicUseEntityType}`);
    if (publicUseFocus) labels.push(`publicUseFocus=${publicUseFocus}`);

    return {
      selectedPerspective,
      faaParts,
      publicUseEntityType,
      publicUseFocus,
      labels,
    };
  }, [latestSimulation, paperworkReviewAgentId]);
  const hasEntityTypeContext = entityTypeContext.labels.length > 0;

  const internalResults = useMemo(() => {
    if (!normalizedQuery) return INTERNAL_DESTINATIONS;
    return INTERNAL_DESTINATIONS.filter((item) => {
      const haystack = `${item.label} ${item.description} ${item.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  const suggestedAgents = useMemo(() => {
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    const scored = AUDIT_AGENTS.map((agent) => {
      const haystack = `${agent.name} ${agent.role} ${agent.id}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (token.length < 3) continue;
        if (haystack.includes(token)) score += 2;
      }
      if (normalizedQuery.includes('faa') && agent.id === 'faa-inspector') score += 4;
      if (normalizedQuery.includes('easa') && agent.id === 'easa-inspector') score += 4;
      if (normalizedQuery.includes('isbao') && agent.id === 'isbao-auditor') score += 4;
      if (normalizedQuery.includes('nasa') && agent.id === 'nasa-auditor') score += 4;
      if (normalizedQuery.includes('safety') && agent.id === 'safety-auditor') score += 3;
      if (normalizedQuery.includes('sms') && agent.id === 'sms-consultant') score += 3;
      if (normalizedQuery.includes('quality') && agent.id === 'as9100-auditor') score += 3;
      if (normalizedQuery.includes('145') && agent.id === 'faa-inspector') score += 4;
      if (normalizedQuery.includes('91') && (agent.id === 'faa-inspector' || agent.id === 'isbao-auditor')) score += 3;
      if (normalizedQuery.includes('public use') && agent.id === 'public-use-auditor') score += 5;

      // Bias routing by saved perspective/configuration.
      if (entityTypeContext.selectedPerspective === agent.id) score += 4;
      if (entityTypeContext.faaParts.includes('145') && agent.id === 'faa-inspector') score += 3;
      if (entityTypeContext.faaParts.includes('91') && (agent.id === 'faa-inspector' || agent.id === 'isbao-auditor')) score += 2;
      if (entityTypeContext.selectedPerspective === 'public-use-auditor' && agent.id === 'public-use-auditor') score += 3;
      return { agent, score };
    })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((entry) => entry.agent);
    return scored.length > 0 ? scored : AUDIT_AGENTS.slice(0, 3);
  }, [entityTypeContext, normalizedQuery]);

  const shouldOfferChecklist = useMemo(() => {
    const text = agentResponse.toLowerCase();
    if (!text) return false;
    return (
      /(^|\n)\s*(\-|\*|\d+\.)\s+/.test(agentResponse) ||
      /\b(checklist|steps?|actions?|must|should|recommend|corrective action|follow-up)\b/.test(text)
    );
  }, [agentResponse]);

  const handleCreateChecklistFromAnswer = async () => {
    if (!activeProjectId) {
      toast.error('Select a project first to create a checklist.');
      navigate('/logbook');
      return;
    }
    if (!agentResponse.trim()) {
      toast.error('No answer available to build a checklist from.');
      return;
    }
    const template = AUDIT_CHECKLIST_TEMPLATES[0];
    const variant = template?.variants[0];
    if (!template || !variant) {
      toast.error('No checklist template is configured.');
      return;
    }
    const lastUser = [...agentChat].reverse().find((m) => m.role === 'user')?.content?.trim() ?? '';
    const answerBody = stripMarkdownSourcesSection(agentResponse);
    let aiItems = extractChecklistItemsFromAnswer(answerBody);

    const selectedProjectDocumentIds = projectDocuments
      .filter((doc) => (doc.extractedText || '').trim().length > 0)
      .slice(0, 10)
      .map((doc) => doc._id);

    const checklistTitle = lastUser
      ? `${truncateForChecklistName(lastUser)} — ${new Date().toLocaleDateString()}`
      : `Search checklist — ${new Date().toLocaleDateString()}`;

    setIsCreatingChecklist(true);
    try {
      if (aiItems.length === 0) {
        aiItems = await extractChecklistItemsViaClaude(lastUser || answerBody.slice(0, 500), agentResponse);
      }
      if (aiItems.length === 0) {
        toast.error('Could not extract checklist items from the answer.');
        return;
      }
      const runId = await createChecklistRunFromSelectedDocs({
        projectId: activeProjectId as any,
        profileId: profile?._id,
        name: checklistTitle,
        framework: template.framework,
        frameworkLabel: template.label,
        subtypeId: variant.id,
        subtypeLabel: variant.label,
        generatedFromTemplateVersion: template.version,
        items: aiItems,
        selectedProjectDocumentIds: selectedProjectDocumentIds as any[],
        selectedSharedReferenceDocumentIds: [],
      });
      toast.success('Checklist created from answer');
      navigate(`/checklists?runId=${encodeURIComponent(String(runId))}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create checklist');
    } finally {
      setIsCreatingChecklist(false);
    }
  };

  const exportAgentAnswerPdf = async () => {
    if (agentChat.length === 0) return;
    try {
      await downloadPlainTextPdf({
        filename: `aerogap-agents-${new Date().toISOString().slice(0, 10)}.pdf`,
        title: 'AeroGap — Agent search answer',
        query:
          [...agentChat].reverse().find((m) => m.role === 'user')?.content?.trim() ||
          query.trim() ||
          'Conversation',
        bodyMarkdown: formatChatAsMarkdown(agentChat),
        modeLabel: 'Ask agents (auto)',
      });
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create PDF');
    }
  };

  const exportClaudeAnswerPdf = async () => {
    if (!claudeChat.length) return;
    try {
      await downloadPlainTextPdf({
        filename: `aerogap-claude-${new Date().toISOString().slice(0, 10)}.pdf`,
        title: 'AeroGap — Claude conversation',
        query: claudeChat.filter((t) => t.role === 'user').slice(-1)[0]?.content?.trim() || 'Conversation',
        bodyMarkdown: formatChatAsMarkdown(claudeChat),
        modeLabel: 'Claude API',
      });
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create PDF');
    }
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error('Enter a search query.');
      return;
    }

    if (target === 'web') {
      window.open(`https://www.google.com/search?q=${encodeURIComponent(trimmed)}`, '_blank', 'noopener,noreferrer');
      return;
    }

    if (target === 'claude') {
      setIsLoading(true);
      const messagesForApi: ChatTurn[] = [...claudeChat, { role: 'user', content: trimmed }];
      try {
        const response = await createClaudeMessage({
          model: DEFAULT_CLAUDE_MODEL,
          max_tokens: 720,
          temperature: 0.2,
          system: [
            'You are a concise aviation and quality-assurance assistant.',
            'Answer directly and practically.',
            'You are in a multi-turn chat: use earlier messages in this thread for context, pronouns, and follow-ups.',
            'After your main answer, add a markdown section titled exactly "## Sources".',
            'Under Sources, use bullet lines ("- ") naming each regulation, advisory circular, standard, or other primary authority you relied on (for example "14 CFR §43.9", "EASA Part-M").',
            'If you used general reasoning without a specific citation, say so under Sources. Do not fabricate citations.',
          ].join('\n'),
          messages: messagesForApi,
        });
        const text = response.content
          .filter((block): block is { type: string; text?: string } => block.type === 'text')
          .map((block) => block.text || '')
          .join('\n')
          .trim();
        const reply = text || 'No response returned.';
        setClaudeChat((prev) => [...prev, { role: 'user', content: trimmed }, { role: 'assistant', content: reply }]);
        setQuery('');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Claude request failed.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (target === 'agents') {
      setIsLoading(true);
      const messagesForApi: ChatTurn[] = [...agentChat, { role: 'user', content: trimmed }];
      try {
        const routed = suggestedAgents;
        const availableAgents = routed
          .map((agent) => `- ${agent.name} (${agent.id}): ${agent.role}`)
          .join('\n');
        const systemLines = [
          'You are an audit assistant router for AeroGap.',
          'Automatically answer the user question from the most relevant audit expert perspective(s).',
          'Use the listed experts only. If one expert is clearly best, answer from that expert.',
          'If multiple experts are needed, synthesize a single direct answer.',
          'You are in a multi-turn chat: use earlier user and assistant messages for context, follow-ups, and clarifications.',
          'Do not mention expert names, agent names, roles, or routing decisions in the output.',
          'Keep the response practical and concise, with clear action steps when applicable.',
          'Where you state requirements or interpret rules, cite the underlying authority in the prose (for example "per 14 CFR §145.51" or "FAA AC 120-92B recommends…") when specific.',
          'After your main answer, add a markdown section titled exactly "## Sources". Under Sources, use bullet lines ("- ") listing each regulation, AC, standard, or other primary document you relied on, with enough detail to identify it. If you relied on general practice without a named document, say so. Do not fabricate citations.',
          'Available experts for this question:',
          availableAgents,
        ];
        if (hasEntityTypeContext) {
          systemLines.splice(
            4,
            0,
            'Base your answer on the configured entity type context first (for example: Part 145, Part 91, or Public Use) unless the user explicitly asks for a different framework.'
          );
          const expertsIdx = systemLines.findIndex((line) => line === 'Available experts for this question:');
          if (expertsIdx !== -1) {
            systemLines.splice(
              expertsIdx,
              0,
              '',
              `Configured entity context: ${entityTypeContext.labels.join(' | ')}`,
              ''
            );
          }
        }
        const system = systemLines.join('\n');
        const response = await createClaudeMessage({
          model: DEFAULT_CLAUDE_MODEL,
          max_tokens: 960,
          temperature: 0.2,
          system,
          messages: messagesForApi,
        });
        const text = response.content
          .filter((block): block is { type: string; text?: string } => block.type === 'text')
          .map((block) => block.text || '')
          .join('\n')
          .trim();
        const reply = text || 'No response returned.';
        setAgentChat((prev) => [...prev, { role: 'user', content: trimmed }, { role: 'assistant', content: reply }]);
        setQuery('');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Agent answer failed.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (target === 'internal' && internalResults.length > 0) {
      navigate(internalResults[0].path);
      return;
    }
  };

  return (
    <div className="box-border flex w-full min-h-full flex-col px-4 py-6 sm:py-8 md:px-8">
      <div className="mx-auto my-auto w-full min-w-0 max-w-4xl">
        <div className="rounded-2xl border border-white/10 bg-navy-900/50 p-6 md:p-8 backdrop-blur">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sky-light shadow-lg shadow-sky/30">
            <svg className="h-14 w-14 text-white" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              {/* Nacelle / inlet lip */}
              <circle cx="32" cy="32" r="29" stroke="currentColor" strokeOpacity="0.5" strokeWidth="2.5" />
              <circle cx="32" cy="32" r="26" stroke="currentColor" strokeOpacity="0.22" strokeWidth="1" />
              {/* Fan shroud shadow ring */}
              <circle cx="32" cy="32" r="23.5" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1.5" />
              <g
                fill="currentColor"
                fillOpacity={0.9}
                className="animate-[spin_12s_linear_infinite]"
                style={{ transformOrigin: '32px 32px' }}
              >
                {/* 14 high-bypass-style fan blades: narrow at hub, wider at tip, slight sweep */}
                {Array.from({ length: 14 }, (_, i) => (
                  <path
                    key={i}
                    d="M32 21.8 Q34.5 16.8 35 11.4 L32 10.3 L29 11.4 Q29.5 16.8 32 21.8 Z"
                    transform={`rotate(${(360 / 14) * i} 32 32)`}
                  />
                ))}
              </g>
              {/* Blade root platform ring (static) */}
              <circle cx="32" cy="32" r="11.5" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1" />
              {/* Spinner cone + hub */}
              <circle cx="32" cy="32" r="8.5" fill="currentColor" fillOpacity={0.35} />
              <circle cx="32" cy="32" r="6.2" fill="#0b1f3d" />
              <ellipse cx="32" cy="31" rx="3.2" ry="2" fill="currentColor" fillOpacity={0.45} />
            </svg>
          </div>
          <h1 className="text-2xl md:text-3xl font-poppins font-bold text-white">Welcome to AeroGap</h1>
          <p className="mt-2 text-sm text-white/70">
            One search bar for internal navigation, auto-routed agent Q&amp;A, Claude API, or web search. Agent and Claude modes keep a running thread—ask follow-ups like a chat.
          </p>
        </div>

        <form onSubmit={handleSearch} className="mt-8 space-y-3" autoComplete="off">
          <label htmlFor="splash-search" className="sr-only">
            Search AeroGap
          </label>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              id="splash-search"
              name={user?.id ? `aerogap-splash-q-${user.id}` : 'aerogap-splash-q'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                target === 'web'
                  ? 'Search the web…'
                  : target === 'agents'
                    ? agentChat.length
                      ? 'Ask a follow-up…'
                      : 'Ask a question or search pages…'
                    : target === 'claude'
                      ? claudeChat.length
                        ? 'Ask a follow-up…'
                        : 'Ask a question or search pages…'
                      : 'Ask a question or search pages…'
              }
              autoComplete="off"
              className="w-full rounded-xl border border-white/15 bg-navy-800/70 px-4 py-3 text-white placeholder:text-white/40 focus:border-sky/60 focus:outline-none"
            />
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as SearchTarget)}
              className="rounded-xl border border-white/15 bg-navy-800/70 px-3 py-3 text-white focus:border-sky/60 focus:outline-none"
            >
              <option value="internal">Internal search</option>
              <option value="agents">Ask agents (auto)</option>
              <option value="claude">Claude API</option>
              <option value="web">Web search</option>
            </select>
            <button
              type="submit"
              disabled={isLoading}
              className="rounded-xl bg-sky px-5 py-3 font-semibold text-white hover:bg-sky-light disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>
        {hasEntityTypeContext && (
          <p className="mt-2 text-xs text-white/60">
            Context applied: {entityTypeContext.labels.join(' | ')}
          </p>
        )}

        {target === 'internal' && (
          <div className="mt-6 max-h-[min(40vh,380px)] space-y-2 overflow-y-auto overflow-x-hidden pr-1">
            {internalResults.slice(0, 8).map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left transition-colors hover:bg-white/10"
              >
                <div className="text-sm font-semibold text-white">{item.label}</div>
                <div className="text-xs text-white/65">{item.description}</div>
              </button>
            ))}
            {internalResults.length === 0 && <p className="text-sm text-white/60">No internal matches found.</p>}
          </div>
        )}

        {target === 'agents' && (
          <div className="mt-6 rounded-2xl border border-sky/30 bg-gradient-to-br from-sky/15 via-navy-800/40 to-navy-900/30 p-5 shadow-lg shadow-sky/10">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-light">Conversation</p>
              <div className="flex flex-wrap items-center gap-2">
                {agentChat.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setAgentChat([])}
                    className="shrink-0 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
                  >
                    New chat
                  </button>
                ) : null}
                {agentChat.length > 0 ? (
                  <button
                    type="button"
                    onClick={exportAgentAnswerPdf}
                    className="shrink-0 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    Export PDF
                  </button>
                ) : null}
              </div>
            </div>
            {agentChat.length > 0 || isLoading ? (
              <>
                <ChatThread turns={agentChat} bottomRef={agentChatBottomRef} isLoading={isLoading} />
                {shouldOfferChecklist && agentResponse ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                    <p className="text-sm text-white/85">Create a checklist from the latest reply?</p>
                    <button
                      type="button"
                      onClick={handleCreateChecklistFromAnswer}
                      disabled={isCreatingChecklist}
                      className="rounded-lg bg-sky px-3 py-2 text-xs font-semibold text-white hover:bg-sky-light disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isCreatingChecklist ? 'Creating checklist...' : 'Create checklist'}
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/checklists')}
                      className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10"
                    >
                      Open checklists
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="mt-2 text-sm text-white/60">
                Ask your question and AeroGap will route it to the most relevant expert perspective. Follow up in the same thread anytime.
              </p>
            )}
          </div>
        )}

        {target === 'claude' && (claudeChat.length > 0 || isLoading) && (
          <div className="mt-6 rounded-xl border border-sky/30 bg-sky/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-light">Conversation</p>
              <div className="flex flex-wrap items-center gap-2">
                {claudeChat.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setClaudeChat([])}
                    className="shrink-0 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
                  >
                    New chat
                  </button>
                ) : null}
                {claudeChat.length > 0 ? (
                  <button
                    type="button"
                    onClick={exportClaudeAnswerPdf}
                    className="shrink-0 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                  >
                    Export PDF
                  </button>
                ) : null}
              </div>
            </div>
            <ChatThread turns={claudeChat} bottomRef={claudeChatBottomRef} isLoading={isLoading} />
          </div>
        )}
        {target === 'claude' && claudeChat.length === 0 && !isLoading ? (
          <p className="mt-4 text-center text-sm text-white/55">Choose Claude API and send a message to start a thread.</p>
        ) : null}
        </div>
      </div>
    </div>
  );
}
