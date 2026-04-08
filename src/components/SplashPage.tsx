import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AUDIT_AGENTS } from '../services/auditAgents';
import type { AuditAgent } from '../types/auditSimulation';
import { AgentAvatarBadge } from './AgentAvatarBadge';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { useAppStore } from '../store/appStore';
import { useTheme } from '../context/ThemeContext';
import {
  useCreateChecklistRunFromSelectedDocs,
  useDocuments,
  useEntityProfile,
  useIsFeatureEnabled,
  usePaperworkReviewAgentId,
  useSimulationResults,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import { AUDIT_CHECKLIST_TEMPLATES } from '../config/auditChecklistTemplates';
import { downloadPlainTextPdf } from '../utils/exportPlainTextPdf';

type SearchTarget = 'agents' | 'internal';

type ChatTurn = { role: 'user' | 'assistant'; content: string };
const SPLASH_CHAT_HISTORY_MAX_TURNS = 80;

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

const KNOWN_SPLASH_AGENT_IDS: Set<string> = new Set(AUDIT_AGENTS.map((a) => a.id));

function normalizeSplashPickedAgentIds(raw: unknown): AuditAgent['id'][] {
  if (!Array.isArray(raw)) return [];
  const out: AuditAgent['id'][] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== 'string' || !KNOWN_SPLASH_AGENT_IDS.has(item) || seen.has(item)) continue;
    seen.add(item);
    out.push(item as AuditAgent['id']);
  }
  return out;
}

function normalizeChatTurns(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatTurn[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') continue;
    const trimmed = content.trim();
    if (!trimmed) continue;
    out.push({ role, content: trimmed });
  }
  return out.slice(-SPLASH_CHAT_HISTORY_MAX_TURNS);
}

function previewChatTurn(turns: ChatTurn[]): string {
  const last = turns[turns.length - 1];
  if (!last) return 'No saved messages.';
  const prefix = last.role === 'user' ? 'You: ' : 'Assistant: ';
  const line = `${prefix}${last.content}`;
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}

function readSavedAgentChatSnapshot(userId: string): ChatTurn[] {
  try {
    const raw = localStorage.getItem(splashDraftStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { agentChat?: unknown };
    return normalizeChatTurns(parsed.agentChat);
  } catch {
    return [];
  }
}

function buildUploadedDocumentsContext(documents: any[]): { context: string; usedCount: number; totalAvailable: number } {
  const uploadedWithText = (documents || []).filter(
    (doc) => doc?.category === 'uploaded' && typeof doc?.extractedText === 'string' && doc.extractedText.trim().length > 0
  );
  if (!uploadedWithText.length) {
    return { context: '', usedCount: 0, totalAvailable: 0 };
  }

  const maxDocs = 6;
  const maxPerDocChars = 2600;
  const maxTotalChars = 14000;
  let totalChars = 0;
  const chunks: string[] = [];
  let usedCount = 0;

  for (const doc of uploadedWithText.slice(0, maxDocs)) {
    const name = String(doc?.name || doc?.title || `Uploaded document ${usedCount + 1}`).trim();
    const normalizedText = String(doc.extractedText)
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalizedText) continue;
    const body = normalizedText.slice(0, maxPerDocChars);
    const chunk = `### ${name}\n${body}`;
    if (totalChars + chunk.length > maxTotalChars) break;
    chunks.push(chunk);
    totalChars += chunk.length;
    usedCount += 1;
  }

  if (!chunks.length) {
    return { context: '', usedCount: 0, totalAvailable: uploadedWithText.length };
  }

  return {
    context: chunks.join('\n\n'),
    usedCount,
    totalAvailable: uploadedWithText.length,
  };
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
    <div className="mt-3 max-h-[min(45vh,640px)] w-full overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-navy-900/45 p-4 pr-3 [scrollbar-gutter:stable] xl:mx-auto xl:max-w-6xl 2xl:max-w-7xl">
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
              <div className="text-sm leading-6">{renderLightMarkdown(turn.content)}</div>
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
  {
    path: '/quality-command-center',
    label: 'Quality & Compliance',
    description: 'QM hub: readiness summary, audit prep, CARs, roster, inspections, and checklists',
    keywords: ['quality', 'dashboard', 'command', 'chief', 'inspector', 'readiness', 'qm', 'prep', 'compliance'],
  },
  { path: '/logbook', label: 'Logbook Management', description: 'Projects and records', keywords: ['logbook', 'project', 'records'] },
  { path: '/logbook?tab=schedule', label: 'Schedule', description: 'Inspection schedule', keywords: ['schedule', 'inspection', 'recurring'] },
  { path: '/form-337', label: 'FAA Form 337', description: 'Form 337 records', keywords: ['337', 'form 337', 'faa', 'major repair', 'alteration'] },
  { path: '/library', label: 'Library', description: 'Standards library', keywords: ['library', 'references', 'standards'] },
  { path: '/review', label: 'Paperwork Review', description: 'Document findings', keywords: ['paperwork', 'documents', 'findings'] },
  { path: '/analysis', label: 'Analysis', description: 'AI analysis', keywords: ['analysis', 'insights', 'ai'] },
  { path: '/entity-issues', label: 'CARs & Issues', description: 'Corrective actions', keywords: ['cars', 'issues', 'corrective'] },
  { path: '/guided-audit', label: 'Guided Audit', description: 'Compliance review', keywords: ['guided', 'checklist', 'review'] },
  { path: '/audit', label: 'Audit Simulation', description: 'Agent audit chat', keywords: ['audit', 'simulation', 'agents'] },
];

