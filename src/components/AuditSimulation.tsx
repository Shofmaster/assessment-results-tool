import { useState, useRef, useEffect, useMemo } from 'react';
import { FiPlay, FiPause, FiStopCircle, FiUpload, FiSave } from 'react-icons/fi';
import { toast } from 'sonner';
import { track, ANALYTICS_EVENTS } from '../services/analyticsEvents';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { AuditSimulationService, AUDIT_AGENTS, getMinimalAssessmentData, extractDiscrepanciesFromTranscript, type ISBAOStage, type AttachedImage, DEFAULT_PUBLIC_USE_CONFIG } from '../services/auditAgents';
import { MODELS_SUPPORTING_THINKING } from '../constants/claude';
import {
  useAssessments,
  useDocuments,
  useAllProjectAgentDocs,
  useSharedAgentDocsByAgentsResolved,
  useSimulationResults,
  useSearchSimulationResults,
  useSimulationResult,
  useAddSimulationResult,
  useRemoveSimulationResult,
  useUserSettings,
  useEnabledAgentIds,
  useAuditSimModel,
  useDefaultClaudeModel,
  useDocumentReviews,
  useSharedReferenceDocsResolved,
  useAddEntityIssue,
} from '../hooks/useConvexData';
import { useStandardsAgentDocs } from '../hooks/useStandardsAgentDocs';
import type { AuditAgent, AuditMessage, AuditDiscrepancy, SelfReviewMode, SimulationDataSummary, FAAConfig, FAAPartScope, PaperworkReviewContext, PublicUseConfig } from '../types/auditSimulation';
import { DEFAULT_FAA_CONFIG } from '../data/faaInspectorTypes';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import AuditorQuestionModal from './AuditorQuestionModal';
import { regionMatches, type RegionId } from '../config/regionConfig';
import { Button, GlassCard } from './ui';
import type { AuditorQuestionAnswer } from '../types/auditSimulation';
import { DocumentExtractor } from '../services/documentExtractor';
import { searchProjectDocuments } from '../services/driveSearchIntegration';
import { AUDIT_AGENT_TOP_K } from '../constants/search';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import {
  hasExtractedTextContent,
  mapProjectDocumentsToOptionalText,
  mapProjectDocumentsToRequiredText,
} from '../utils/documentExtractedText';
import SimulationAgentSelector from './SimulationAgentSelector';
import SimulationTranscript from './SimulationTranscript';

const SIMULATION_AGENT_IDS = AUDIT_AGENTS.map((a) => a.id);

