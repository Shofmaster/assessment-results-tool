import { FormEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useConvex } from 'convex/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { AUDIT_AGENTS } from '../services/auditAgents';
import type { AuditAgent } from '../types/auditSimulation';
import {
  createClaudeMessage,
  createClaudeMessageStream,
  type ClaudeMessageParams,
  type ClaudeToolResultContent,
  type ClaudeToolUseBlock,
} from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { askPerfLog, askPerfNow } from '../utils/askPerf';
import {
  RECORD_TOOLS,
  MAX_RECORD_TOOL_CALLS,
  executeRecordTool,
} from '../services/askRecordTools';
import { useAppStore } from '../store/appStore';
import { useTheme } from '../context/ThemeContext';
import {
  useCreateChecklistRunFromSelectedDocs,
  useCompanyFeaturePolicyByProject,
  useComplianceScopeCompanyId,
  useDocuments,
  useDocumentsByCompany,
  useEntityProfile,
  useIsFeatureEnabled,
  useMergedEntityRevisionDocs,
  useProject,
  useProjects,
  useSharedReferenceDocsResolved,
  useSimulationResults,
  useTechnicalPublicationsByCompany,
  useUserSettings,
  useEnabledAgentIds,
  useAircraftAssetsForLibrary,
  useSharedAgentDocsByAgentsResolved,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import { AUDIT_CHECKLIST_TEMPLATES } from '../config/auditChecklistTemplates';
import { downloadSplashReportPdf, type SplashReportEntry } from '../services/splashReportGenerator';
import {
  ASK_AGENT_ROUTING_HISTORY_TURNS,
  buildRoutingQueryText,
  resolveRoutedAgentsForAsk,
  resolveSuggestedAgents,
  type AskAgentEntityContext,
} from '../utils/askAgentRouting';
import { searchDocuments, loadProjectIndexCoverage, type CoverageRow } from '../services/driveSearchIntegration';
import { ASK_TOP_K } from '../constants/search';
import type { Id } from '../../convex/_generated/dataModel';
import { useIndexSummary } from '../hooks/useIndexSummary';
import {
  type AskSource,
  type AskChunkSource,
  type AskDocumentSource,
  type AskRecordSource,
  createTagAllocator,
  segmentAnswerWithCitations,
} from '../types/askSources';
import AskSourceModal from './ask/AskSourceModal';
import AuditPrepCard from './AuditPrepCard';
import { categoryLabel } from './ask/AskMarkdown';
import { useIndexingProgress } from '../hooks/useIndexingProgress';
import {
  indexingStallHint,
  indexingUnavailableToast,
  isIndexingUnavailableError,
} from '../utils/indexingEnvMessage';
import ChatHistoryPanel from './splash/ChatHistoryPanel';
import ChatThread from './splash/ChatThread';
import {
  splashDraftStorageKey,
  normalizeSplashPickedAgentIds,
  normalizeChatTurns,
  makeConversationId,
  deriveConversationTitle,
  readStoredConversations,
  writeStoredConversations,
  type AssistantTurnMeta,
  type ChatTurn,
  type RetrievedDocRef,
  type StoredConversation,
} from './splash/chatModel';
import {
  ASK_AGENTS_FOCUS_THRESHOLD,
  TECHNICAL_LIBRARY_CATEGORIES,
  COMPANY_DOCUMENT_CATEGORIES,
  remediationHintForReason,
  buildUploadedDocumentsContext,
  buildSharedReferenceContext,
  buildRetrievedPassageContext,
  buildRetrievedFullDocumentContext,
  buildCompanyProfileContext,
} from './splash/askContext';
import {
  stripMarkdownSourcesSection,
  truncateForChecklistName,
  extractChecklistItemsFromAnswer,
  extractChecklistItemsViaClaude,
  parseSourcesSection,
  extractReportExtrasViaClaude,
} from './splash/askExtraction';

type InternalDestination = {
  path: string;
  label: string;
  description: string;
  keywords: string[];
};

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
  const location = useLocation();
  const convex = useConvex();
  const { user } = useUser();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const chatUtilityButtonClass = isDarkMode
    ? 'inline-flex h-8 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-semibold text-white/90 hover:bg-white/10'
    : 'inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100';
  const chatUtilityStrongButtonClass = isDarkMode
    ? 'inline-flex h-8 items-center justify-center rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15'
    : 'inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-200';
  const advancedRegionClass = isDarkMode
    ? 'mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4'
    : 'mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4';
  const advancedSubPanelClass = isDarkMode
    ? 'mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3'
    : 'mt-3 rounded-lg border border-slate-200 bg-white p-3';
  const advancedTitleClass = isDarkMode
    ? 'text-xs font-semibold uppercase tracking-wide text-white/70'
    : 'text-xs font-semibold uppercase tracking-wide text-slate-600';
  const advancedLabelClass = isDarkMode
    ? 'text-xs font-semibold uppercase tracking-wide text-white/65'
    : 'text-xs font-semibold uppercase tracking-wide text-slate-600';
  const advancedMutedClass = isDarkMode ? 'text-white/55' : 'text-slate-500';
  const advancedBodyClass = isDarkMode ? 'text-white/85' : 'text-slate-800';
  const advancedTextClass = isDarkMode ? 'text-white/60' : 'text-slate-600';
  const advancedStrongClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const advancedChipButtonClass = isDarkMode
    ? 'shrink-0 rounded-lg border border-sky/40 bg-sky/15 px-3 py-1.5 text-xs font-semibold text-sky-light hover:bg-sky/25'
    : 'shrink-0 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100';
  const advancedGhostButtonClass = isDarkMode
    ? 'shrink-0 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10'
    : 'shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100';
  const advancedOptionClass = isDarkMode
    ? 'flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left transition-colors hover:bg-white/10'
    : 'flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-colors hover:bg-slate-50';
  const checklistOfferClass = isDarkMode
    ? 'mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3'
    : 'mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3';
  const checklistOfferTextClass = isDarkMode ? 'text-sm text-white/85' : 'text-sm text-slate-700';
  const checklistSecondaryButtonClass = isDarkMode
    ? 'rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10'
    : 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100';
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const isChecklistsEnabled = useIsFeatureEnabled(FEATURE_KEYS.CHECKLISTS);
  const isAskCitationsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ASK_CITATIONS);
  const isAskRecordToolsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ASK_RECORD_TOOLS);
  const profile = useEntityProfile(activeProjectId || undefined) as any;
  const userSettings = useUserSettings() as any;
  const companyPolicy = useCompanyFeaturePolicyByProject(activeProjectId || undefined) as any;
  const sharedReferenceDocs = (useSharedReferenceDocsResolved() || []) as any[];
  const scopeCompanyId = useComplianceScopeCompanyId();
  const projectDocumentsRaw = useDocuments(activeProjectId || undefined) as any[] | undefined;
  const projectDocuments = (projectDocumentsRaw || []) as any[];
  const allProjects = useProjects() as any[] | undefined;
  // Only show the onboarding card once we affirmatively know the user has no
  // documents. activeProjectId starts null on every load (not persisted) and is
  // assigned after projects/settings resolve, so gating on "length === 0" alone
  // flashes the card on every app open while queries are still settling.
  const showGettingStarted = activeProjectId
    ? projectDocumentsRaw !== undefined && projectDocumentsRaw.length === 0
    : allProjects !== undefined && userSettings !== undefined && allProjects.length === 0;
  const mergedEntityDocs = (useMergedEntityRevisionDocs(activeProjectId || undefined) || []) as any[];
  const activeProject = useProject(activeProjectId ?? undefined) as { companyId?: Id<'companies'> } | null | undefined;
  const retrievalCompanyId = (activeProject?.companyId
    ? String(activeProject.companyId)
    : scopeCompanyId) as string | undefined;
  const companyMaintenanceDocs = (useDocumentsByCompany(retrievalCompanyId, 'maintenance_manual') || []) as any[];
  const companyPartsDocs = (useDocumentsByCompany(retrievalCompanyId, 'parts_catalog') || []) as any[];
  const companyLogbookScanDocs = (useDocumentsByCompany(retrievalCompanyId, 'logbook_scan') || []) as any[];

  // Aircraft-tail-specific scoping: if the active project has aircraft assets,
  // restrict maintenance_manual / parts_catalog / logbook_scan pulls to manuals
  // bound to that aircraft (or fleet-wide, i.e. no aircraft binding). Falls back
  // to the broad company-wide list when no aircraft exists yet.
  // The aircraft binding lives on `technicalPublications`, not on `documents`,
  // so we resolve via the publications table and build a documentId allow-set.
  // Retrieval scoping only needs the aircraft tails, not the Logbook entitlement.
  // Use the library-safe variant so a logbook-disabled user (or a transient auth
  // drop) doesn't throw "Server Error" through this splash-page render.
  const aircraftAssets = (useAircraftAssetsForLibrary(activeProjectId || undefined) || []) as any[];
  const allCompanyPublications = (useTechnicalPublicationsByCompany(retrievalCompanyId) || []) as Array<{
    documentId?: string;
    title?: string;
    publicationType?: string;
    aircraftIds?: unknown[];
    aircraftTypeIds?: unknown[];
    projectId?: string;
  }>;
  const aircraftDocIdSet = useMemo(() => {
    if (!aircraftAssets.length) return null;
    const result = new Set<string>();
    for (const pub of allCompanyPublications) {
      const docId = pub?.documentId ? String(pub.documentId) : null;
      if (!docId) continue;
      const appliesToAnyTail = aircraftAssets.some((a: any) => {
        const typeIds = (pub.aircraftTypeIds ?? []) as string[];
        const tailIds = (pub.aircraftIds ?? []) as string[];
        if (typeIds.length === 0 && tailIds.length === 0) return true;
        if (tailIds.some((aid) => String(aid) === String(a._id))) return true;
        if (a.aircraftTypeId && typeIds.some((tid) => String(tid) === String(a.aircraftTypeId))) return true;
        return false;
      });
      if (appliesToAnyTail) result.add(docId);
    }
    return result;
  }, [aircraftAssets, allCompanyPublications]);

  const scopedManuals = useMemo(
    () => (aircraftDocIdSet ? companyMaintenanceDocs.filter((d) => aircraftDocIdSet.has(String(d._id))) : companyMaintenanceDocs),
    [aircraftDocIdSet, companyMaintenanceDocs],
  );
  const scopedParts = useMemo(
    () => (aircraftDocIdSet ? companyPartsDocs.filter((d) => aircraftDocIdSet.has(String(d._id))) : companyPartsDocs),
    [aircraftDocIdSet, companyPartsDocs],
  );
  const scopedLogbookScans = useMemo(
    () => (aircraftDocIdSet ? companyLogbookScanDocs.filter((d) => aircraftDocIdSet.has(String(d._id))) : companyLogbookScanDocs),
    [aircraftDocIdSet, companyLogbookScanDocs],
  );

  // Platform-wide shared agent KB — feed it into the search context so admin-curated
  // docs surface alongside project + aircraft-scoped manuals.
  const sharedAgentKbDocs = (useSharedAgentDocsByAgentsResolved(AUDIT_AGENTS.map((a) => a.id)) || []) as any[];

  const companyDocumentPool = useMemo(() => {
    const byId = new Map<string, any>();
    for (const doc of [
      ...projectDocuments,
      ...mergedEntityDocs,
      ...scopedManuals,
      ...scopedParts,
      ...scopedLogbookScans,
      ...sharedAgentKbDocs,
    ]) {
      if (!doc) continue;
      const id = doc._id ? String(doc._id) : `${doc?.name || ''}|${doc?.category || ''}`;
      if (!byId.has(id)) byId.set(id, doc);
    }
    return Array.from(byId.values());
  }, [projectDocuments, mergedEntityDocs, scopedManuals, scopedParts, scopedLogbookScans, sharedAgentKbDocs]);
  const simulationResults = (useSimulationResults(activeProjectId || undefined) || []) as any[];
  const createChecklistRunFromSelectedDocs = useCreateChecklistRunFromSelectedDocs();
  const [query, setQuery] = useState('');
  const pendingAutoAskRef = useRef<string | null>(null);
  useEffect(() => {
    const incomingState = location.state as { askQuery?: string; autoSubmit?: boolean } | null;
    const incoming = incomingState?.askQuery;
    if (typeof incoming === 'string' && incoming.trim()) {
      const trimmed = incoming.trim();
      setQuery(trimmed);
      if (incomingState?.autoSubmit) {
        pendingAutoAskRef.current = trimmed;
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.pathname, location.state, navigate]);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    const pending = pendingAutoAskRef.current;
    if (!pending || query !== pending || isLoading) return;
    pendingAutoAskRef.current = null;
    window.setTimeout(() => {
      splashSearchRef.current?.form?.requestSubmit();
    }, 0);
  }, [query, isLoading]);
  const [agentChat, setAgentChat] = useState<ChatTurn[]>([]);
  const [isCreatingChecklist, setIsCreatingChecklist] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [reportScope, setReportScope] = useState<'latest' | 'all'>('latest');
  const [useFullDocumentContext, setUseFullDocumentContext] = useState(false);
  const [forceCompanyContext, setForceCompanyContext] = useState(false);
  const [hasDraftForceCompanyContext, setHasDraftForceCompanyContext] = useState(false);
  const [showAgentSettings, setShowAgentSettings] = useState(false);
  const [splashDraftHydrated, setSplashDraftHydrated] = useState(false);
  const [conversations, setConversations] = useState<StoredConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);
  /** When false, experts = suggestions from wording ∪ always-include pins. When true, only splashAskAgentsPickedIds (fixed; query changes do not alter it). */
  const [splashAskAgentsManual, setSplashAskAgentsManual] = useState(false);
  const [activeAskSource, setActiveAskSource] = useState<AskChunkSource | AskDocumentSource | null>(null);
  const [splashAskAgentsPickedIds, setSplashAskAgentsPickedIds] = useState<AuditAgent['id'][]>([]);
  /** In auto mode: merged into every message on top of suggested agents. Add/remove anytime. */
  const [splashAskAgentPinnedIds, setSplashAskAgentPinnedIds] = useState<AuditAgent['id'][]>([]);
  const [splashDocPickerIds, setSplashDocPickerIds] = useState<Id<'documents'>[]>([]);
  const [retrievalFailed, setRetrievalFailed] = useState(false);
  const [retrievalErrorMessage, setRetrievalErrorMessage] = useState<string | undefined>();
  const [showIndexHealth, setShowIndexHealth] = useState(false);
  const [federatedCoverage, setFederatedCoverage] = useState<CoverageRow[] | null>(null);
  const agentChatBottomRef = useRef<HTMLDivElement>(null);
  const splashSearchRef = useRef<HTMLTextAreaElement>(null);
  /**
   * Monotonic id for the in-flight Ask request. Bumped on every submit AND on
   * any conversation change (new chat, select, delete), so a completion or
   * stream token from a superseded request can never write into whichever
   * conversation is now active.
   */
  const askGenerationRef = useRef(0);

  const { summary: indexSummary, refetch: refetchIndexSummary } = useIndexSummary(
    retrievalCompanyId
      ? { companyId: retrievalCompanyId as Id<'companies'> }
      : { projectId: (activeProjectId as Id<'projects'> | null) ?? null },
  );

  // Shared indexing-progress machinery — same hook used by Admin Library and
  // Company Library so all reindex actions surface the same live progress UI.
  const {
    indexingState,
    start: startIndexingProgress,
    stop: stopIndexingProgress,
    elapsedSec,
    sinceProgressMs,
    stallMild,
    stallSevere,
  } = useIndexingProgress(indexSummary, refetchIndexSummary, {
    successToast: () => 'Indexing complete — all manuals are searchable.',
  });

  // Reset the per-project indexing UI when the project changes.
  useEffect(() => {
    stopIndexingProgress();
  }, [activeProjectId, stopIndexingProgress]);

  // Federated search coverage (Drive index + Convex) for the active project.
  useEffect(() => {
    if (!activeProjectId) {
      setFederatedCoverage(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const coverage = await loadProjectIndexCoverage(convex, activeProjectId);
        if (!cancelled) setFederatedCoverage(coverage.rows);
      } catch {
        if (!cancelled) setFederatedCoverage(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [convex, activeProjectId, indexSummary?.indexed, indexingState]);

  // Scan from the end without copying — this runs on every stream token.
  let latestAgentAssistant: ChatTurn | undefined;
  for (let i = agentChat.length - 1; i >= 0; i--) {
    if (agentChat[i].role === 'assistant') {
      latestAgentAssistant = agentChat[i];
      break;
    }
  }
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

  // Scroll on turn boundaries (new message / stream start-end), not on every
  // stream token — per-token smooth scrolling thrashes the transcript.
  useEffect(() => {
    agentChatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [agentChat.length, isLoading]);

  useEffect(() => {
    if (agentChat.length > 0) setShowAgentSettings(false);
  }, [agentChat.length]);

  useEffect(() => {
    if (!user?.id) {
      setSplashDraftHydrated(false);
      return;
    }
    const uid = user.id;

    setSplashDraftHydrated(false);
    setAgentChat([]);
    setConversations([]);
    setActiveConversationId(null);
    setShowChatHistory(false);
    setSplashAskAgentsManual(false);
    setSplashAskAgentsPickedIds([]);
    setSplashAskAgentPinnedIds([]);
    setHasDraftForceCompanyContext(false);

    let legacyChatTurns: ChatTurn[] = [];

    try {
      const raw = localStorage.getItem(splashDraftStorageKey(uid));
      if (raw) {
        const parsed = JSON.parse(raw) as {
          query?: unknown;
          agentChat?: unknown;
          useFullDocumentContext?: unknown;
          forceCompanyContext?: unknown;
          splashAskAgentsManual?: unknown;
          splashAskAgentsPickedIds?: unknown;
          splashAskAgentPinnedIds?: unknown;
          splashDocPickerIds?: unknown;
        };
        if (typeof parsed.query === 'string') setQuery(parsed.query);
        // Legacy single-slot saved chat — migrated into the conversation list below.
        legacyChatTurns = normalizeChatTurns(parsed.agentChat);
        if (typeof parsed.useFullDocumentContext === 'boolean') {
          setUseFullDocumentContext(parsed.useFullDocumentContext);
        }
        if (typeof parsed.forceCompanyContext === 'boolean') {
          setForceCompanyContext(parsed.forceCompanyContext);
          setHasDraftForceCompanyContext(true);
        } else {
          setHasDraftForceCompanyContext(false);
        }
        const picked = normalizeSplashPickedAgentIds(parsed.splashAskAgentsPickedIds);
        const manual = parsed.splashAskAgentsManual === true && picked.length > 0;
        setSplashAskAgentsManual(manual);
        setSplashAskAgentsPickedIds(manual ? picked : []);
        setSplashAskAgentPinnedIds(normalizeSplashPickedAgentIds(parsed.splashAskAgentPinnedIds));
        if (Array.isArray(parsed.splashDocPickerIds)) {
          setSplashDocPickerIds(
            parsed.splashDocPickerIds
              .filter((id): id is string => typeof id === 'string' && id.length > 0)
              .map((id) => id as Id<'documents'>)
          );
        } else {
          setSplashDocPickerIds([]);
        }
      } else {
        setQuery('');
        setUseFullDocumentContext(false);
        setForceCompanyContext(false);
        setSplashDocPickerIds([]);
      }
    } catch {
      setQuery('');
      setUseFullDocumentContext(false);
      setForceCompanyContext(false);
      setSplashDocPickerIds([]);
    }

    // Load the multi-conversation history (stored separately from the draft). The
    // very first time, migrate the legacy single saved chat into a conversation.
    let convos = readStoredConversations(uid);
    if (convos.length === 0 && legacyChatTurns.length > 0) {
      const now = Date.now();
      convos = [
        {
          id: makeConversationId(),
          title: deriveConversationTitle(legacyChatTurns),
          turns: legacyChatTurns,
          createdAt: now,
          updatedAt: now,
        },
      ];
      writeStoredConversations(uid, convos);
    }
    setConversations(convos);
    // Open on a fresh chat (ChatGPT/Claude style); past chats live in the sidebar.
    setActiveConversationId(null);
    setAgentChat([]);

    setSplashDraftHydrated(true);
  }, [user?.id]);

  useEffect(() => {
    if (!splashDraftHydrated) return;
    if (hasDraftForceCompanyContext) return;
    setForceCompanyContext(userSettings?.forceCompanyContextDefault === true);
  }, [splashDraftHydrated, hasDraftForceCompanyContext, userSettings?.forceCompanyContextDefault]);

  useEffect(() => {
    if (!user?.id || !splashDraftHydrated) return;
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(
          splashDraftStorageKey(user.id),
          JSON.stringify({
            query,
            useFullDocumentContext,
            forceCompanyContext,
            splashAskAgentsManual: splashAskAgentsManual && splashAskAgentsPickedIds.length > 0,
            splashAskAgentsPickedIds,
            splashAskAgentPinnedIds,
            splashDocPickerIds,
          })
        );
      } catch {
        /* quota / private mode */
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [user?.id, query, useFullDocumentContext, forceCompanyContext, splashDraftHydrated, splashAskAgentsManual, splashAskAgentsPickedIds, splashAskAgentPinnedIds, splashDocPickerIds]);

  // Persist the active conversation into the multi-chat history when its turns
  // change. Debounced: during streaming, agentChat updates on every token and a
  // full JSON.stringify-to-localStorage per token is pure waste — the trailing
  // write after the stream settles captures the finished turn. Reads the current
  // list via a ref so the (impure) write happens outside any state updater.
  const conversationsRef = useRef<StoredConversation[]>([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);
  useEffect(() => {
    if (!user?.id || !splashDraftHydrated) return;
    if (agentChat.length === 0) return;
    const uid = user.id;
    const timer = window.setTimeout(() => {
      const now = Date.now();
      let id = activeConversationId;
      let created = false;
      if (!id) {
        id = makeConversationId();
        created = true;
      }
      const prev = conversationsRef.current;
      const idx = prev.findIndex((c) => c.id === id);
      let next: StoredConversation[];
      if (idx === -1) {
        next = [
          {
            id,
            title: deriveConversationTitle(agentChat),
            turns: agentChat,
            createdAt: now,
            updatedAt: now,
          },
          ...prev,
        ];
      } else {
        next = prev.slice();
        const existing = next[idx];
        next[idx] = {
          ...existing,
          turns: agentChat,
          title: existing.title && existing.title !== 'New chat' ? existing.title : deriveConversationTitle(agentChat),
          updatedAt: now,
        };
        next.sort((a, b) => b.updatedAt - a.updatedAt);
      }
      writeStoredConversations(uid, next);
      setConversations(next);
      if (created) setActiveConversationId(id);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [agentChat, user?.id, splashDraftHydrated, activeConversationId]);

  const normalizedQuery = query.trim().toLowerCase();
  const latestSimulation = useMemo(() => {
    if (!simulationResults.length) return null;
    return simulationResults
      .slice()
      .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))[0];
  }, [simulationResults]);

  const enabledAgentIds = useEnabledAgentIds();
  const availableAgentsForAsk = useMemo(
    () =>
      enabledAgentIds === null
        ? AUDIT_AGENTS
        : AUDIT_AGENTS.filter((a) => enabledAgentIds.includes(a.id)),
    [enabledAgentIds],
  );

  const entityTypeContext = useMemo(() => {
    const selectedPerspective = 'generic';
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
  }, [latestSimulation]);
  const hasEntityTypeContext = entityTypeContext.labels.length > 0;

  const internalResults = useMemo(() => {
    if (!normalizedQuery) return INTERNAL_DESTINATIONS;
    return INTERNAL_DESTINATIONS.filter((item) => {
      const haystack = `${item.label} ${item.description} ${item.keywords.join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery]);

  const askAgentEntityContext = useMemo((): AskAgentEntityContext => {
    return {
      selectedPerspective: entityTypeContext.selectedPerspective,
      faaParts: entityTypeContext.faaParts,
      publicUseEntityType: entityTypeContext.publicUseEntityType,
      publicUseFocus: entityTypeContext.publicUseFocus,
    };
  }, [entityTypeContext]);

  const recentUserMessagesForRouting = useMemo(
    () =>
      agentChat
        .filter((turn): turn is ChatTurn & { role: 'user' } => turn.role === 'user')
        .map((turn) => turn.content),
    [agentChat],
  );

  const routingQueryText = useMemo(
    () => buildRoutingQueryText(query, recentUserMessagesForRouting, ASK_AGENT_ROUTING_HISTORY_TURNS),
    [query, recentUserMessagesForRouting],
  );

  const suggestedAgents = useMemo(
    () => resolveSuggestedAgents(routingQueryText, askAgentEntityContext, availableAgentsForAsk),
    [routingQueryText, askAgentEntityContext, availableAgentsForAsk],
  );

  const suggestedIdSet = useMemo(() => new Set(suggestedAgents.map((a) => a.id)), [suggestedAgents]);
  const companyDocumentPickerOptions = useMemo(
    () =>
      companyDocumentPool
        .filter((doc) => COMPANY_DOCUMENT_CATEGORIES.has(doc?.category))
        .map((doc) => ({
          id: String(doc._id) as Id<'documents'>,
          name: String(doc?.name || 'Company document'),
          category: String(doc?.category || 'uploaded'),
        })),
    [companyDocumentPool]
  );
  useEffect(() => {
    const available = new Set(companyDocumentPickerOptions.map((doc) => doc.id));
    setSplashDocPickerIds((prev) => prev.filter((id) => available.has(id)));
  }, [companyDocumentPickerOptions]);
  const uploadedDocsContext = useMemo(() => buildUploadedDocumentsContext(companyDocumentPool), [companyDocumentPool]);
  const sharedReferenceContext = useMemo(
    () => buildSharedReferenceContext(sharedReferenceDocs),
    [sharedReferenceDocs]
  );
  const companyProfileContext = useMemo(() => buildCompanyProfileContext(profile), [profile]);
  const companyPolicyForceCompanyContext = useMemo(() => {
    if (typeof companyPolicy?.forceCompanyContextDefault === 'boolean') {
      return companyPolicy.forceCompanyContextDefault;
    }
    return undefined;
  }, [companyPolicy?.forceCompanyContextDefault]);
  // Default to project-scoped retrieval; user or company policy can widen to the full company library.
  const effectiveForceCompanyContext = useMemo(() => {
    if (typeof companyPolicyForceCompanyContext === 'boolean') {
      return companyPolicyForceCompanyContext;
    }
    return forceCompanyContext;
  }, [companyPolicyForceCompanyContext, forceCompanyContext]);
  const allIndexedDocIds = useMemo<Id<'documents'>[]>(() => {
    if (!indexSummary) return [];
    return indexSummary.perDoc
      .filter((doc) => doc.chunkCount > 0)
      .map((doc) => doc.documentId as Id<'documents'>);
  }, [indexSummary]);

  /** Indexed maintenance manuals / IPC / logbook scans — Convex chunks and/or Drive index. */
  const technicalLibraryIndexedDocIds = useMemo<Id<'documents'>[]>(() => {
    const ids = new Set<string>();
    if (indexSummary) {
      for (const doc of indexSummary.perDoc) {
        if (doc.chunkCount > 0 && TECHNICAL_LIBRARY_CATEGORIES.has(doc.category)) {
          ids.add(String(doc.documentId));
        }
      }
    }
    if (federatedCoverage) {
      for (const row of federatedCoverage) {
        if (
          row.inIndex &&
          row.searchableVia === 'drive' &&
          TECHNICAL_LIBRARY_CATEGORIES.has(String(row.category || ''))
        ) {
          ids.add(row.documentId);
        }
      }
    }
    return Array.from(ids) as Id<'documents'>[];
  }, [indexSummary, federatedCoverage]);

  const federatedCoverageByDocId = useMemo(
    () => new Map((federatedCoverage ?? []).map((row) => [row.documentId, row] as const)),
    [federatedCoverage],
  );

  const technicalLibraryHealth = useMemo(() => {
    if (!indexSummary) {
      return {
        totalPublications: allCompanyPublications.length,
        missingCount: 0,
        missingRows: [] as Array<{ documentId: string; name: string; reason: string }>,
      };
    }

    const perDocById = new Map(
      indexSummary.perDoc.map((doc) => [String(doc.documentId), doc] as const),
    );
    const relevantPublications = allCompanyPublications.filter((pub) =>
      TECHNICAL_LIBRARY_CATEGORIES.has(String(pub.publicationType || '')),
    );

    const missingRows: Array<{ documentId: string; name: string; reason: string }> = [];
    for (const pub of relevantPublications) {
      const documentId = String(pub.documentId || '');
      if (!documentId) continue;
      const doc = perDocById.get(documentId);
      const coverage = federatedCoverageByDocId.get(documentId);
      const searchableViaConvex = (doc?.chunkCount ?? 0) > 0;
      const searchableViaDrive = coverage?.inIndex === true && coverage.searchableVia === 'drive';
      if (!doc && !coverage) {
        missingRows.push({
          documentId,
          name: String(pub.title || 'Technical publication'),
          reason: 'missing from index summary scope',
        });
        continue;
      }
      if (!searchableViaConvex && !searchableViaDrive) {
        missingRows.push({
          documentId,
          name: String(doc?.name || pub.title || 'Technical publication'),
          reason:
            coverage && !coverage.inIndex
              ? 'needs Drive search index refresh'
              : String(doc?.reason || 'not indexed'),
        });
      }
    }

    return {
      totalPublications: relevantPublications.length,
      missingCount: missingRows.length,
      missingRows,
    };
  }, [allCompanyPublications, indexSummary, federatedCoverageByDocId]);
  const technicalLibraryFixHint = useMemo(() => {
    if (technicalLibraryHealth.missingRows.length === 0) return null;
    for (const row of technicalLibraryHealth.missingRows) {
      const hint = remediationHintForReason(row.reason);
      if (hint) return hint;
    }
    return 'Suggested fix: open Admin · Library and click "Reindex company documents". If counts do not improve, inspect listed reason text per document.';
  }, [technicalLibraryHealth]);

  const routedAgentsForAsk = useMemo(
    () =>
      resolveRoutedAgentsForAsk({
        manual: splashAskAgentsManual,
        pickedIds: splashAskAgentsPickedIds,
        pinnedIds: splashAskAgentPinnedIds,
        routingQuery: routingQueryText,
        entity: askAgentEntityContext,
        agents: availableAgentsForAsk,
      }),
    [
      splashAskAgentsManual,
      splashAskAgentsPickedIds,
      splashAskAgentPinnedIds,
      routingQueryText,
      askAgentEntityContext,
      availableAgentsForAsk,
    ],
  );

  const nextRosterNames = useMemo(() => {
    if (routedAgentsForAsk.length === 0) return '—';
    return routedAgentsForAsk.map((a) => a.name).join(', ');
  }, [routedAgentsForAsk]);

  const shouldOfferChecklist = useMemo(() => {
    const text = agentResponse.toLowerCase();
    if (!text) return false;
    return (
      /(^|\n)\s*(-|\*|\d+\.)\s+/.test(agentResponse) ||
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
      : `Ask checklist — ${new Date().toLocaleDateString()}`;

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

  const exportAgentReportPdf = async () => {
    if (agentChat.length === 0) return;

    // Build (question, assistant turn) pairs from the flat chat history.
    const pairs: Array<{ question: string; turn: ChatTurn }> = [];
    let pendingQuestion = '';
    for (const turn of agentChat) {
      if (turn.role === 'user') {
        pendingQuestion = turn.content.trim();
      } else if (turn.role === 'assistant') {
        pairs.push({ question: pendingQuestion || 'Conversation', turn });
      }
    }
    if (pairs.length === 0) return;

    const selectedPairs = reportScope === 'latest' ? pairs.slice(-1) : pairs;

    const modeLabel =
      splashAskAgentsManual && splashAskAgentsPickedIds.length > 0
        ? 'Ask an Expert (manual roster)'
        : splashAskAgentPinnedIds.length > 0
          ? 'Ask an Expert (auto + always include)'
          : 'Ask an Expert (auto)';

    setIsExportingReport(true);
    try {
      const extras = await extractReportExtrasViaClaude(
        selectedPairs.map((p) => ({ question: p.question, answer: p.turn.content })),
      );

      const entries: SplashReportEntry[] = selectedPairs.map((pair, idx) => ({
        question: pair.question,
        answerBody: stripMarkdownSourcesSection(pair.turn.content),
        sources: parseSourcesSection(pair.turn.content),
        manuals: (pair.turn.meta?.retrievedDocs ?? []).map((doc) => ({
          name: doc.name,
          category: doc.category,
        })),
        agents: (pair.turn.meta?.routedAgents ?? []).map((a) => a.name),
        partNumbers: extras[idx]?.partNumbers ?? [],
        actions: extras[idx]?.actions ?? [],
      }));

      await downloadSplashReportPdf({
        title: 'AeroGap — Ask an Expert Report',
        companyName: profile?.companyName || profile?.legalEntityName || undefined,
        modeLabel,
        generatedAt: new Date(),
        entries,
      });
      toast.success('Report PDF downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not create report');
    } finally {
      setIsExportingReport(false);
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

  const toggleFocusedDocument = (id: Id<'documents'>) => {
    setSplashDocPickerIds((prev) => (prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id]));
  };

  const clearFocusedDocuments = () => {
    setSplashDocPickerIds([]);
  };

  const selectAllSplashAskExperts = () => {
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds(availableAgentsForAsk.map((a) => a.id));
  };

  const clearSplashAskExpertChecks = () => {
    setSplashAskAgentsManual(true);
    setSplashAskAgentsPickedIds([]);
  };

  /** Abandon any in-flight Ask request when the visible conversation changes. */
  const abandonInFlightAsk = () => {
    askGenerationRef.current += 1;
    setIsLoading(false);
  };

  const startNewConversation = () => {
    abandonInFlightAsk();
    setAgentChat([]);
    setActiveConversationId(null);
    setSplashAskAgentsManual(false);
    setSplashAskAgentsPickedIds([]);
    setSplashAskAgentPinnedIds([]);
    setShowAgentSettings(false);
    setShowChatHistory(false);
    setQuery('');
    window.setTimeout(() => splashSearchRef.current?.focus(), 0);
  };

  const selectConversation = (id: string) => {
    const convo = conversations.find((c) => c.id === id);
    if (!convo) return;
    abandonInFlightAsk();
    setActiveConversationId(id);
    setAgentChat(convo.turns);
    setShowAgentSettings(false);
    setShowChatHistory(false);
  };

  const deleteConversation = (id: string) => {
    const next = conversations.filter((c) => c.id !== id);
    if (user?.id) writeStoredConversations(user.id, next);
    setConversations(next);
    if (id === activeConversationId) {
      abandonInFlightAsk();
      setActiveConversationId(null);
      setAgentChat([]);
    }
  };

  const handleSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return; // one Ask at a time — overlapping streams would interleave turns
    const trimmed = query.trim();
    if (!trimmed) {
      toast.error('Enter a question.');
      return;
    }
    if (isLoading) return;

    const routed = routedAgentsForAsk;
    if (routed.length === 0) {
      toast.error('Select at least one expert, or switch back to auto routing.');
      return;
    }
    if (agentChat.length === 0) setShowAgentSettings(false);
    const generation = ++askGenerationRef.current;
    const isCurrent = () => askGenerationRef.current === generation;
    setIsLoading(true);
    const messagesForApi: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...agentChat.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: 'user', content: trimmed },
    ];
    // Show the user turn immediately; assistant arrives via stream or after the tool loop.
    setAgentChat((prev) => [...prev, { role: 'user', content: trimmed }]);
    try {
      let retrievedPassageContext: {
        context: string;
        usedCount: number;
        docCount: number;
        docs: RetrievedDocRef[];
        sources: AskChunkSource[];
      } = { context: '', usedCount: 0, docCount: 0, docs: [], sources: [] };
      let retrievedFullDocContext: {
        context: string;
        usedCount: number;
        docs: RetrievedDocRef[];
        sources: AskDocumentSource[];
      } = {
        context: '',
        usedCount: 0,
        docs: [],
        sources: [],
      };
      let fallbackUsed = false;
      setRetrievalFailed(false);
      setRetrievalErrorMessage(undefined);
      if (activeProjectId || retrievalCompanyId) {
        try {
          let autoFocusIds: Id<'documents'>[] | undefined;
          let driveFocusIds: Id<'documents'>[] | undefined;
          if (splashDocPickerIds.length > 0) {
            autoFocusIds = splashDocPickerIds;
            driveFocusIds = splashDocPickerIds;
          } else if (technicalLibraryIndexedDocIds.length > 0) {
            // Never let ANN pre-filter drop maintenance manuals / IPC when the library is indexed.
            autoFocusIds = technicalLibraryIndexedDocIds;
            if (
              allIndexedDocIds.length > 0 &&
              allIndexedDocIds.length <= ASK_AGENTS_FOCUS_THRESHOLD
            ) {
              autoFocusIds = Array.from(
                new Set([...autoFocusIds, ...allIndexedDocIds]),
              ) as Id<'documents'>[];
            }
          } else if (
            allIndexedDocIds.length > 0 &&
            allIndexedDocIds.length <= ASK_AGENTS_FOCUS_THRESHOLD
          ) {
            autoFocusIds = allIndexedDocIds;
          }

          const searchArgs: Record<string, unknown> = {
            query: trimmed,
            documentIds: autoFocusIds,
            driveDocumentIds: driveFocusIds,
            // No category filter: search EVERY indexed document so any linked file
            // (Drive, server, uploaded — any category) can answer the question.
            topK: ASK_TOP_K,
            // Ask skips Voyage rerank — hybrid fusion order is fast enough for cited Q&A.
            allowRerank: false,
            includeFullDocuments: useFullDocumentContext,
            maxFullDocuments: useFullDocumentContext ? 4 : 0,
          };
          if (effectiveForceCompanyContext && retrievalCompanyId) {
            searchArgs.companyId = retrievalCompanyId as Id<'companies'>;
          } else if (activeProjectId) {
            searchArgs.projectId = activeProjectId as Id<'projects'>;
          } else if (retrievalCompanyId) {
            searchArgs.companyId = retrievalCompanyId as Id<'companies'>;
          }
          const retrievalStarted = askPerfNow();
          const retrieved = await searchDocuments(convex, searchArgs as any);
          askPerfLog('retrieval', retrievalStarted, {
            chunks: retrieved.chunks?.length ?? 0,
            docs: retrieved.documents?.length ?? 0,
          });
          if (retrieved.meta?.driveUnavailable) {
            toast.message('Google Drive manuals were not searched', {
              description:
                'Sign in to Google via Library → Refresh search index (or Company Library), then try again.',
              duration: 8000,
            });
          }
          retrievedPassageContext = buildRetrievedPassageContext(
            retrieved.chunks || [],
            isAskCitationsEnabled,
          );
          retrievedFullDocContext = buildRetrievedFullDocumentContext(
            retrieved.documents || [],
            isAskCitationsEnabled,
          );
          if (
            !retrievedPassageContext.context &&
            !retrievedFullDocContext.context &&
            technicalLibraryIndexedDocIds.length === 0 &&
            (indexSummary?.perDoc.some(
              (d) =>
                TECHNICAL_LIBRARY_CATEGORIES.has(d.category) &&
                (d.state === 'eligible' || d.state === 'failed' || d.chunkCount === 0),
            ) ||
              (federatedCoverage ?? []).some(
                (row) =>
                  TECHNICAL_LIBRARY_CATEGORIES.has(String(row.category || '')) && !row.inIndex,
              ))
          ) {
            toast.message('Maintenance manuals are not indexed yet', {
              description:
                'For Google Drive-linked manuals, open Library or Company Library and click Refresh search index. For uploaded files, use Re-index on this page.',
              duration: 8000,
            });
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          setRetrievalFailed(true);
          setRetrievalErrorMessage(message);
          if (isIndexingUnavailableError(message)) {
            toast.error(indexingUnavailableToast(), { duration: 8000 });
          }
          retrievedPassageContext = { context: '', usedCount: 0, docCount: 0, docs: [], sources: [] };
          retrievedFullDocContext = { context: '', usedCount: 0, docs: [], sources: [] };
        }
        if (!retrievedFullDocContext.context && !retrievedPassageContext.context && uploadedDocsContext.context) {
          fallbackUsed = true;
        }
      }
      // Sources actually entering the prompt: full-doc grounding wins over passages
      // (mirrors the context-block branches below). Tags are per-turn: only these
      // sources validate this answer's [S#] citations.
      const turnSources: AskSource[] =
        useFullDocumentContext && retrievedFullDocContext.context
          ? retrievedFullDocContext.sources
          : retrievedPassageContext.context
            ? retrievedPassageContext.sources
            : [];
      // Record tools: only when the flags are on AND the project actually has
      // fleet data — otherwise the model would call tools into an empty well.
      const recordToolsActive =
        isAskCitationsEnabled && isAskRecordToolsEnabled && Boolean(activeProjectId) && aircraftAssets.length > 0;
      const availableAgents = routed
        .map((agent) => `- ${agent.name} (${agent.id}): ${agent.role}`)
        .join('\n');
      const systemLines = [
        'You are an aviation audit and compliance assistant for AeroGap.',
        'Your job is to answer the user\'s question using the listed expert perspectives and any retrieved company documents below.',
        'CRITICAL: Never reply that a topic is "outside your scope" or that you "cannot answer". You are a general aviation audit assistant — answer every aviation/compliance/manuals question to the best of your ability.',
        'If the user asks about a company document type (MEL/MMEL, GMM, QCM, RSM, ops specs, training program, SMS manual, parts catalog, maintenance manual, logbook, etc.), answer using the retrieved document passages/full text below when present.',
        retrievalFailed
          ? 'Document retrieval failed for this query (indexing or search error). Do NOT claim that no company document exists. Answer from general industry/regulatory knowledge and clearly state that live document retrieval was unavailable for this request.'
          : 'If no relevant company document passages were retrieved, answer from general industry/regulatory knowledge and clearly note that no matching company document passage was found (not that the library is empty).',
        'If the question is borderline relevant (e.g. operational vs. maintenance) still answer; only decline if the question is clearly unrelated to aviation, safety, quality, or compliance.',
        'Use the listed experts only as perspective. If one expert is clearly best, answer from that perspective. If multiple are needed, synthesize a single direct answer.',
        'You are in a multi-turn chat: use earlier user and assistant messages for context, follow-ups, and clarifications.',
        'Do not mention expert names, agent names, roles, or routing decisions in the output.',
        'Keep the response practical and concise, with clear action steps when applicable.',
        'Where you state requirements or interpret rules, cite the underlying authority in the prose (for example "per 14 CFR §145.51" or "FAA AC 120-92B recommends…") when specific.',
        turnSources.length > 0 || recordToolsActive
          ? 'When you rely on a provided source excerpt, document, or tool-result row below, cite it inline using its bracket tag immediately after the claim it supports, e.g. "Tooling must be calibrated annually [S1][S3]." Only use tags that appear in the provided sources or tool results — never invent a tag. If you answer from general knowledge or cite a regulation that is not among the provided sources, name it in the prose without a tag. Do not produce a separate "## Sources" section.'
          : 'After your main answer, add a markdown section titled exactly "## Sources". Under Sources, use bullet lines ("- ") listing each regulation, AC, standard, or company document you relied on. If you relied on general practice without a named document, say so. Do not fabricate citations.',
        'Available experts for this question:',
        availableAgents,
      ];
      if (hasEntityTypeContext) {
        const expertsIdx = systemLines.findIndex((line) => line === 'Available experts for this question:');
        if (expertsIdx !== -1) {
          systemLines.splice(
            expertsIdx,
            0,
            '',
            `Entity context (advisory only — do not use to refuse questions): ${entityTypeContext.labels.join(' | ')}`,
            'When the configured regulatory part differs from the question topic, still answer the question; just note the framework difference if relevant.',
            ''
          );
        }
      }
      if (useFullDocumentContext && retrievedFullDocContext.context) {
        systemLines.push(
          '',
          'Use the full text for the retrieved company documents below as primary evidence when relevant to the question.',
          'If this context still does not contain a required fact, state that clearly before falling back to general standards/guidance.',
          turnSources.length > 0
            ? 'When you cite company material, name the document in the prose and attach its bracket tag (e.g., "per the General Maintenance Manual §4.2 [S1]").'
            : 'When you cite company material, name the document in the prose (e.g., "per the General Maintenance Manual §4.2").',
          '',
          `Retrieved company documents (full text from ${retrievedFullDocContext.usedCount} docs):`,
          retrievedFullDocContext.context
        );
      } else if (retrievedPassageContext.context) {
        systemLines.push(
          '',
          'Use the retrieved company document passages below as primary evidence when relevant to the question.',
          'If these passages do not contain a required fact, state that clearly before falling back to general standards/guidance.',
          turnSources.length > 0
            ? 'When you cite company material, name the document in the prose and attach the passage\'s bracket tag (e.g., "per the General Maintenance Manual §4.2 [S2]").'
            : 'When you cite company material, name the document in the prose (e.g., "per the General Maintenance Manual §4.2").',
          '',
          `Company document retrieval (${retrievedPassageContext.usedCount} passages from ${retrievedPassageContext.docCount} docs):`,
          retrievedPassageContext.context
        );
      } else if (uploadedDocsContext.context) {
        systemLines.push(
          '',
          'Use the company document preview context below as primary evidence when relevant to the question.',
          'Note: retrieval passages are unavailable for this query, so this fallback may be less complete.',
          '',
          `Company document preview fallback (${uploadedDocsContext.usedCount}/${uploadedDocsContext.totalAvailable} docs included):`,
          uploadedDocsContext.context
        );
      }
      if (sharedReferenceContext.context) {
        systemLines.push(
          '',
          'Additional company shared reference library (organization-provided primary evidence):',
          '',
          `Shared reference context (${sharedReferenceContext.usedCount}/${sharedReferenceContext.totalAvailable} docs included):`,
          sharedReferenceContext.context
        );
      }
      if (companyProfileContext.hasAny) {
        systemLines.push(
          '',
          'Company profile context:',
          companyProfileContext.context
        );
      }
      if (effectiveForceCompanyContext) {
        systemLines.push(
          '',
          'Forced company-context mode is enabled.',
          'Treat uploaded manuals and company profile context as primary grounding for every answer.',
          'Tailor the response to this organization first, and clearly call out any gaps when the company context is incomplete.'
        );
      }
      if (recordToolsActive) {
        systemLines.push(
          '',
          "You also have records tools over this company's actual fleet data: aircraft status (times/cycles), logbook entries, installed components, discrepancies, and coming-due maintenance items.",
          "Call them whenever the question concerns this company's aircraft, maintenance history, parts, or due dates — do not answer such questions from memory.",
          'Rows in tool results include a "cite" field (e.g. "S7"). Cite those rows inline with bracket tags, e.g. "The ELT battery was last replaced on 2025-11-02 [S7]." Only cite tags that appear in tool results or provided sources.',
          'Keep tool use focused: prefer one well-filtered call over several broad ones.',
        );
      }
      const system = systemLines.join('\n');
      const nextRecordTag = createTagAllocator(turnSources.length);
      const recordSources: AskRecordSource[] = [];
      const baseParams = {
        model: DEFAULT_CLAUDE_MODEL,
        max_tokens: 3000,
        temperature: 0.2,
        system,
        ...(recordToolsActive ? { tools: RECORD_TOOLS } : {}),
      };
      let loopMessages: ClaudeMessageParams['messages'] = [...messagesForApi];
      const claudeStarted = askPerfNow();
      let response;
      if (recordToolsActive) {
        // Tool-use rounds need the full message; keep non-streaming for the loop.
        response = await createClaudeMessage({ ...baseParams, messages: loopMessages });
        let toolCallCount = 0;
        while (response.stop_reason === 'tool_use' && toolCallCount < MAX_RECORD_TOOL_CALLS) {
          const toolUses = response.content.filter(
            (block): block is ClaudeToolUseBlock => block.type === 'tool_use',
          );
          if (toolUses.length === 0) break;
          const toolResults: ClaudeToolResultContent[] = [];
          for (const toolUse of toolUses) {
            toolCallCount += 1;
            const executed = await executeRecordTool(
              convex,
              String(activeProjectId),
              toolUse.name,
              toolUse.input || {},
              nextRecordTag,
            );
            recordSources.push(...executed.sources);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: executed.resultForModel,
            });
          }
          loopMessages = [
            ...loopMessages,
            { role: 'assistant', content: response.content as ClaudeMessageParams['messages'][number]['content'] },
            { role: 'user', content: toolResults },
          ];
          response = await createClaudeMessage({ ...baseParams, messages: loopMessages });
        }
        askPerfLog('claude', claudeStarted, { streamed: false, toolCalls: toolCallCount });
      } else {
        let sawFirstToken = false;
        response = await createClaudeMessageStream(
          { ...baseParams, messages: loopMessages },
          {
            onText: (chunk) => {
              if (!isCurrent()) return; // conversation changed — drop stale tokens
              if (!sawFirstToken) {
                askPerfLog('claude-ttft', claudeStarted);
                sawFirstToken = true;
                setAgentChat((prev) => [...prev, { role: 'assistant', content: chunk }]);
                return;
              }
              setAgentChat((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === 'assistant') {
                  next[next.length - 1] = { ...last, content: last.content + chunk };
                }
                return next;
              });
            },
          },
        );
        askPerfLog('claude', claudeStarted, { streamed: true });
      }
      const text = response.content
        .filter((block): block is { type: string; text?: string } => block.type === 'text')
        .map((block) => block.text || '')
        .join('\n')
        .trim();
      const reply =
        (text || 'No response returned.') +
        (response.stop_reason === 'max_tokens'
          ? '\n\n_…response was truncated; ask a narrower question for the full detail._'
          : '');
      const dedupedRetrievedDocs: RetrievedDocRef[] = (() => {
        const seen = new Set<string>();
        const merged: RetrievedDocRef[] = [];
        for (const doc of [...retrievedFullDocContext.docs, ...retrievedPassageContext.docs]) {
          const key = doc.id || doc.name;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          merged.push(doc);
        }
        return merged;
      })();
      const assistantMeta: AssistantTurnMeta = {
        routedAgents: routed.map((agent) => ({ id: String(agent.id), name: agent.name })),
        retrievedDocs: dedupedRetrievedDocs,
        passageCount: retrievedPassageContext.usedCount,
        docCount: retrievedPassageContext.docCount,
        fallback: fallbackUsed,
        manualRouting: splashAskAgentsManual,
      };
      // Document sources persist whole (the panel shows "also searched");
      // record sources persist only when actually cited — tool calls can
      // return dozens of rows and uncited ones are noise.
      const citedTagsInReply = new Set(
        segmentAnswerWithCitations(reply, [...turnSources, ...recordSources]).citedTags,
      );
      const keptSources: AskSource[] = [
        ...turnSources,
        ...recordSources.filter((s) => citedTagsInReply.has(s.tag)),
      ];
      const assistantTurn: ChatTurn = {
        role: 'assistant',
        content: reply,
        meta: assistantMeta,
        ...(keptSources.length > 0 ? { sources: keptSources } : {}),
      };
      if (!isCurrent()) return; // superseded — don't write into the new conversation
      setAgentChat((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === 'assistant') {
          next[next.length - 1] = assistantTurn;
          return next;
        }
        return [...next, assistantTurn];
      });
      setQuery('');
    } catch (error) {
      if (!isCurrent()) return;
      toast.error(error instanceof Error ? error.message : 'Agent answer failed.');
      // Roll back the orphaned user turn so a retry doesn't double it up.
      setAgentChat((prev) => {
        const last = prev[prev.length - 1];
        return last?.role === 'user' && last.content === trimmed ? prev.slice(0, -1) : prev;
      });
    } finally {
      if (isCurrent()) setIsLoading(false);
    }

  };

  const askStatusMessage = isLoading
    ? agentChat.length > 0 && agentChat[agentChat.length - 1]?.role === 'assistant'
      ? 'Assistant is responding…'
      : 'Assistant is thinking…'
    : retrievalFailed
      ? 'Company document search failed for the last question.'
      : '';

  return (
    <div className="box-border flex w-full min-h-full flex-col px-3 py-5 sm:px-4 sm:py-7 md:px-8 md:py-9 lg:px-12 xl:px-16 2xl:px-24">
      <div className="mx-auto mt-1 mb-auto w-full min-w-0 max-w-[min(96vw,110rem)] sm:mt-2 md:mt-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* Past chats — persistent sidebar on large screens */}
        <aside
          className={`hidden shrink-0 flex-col rounded-2xl border p-3 backdrop-blur lg:flex lg:w-72 xl:w-80 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] ${
            isDarkMode
              ? 'border-white/10 bg-navy-900/50'
              : 'border-slate-200/90 bg-white/90 shadow-xl shadow-slate-300/35'
          }`}
          aria-label="Past chats"
        >
          <ChatHistoryPanel
            conversations={conversations}
            activeConversationId={activeConversationId}
            isDarkMode={isDarkMode}
            onSelect={selectConversation}
            onNew={startNewConversation}
            onDelete={deleteConversation}
          />
        </aside>

        <div className="min-w-0 flex-1">
        {/* Past chats — collapsible drawer on small screens */}
        <div className="mb-3 lg:hidden">
          <button
            type="button"
            onClick={() => setShowChatHistory((prev) => !prev)}
            aria-expanded={showChatHistory}
            className={`flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold backdrop-blur ${
              isDarkMode
                ? 'border-white/10 bg-navy-900/50 text-white/90'
                : 'border-slate-200/90 bg-white/90 text-slate-700 shadow-sm'
            }`}
          >
            <span>Past chats ({conversations.length})</span>
            <span aria-hidden="true">{showChatHistory ? '▴' : '▾'}</span>
          </button>
          {showChatHistory ? (
            <div
              className={`mt-2 flex max-h-[60vh] flex-col overflow-hidden rounded-2xl border p-3 backdrop-blur ${
                isDarkMode
                  ? 'border-white/10 bg-navy-900/50'
                  : 'border-slate-200/90 bg-white/90 shadow-lg'
              }`}
            >
              <ChatHistoryPanel
                conversations={conversations}
                activeConversationId={activeConversationId}
                isDarkMode={isDarkMode}
                onSelect={selectConversation}
                onNew={startNewConversation}
                onDelete={deleteConversation}
              />
            </div>
          ) : null}
        </div>
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
            Ask an Expert
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
                if (isLoading) return;
                e.currentTarget.form?.requestSubmit();
              }}
              placeholder={agentChat.length ? 'Ask a follow-up…' : 'Ask a question or search pages…'}
              autoComplete="off"
              disabled={isLoading}
              className={`w-full min-w-0 resize-none rounded-xl px-4 py-3 focus:outline-none md:min-h-[3rem] md:flex-1 md:basis-0 leading-normal disabled:cursor-not-allowed disabled:opacity-60 ${
                isDarkMode
                  ? 'border border-white/15 bg-navy-800/70 text-white placeholder:text-white/40 focus:border-sky/60'
                  : 'border border-slate-300 bg-white text-slate-900 placeholder:text-slate-500 focus:border-sky'
              }`}
            />
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full shrink-0 rounded-xl px-5 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 md:w-auto ${
                isDarkMode
                  ? 'bg-sky hover:bg-sky-light'
                  : 'bg-sky-600 hover:bg-sky-700 shadow-sm shadow-sky-700/25'
              }`}
            >
              {isLoading ? 'Asking…' : 'Ask'}
            </button>
          </div>
        </form>
        {showGettingStarted && (
          <div
            className={`mt-6 rounded-xl border p-5 ${
              isDarkMode
                ? 'border-sky/25 bg-sky/10'
                : 'border-sky-200 bg-sky-50'
            }`}
          >
            <h2 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Getting started
            </h2>
            <p className={`mt-1 text-sm ${isDarkMode ? 'text-white/70' : 'text-slate-600'}`}>
              Three quick steps to your first compliance review.
            </p>
            <ol className="mt-4 space-y-3">
              {[
                {
                  label: 'Add your manuals to the Library',
                  detail: 'Upload entity, regulatory, or maintenance documents so AeroGap can reference them.',
                  cta: 'Open Library',
                  to: '/library',
                },
                {
                  label: 'Run the Guided Audit — start here',
                  detail: 'One flow that walks you through upload, analysis, audit simulation, review, and revisions.',
                  cta: 'Start Guided Audit',
                  to: '/guided-audit',
                },
                {
                  label: 'Open the Quality Command Center',
                  detail: 'See compliance status and jump into the workflow that fits your operation.',
                  cta: 'Open Command Center',
                  to: '/quality-command-center',
                },
              ].map((step, i) => (
                <li key={step.to} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isDarkMode ? 'bg-sky/30 text-sky-100' : 'bg-sky-600 text-white'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                      {step.label}
                    </p>
                    <p className={`text-xs ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
                      {step.detail}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate(step.to)}
                      className={`mt-1.5 text-xs font-semibold underline underline-offset-2 ${
                        isDarkMode ? 'text-sky-light hover:text-white' : 'text-sky-700 hover:text-sky-900'
                      }`}
                    >
                      {step.cta} →
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
        {splashDocPickerIds.length > 0 ? (
          <div className={`mt-2 flex flex-wrap items-center gap-2 text-xs ${isDarkMode ? 'text-white/75' : 'text-slate-600'}`}>
            <span className="font-semibold uppercase tracking-wide">Focused on:</span>
            {splashDocPickerIds
              .map((id) => companyDocumentPickerOptions.find((doc) => doc.id === id))
              .filter((doc): doc is { id: Id<'documents'>; name: string; category: string } => Boolean(doc))
              .map((doc) => (
                <button
                  key={`focus-pill-${doc.id}`}
                  type="button"
                  onClick={() => toggleFocusedDocument(doc.id)}
                  className={`rounded-full border px-2 py-1 ${
                    isDarkMode
                      ? 'border-sky/35 bg-sky/15 text-sky-100 hover:bg-sky/25'
                      : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
                  }`}
                >
                  {doc.name} ×
                </button>
              ))}
            <button
              type="button"
              onClick={clearFocusedDocuments}
              className={`${isDarkMode ? 'text-white/70 hover:text-white' : 'text-slate-600 hover:text-slate-900'} underline underline-offset-2`}
            >
              Clear
            </button>
          </div>
        ) : null}
        {(() => {
          const showBecauseRetrievalFailed = retrievalFailed;
          // Only surface this panel while actively indexing or when search failed.
          // The idle "Manuals ready to search" state is intentionally hidden.
          if (!showBecauseRetrievalFailed && !indexingState) {
            return null;
          }
          const indexHealthExpanded = showIndexHealth || retrievalFailed;
          const total = Math.max(indexSummary?.totalDocs ?? indexingState?.startingTotal ?? 0, 1);
          const indexed = Math.min(indexSummary?.indexed ?? indexingState?.startingIndexed ?? 0, total);
          const percent = Math.max(0, Math.min(100, Math.round((indexed / total) * 100)));
          const failedCount = indexSummary?.failed ?? 0;
          const inFlightCount = indexSummary?.inFlight ?? 0;
          return (
            <div
              className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                isDarkMode
                  ? 'border-amber-300/30 bg-amber-300/10 text-amber-100'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowIndexHealth((prev) => !prev)}
                  className="text-left font-semibold underline-offset-2 hover:underline"
                  aria-expanded={indexHealthExpanded}
                >
                  {retrievalFailed
                    ? 'Document search failed'
                    : indexingState
                      ? 'Indexing manuals…'
                      : 'Manuals ready to search'}{' '}
                  <span className="font-normal opacity-80">
                    {indexed} of {total} ({percent}%)
                  </span>
                  <span className="ml-1 text-[10px] opacity-80">{indexHealthExpanded ? '▴' : '▾'}</span>
                </button>
                {indexingState ? (
                  <span className="text-[10px] opacity-70" aria-live="polite">
                    {elapsedSec}s elapsed
                  </span>
                ) : null}
              </div>
              <div
                role="progressbar"
                aria-valuenow={percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={indexingState ? 'Indexing progress' : 'Manuals ready'}
                className={`mt-2 h-1.5 w-full overflow-hidden rounded-full ${
                  isDarkMode ? 'bg-white/10' : 'bg-amber-200/60'
                }`}
              >
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ease-out ${
                    stallSevere
                      ? isDarkMode
                        ? 'bg-rose-400'
                        : 'bg-rose-500'
                      : stallMild
                        ? isDarkMode
                          ? 'bg-amber-300'
                          : 'bg-amber-500'
                        : indexingState
                          ? isDarkMode
                            ? 'bg-sky-300'
                            : 'bg-sky-500'
                          : isDarkMode
                            ? 'bg-amber-300'
                            : 'bg-amber-500'
                  } ${indexingState && percent < 100 && !stallSevere ? 'animate-pulse' : ''}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
              {indexingState && (stallMild || stallSevere) ? (
                <div
                  className={`mt-2 rounded-md border px-2 py-1.5 text-[11px] ${
                    stallSevere
                      ? isDarkMode
                        ? 'border-rose-400/40 bg-rose-400/10 text-rose-100'
                        : 'border-rose-300 bg-rose-50 text-rose-900'
                      : isDarkMode
                        ? 'border-white/15 bg-white/5 text-white/80'
                        : 'border-amber-300 bg-amber-50/60 text-amber-900'
                  }`}
                >
                  {stallSevere ? (
                    <>
                      <p className="font-semibold">
                        No progress for {Math.floor(sinceProgressMs / 1000)}s.
                      </p>
                      <p className="mt-0.5">
                        {failedCount > 0
                          ? `${failedCount} document${failedCount === 1 ? '' : 's'} failed to index — expand for details.`
                          : indexingStallHint()}
                      </p>
                    </>
                  ) : (
                    <p>
                      No progress for {Math.floor(sinceProgressMs / 1000)}s. Still working — if this hangs, {indexingStallHint()}
                    </p>
                  )}
                </div>
              ) : null}
              {retrievalFailed && retrievalErrorMessage ? (
                <p
                  className={`mt-2 text-[11px] ${
                    isDarkMode ? 'text-rose-200/90' : 'text-rose-700'
                  }`}
                >
                  Retrieval error: {retrievalErrorMessage}
                </p>
              ) : null}
              {!indexingState && failedCount > 0 ? (
                <p
                  className={`mt-2 text-[11px] ${
                    isDarkMode ? 'text-rose-200/90' : 'text-rose-700'
                  }`}
                >
                  {failedCount} document{failedCount === 1 ? '' : 's'} failed to index — expand for details.
                </p>
              ) : null}
              {indexingState && inFlightCount > 0 ? (
                <p className={`mt-1 text-[10px] ${isDarkMode ? 'text-white/45' : 'text-slate-500'}`}>
                  {inFlightCount} in flight
                </p>
              ) : null}
              {indexHealthExpanded && indexSummary ? (
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto pr-1">
                  {indexSummary.perDoc
                    .filter((doc) => {
                      if (doc.chunkCount > 0) return false;
                      const coverage = federatedCoverageByDocId.get(String(doc.documentId));
                      return !(coverage?.inIndex === true);
                    })
                    .slice(0, 50)
                    .map((doc) => (
                      <li key={doc.documentId} className="flex items-start justify-between gap-2 text-[11px]">
                        <span className="truncate font-medium">{doc.name}</span>
                        <span className="shrink-0 opacity-80" title={doc.errorCode || doc.lastError}>
                          {doc.reason}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : null}
              {indexHealthExpanded && technicalLibraryHealth.missingRows.length > 0 ? (
                <div className="mt-2 rounded-md border border-amber-300/20 bg-black/10 p-2">
                  <p className="text-[11px] font-semibold">
                    Missing technical-library chunks: {technicalLibraryHealth.missingRows.length} of {technicalLibraryHealth.totalPublications}
                  </p>
                  <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto pr-1 text-[11px]">
                    {technicalLibraryHealth.missingRows.slice(0, 50).map((row) => (
                      <li key={`techlib-missing-${row.documentId}`} className="flex items-start justify-between gap-2">
                        <span className="truncate font-medium">{row.name}</span>
                        <span className="shrink-0 opacity-80">{row.reason}</span>
                      </li>
                    ))}
                  </ul>
                  {technicalLibraryFixHint ? (
                    <p className="mt-2 text-[11px] opacity-85">{technicalLibraryFixHint}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })()}
        {hasEntityTypeContext && (
          <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-white/60' : 'text-slate-500'}`}>
            Context: {entityTypeContext.labels.join(' | ')}
          </p>
        )}
        {query.trim().length > 0 && sharedReferenceContext.totalAvailable > 0 ? (
          <p className={`mt-1.5 text-xs ${isDarkMode ? 'text-white/55' : 'text-slate-500'}`}>
            Shared reference library: on ({sharedReferenceContext.usedCount}/{sharedReferenceContext.totalAvailable}).
          </p>
        ) : null}

        {query.trim().length > 0 && internalResults.length > 0 && internalResults.length < INTERNAL_DESTINATIONS.length ? (
          <button
            type="button"
            onClick={() => navigate(internalResults[0].path)}
            className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              isDarkMode
                ? 'border-sky/30 bg-sky/10 text-sky-100 hover:bg-sky/20'
                : 'border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100'
            }`}
          >
            Looking for a page? Go to {internalResults[0].label} →
          </button>
        ) : null}

        {(agentChat.length > 0 || isLoading) && (
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
                    onClick={startNewConversation}
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
                  {showAgentSettings ? 'Hide advanced' : 'Advanced'}
                </button>
                {agentChat.length > 0 ? (
                  <div
                    className="inline-flex shrink-0 overflow-hidden rounded-lg border border-white/15"
                    role="group"
                    aria-label="Report scope"
                  >
                    <button
                      type="button"
                      onClick={() => setReportScope('latest')}
                      aria-pressed={reportScope === 'latest'}
                      className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        reportScope === 'latest'
                          ? 'bg-sky text-white'
                          : isDarkMode
                            ? 'bg-white/5 text-white/70 hover:bg-white/10'
                            : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      This answer
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportScope('all')}
                      aria-pressed={reportScope === 'all'}
                      className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        reportScope === 'all'
                          ? 'bg-sky text-white'
                          : isDarkMode
                            ? 'bg-white/5 text-white/70 hover:bg-white/10'
                            : 'bg-white text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Full chat
                    </button>
                  </div>
                ) : null}
                {agentChat.length > 0 ? (
                  <button
                    type="button"
                    onClick={exportAgentReportPdf}
                    disabled={isExportingReport}
                    className={`${chatUtilityStrongButtonClass} shrink-0 disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {isExportingReport ? 'Building report…' : 'Export PDF'}
                  </button>
                ) : null}
              </div>
            </div>
            {agentChat.length > 0 || isLoading ? (
              <>
                <div className="sr-only" aria-live="polite" aria-atomic="true">
                  {askStatusMessage}
                </div>
                <ChatThread
                  turns={agentChat}
                  bottomRef={agentChatBottomRef}
                  isLoading={isLoading}
                  isDarkMode={isDarkMode}
                  onOpenSource={(source) => {
                    // Record chips deep-link to the owning view; document chips open the text modal.
                    if (source.kind === 'record') navigate(source.route);
                    else setActiveAskSource(source);
                  }}
                  onOpenDoc={(doc) => {
                    // Open the actual document text when we know which one it
                    // is; fall back to the Library for legacy refs without ids.
                    if (doc.id) {
                      setActiveAskSource({
                        tag: '',
                        kind: 'document',
                        documentId: doc.id,
                        docName: doc.name,
                        category: doc.category || '',
                      });
                    } else {
                      navigate('/library');
                    }
                  }}
                />
                {retrievalFailed ? (
                  <div
                    className={`mt-4 rounded-xl border px-3 py-2.5 text-xs ${
                      isDarkMode
                        ? 'border-rose-400/35 bg-rose-400/10 text-rose-100'
                        : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                    role="alert"
                  >
                    <p className="font-semibold">Company document search failed for the last question.</p>
                    {retrievalErrorMessage ? (
                      <p className="mt-1 opacity-90">{retrievalErrorMessage}</p>
                    ) : (
                      <p className="mt-1 opacity-90">
                        The answer may omit uploaded manuals. Try Re-index, then ask again.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowIndexHealth(true)}
                      className={`mt-2 rounded-md border px-2.5 py-1 text-[11px] font-semibold ${
                        isDarkMode
                          ? 'border-white/25 bg-white/10 hover:bg-white/15'
                          : 'border-rose-300 bg-white hover:bg-rose-100'
                      }`}
                    >
                      Show indexing details
                    </button>
                  </div>
                ) : null}
                {shouldOfferChecklist && agentResponse && isChecklistsEnabled ? (
                  <div className={checklistOfferClass}>
                    <p className={checklistOfferTextClass}>Create a checklist from the latest reply?</p>
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
                      className={checklistSecondaryButtonClass}
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
              <div className={advancedRegionClass} role="region" aria-label="Advanced">
                <p className={advancedTitleClass}>Advanced</p>
                <p className={`mt-2 text-[11px] ${advancedMutedClass}`}>
                  Ask uses your company documents, shared references, and auto-picked experts by default. Use these
                  controls to override routing or limit retrieval to specific documents.
                </p>

                <div className={advancedSubPanelClass}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className={advancedLabelClass}>Routing mode</p>
                    {!splashAskAgentsManual ? (
                      <button
                        type="button"
                        onClick={beginSplashManualExperts}
                        className={advancedChipButtonClass}
                      >
                        Set experts manually…
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={endSplashManualExperts}
                        className={advancedGhostButtonClass}
                      >
                        Use auto routing
                      </button>
                    )}
                  </div>
                  <p className={`mt-2 text-xs ${advancedTextClass}`}>
                    {splashAskAgentsManual ? 'Manual roster is active.' : 'Auto routing is active.'}
                  </p>
                </div>

                <div className={advancedSubPanelClass}>
                  <p className={advancedLabelClass}>Experts for this thread</p>
                  <p className={`mt-2 text-sm ${advancedBodyClass}`}>
                    <span className={advancedTextClass}>Next message uses:</span>{' '}
                    <span className={`font-medium ${advancedStrongClass}`}>{nextRosterNames}</span>
                  </p>
                  {!splashAskAgentsManual ? (
                    <>
                      <p className={`mt-2 text-xs ${advancedTextClass}`}>
                        Suggestions use your latest question plus recent chat context. Pin experts to always include (up to four total).
                      </p>
                      <p className={`mt-2 text-sm ${isDarkMode ? 'text-white/75' : 'text-slate-700'}`}>
                        Auto-picked: <span className={`font-medium ${advancedStrongClass}`}>{suggestedAgents.map((a) => a.name).join(', ') || '—'}</span>
                      </p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <p className={`text-[11px] font-semibold uppercase tracking-wide ${advancedMutedClass}`}>Always include (optional)</p>
                        {splashAskAgentPinnedIds.length > 0 ? (
                          <button
                            type="button"
                            onClick={clearSplashAlwaysInclude}
                            className={
                              isDarkMode
                                ? 'rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/80 hover:bg-white/10'
                                : 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100'
                            }
                          >
                            Clear always-include
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-2 grid max-h-[min(35vh,400px)] grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden pr-1 sm:grid-cols-2 lg:grid-cols-3 [scrollbar-gutter:stable]">
                        {availableAgentsForAsk.map((agent) => {
                          const pinned = splashAskAgentPinnedIds.includes(agent.id);
                          const inSuggestions = suggestedIdSet.has(agent.id);
                          return (
                            <label
                              key={agent.id}
                              className={`${advancedOptionClass} ${pinned ? (isDarkMode ? 'border-sky/35 bg-sky/10' : 'border-sky-300 bg-sky-50') : ''}`}
                            >
                              <input
                                type="checkbox"
                                checked={pinned}
                                onChange={() => toggleSplashAlwaysInclude(agent.id)}
                                aria-label={`Always include ${agent.name} on every agent reply`}
                                className={`mt-1 shrink-0 rounded focus:ring-sky ${
                                  isDarkMode
                                    ? 'border-white/30 bg-white/5 text-sky-light'
                                    : 'border-slate-300 bg-white text-sky-600'
                                }`}
                              />
                              <span className={`min-w-0 text-sm ${isDarkMode ? 'text-white/90' : 'text-slate-800'}`}>
                                <span className={`font-medium ${advancedStrongClass}`}>{agent.name}</span>
                                {inSuggestions ? (
                                  <span className={`ml-1.5 text-[10px] font-medium uppercase tracking-wide ${isDarkMode ? 'text-sky-light/90' : 'text-sky-700'}`}>
                                    Also suggested
                                  </span>
                                ) : null}
                                <span className={`mt-0.5 block text-xs line-clamp-2 ${advancedMutedClass}`}>{agent.role}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      <p className={`mt-2 text-xs ${advancedTextClass}`}>
                        Manual roster stays fixed until you switch back to auto.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={selectAllSplashAskExperts}
                          className={
                            isDarkMode
                              ? 'rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10'
                              : 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-100'
                          }
                        >
                          Check all
                        </button>
                        <button
                          type="button"
                          onClick={clearSplashAskExpertChecks}
                          className={
                            isDarkMode
                              ? 'rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/10'
                              : 'rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-100'
                          }
                        >
                          Uncheck all
                        </button>
                      </div>
                      <div className="mt-3 grid max-h-[min(35vh,400px)] grid-cols-1 gap-2 overflow-y-auto overflow-x-hidden pr-1 sm:grid-cols-2 lg:grid-cols-3 [scrollbar-gutter:stable]">
                        {availableAgentsForAsk.map((agent) => (
                          <label
                            key={agent.id}
                            className={advancedOptionClass}
                          >
                            <input
                              type="checkbox"
                              checked={splashAskAgentsPickedIds.includes(agent.id)}
                              onChange={() => toggleSplashAskExpert(agent.id)}
                              className={`mt-1 shrink-0 rounded focus:ring-sky ${
                                isDarkMode
                                  ? 'border-white/30 bg-white/5 text-sky-light'
                                  : 'border-slate-300 bg-white text-sky-600'
                              }`}
                            />
                            <span className={`min-w-0 text-sm ${isDarkMode ? 'text-white/90' : 'text-slate-800'}`}>
                              <span className={`font-medium ${advancedStrongClass}`}>{agent.name}</span>
                              <span className={`mt-0.5 block text-xs line-clamp-2 ${advancedMutedClass}`}>{agent.role}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      {splashAskAgentsPickedIds.length === 0 ? (
                        <p className={`mt-2 text-xs ${isDarkMode ? 'text-amber-200/90' : 'text-amber-700'}`}>Select at least one expert.</p>
                      ) : null}
                    </>
                  )}
                </div>

                <div className={advancedSubPanelClass}>
                  <p className={advancedLabelClass}>Retrieval (cost)</p>
                  <label className={`mt-2 flex cursor-pointer items-start gap-2 text-sm ${advancedBodyClass}`}>
                    <input
                      type="checkbox"
                      checked={useFullDocumentContext}
                      onChange={(e) => setUseFullDocumentContext(e.target.checked)}
                      className={`mt-1 shrink-0 rounded focus:ring-sky ${
                        isDarkMode
                          ? 'border-white/30 bg-white/5 text-sky-light'
                          : 'border-slate-300 bg-white text-sky-600'
                      }`}
                    />
                    <span>
                      <span className={`font-medium ${advancedStrongClass}`}>Include full manual text</span>
                      <span className={`mt-0.5 block text-xs ${advancedMutedClass}`}>
                        Loads up to 4 complete documents per question (higher Convex usage). Default uses passage excerpts only.
                      </span>
                    </span>
                  </label>
                  <label className={`mt-3 flex cursor-pointer items-start gap-2 text-sm ${advancedBodyClass}`}>
                    <input
                      type="checkbox"
                      checked={forceCompanyContext}
                      onChange={(e) => {
                        setForceCompanyContext(e.target.checked);
                        setHasDraftForceCompanyContext(true);
                      }}
                      className={`mt-1 shrink-0 rounded focus:ring-sky ${
                        isDarkMode
                          ? 'border-white/30 bg-white/5 text-sky-light'
                          : 'border-slate-300 bg-white text-sky-600'
                      }`}
                    />
                    <span>
                      <span className={`font-medium ${advancedStrongClass}`}>Search entire company library</span>
                      <span className={`mt-0.5 block text-xs ${advancedMutedClass}`}>
                        When off, retrieval is scoped to the active project only (recommended).
                      </span>
                    </span>
                  </label>
                </div>

                {companyDocumentPickerOptions.length > 0 ? (
                  <div className={advancedSubPanelClass}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className={advancedLabelClass}>Focus retrieval on specific docs</p>
                      {splashDocPickerIds.length > 0 ? (
                        <button
                          type="button"
                          onClick={clearFocusedDocuments}
                          className={`text-[11px] font-semibold ${isDarkMode ? 'text-sky-200 hover:text-sky-100' : 'text-sky-700 hover:text-sky-900'}`}
                        >
                          Clear selection
                        </button>
                      ) : null}
                    </div>
                    <p className={`mt-2 text-[11px] ${advancedMutedClass}`}>
                      Leave empty to search all company documents. Selecting documents restricts retrieval to that subset only.
                    </p>
                    <div className={`mt-2 max-h-40 space-y-1 overflow-y-auto rounded-md border p-1.5 ${
                      isDarkMode ? 'border-white/5 bg-white/[0.02]' : 'border-slate-200 bg-slate-50'
                    }`}>
                      {companyDocumentPickerOptions.map((doc) => {
                        const checked = splashDocPickerIds.includes(doc.id);
                        return (
                          <label
                            key={`doc-focus-${doc.id}`}
                            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs ${
                              checked
                                ? isDarkMode
                                  ? 'bg-sky/15 text-sky-100'
                                  : 'bg-sky-50 text-sky-800'
                                : isDarkMode
                                  ? 'text-white/80 hover:bg-white/5'
                                  : 'text-slate-700 hover:bg-white'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className={`h-3.5 w-3.5 rounded ${isDarkMode ? 'border-white/25' : 'border-slate-300'}`}
                              checked={checked}
                              onChange={() => toggleFocusedDocument(doc.id)}
                            />
                            <span className="truncate">{doc.name}</span>
                            <span className={`ml-auto shrink-0 text-[10px] uppercase ${isDarkMode ? 'text-white/50' : 'text-slate-400'}`}>{categoryLabel(doc.category)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <p className={`mt-3 text-[11px] ${isDarkMode ? 'text-white/45' : 'text-slate-500'}`}>
                  Past chats are saved automatically — switch between them in the Chats panel on the left.
                </p>
              </div>
            ) : null}
          </div>
        )}
        {!showGettingStarted && <AuditPrepCard isDarkMode={isDarkMode} />}
        </div>
        </div>
        </div>
      </div>
      {activeAskSource ? (
        <AskSourceModal
          source={activeAskSource}
          isDarkMode={isDarkMode}
          onClose={() => setActiveAskSource(null)}
          onOpenLibrary={() => {
            setActiveAskSource(null);
            navigate('/library');
          }}
        />
      ) : null}
    </div>
  );
}