export default function SplashPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const chatUtilityButtonClass = isDarkMode
    ? 'inline-flex h-8 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-semibold text-white/90 hover:bg-white/10'
    : 'inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100';
  const chatUtilityStrongButtonClass = isDarkMode
    ? 'inline-flex h-8 items-center justify-center rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15'
    : 'inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-200';
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const isChecklistsEnabled = useIsFeatureEnabled(FEATURE_KEYS.CHECKLISTS);
  const profile = useEntityProfile(activeProjectId || undefined) as any;
  const projectDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const simulationResults = (useSimulationResults(activeProjectId || undefined) || []) as any[];
  const paperworkReviewAgentId = usePaperworkReviewAgentId();
  const createChecklistRunFromSelectedDocs = useCreateChecklistRunFromSelectedDocs();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<SearchTarget>('agents');
  const [isLoading, setIsLoading] = useState(false);
  const [agentChat, setAgentChat] = useState<ChatTurn[]>([]);
  const [persistPreviousChats, setPersistPreviousChats] = useState(true);
  const [isCreatingChecklist, setIsCreatingChecklist] = useState(false);
  const [useUploadedDocsContext, setUseUploadedDocsContext] = useState(true);
  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [splashDraftHydrated, setSplashDraftHydrated] = useState(false);
  const [savedAgentChatSnapshot, setSavedAgentChatSnapshot] = useState<ChatTurn[]>([]);
  /** When false, experts = suggestions from wording ∪ always-include pins. When true, only splashAskAgentsPickedIds (fixed; query changes do not alter it). */
  const [splashAskAgentsManual, setSplashAskAgentsManual] = useState(false);
  const [splashAskAgentsPickedIds, setSplashAskAgentsPickedIds] = useState<AuditAgent['id'][]>([]);
  /** In auto mode: merged into every message on top of suggested agents. Add/remove anytime. */
  const [splashAskAgentPinnedIds, setSplashAskAgentPinnedIds] = useState<AuditAgent['id'][]>([]);
  const agentChatBottomRef = useRef<HTMLDivElement>(null);
  const splashSearchRef = useRef<HTMLTextAreaElement>(null);

  const latestAgentAssistant = [...agentChat].reverse().find((m) => m.role === 'assistant');
  const agentResponse = latestAgentAssistant?.content ?? '';

  useLayoutEffect(() => {
    const el = splashSearchRef.current;
    if (!el) return;
    const max = Math.min(window.innerHeight * 0.5, 480);
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, max);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [query]);

  useEffect(() => {
    if (target !== 'agents') return;
    agentChatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [target, agentChat, isLoading]);

  useEffect(() => {
    if (agentChat.length > 0) setShowAgentSettings(false);
  }, [agentChat.length]);

  useEffect(() => {
    if (!user?.id) {
      setSplashDraftHydrated(false);
      return;
    }

    setSplashDraftHydrated(false);
    setAgentChat([]);
    setPersistPreviousChats(true);
    setSplashAskAgentsManual(false);
    setSplashAskAgentsPickedIds([]);
    setSplashAskAgentPinnedIds([]);

    try {
      const raw = localStorage.getItem(splashDraftStorageKey(user.id));
      if (raw) {
        const parsed = JSON.parse(raw) as {
          query?: unknown;
          target?: unknown;
          persistPreviousChats?: unknown;
          agentChat?: unknown;
          useUploadedDocsContext?: unknown;
          splashAskAgentsManual?: unknown;
          splashAskAgentsPickedIds?: unknown;
          splashAskAgentPinnedIds?: unknown;
        };
        if (typeof parsed.query === 'string') setQuery(parsed.query);
        const t = parsed.target;
        if (t === 'internal' || t === 'agents') {
          setTarget(t);
        } else if (t === 'claude' || t === 'web') {
          setTarget('agents');
        }
        const persistChats = parsed.persistPreviousChats !== false;
        setPersistPreviousChats(persistChats);
        if (persistChats) {
          setAgentChat(normalizeChatTurns(parsed.agentChat));
        } else {
          setAgentChat([]);
        }
        if (typeof parsed.useUploadedDocsContext === 'boolean') {
          setUseUploadedDocsContext(parsed.useUploadedDocsContext);
        }
        const picked = normalizeSplashPickedAgentIds(parsed.splashAskAgentsPickedIds);
        const manual = parsed.splashAskAgentsManual === true && picked.length > 0;
        setSplashAskAgentsManual(manual);
        setSplashAskAgentsPickedIds(manual ? picked : []);
        setSplashAskAgentPinnedIds(normalizeSplashPickedAgentIds(parsed.splashAskAgentPinnedIds));
      } else {
        setQuery('');
        setTarget('agents');
        setPersistPreviousChats(true);
        setUseUploadedDocsContext(true);
        setSplashAskAgentsManual(false);
        setSplashAskAgentsPickedIds([]);
        setSplashAskAgentPinnedIds([]);
      }
    } catch {
      setQuery('');
      setTarget('agents');
      setPersistPreviousChats(true);
      setUseUploadedDocsContext(true);
      setSplashAskAgentsManual(false);
      setSplashAskAgentsPickedIds([]);
      setSplashAskAgentPinnedIds([]);
    }
    setSplashDraftHydrated(true);
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !splashDraftHydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          splashDraftStorageKey(user.id),
          JSON.stringify({
            query,
            target,
            persistPreviousChats,
            ...(persistPreviousChats
              ? {
                  agentChat: agentChat.slice(-SPLASH_CHAT_HISTORY_MAX_TURNS),
                }
              : {}),
            useUploadedDocsContext,
            splashAskAgentsManual: splashAskAgentsManual && splashAskAgentsPickedIds.length > 0,
            splashAskAgentsPickedIds,
            splashAskAgentPinnedIds,
          })
        );
      } catch {
        /* quota / private mode */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [user?.id, query, target, persistPreviousChats, agentChat, useUploadedDocsContext, splashDraftHydrated, splashAskAgentsManual, splashAskAgentsPickedIds, splashAskAgentPinnedIds]);

  useEffect(() => {
    if (!user?.id) {
      setSavedAgentChatSnapshot([]);
      return;
    }
    setSavedAgentChatSnapshot(readSavedAgentChatSnapshot(user.id));
  }, [user?.id, splashDraftHydrated, agentChat]);

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
    if (faaParts.length) labels.push(`FAA parts: ${faaParts.join(', ')}`);
    if (publicUseEntityType) labels.push(`entity: ${publicUseEntityType}`);
    if (publicUseFocus) labels.push(`focus: ${publicUseFocus}`);

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
      if ((normalizedQuery.includes('isbao') || normalizedQuery.includes('is-bao')) && agent.id === 'isbao-auditor') score += 4;
      if (normalizedQuery.includes('nasa') && agent.id === 'nasa-auditor') score += 4;
      if ((normalizedQuery.includes('safety') || normalizedQuery.includes('argus') || normalizedQuery.includes('wyvern')) && agent.id === 'safety-auditor') score += 3;
      if ((normalizedQuery.includes('sms') || normalizedQuery.includes('safety management')) && agent.id === 'sms-consultant') score += 4;
      if ((normalizedQuery.includes('quality') || normalizedQuery.includes('as9100') || normalizedQuery.includes('qms')) && agent.id === 'as9100-auditor') score += 4;
      if ((normalizedQuery.includes('145') || normalizedQuery.includes('part 145') || normalizedQuery.includes('repair station')) && agent.id === 'faa-inspector') score += 4;
      if ((normalizedQuery.includes('part 91') || normalizedQuery.includes('part91')) && (agent.id === 'faa-inspector' || agent.id === 'isbao-auditor')) score += 3;
      if ((normalizedQuery.includes('part 135') || normalizedQuery.includes('135') || normalizedQuery.includes('charter') || normalizedQuery.includes('air carrier')) && agent.id === 'faa-inspector') score += 3;
      if ((normalizedQuery.includes('public use') || normalizedQuery.includes('government aircraft') || normalizedQuery.includes('law enforcement') || normalizedQuery.includes('fire rescue')) && agent.id === 'public-use-auditor') score += 6;
      if ((normalizedQuery.includes('supply chain') || normalizedQuery.includes('supplier') || normalizedQuery.includes('vendor')) && agent.id === 'supply-chain-auditor') score += 4;

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

  const suggestedIdSet = useMemo(() => new Set(suggestedAgents.map((a) => a.id)), [suggestedAgents]);
  const uploadedDocsContext = useMemo(() => buildUploadedDocumentsContext(projectDocuments), [projectDocuments]);

  const routedAgentsForAsk = useMemo(() => {
    if (splashAskAgentsManual) {
      if (splashAskAgentsPickedIds.length === 0) {
        return [];
      }
      return splashAskAgentsPickedIds
        .map((id) => AUDIT_AGENTS.find((a) => a.id === id))
        .filter((a): a is (typeof AUDIT_AGENTS)[number] => Boolean(a));
    }
    const mergedIds = [...new Set([...suggestedAgents.map((a) => a.id), ...splashAskAgentPinnedIds])];
    return mergedIds
      .map((id) => AUDIT_AGENTS.find((a) => a.id === id))
      .filter((a): a is (typeof AUDIT_AGENTS)[number] => Boolean(a));
  }, [splashAskAgentsManual, splashAskAgentsPickedIds, suggestedAgents, splashAskAgentPinnedIds]);

  const nextRosterNames = useMemo(() => {
    if (routedAgentsForAsk.length === 0) return '—';
    return routedAgentsForAsk.map((a) => a.name).join(', ');
  }, [routedAgentsForAsk]);

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
        modeLabel:
          splashAskAgentsManual && splashAskAgentsPickedIds.length > 0
            ? 'Ask agents (manual roster)'
            : splashAskAgentPinnedIds.length > 0
              ? 'Ask agents (auto + always include)'
              : 'Ask agents (auto)',
      });
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create PDF');
    }
  };

  const beginSplashManualExperts = () => {
    const merged = [...new Set([...suggestedAgents.map((a) => a.id), ...splashAskAgentPinnedIds])];
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds(merged);
  };

  const endSplashManualExperts = () => {
    setSplashAskAgentsManual(false);
    setSplashAskAgentsPickedIds([]);
  };

  const toggleSplashAskExpert = (id: AuditAgent['id']) => {
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSplashAlwaysInclude = (id: AuditAgent['id']) => {
    if (splashAskAgentsManual) return;
    setSplashAskAgentPinnedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const clearSplashAlwaysInclude = () => {
    setSplashAskAgentPinnedIds([]);
  };

  const selectAllSplashAskExperts = () => {
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds(AUDIT_AGENTS.map((a) => a.id));
  };

  const clearSplashAskExpertChecks = () => {
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds([]);
  };

  const clearSavedChatHistory = () => {
    setAgentChat([]);

    if (!user?.id) return;
    try {
      const key = splashDraftStorageKey(user.id);
      const raw = localStorage.getItem(key);
      if (!raw) {
        toast.success('Saved chat history cleared');
        return;
      }
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      delete parsed.agentChat;
      delete parsed.claudeChat;
      localStorage.setItem(key, JSON.stringify(parsed));
      toast.success('Saved chat history cleared');
    } catch {
      toast.error('Could not clear saved chat history');
    }
  };

  const loadSavedAgentChat = () => {
    if (!user?.id) return;
    const snapshot = readSavedAgentChatSnapshot(user.id);
    if (snapshot.length === 0) {
      toast.error('No saved Ask Agents chat found.');
      return;
    }
    setPersistPreviousChats(true);
    setTarget('agents');
    setAgentChat(snapshot);
    toast.success('Loaded saved Ask Agents chat.');
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error('Enter a search query.');
      return;
    }

    if (target === 'agents') {
      const routed = routedAgentsForAsk;
      if (routed.length === 0) {
        toast.error('Select at least one expert, or switch back to auto routing.');
        return;
      }
      if (agentChat.length === 0) setShowAgentSettings(false);
      setIsLoading(true);
      const messagesForApi: ChatTurn[] = [...agentChat, { role: 'user', content: trimmed }];
      try {
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
        if (useUploadedDocsContext && uploadedDocsContext.context) {
          systemLines.push(
            '',
            'Use uploaded project document content as primary evidence when relevant to the question.',
            'If uploaded documents do not contain a required fact, state that clearly before using general standards/guidance.',
            '',
            `Uploaded document context (${uploadedDocsContext.usedCount}/${uploadedDocsContext.totalAvailable} docs included):`,
            uploadedDocsContext.context
          );
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
    <div className="box-border flex w-full min-h-full flex-col px-3 py-5 sm:px-4 sm:py-7 md:px-8 md:py-9 lg:px-12 xl:px-16 2xl:px-24">
      <div className="mx-auto my-auto w-full min-w-0 max-w-[min(96vw,110rem)]">
        <div
          className={`rounded-2xl p-5 sm:p-7 md:p-8 lg:p-10 backdrop-blur ${
            isDarkMode
              ? 'border border-white/10 bg-navy-900/50'
              : 'border border-slate-200/90 bg-white/90 shadow-xl shadow-slate-300/35'
          }`}
        >
        <div className="text-center">
          <div className="mx-auto mb-3 sm:mb-4 flex h-14 w-14 sm:h-20 sm:w-20 lg:h-24 lg:w-24 items-center justify-center rounded-2xl bg-gradient-to-br from-sky to-sky-light shadow-lg shadow-sky/30">
            <svg className="h-10 w-10 sm:h-14 sm:w-14 lg:h-16 lg:w-16 text-white" viewBox="0 0 64 64" fill="none" aria-hidden="true">
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
          <h1 className={`text-xl sm:text-2xl md:text-3xl lg:text-4xl font-poppins font-bold tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>AeroGap</h1>
          <p className={`mt-1 text-sm font-semibold tracking-tight ${isDarkMode ? 'text-sky-light' : 'text-sky-700'}`}>Assistive Intelligence</p>
          <p className={`mt-2 text-xs ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>Not artificial intelligence.</p>
        </div>

        <form onSubmit={handleSearch} className="mt-6 sm:mt-8 space-y-3" autoComplete="off">
          <label htmlFor="splash-search" className="sr-only">
            Search AeroGap
          </label>
          <div className="flex flex-col gap-3 md:flex-row md:items-stretch">
            <textarea
              ref={splashSearchRef}
              id="splash-search"
              name={user?.id ? `aerogap-splash-q-${user.id}` : 'aerogap-splash-q'}
              rows={1}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }}
              placeholder={
                target === 'agents'
                  ? agentChat.length
                    ? 'Ask a follow-up…'
                    : 'Ask a question or search pages…'
                  : 'Ask a question or search pages…'
              }
              autoComplete="off"
              className={`w-full min-w-0 resize-none rounded-xl px-4 py-3 focus:outline-none md:min-h-[3rem] md:flex-1 md:basis-0 leading-normal ${
                isDarkMode
                  ? 'border border-white/15 bg-navy-800/70 text-white placeholder:text-white/40 focus:border-sky/60'
                  : 'border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-sky'
              }`}
            />
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as SearchTarget)}
              className={`w-full shrink-0 rounded-xl px-3 py-3 focus:outline-none md:w-auto ${
                isDarkMode
                  ? 'border border-white/15 bg-navy-800/70 text-white focus:border-sky/60'
                  : 'border border-slate-300 bg-white text-slate-900 focus:border-sky'
              }`}
            >
              <option value="internal">Internal search</option>
              <option value="agents">Ask agents</option>
            </select>
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full shrink-0 rounded-xl px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 md:w-auto ${
                isDarkMode
                  ? 'bg-sky hover:bg-sky-light'
                  : 'bg-sky-600 hover:bg-sky-700 shadow-sm shadow-sky-700/25'
              }`}
            >
              {isLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>
        {target === 'agents' && !splashAskAgentsManual && query.trim().length > 0 && (
          <p className={`mt-3 text-xs ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
            Asking: <span className={isDarkMode ? 'text-white/85' : 'text-slate-700'}>{suggestedAgents.map((a) => a.name).join(', ')}</span>
            {splashAskAgentPinnedIds.length > 0 && ` + ${splashAskAgentPinnedIds.length} pinned`}
          </p>
        )}
        {hasEntityTypeContext && (
          <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
            Context: {entityTypeContext.labels.join(' | ')}
          </p>
        )}
        {target === 'agents' && uploadedDocsContext.totalAvailable > 0 && query.trim().length > 0 ? (
          <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
            Document context: {useUploadedDocsContext ? `on (${uploadedDocsContext.usedCount}/${uploadedDocsContext.totalAvailable})` : `off (${uploadedDocsContext.totalAvailable} available)`}.
          </p>
        ) : null}

        {target === 'internal' && (
          <div className="mt-7 max-h-[min(35vh,380px)] space-y-2.5 overflow-y-auto overflow-x-hidden pr-1">
            {internalResults.slice(0, 8).map((item) => (
              <button
                key={item.path}
                type="button"
                onClick={() => navigate(item.path)}
                className={`w-full rounded-lg p-3 text-left transition-colors ${
                  isDarkMode
                    ? 'border border-white/10 bg-white/5 hover:bg-white/10'
                    : 'border border-slate-200 bg-white hover:bg-slate-50'
                }`}
              >
                <div className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{item.label}</div>
                <div className={`text-xs ${isDarkMode ? 'text-white/65' : 'text-slate-500'}`}>{item.description}</div>
              </button>
            ))}
            {internalResults.length === 0 && <p className={`text-sm ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>No internal matches found.</p>}
          </div>
        )}

        {target === 'agents' && (agentChat.length > 0 || isLoading) && (
          <div
            className={`mt-7 rounded-2xl p-5 ${
              isDarkMode
                ? 'border border-sky/30 bg-gradient-to-br from-sky/15 via-navy-800/40 to-navy-900/30 shadow-lg shadow-sky/10'
                : 'border border-sky/20 bg-gradient-to-br from-sky-50 via-white to-blue-50 shadow-lg shadow-slate-300/30'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-light">Conversation</p>
              <div className="flex flex-wrap items-center gap-2">
                {agentChat.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAgentChat([]);
                      setSplashAskAgentsManual(false);
                      setSplashAskAgentsPickedIds([]);
                      setSplashAskAgentPinnedIds([]);
                      setShowAgentSettings(false);
                    }}
                    className={`${chatUtilityButtonClass} shrink-0`}
                  >
                    New chat
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowAgentSettings((prev) => !prev)}
                  className={`${chatUtilityButtonClass} shrink-0`}
                >
                  {showAgentSettings ? 'Hide settings' : 'Chat settings'}
                </button>
                {agentChat.length > 0 ? (
                  <button
                    type="button"
                    onClick={exportAgentAnswerPdf}
                    className={`${chatUtilityStrongButtonClass} shrink-0`}
                  >
                    Export PDF
                  </button>
                ) : null}
              </div>
            </div>
            {agentChat.length > 0 || isLoading ? (
              <>
                <ChatThread turns={agentChat} bottomRef={agentChatBottomRef} isLoading={isLoading} />
                {shouldOfferChecklist && agentResponse && isChecklistsEnabled ? (
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
              <p className={`mt-2 text-sm ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>Ask a question to start.</p>
            )}

            {showAgentSettings ? (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4" role="region" aria-label="Chat settings">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Chat settings</p>
                <div className="mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Save previous chats</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={clearSavedChatHistory}
                        className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10"
                      >
                        Clear saved history
                      </button>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={persistPreviousChats}
                        onClick={() => setPersistPreviousChats((prev) => !prev)}
                        className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                          persistPreviousChats
                            ? 'border-sky/40 bg-sky/20 text-sky-light hover:bg-sky/25'
                            : 'border-white/20 bg-white/5 text-white/85 hover:bg-white/10'
                        }`}
                      >
                        {persistPreviousChats ? 'On' : 'Off'}
                      </button>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-white/60">
                    Stores this chat thread for your signed-in account on this device.
                  </p>
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Uploaded documents context</p>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={useUploadedDocsContext}
                      onClick={() => setUseUploadedDocsContext((prev) => !prev)}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                        useUploadedDocsContext
                          ? 'border-sky/40 bg-sky/20 text-sky-light hover:bg-sky/25'
                          : 'border-white/20 bg-white/5 text-white/85 hover:bg-white/10'
                      }`}
                    >
                      {useUploadedDocsContext ? 'On' : 'Off'}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-white/60">
                    {uploadedDocsContext.totalAvailable > 0
                      ? `Available: ${uploadedDocsContext.totalAvailable}. Included: ${useUploadedDocsContext ? uploadedDocsContext.usedCount : 0}.`
                      : 'No extracted documents available.'}
                  </p>
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Saved Ask Agents chat</p>
                    <span className="text-xs text-white/60">{savedAgentChatSnapshot.length} messages</span>
                  </div>
                  <p className="mt-2 text-xs text-white/60">{previewChatTurn(savedAgentChatSnapshot)}</p>
                  <button
                    type="button"
                    onClick={loadSavedAgentChat}
                    disabled={savedAgentChatSnapshot.length === 0}
                    className="mt-3 rounded-lg border border-sky/40 bg-sky/20 px-3 py-1.5 text-xs font-semibold text-sky-light hover:bg-sky/25 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Load saved Ask Agents chat
                  </button>
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Routing mode</p>
                    {!splashAskAgentsManual ? (
                      <button
                        type="button"
                        onClick={beginSplashManualExperts}
                        className="shrink-0 rounded-lg border border-sky/40 bg-sky/15 px-3 py-1.5 text-xs font-semibold text-sky-light hover:bg-sky/25"
                      >
                        Set experts manually…
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={endSplashManualExperts}
                        className="shrink-0 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10"
                      >
                        Use auto routing
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-white/60">
                    {splashAskAgentsManual ? 'Manual roster is active.' : 'Auto routing is active.'}
                  </p>
                </div>
                <div className="mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-white/65">Experts for this thread</p>
                  <p className="mt-2 text-sm text-white/85">
                    <span className="text-white/60">Next message uses:</span>{' '}
                    <span className="font-medium text-white">{nextRosterNames}</span>
                  </p>
                  {!splashAskAgentsManual ? (
                  <>
                    <p className="mt-2 text-xs text-white/60">
                      Suggestions update from your question. Pin experts to always include.
                    </p>
                    <p className="mt-2 text-sm text-white/75">
                      Suggested: <span className="font-medium text-white">{suggestedAgents.map((a) => a.name).join(', ')}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/55">Always include (optional)</p>
                      {splashAskAgentPinnedIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={clearSplashAlwaysInclude}
                          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10"
                        >
                          Clear always-include
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 grid max-h-[min(35vh,400px)] grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden pr-1 sm:grid-cols-2 lg:grid-cols-3 [scrollbar-gutter:stable]">
                      {AUDIT_AGENTS.map((agent) => {
                        const pinned = splashAskAgentPinnedIds.includes(agent.id);
                        const inSuggestions = suggestedIdSet.has(agent.id);
                        return (
                          <label
                            key={agent.id}
                            className={`flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left transition-colors hover:bg-white/10 ${pinned ? 'border-sky/35 bg-sky/10' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={pinned}
                              onChange={() => toggleSplashAlwaysInclude(agent.id)}
                              aria-label={`Always include ${agent.name} on every agent reply`}
                              className="mt-1 shrink-0 rounded border-white/30 bg-white/5 text-sky-light focus:ring-sky"
                            />
                            <span className="min-w-0 text-sm text-white/90 flex items-start gap-2">
                              <AgentAvatarBadge agentId={agent.id} size="sm" className="mt-0.5" />
                              <span>
                                <span className="font-medium text-white">{agent.name}</span>
                                {inSuggestions ? (
                                  <span className="ml-1.5 text-[10px] font-medium uppercase tracking-wide text-sky-light/90">
                                    Also suggested
                                  </span>
                                ) : null}
                                <span className="mt-0.5 block text-xs text-white/55 line-clamp-2">{agent.role}</span>
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mt-2 text-xs text-white/60">
                      Manual roster stays fixed until you switch back to auto.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={selectAllSplashAskExperts}
                        className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10"
                      >
                        Check all
                      </button>
                      <button
                        type="button"
                        onClick={clearSplashAskExpertChecks}
                        className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10"
                      >
                        Uncheck all
                      </button>
                    </div>
                    <div className="mt-3 grid max-h-[min(35vh,400px)] grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden pr-1 sm:grid-cols-2 lg:grid-cols-3 [scrollbar-gutter:stable]">
                      {AUDIT_AGENTS.map((agent) => (
                        <label
                          key={agent.id}
                          className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left transition-colors hover:bg-white/10"
                        >
                          <input
                            type="checkbox"
                            checked={splashAskAgentsPickedIds.includes(agent.id)}
                            onChange={() => toggleSplashAskExpert(agent.id)}
                            className="mt-1 shrink-0 rounded border-white/30 bg-white/5 text-sky-light focus:ring-sky"
                          />
                          <span className="min-w-0 text-sm text-white/90 flex items-start gap-2">
                            <AgentAvatarBadge agentId={agent.id} size="sm" className="mt-0.5" />
                            <span>
                              <span className="font-medium text-white">{agent.name}</span>
                              <span className="mt-0.5 block text-xs text-white/55 line-clamp-2">{agent.role}</span>
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {splashAskAgentsPickedIds.length === 0 ? (
                      <p className="mt-2 text-xs text-amber-200/90">Select at least one expert.</p>
                    ) : null}
                  </>
                  )}
                </div>
              </div>
            ) : agentChat.length > 0 ? (
              <p className="mt-4 text-xs text-white/55">
                Open <span className="text-white/80">Chat settings</span> to adjust routing or document context.
              </p>
            ) : null}
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