export default function AuditSimulation() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const auditSimSelectedFromStore = useAppStore((s) => s.auditSimulationSelectedAgents);
  const setAuditSimSelectedInStore = useAppStore((s) => s.setAuditSimulationSelectedAgents);

  const validAgentIds = useMemo(() => new Set(AUDIT_AGENTS.map((a) => a.id)), []);
  const restoredFromStore = auditSimSelectedFromStore.filter((id): id is AuditAgent['id'] =>
    validAgentIds.has(id as AuditAgent['id'])
  );
  const selectedAgents = new Set(restoredFromStore);

  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [selectedIsbaoStage, setSelectedIsbaoStage] = useState<ISBAOStage>(1);
  const [totalRounds, setTotalRounds] = useState(3);
  // A2 (experimental): scope each auditor's org documents to vector-retrieved excerpts
  // instead of injecting full entity/SMS docs into every agent. Off by default.
  const [useRetrievalDocs, setUseRetrievalDocs] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<AuditAgent['id'] | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<AuditAgent['id'] | null>(null);
  const [messages, setMessages] = useState<AuditMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [currentRound, setCurrentRound] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [viewMode, setViewMode] = useState<'chat' | 'compare'>('chat');
  const [loadedSimulationId, setLoadedSimulationId] = useState<string | null>(null);
  const [discrepancies, setDiscrepancies] = useState<AuditDiscrepancy[]>([]);
  const [discrepanciesLoading, setDiscrepanciesLoading] = useState(false);
  const [dataSummaryForRun, setDataSummaryForRun] = useState<SimulationDataSummary | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<{
    agentName: string;
    question: string;
    resolve: (answer: AuditorQuestionAnswer) => void;
  } | null>(null);
  const [simulationUploads, setSimulationUploads] = useState<Array<{ name: string; text: string }>>([]);
  const [attachedImages, setAttachedImages] = useState<Array<{ name: string } & AttachedImage>>([]);
  const [pauseUploading, setPauseUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [compareRunAId, setCompareRunAId] = useState<string | null>(null);
  const [compareRunBId, setCompareRunBId] = useState<string | null>(null);
  const [compareFindingsA, setCompareFindingsA] = useState<AuditDiscrepancy[]>([]);
  const [compareFindingsB, setCompareFindingsB] = useState<AuditDiscrepancy[]>([]);
  const [compareFindingsALoading, setCompareFindingsALoading] = useState(false);
  const [compareFindingsBLoading, setCompareFindingsBLoading] = useState(false);
  const [addingToEntityIssues, setAddingToEntityIssues] = useState(false);
  const [savedSimSearch, setSavedSimSearch] = useState('');
  const [selectedRegion, setSelectedRegion] = useState<RegionId>('all');

  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const serviceRef = useRef<AuditSimulationService | null>(null);
  const isPausedRef = useRef(false);
  const unpauseResolveRef = useRef<(() => void) | null>(null);
  const documentExtractorRef = useRef(new DocumentExtractor()).current;

  const settings = useUserSettings();

  const auditSimModel = useAuditSimModel();
  const defaultModel = useDefaultClaudeModel();
  const thinkingEnabled = (settings?.thinkingEnabled ?? false) && MODELS_SUPPORTING_THINKING.has(auditSimModel);

  // Filter agents by company policy ∩ per-user toggles (null = all enabled)
  const enabledAgentIds = useEnabledAgentIds();
  const availableAgents = useMemo(
    () => enabledAgentIds === null ? AUDIT_AGENTS : AUDIT_AGENTS.filter((a) => enabledAgentIds.includes(a.id)),
    [enabledAgentIds]
  );
  const thinkingBudget = settings?.thinkingBudget ?? 10000;
  const adaptiveThinking = settings?.adaptiveThinking ?? false;
  const adaptiveThinkingEffort = (settings?.adaptiveThinkingEffort ?? 'high') as 'low' | 'medium' | 'high' | 'max';
  const selfReviewMode = (settings?.selfReviewMode || 'off') as SelfReviewMode;
  const selfReviewMaxIterations = settings?.selfReviewMaxIterations ?? 2;

  const convex = useConvex();
  const assessments = (useAssessments(activeProjectId || undefined) || []) as any[];
  const regulatoryFiles = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const smsDocuments = (useDocuments(activeProjectId || undefined, 'sms') || []) as any[];
  const uploadedDocuments = (useDocuments(activeProjectId || undefined, 'uploaded') || []) as any[];
  const allProjectAgentDocs = (useAllProjectAgentDocs(activeProjectId || undefined) || []) as any[];
  const allSharedAgentDocs = (useSharedAgentDocsByAgentsResolved(SIMULATION_AGENT_IDS) || []) as any[];

  const documentReviews = (useDocumentReviews(activeProjectId || undefined) || []) as any[];
  const allDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const sharedReferenceDocs = (useSharedReferenceDocsResolved() || []) as any[];
  // Per-company compliance standards (no-copy), resolved on demand and grouped by agent.
  // Empty when the AeroGap-admin legacy flag (allowStandardsStorage) is ON for the company.
  const standardsByAgent = useStandardsAgentDocs(activeProjectId || undefined);

  const simulationResults = (useSimulationResults(activeProjectId || undefined) || []) as any[];
  const searchedSimulationResults = (useSearchSimulationResults(
    activeProjectId || undefined,
    savedSimSearch,
    100
  ) || []) as any[];
  const loadedSimFull = useSimulationResult(loadedSimulationId ?? undefined);
  const compareRunA = useSimulationResult(compareRunAId ?? undefined);
  const compareRunB = useSimulationResult(compareRunBId ?? undefined);
  const addSimulationResult = useAddSimulationResult();
  const removeSimulationResult = useRemoveSimulationResult();
  const addEntityIssue = useAddEntityIssue();

  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());
  const [faaConfig, setFaaConfig] = useState<FAAConfig>(() => ({ ...DEFAULT_FAA_CONFIG }));
  const [publicUseConfig, setPublicUseConfig] = useState<PublicUseConfig>(() => ({ ...DEFAULT_PUBLIC_USE_CONFIG }));

  const completedReviews = documentReviews.filter((r: any) => r.status === 'completed' && r.verdict);

  useEffect(() => {
    const fromMulti = searchParams.getAll('agent');
    const fromCsv = (searchParams.get('agents') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const requested = [...fromMulti, ...fromCsv];
    if (requested.length === 0) return;
    const dedupedValid = Array.from(
      new Set(
        requested.filter((id): id is AuditAgent['id'] => validAgentIds.has(id as AuditAgent['id']))
      )
    );
    if (dedupedValid.length > 0) {
      setAuditSimSelectedInStore(dedupedValid);
    }
  }, [searchParams, setAuditSimSelectedInStore, validAgentIds]);

  useEffect(() => {
    if (messages.length > 0) {
      const el = document.getElementById('audit-chat-end');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // When user loads a saved simulation, sync messages and config from full doc (list only has summary).
  useEffect(() => {
    if (!loadedSimulationId || !loadedSimFull || isRunning) return;
    setMessages(loadedSimFull.messages ?? []);
    if (loadedSimFull.assessmentId) setSelectedAssessment(loadedSimFull.assessmentId);
    if (Array.isArray(loadedSimFull.agentIds)) setAuditSimSelectedInStore(loadedSimFull.agentIds as string[]);
    if (typeof loadedSimFull.totalRounds === 'number') setTotalRounds(loadedSimFull.totalRounds);
    if (loadedSimFull.isbaoStage === 1 || loadedSimFull.isbaoStage === 2 || loadedSimFull.isbaoStage === 3) {
      setSelectedIsbaoStage(loadedSimFull.isbaoStage);
    }
    if (loadedSimFull.faaConfig && Array.isArray((loadedSimFull.faaConfig as any).partsScope) && (loadedSimFull.faaConfig as any).partsScope.length > 0) {
      setFaaConfig({
        partsScope: (loadedSimFull.faaConfig as any).partsScope,
        specialtyId: (loadedSimFull.faaConfig as any).specialtyId || DEFAULT_FAA_CONFIG.specialtyId,
        inspectionTypeId: (loadedSimFull.faaConfig as any).inspectionTypeId || DEFAULT_FAA_CONFIG.inspectionTypeId,
      });
    }
    const loadedPUC = (loadedSimFull as any).publicUseConfig;
    if (loadedPUC && loadedPUC.entityType && loadedPUC.auditFocus) {
      setPublicUseConfig({ entityType: loadedPUC.entityType, auditFocus: loadedPUC.auditFocus });
    }
    setDiscrepancies(Array.isArray((loadedSimFull as any).discrepancies) ? (loadedSimFull as any).discrepancies : []);
    setDataSummaryForRun((loadedSimFull as any).dataSummary ?? null);
    if ((loadedSimFull as any).region) setSelectedRegion((loadedSimFull as any).region);
  }, [loadedSimulationId, loadedSimFull, isRunning]);

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 h-full min-h-0">
        <GlassCard padding="xl" className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to run simulations.</p>
          <Button onClick={() => navigate('/logbook')}>
            Open Logbook
          </Button>
        </GlassCard>
      </div>
    );
  }

  const toggleAgent = (agentId: AuditAgent['id']) => {
    const next = new Set(selectedAgents);
    if (next.has(agentId)) {
      if (next.size > 1) next.delete(agentId);
    } else {
      next.add(agentId);
    }
    setAuditSimSelectedInStore(Array.from(next));
  };

  const selectAllAgents = () => setAuditSimSelectedInStore(availableAgents.map((a) => a.id));
  const deselectAllAgents = () => setAuditSimSelectedInStore([]);

  const projectDocsByAgent = AUDIT_AGENTS.reduce<Record<string, any[]>>((acc, agent) => {
    acc[agent.id] = allProjectAgentDocs.filter((d: any) => d.agentId === agent.id);
    return acc;
  }, {});

  const sharedDocsByAgent = AUDIT_AGENTS.reduce<Record<string, any[]>>((acc, agent) => {
    acc[agent.id] = allSharedAgentDocs.filter((d: any) => d.agentId === agent.id);
    return acc;
  }, {});

  const getDocsForAgent = (agentId: AuditAgent['id']) => {
    const projectDocs = projectDocsByAgent[agentId] || [];
    const sharedDocs = sharedDocsByAgent[agentId] || [];
    const combined = [...sharedDocs, ...projectDocs];
    // Standards docs are already resolved to { name, text } and have no region — append additively.
    const standardsDocs = standardsByAgent[agentId] || [];
    return [
      ...combined
        .filter((d: any) => regionMatches(d.region, selectedRegion))
        .map((d: any) => ({ name: d.name, text: d.extractedText || '' })),
      ...standardsDocs,
    ].filter((d: any) => d.text.length > 0);
  };

  /** Build a realistic summary of what data we have and what's missing (address later). */
  const getDataSummary = (): SimulationDataSummary => {
    const entityWithText = entityDocuments.filter((d: any) => hasExtractedTextContent(d));
    const smsWithText = smsDocuments.filter((d: any) => hasExtractedTextContent(d));
    const uploadedWithText = uploadedDocuments.filter((d: any) => hasExtractedTextContent(d));
    const assessmentRecord = selectedAssessment ? assessments.find((a: any) => a._id === selectedAssessment) : null;
    const hasAssessment = !!assessmentRecord;
    const assessmentName = assessmentRecord?.data?.companyName ?? 'None (generic context)';

    const agentLibraryCounts: Record<string, number> = {};
    const gaps: string[] = [];
    AUDIT_AGENTS.forEach((agent) => {
      const count = getDocsForAgent(agent.id).length;
      agentLibraryCounts[agent.id] = count;
    });
    Array.from(selectedAgents).forEach((agentId) => {
      const count = agentLibraryCounts[agentId] ?? 0;
      const agent = AUDIT_AGENTS.find((a) => a.id === agentId);
      if (count === 0 && agent) {
        gaps.push(`${agent.name}: no Library documents`);
      }
    });
    if (!hasAssessment) gaps.push('No assessment selected');
    if (entityWithText.length === 0) gaps.push('No entity documents with text');
    if (smsWithText.length === 0) gaps.push('No SMS documents with text');
    if (uploadedWithText.length === 0) gaps.push('No uploaded documents with text');

    const reviewCount = selectedReviewIds.size;
    if (completedReviews.length > 0 && reviewCount === 0) {
      gaps.push('No paperwork reviews selected (completed reviews available)');
    }

    return {
      hasAssessment,
      assessmentName,
      entityDocsWithText: entityWithText.length,
      smsDocsWithText: smsWithText.length,
      uploadedDocsWithText: uploadedWithText.length,
      paperworkReviewsIncluded: reviewCount,
      agentLibraryCounts,
      gaps,
    };
  };

  const currentDataSummary = getDataSummary();

  const effectiveFaaConfig = (): FAAConfig | undefined => {
    if (!selectedAgents.has('faa-inspector')) return undefined;
    const parts = faaConfig.partsScope?.length ? faaConfig.partsScope : DEFAULT_FAA_CONFIG.partsScope;
    return {
      partsScope: parts,
      specialtyId: faaConfig.specialtyId || DEFAULT_FAA_CONFIG.specialtyId,
      inspectionTypeId: faaConfig.inspectionTypeId || DEFAULT_FAA_CONFIG.inspectionTypeId,
    };
  };

  const docNameMap: Record<string, string> = {};
  allDocuments.forEach((d: any) => { docNameMap[d._id] = d.name; });
  sharedReferenceDocs.forEach((d: any) => { docNameMap[d._id] = d.name; });

  const toggleReview = (reviewId: string) => {
    setSelectedReviewIds((prev) => {
      const next = new Set(prev);
      if (next.has(reviewId)) {
        next.delete(reviewId);
      } else {
        next.add(reviewId);
      }
      return next;
    });
  };

  const selectAllReviews = () => {
    setSelectedReviewIds(new Set(completedReviews.map((r: any) => r._id)));
  };

  const deselectAllReviews = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setSelectedReviewIds(new Set());
    if (selectedReviewIds.size > 0) {
      toast.success('Paperwork review selection cleared');
    }
  };

  const buildPaperworkReviewContexts = (): PaperworkReviewContext[] => {
    return completedReviews
      .filter((r: any) => selectedReviewIds.has(r._id))
      .map((r: any) => {
        const refNames: string[] = [];
        (r.referenceDocumentIds || (r.referenceDocumentId ? [r.referenceDocumentId] : [])).forEach((id: string) => {
          refNames.push(docNameMap[id] || 'Reference document');
        });
        (r.sharedReferenceDocumentIds || (r.sharedReferenceDocumentId ? [r.sharedReferenceDocumentId] : [])).forEach((id: string) => {
          refNames.push(docNameMap[id] || 'Unknown shared reference');
        });
        return {
          documentUnderReview: docNameMap[r.underReviewDocumentId] || 'Document under review',
          referenceDocuments: refNames,
          auditorIds: Array.isArray(r.auditorIds) ? r.auditorIds : [],
          verdict: r.verdict as PaperworkReviewContext['verdict'],
          findings: Array.isArray(r.findings) ? r.findings.map((f: any) => ({
            severity: f.severity || 'observation',
            location: f.location,
            description: f.description || '',
          })) : [],
          reviewScope: r.reviewScope,
          notes: r.notes,
          completedAt: r.completedAt,
        } satisfies PaperworkReviewContext;
      });
  };

  const handleStart = async () => {
    if (selectedAgents.has('faa-inspector') && (!faaConfig.partsScope || faaConfig.partsScope.length === 0)) {
      toast.warning('Select at least one Part (121, 135, and/or 145) for the FAA Inspector.');
      return;
    }

    // Estimate the number of Claude API calls this run will make so the user can
    // catch an accidentally expensive configuration (e.g. all agents × many rounds)
    // before it bills. base = agents × rounds; reviews multiply that overhead.
    const agentCount = selectedAgents.size || 1;
    let estimatedCalls = agentCount * totalRounds;
    if (selfReviewMode === 'per-turn') {
      // Each turn may be reviewed + regenerated up to maxIterations times.
      estimatedCalls += agentCount * totalRounds * selfReviewMaxIterations * 2;
    } else if (selfReviewMode === 'post-simulation') {
      estimatedCalls += 1 + agentCount * selfReviewMaxIterations;
    }
    estimatedCalls += 1; // post-sim critique + discrepancy extraction (consolidated)
    const COST_CONFIRM_THRESHOLD = 40;
    if (estimatedCalls > COST_CONFIRM_THRESHOLD) {
      const proceed = window.confirm(
        `This run will make roughly ${estimatedCalls} Claude API calls ` +
          `(${agentCount} agents × ${totalRounds} rounds` +
          `${selfReviewMode !== 'off' ? ` + ${selfReviewMode} review` : ''}).\n\n` +
          `Lower the round count or de-select agents to reduce cost. Continue?`,
      );
      if (!proceed) return;
    }

    const assessmentRecord = selectedAssessment
      ? assessments.find((a: any) => a._id === selectedAssessment)
      : null;
    const assessmentData = assessmentRecord?.data ?? getMinimalAssessmentData();

    setIsRunning(true);
    setIsPaused(false);
    setSimulationError(null);
    track(ANALYTICS_EVENTS.AUDIT_SIMULATION_STARTED, {
      agents: agentCount,
      rounds: totalRounds,
      selfReviewMode,
    });
    isPausedRef.current = false;
    setMessages([]);
    setCurrentRound(0);
    setDiscrepancies([]);
    setDiscrepanciesLoading(false);
    setDataSummaryForRun(getDataSummary());
    setSimulationUploads([]);
    abortRef.current = false;

    const [entityDocs, smsDocs, uploadedResolved] = await Promise.all([
      mapProjectDocumentsToOptionalText(entityDocuments, convex),
      mapProjectDocumentsToOptionalText(smsDocuments, convex),
      mapProjectDocumentsToRequiredText(uploadedDocuments, convex),
    ]);

    const paperworkContexts = buildPaperworkReviewContexts();

    const summary = getDataSummary();
    const dataContext = [
      'Available for this audit:',
      `Assessment: ${summary.assessmentName}.`,
      `Entity docs: ${summary.entityDocsWithText}, SMS docs: ${summary.smsDocsWithText}, uploaded: ${summary.uploadedDocsWithText}.`,
      paperworkContexts.length > 0 ? `Paperwork reviews included: ${paperworkContexts.length} completed review(s) with findings.` : '',
      summary.gaps.length > 0 ? `Not provided (address later): ${summary.gaps.join('; ')}.` : '',
      'Work only from the data provided. When something is missing or not in the materials, acknowledge it briefly and continue; do not refuse to participate or invent data. Gaps can be addressed later.',
    ].filter(Boolean).join(' ');

    // A2 (experimental): scope each auditor's organization documents to vector-retrieved
    // excerpts rather than injecting full entity/SMS docs. Each agent gets only the
    // passages relevant to its focus area — a large token reduction for big libraries.
    let retrievedDocsByAgent: Record<string, Array<{ name: string; text?: string }>> = {};
    if (useRetrievalDocs && activeProjectId) {
      const orgSummary = [
        assessmentData.companyName,
        (assessmentData.servicesOffered || []).join(', '),
        (assessmentData.certifications || []).join(', '),
      ].filter(Boolean).join(' — ');
      const agentIds = Array.from(selectedAgents) as AuditAgent['id'][];
      const entries = await Promise.all(
        agentIds.map(async (id) => {
          const agent = AUDIT_AGENTS.find((a) => a.id === id);
          const query = `${agent?.name ?? id}: ${agent?.role ?? ''}. Organization under audit: ${orgSummary}. Surface the most relevant quality, compliance, and safety document passages.`;
          try {
            const res: any = await searchProjectDocuments(convex, {
              projectId: String(activeProjectId),
              query,
              categories: ['entity', 'sms'],
              topK: AUDIT_AGENT_TOP_K,
              allowRerank: false,
            });
            const docs = ((res?.chunks as any[]) || [])
              .map((c: any) => ({
                name: `${String(c.docName || 'Company document')} (passage ${(Number(c.chunkIndex) || 0) + 1}/${c.totalChunks ?? '?'}, ${String(c.category || '')})`,
                text: String(c.text || ''),
              }))
              .filter((d) => d.text.length > 0);
            return [id, docs] as const;
          } catch {
            return [id, [] as Array<{ name: string; text?: string }>] as const;
          }
        })
      );
      retrievedDocsByAgent = Object.fromEntries(entries);
    }
    // In retrieval mode the full shared corpus is omitted (passed as []); each agent
    // instead receives its retrieved excerpts via setRetrievedDocsByAgent below.
    const entityDocsArg = useRetrievalDocs ? [] : entityDocs;
    const smsDocsArg = useRetrievalDocs ? [] : smsDocs;

    // Each participant uses only their own knowledge base (FAA → faa-inspector docs, IS-BAO → isbao-auditor docs, etc.). Do not pass project-wide regulatory; add standards per agent in Library.
    const service = new AuditSimulationService(
      assessmentData,
      [],
      entityDocsArg,
      smsDocsArg,
      uploadedResolved,
      Object.fromEntries(
        AUDIT_AGENTS.map((a) => [a.id, getDocsForAgent(a.id)])
      ) as any,
      {},
      thinkingEnabled ? { enabled: true, budgetTokens: thinkingBudget, adaptive: adaptiveThinking, adaptiveEffort: adaptiveThinkingEffort } : undefined,
      selfReviewMode !== 'off' ? { mode: selfReviewMode, maxIterations: selfReviewMaxIterations } : undefined,
      effectiveFaaConfig(),
      selectedAgents.has('isbao-auditor') ? selectedIsbaoStage : undefined,
      selectedAgents.has('public-use-auditor') ? publicUseConfig : undefined,
      dataContext,
      Array.from(selectedAgents) as AuditAgent['id'][],
      paperworkContexts,
      auditSimModel,
      attachedImages.map(({ media_type, data }) => ({ media_type, data }))
    );
    if (useRetrievalDocs) {
      service.setRetrievedDocsByAgent(retrievedDocsByAgent);
    }
    serviceRef.current = service;

    let completedMessages: AuditMessage[] = [];
    try {
      completedMessages = await service.runSimulation(
        totalRounds,
        (message) => {
          if (!abortRef.current) {
            setMessages((prev) => [...prev, message]);
          }
        },
        (round) => {
          if (!abortRef.current) {
            setCurrentRound(round);
          }
        },
        (status) => {
          if (!abortRef.current) {
            setStatusText(status);
          }
        },
        Array.from(selectedAgents) as AuditAgent['id'][],
        async (round, agentId) => {
          while (isPausedRef.current && !abortRef.current) {
            await new Promise<void>((resolve) => {
              unpauseResolveRef.current = resolve;
            });
          }
        },
        async (question, agentName) => {
          return new Promise<AuditorQuestionAnswer>((resolve) => {
            setPendingQuestion({ agentName, question, resolve });
          });
        }
      );
    } catch (error: any) {
      if (!abortRef.current) {
        const message =
          error?.message ||
          'The audit service did not respond. This can happen on long runs — start the simulation again to retry.';
        setSimulationError(message);
        toast.error('Simulation error', { description: message });
      }
    } finally {
      serviceRef.current = null;
      setIsRunning(false);
      setIsPaused(false);
      isPausedRef.current = false;
      if (!abortRef.current && completedMessages.length > 0) {
        setDiscrepanciesLoading(true);
        try {
          const list = await extractDiscrepanciesFromTranscript(completedMessages, setStatusText, auditSimModel);
          setDiscrepancies(list);
        } catch {
          toast.error('Could not extract discrepancies');
          setDiscrepancies([]);
        } finally {
          setDiscrepanciesLoading(false);
          setStatusText('');
        }
      }
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    setIsRunning(false);
    setIsPaused(false);
    isPausedRef.current = false;
    unpauseResolveRef.current?.();
    setStatusText('Simulation stopped');
  };

  const handlePause = () => {
    isPausedRef.current = true;
    setIsPaused(true);
    setStatusText('Paused — upload documents or click Resume to continue');
  };

  const handleResume = () => {
    if (serviceRef.current && simulationUploads.length > 0) {
      serviceRef.current.addUploadedDocuments(simulationUploads);
      setSimulationUploads([]);
    }
    isPausedRef.current = false;
    unpauseResolveRef.current?.();
    unpauseResolveRef.current = null;
    setIsPaused(false);
    setStatusText('');
  };

  const readImageAsBase64 = (file: File): Promise<{ name: string } & AttachedImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          reject(new Error('Could not parse image data'));
          return;
        }
        const media_type = match[1].toLowerCase();
        const data = match[2];
        resolve({ name: file.name, media_type, data });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const handleImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const toAdd: Array<{ name: string } & AttachedImage> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowed.includes(file.type)) {
        toast.warning(`Skipped ${file.name}: use JPEG, PNG, GIF, or WebP`);
        continue;
      }
      try {
        toAdd.push(await readImageAsBase64(file));
      } catch (err) {
        toast.error(`Failed to read ${file.name}`);
      }
    }
    if (toAdd.length) setAttachedImages((prev) => [...prev, ...toAdd]);
    e.target.value = '';
  };

  const removeAttachedImage = (index: number) => {
    setAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePauseFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPauseUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const text = await documentExtractorRef.extractText(buffer, file.name, file.type || '', defaultModel);
      setSimulationUploads((prev) => [...prev, { name: file.name, text: text.substring(0, 18000) }]);
      toast.success(`Added "${file.name}" for the simulation`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to extract text from document');
    } finally {
      setPauseUploading(false);
      e.target.value = '';
    }
  };

  const handleAuditorQuestionAnswer = (answer: AuditorQuestionAnswer) => {
    if (pendingQuestion) {
      pendingQuestion.resolve(answer);
      setPendingQuestion(null);
    }
  };

  const handleSaveSimulation = async (asDraft?: boolean) => {
    if (messages.length === 0) return;
    const assessmentRecord = selectedAssessment ? assessments.find((a: any) => a._id === selectedAssessment) : null;
    const agentIdList = Array.from(selectedAgents) as AuditAgent['id'][];
    const now = new Date();
    const faaCfg = effectiveFaaConfig();
    const dataSummary = dataSummaryForRun ?? getDataSummary();
    const name = asDraft
      ? `Draft – Round ${currentRound} of ${totalRounds}`
      : `${assessmentRecord?.data?.companyName || 'Simulation'} - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    const simId = await addSimulationResult({
      projectId: activeProjectId as any,
      originalId: `sim-${Date.now()}`,
      name,
      assessmentId: selectedAssessment || '',
      assessmentName: assessmentRecord?.data?.companyName || 'No assessment',
      agentIds: agentIdList,
      totalRounds,
      messages: [...messages],
      createdAt: now.toISOString(),
      thinkingEnabled,
      selfReviewMode,
      faaConfig: faaCfg ?? undefined,
      isbaoStage: selectedAgents.has('isbao-auditor') ? selectedIsbaoStage : undefined,
      publicUseConfig: selectedAgents.has('public-use-auditor') ? publicUseConfig : undefined,
      region: selectedRegion !== 'all' ? selectedRegion : undefined,
      ...(asDraft ? { isPaused: true as const, currentRound } : {}),
      ...(discrepancies.length > 0 ? { discrepancies } : {}),
      dataSummary,
    } as any);
    setLoadedSimulationId(simId);
    if (asDraft) toast.success('Progress saved. You can load this draft from Saved Simulations.');
  };

  const handleLoadSimulation = (simId: string) => {
    if (!simulationResults.some((s: any) => s._id === simId)) return;
    setLoadedSimulationId(simId);
    setViewMode('chat');
    // Messages and config are synced from useSimulationResult(simId) in useEffect.
  };

  const handleAddAllToEntityIssues = async () => {
    if (!activeProjectId || discrepancies.length === 0) return;
    setAddingToEntityIssues(true);
    try {
      for (const d of discrepancies) {
        await addEntityIssue({
          projectId: activeProjectId as any,
          assessmentId: selectedAssessment || undefined,
          source: 'audit_sim',
          sourceId: loadedSimulationId ?? undefined,
          severity: d.severity,
          title: d.title,
          description: d.description,
          regulationRef: d.regulationRef,
        });
      }
      toast.success(`${discrepancies.length} issue(s) added to Entity issues`);
      navigate('/entity-issues');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to add to entity issues');
    } finally {
      setAddingToEntityIssues(false);
    }
  };

  const handleDeleteSimulation = async (simId: string) => {
    await removeSimulationResult({ simulationId: simId as any });
    if (loadedSimulationId === simId) setLoadedSimulationId(null);
  };

  const extractFindingsForCompare = async (side: 'A' | 'B') => {
    const sim = side === 'A' ? (compareRunA ?? undefined) : (compareRunB ?? undefined);
    if (!sim?.messages?.length) return;
    if (side === 'A') {
      setCompareFindingsALoading(true);
      setCompareFindingsA([]);
    } else {
      setCompareFindingsBLoading(true);
      setCompareFindingsB([]);
    }
    try {
      const list = await extractDiscrepanciesFromTranscript(sim.messages, undefined, auditSimModel);
      if (side === 'A') setCompareFindingsA(list);
      else setCompareFindingsB(list);
    } catch {
      toast.error(`Could not extract findings for Run ${side}`);
      if (side === 'A') setCompareFindingsA([]);
      else setCompareFindingsB([]);
    } finally {
      if (side === 'A') setCompareFindingsALoading(false);
      else setCompareFindingsBLoading(false);
    }
  };

  const handleNewSimulation = () => {
    setMessages([]);
    setCurrentRound(0);
    setStatusText('');
    setViewMode('chat');
    setLoadedSimulationId(null);
    setDiscrepancies([]);
    setDiscrepanciesLoading(false);
    setDataSummaryForRun(null);
  };

  const rounds: Map<number, AuditMessage[]> = new Map();
  messages.forEach((msg) => {
    if (!rounds.has(msg.round)) rounds.set(msg.round, []);
    rounds.get(msg.round)!.push(msg);
  });

  return (
    <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 flex flex-col min-h-0 h-full">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Audit Simulation
        </h1>
        <p className="text-white/60 text-lg">
          Multi-agent audit simulation with {availableAgents.length} specialist auditors{enabledAgentIds !== null ? ' (filtered)' : ''}.
        </p>
      </div>

      {simulationError && !isRunning && messages.length === 0 && (
        <GlassCard rounded="xl" padding="md" className="mb-4 border border-red-500/30 bg-red-500/10">
          <p className="font-semibold text-red-300">Simulation failed</p>
          <p className="text-sm text-white/70 mt-1">{simulationError}</p>
          <p className="text-sm text-white/60 mt-2">
            Adjust your selection if needed and press Start to retry.
          </p>
        </GlassCard>
      )}

      {messages.length === 0 && !isRunning && availableAgents.length === 0 && (
        <GlassCard rounded="xl" padding="md" className="border border-white/10">
          <p className="font-semibold text-white">No auditors available</p>
          <p className="text-sm text-white/65 mt-1">
            All audit agents are disabled for this workspace. Enable one or more auditors in
            Settings to run a simulation.
          </p>
        </GlassCard>
      )}

      {messages.length === 0 && !isRunning && availableAgents.length > 0 && (
        <>
        <GlassCard rounded="xl" padding="sm" className="mb-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useRetrievalDocs}
              onChange={(e) => setUseRetrievalDocs(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-sky-400"
            />
            <span className="text-sm text-white/75">
              <span className="font-medium text-white">Scope documents by relevance (experimental)</span>
              {' '}— give each auditor only the retrieved passages relevant to its focus area instead of every entity/SMS document in full. Lowers token usage on large libraries; requires documents to be indexed.
            </span>
          </label>
        </GlassCard>
        <SimulationAgentSelector
          availableAgents={availableAgents}
          selectedAgents={selectedAgents}
          onToggleAgent={toggleAgent}
          onSelectAllAgents={selectAllAgents}
          onDeselectAllAgents={deselectAllAgents}
          faaConfig={faaConfig}
          onSetFaaConfig={setFaaConfig}
          selectedIsbaoStage={selectedIsbaoStage}
          onSetIsbaoStage={setSelectedIsbaoStage}
          publicUseConfig={publicUseConfig}
          onSetPublicUseConfig={setPublicUseConfig}
          assessments={assessments}
          selectedAssessment={selectedAssessment}
          onSetAssessment={setSelectedAssessment}
          totalRounds={totalRounds}
          onSetTotalRounds={setTotalRounds}
          attachedImages={attachedImages}
          imageInputRef={imageInputRef}
          onImageAttach={handleImageAttach}
          onRemoveImage={removeAttachedImage}
          completedReviews={completedReviews}
          selectedReviewIds={selectedReviewIds}
          docNameMap={docNameMap}
          onToggleReview={toggleReview}
          onSelectAllReviews={selectAllReviews}
          onDeselectAllReviews={deselectAllReviews}
          selectedRegion={selectedRegion}
          onSetRegion={setSelectedRegion}
          dataSummary={currentDataSummary}
          isRunning={isRunning}
          onStart={handleStart}
        />
        </>
      )}


      {isRunning && (
        <>
          <GlassCard rounded="xl" padding="sm" className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-green-400 animate-pulse'}`} />
              <span className="font-medium">{statusText}</span>
              <span className="text-white/70 text-sm">Round {currentRound} of {totalRounds}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {isPaused ? (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleResume}
                    icon={<FiPlay />}
                    className="w-full sm:w-auto"
                  >
                    Resume
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleSaveSimulation(true)}
                    icon={<FiSave className="w-3.5 h-3.5" />}
                    className="w-full sm:w-auto"
                  >
                    Save progress
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handlePause}
                  icon={<FiPause />}
                  className="w-full sm:w-auto"
                >
                  Pause
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={handleStop}
                icon={<FiStopCircle />}
                className="w-full sm:w-auto"
              >
                Stop
              </Button>
            </div>
          </GlassCard>
          {isPaused && (
            <GlassCard rounded="xl" padding="md" className="mb-4 border border-sky/20">
              <h3 className="text-sm font-semibold text-sky-light mb-2">Upload documents for this simulation</h3>
              <p className="text-white/70 text-xs mb-3">
                Add PDF, Word, or text files. They will be available to all auditors when you resume.
              </p>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt,image/*"
                onChange={handlePauseFileSelect}
                className="hidden"
                id="pause-upload-input"
              />
              <Button
                variant="secondary"
                size="sm"
                icon={<FiUpload className="w-3.5 h-3.5" />}
                onClick={() => document.getElementById('pause-upload-input')?.click()}
                disabled={pauseUploading}
              >
                {pauseUploading ? 'Extracting...' : 'Choose file'}
              </Button>
              {simulationUploads.length > 0 && (
                <ul className="mt-3 text-sm text-white/80 space-y-1">
                  {simulationUploads.map((d, i) => (
                    <li key={i}>{d.name}</li>
                  ))}
                </ul>
              )}
            </GlassCard>
          )}
        </>
      )}

      {messages.length > 0 && (
        <SimulationTranscript
          messages={messages}
          rounds={rounds}
          isRunning={isRunning}
          viewMode={viewMode}
          selectedAgents={selectedAgents}
          discrepancies={discrepancies}
          discrepanciesLoading={discrepanciesLoading}
          dataSummaryForRun={dataSummaryForRun}
          addingToEntityIssues={addingToEntityIssues}
          simulationResults={simulationResults}
          searchedSimulationResults={searchedSimulationResults}
          loadedSimulationId={loadedSimulationId}
          savedSimSearch={savedSimSearch}
          compareRunAId={compareRunAId}
          compareRunBId={compareRunBId}
          compareRunA={compareRunA}
          compareRunB={compareRunB}
          compareFindingsA={compareFindingsA}
          compareFindingsB={compareFindingsB}
          compareFindingsALoading={compareFindingsALoading}
          compareFindingsBLoading={compareFindingsBLoading}
          onSetViewMode={setViewMode}
          onSaveSimulation={handleSaveSimulation}
          onNewSimulation={handleNewSimulation}
          onLoadSimulation={handleLoadSimulation}
          onDeleteSimulation={handleDeleteSimulation}
          onAddAllToEntityIssues={handleAddAllToEntityIssues}
          onSetSavedSimSearch={setSavedSimSearch}
          onSetCompareRunAId={setCompareRunAId}
          onSetCompareFindingsA={setCompareFindingsA}
          onSetCompareRunBId={setCompareRunBId}
          onSetCompareFindingsB={setCompareFindingsB}
          onExtractFindingsForCompare={extractFindingsForCompare}
        />
      )}


      <AuditorQuestionModal
        open={!!pendingQuestion}
        agentName={pendingQuestion?.agentName ?? ''}
        question={pendingQuestion?.question ?? ''}
        onAnswer={handleAuditorQuestionAnswer}
        onClose={() => {
          if (pendingQuestion) {
            pendingQuestion.resolve({ type: 'no', value: '' });
            setPendingQuestion(null);
          }
        }}
      />
    </div>
  );
}
