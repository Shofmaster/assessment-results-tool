import { useState, useRef, useEffect } from 'react';
import { FiPlay, FiPause, FiStopCircle, FiCheck, FiColumns, FiMessageSquare, FiSave, FiTrash2, FiList, FiUpload, FiFileText, FiImage, FiX } from 'react-icons/fi';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { AuditSimulationService, AUDIT_AGENTS, getMinimalAssessmentData, extractDiscrepanciesFromTranscript, type ISBAOStage, type AttachedImage } from '../services/auditAgents';
import { MODELS_SUPPORTING_THINKING } from '../constants/claude';
import {
  useAssessments,
  useDocuments,
  useAllProjectAgentDocs,
  useSharedAgentDocsByAgents,
  useSimulationResults,
  useSimulationResult,
  useAddSimulationResult,
  useRemoveSimulationResult,
  useUserSettings,
  useUpsertUserSettings,
  useAuditSimModel,
  useDefaultClaudeModel,
  useDocumentReviews,
  useAllSharedReferenceDocs,
} from '../hooks/useConvexData';
import type { AuditAgent, AuditMessage, AuditDiscrepancy, SelfReviewMode, SimulationResult, SimulationDataSummary, FAAConfig, FAAPartScope, PaperworkReviewContext } from '../types/auditSimulation';
import { FAA_INSPECTOR_SPECIALTIES, FAA_PARTS, DEFAULT_FAA_CONFIG } from '../data/faaInspectorTypes';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import ComparisonView from './ComparisonView';
import AuditorQuestionModal from './AuditorQuestionModal';
import { Button, GlassCard, Select, Badge } from './ui';
import { PageModelSelector } from './PageModelSelector';
import type { AuditorQuestionAnswer } from '../types/auditSimulation';
import { DocumentExtractor } from '../services/documentExtractor';

const SIMULATION_AGENT_IDS = AUDIT_AGENTS.map((a) => a.id);

export default function AuditSimulation() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const navigate = useNavigate();

  const auditSimSelectedFromStore = useAppStore((s) => s.auditSimulationSelectedAgents);
  const setAuditSimSelectedInStore = useAppStore((s) => s.setAuditSimulationSelectedAgents);

  const validAgentIds = new Set(AUDIT_AGENTS.map((a) => a.id));
  const defaultSelected = new Set(AUDIT_AGENTS.map((a) => a.id));
  const restoredFromStore = auditSimSelectedFromStore.filter((id): id is AuditAgent['id'] =>
    validAgentIds.has(id as AuditAgent['id'])
  );
  const selectedAgents = restoredFromStore.length > 0
    ? new Set(restoredFromStore)
    : defaultSelected;

  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [selectedIsbaoStage, setSelectedIsbaoStage] = useState<ISBAOStage>(1);
  const [totalRounds, setTotalRounds] = useState(8);
  const [uploadingFor, setUploadingFor] = useState<AuditAgent['id'] | null>(null);
  const [expandedAgent, setExpandedAgent] = useState<AuditAgent['id'] | null>(null);
  const [messages, setMessages] = useState<AuditMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
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

  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const serviceRef = useRef<AuditSimulationService | null>(null);
  const isPausedRef = useRef(false);
  const unpauseResolveRef = useRef<(() => void) | null>(null);
  const documentExtractorRef = useRef(new DocumentExtractor()).current;

  const settings = useUserSettings();
  const upsertSettings = useUpsertUserSettings();
  const auditSimModel = useAuditSimModel();
  const defaultModel = useDefaultClaudeModel();
  const thinkingEnabled = (settings?.thinkingEnabled ?? false) && MODELS_SUPPORTING_THINKING.has(auditSimModel);
  const thinkingBudget = settings?.thinkingBudget ?? 10000;
  const selfReviewMode = (settings?.selfReviewMode || 'off') as SelfReviewMode;
  const selfReviewMaxIterations = settings?.selfReviewMaxIterations ?? 2;

  const assessments = (useAssessments(activeProjectId || undefined) || []) as any[];
  const regulatoryFiles = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const smsDocuments = (useDocuments(activeProjectId || undefined, 'sms') || []) as any[];
  const uploadedDocuments = (useDocuments(activeProjectId || undefined, 'uploaded') || []) as any[];
  const allProjectAgentDocs = (useAllProjectAgentDocs(activeProjectId || undefined) || []) as any[];
  const allSharedAgentDocs = (useSharedAgentDocsByAgents(SIMULATION_AGENT_IDS) || []) as any[];

  const documentReviews = (useDocumentReviews(activeProjectId || undefined) || []) as any[];
  const allDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const sharedReferenceDocs = (useAllSharedReferenceDocs() || []) as any[];

  const simulationResults = (useSimulationResults(activeProjectId || undefined) || []) as any[];
  const loadedSimFull = useSimulationResult(loadedSimulationId ?? undefined);
  const compareRunA = useSimulationResult(compareRunAId ?? undefined);
  const compareRunB = useSimulationResult(compareRunBId ?? undefined);
  const addSimulationResult = useAddSimulationResult();
  const removeSimulationResult = useRemoveSimulationResult();

  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set());
  const [faaConfig, setFaaConfig] = useState<FAAConfig>(() => ({ ...DEFAULT_FAA_CONFIG }));

  const completedReviews = documentReviews.filter((r: any) => r.status === 'completed' && r.verdict);

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
  }, [loadedSimulationId, loadedSimFull, isRunning]);

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 w-full">
        <GlassCard padding="xl" className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to run simulations.</p>
          <Button onClick={() => navigate('/projects')}>
            Go to Projects
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
    return combined.map((d: any) => ({ name: d.name, text: d.extractedText || '' })).filter((d: any) => d.text.length > 0);
  };

  /** Build a realistic summary of what data we have and what's missing (address later). */
  const getDataSummary = (): SimulationDataSummary => {
    const entityWithText = entityDocuments.filter((d: any) => (d.extractedText || '').length > 0);
    const smsWithText = smsDocuments.filter((d: any) => (d.extractedText || '').length > 0);
    const uploadedWithText = uploadedDocuments.filter((d: any) => (d.extractedText || '').length > 0);
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

  const deselectAllReviews = () => {
    setSelectedReviewIds(new Set());
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

    const assessmentRecord = selectedAssessment
      ? assessments.find((a: any) => a._id === selectedAssessment)
      : null;
    const assessmentData = assessmentRecord?.data ?? getMinimalAssessmentData();

    setIsRunning(true);
    setIsPaused(false);
    isPausedRef.current = false;
    setMessages([]);
    setCurrentRound(0);
    setDiscrepancies([]);
    setDiscrepanciesLoading(false);
    setDataSummaryForRun(getDataSummary());
    setSimulationUploads([]);
    abortRef.current = false;

    const entityDocs: { name: string; text?: string }[] = entityDocuments.map((d: any) => ({
      name: d.name,
      ...(d.extractedText ? { text: d.extractedText } : {}),
    }));
    const smsDocs: { name: string; text?: string }[] = smsDocuments.map((d: any) => ({
      name: d.name,
      ...(d.extractedText ? { text: d.extractedText } : {}),
    }));

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

    // Each participant uses only their own knowledge base (FAA → faa-inspector docs, IS-BAO → isbao-auditor docs, etc.). Do not pass project-wide regulatory; add standards per agent in Library.
    const uploadedWithText: { name: string; text: string }[] = uploadedDocuments
      .filter((d: any) => (d.extractedText || '').length > 0)
      .map((d: any) => ({ name: d.name, text: d.extractedText || '' }));
    const service = new AuditSimulationService(
      assessmentData,
      [],
      entityDocs,
      smsDocs,
      uploadedWithText,
      Object.fromEntries(
        AUDIT_AGENTS.map((a) => [a.id, getDocsForAgent(a.id)])
      ) as any,
      Object.fromEntries(
        AUDIT_AGENTS.map((a) => [a.id, getDocsForAgent(a.id)])
      ) as any,
      thinkingEnabled ? { enabled: true, budgetTokens: thinkingBudget } : undefined,
      selfReviewMode !== 'off' ? { mode: selfReviewMode, maxIterations: selfReviewMaxIterations } : undefined,
      effectiveFaaConfig(),
      selectedAgents.has('isbao-auditor') ? selectedIsbaoStage : undefined,
      dataContext,
      Array.from(selectedAgents) as AuditAgent['id'][],
      paperworkContexts,
      auditSimModel,
      attachedImages.map(({ media_type, data }) => ({ media_type, data }))
    );
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
        toast.error('Simulation error', { description: error.message });
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

  const handleSaveSimulation = async () => {
    if (messages.length === 0) return;
    const assessmentRecord = selectedAssessment ? assessments.find((a: any) => a._id === selectedAssessment) : null;
    const agentIdList = Array.from(selectedAgents) as AuditAgent['id'][];
    const now = new Date();
    const faaCfg = effectiveFaaConfig();
    const result: SimulationResult = {
      id: `sim-${Date.now()}`,
      name: `${assessmentRecord?.data?.companyName || 'Simulation'} - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      assessmentId: selectedAssessment || '',
      assessmentName: assessmentRecord?.data?.companyName || 'No assessment',
      agentIds: agentIdList,
      totalRounds: totalRounds,
      messages: [...messages],
      createdAt: now.toISOString(),
      thinkingEnabled,
      selfReviewMode,
      faaConfig: faaCfg,
      isbaoStage: selectedAgents.has('isbao-auditor') ? selectedIsbaoStage : undefined,
      dataSummary: dataSummaryForRun ?? getDataSummary(),
    };
    const simId = await addSimulationResult({
      projectId: activeProjectId as any,
      originalId: result.id,
      name: result.name,
      assessmentId: result.assessmentId,
      assessmentName: result.assessmentName,
      agentIds: result.agentIds,
      totalRounds: result.totalRounds,
      messages: result.messages,
      createdAt: result.createdAt,
      thinkingEnabled: result.thinkingEnabled,
      selfReviewMode: result.selfReviewMode,
      faaConfig: faaCfg ?? undefined,
      isbaoStage: result.isbaoStage,
    });
    setLoadedSimulationId(simId);
  };

  const handleLoadSimulation = (simId: string) => {
    if (!simulationResults.some((s: any) => s._id === simId)) return;
    setLoadedSimulationId(simId);
    setViewMode('chat');
    // Messages and config are synced from useSimulationResult(simId) in useEffect.
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

  const rounds: Map<number, AuditMessage[]> = new Map();
  messages.forEach((msg) => {
    if (!rounds.has(msg.round)) rounds.set(msg.round, []);
    rounds.get(msg.round)!.push(msg);
  });

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 w-full flex flex-col h-full">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Audit Simulation
        </h1>
        <p className="text-white/60 text-lg">
          Multi-agent audit simulation with {AUDIT_AGENTS.length} specialist auditors
        </p>
      </div>

      {messages.length === 0 && !isRunning && (
        <GlassCard className="mb-6 overflow-y-auto">
          <h2 className="text-xl font-display font-bold mb-4">Configure Simulation</h2>

          <p className="text-sm text-white/70 mb-2">Click to select or deselect participants</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-4">
            {AUDIT_AGENTS.map((agent) => {
              const isSelected = selectedAgents.has(agent.id);
              const isFaa = agent.id === 'faa-inspector';
              return (
                <div key={agent.id} className="flex flex-col gap-0 min-h-[9rem]">
                  <button
                    type="button"
                    onClick={() => toggleAgent(agent.id)}
                    className={`relative p-3 rounded-xl border text-left transition-all h-full min-h-[9rem] flex flex-col ${
                      isSelected ? 'bg-white/5 border-sky-light/40' : 'bg-white/5 border-white/10 opacity-40'
                    }`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 w-5 h-5 bg-sky-light rounded-full flex items-center justify-center">
                        <FiCheck className="text-navy-900 text-xs" />
                      </div>
                    )}
                    <div className="text-3xl mb-2">{agent.avatar}</div>
                    <div className="font-bold text-sm">{agent.name}</div>
                    {isFaa && isSelected && faaConfig.partsScope?.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {faaConfig.partsScope.map((p) => (
                          <Badge key={p} size="sm" pill className="text-xs">
                            Part {p}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-1.5 min-h-[1.5rem]" aria-hidden />
                    )}
                    <div className="text-xs text-white/60 mt-1 line-clamp-2">{agent.role}</div>
                  </button>
                </div>
              );
            })}
          </div>

          {selectedAgents.has('faa-inspector') && (
            <GlassCard rounded="xl" padding="md" className="mb-6 border border-sky/20">
              <h3 className="text-sm font-semibold text-sky-light mb-3">FAA Inspector scope and type</h3>
              <p className="text-xs text-white/70 mb-3">Select at least one Part; then choose specialty and inspection type.</p>
              <div className="flex flex-wrap gap-4 mb-4">
                <span className="text-sm text-white/70">Scope (Parts):</span>
                {FAA_PARTS.map((part) => {
                  const checked = faaConfig.partsScope?.includes(part) ?? false;
                  return (
                    <label key={part} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setFaaConfig((prev) => {
                            const next = prev.partsScope?.includes(part)
                              ? (prev.partsScope.filter((p) => p !== part) as FAAPartScope[])
                              : [...(prev.partsScope || []), part];
                            return { ...prev, partsScope: next };
                          });
                        }}
                        className="rounded border-white/30 bg-white/5 text-sky-light focus:ring-sky"
                      />
                      <span className="text-sm">Part {part}</span>
                    </label>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/70 mb-1.5">Specialty</label>
                  <Select
                    value={faaConfig.specialtyId}
                    onChange={(e) => {
                      const specialty = FAA_INSPECTOR_SPECIALTIES.find((s) => s.id === e.target.value);
                      setFaaConfig((prev) => ({
                        ...prev,
                        specialtyId: e.target.value,
                        inspectionTypeId: specialty?.inspectionTypes[0]?.id ?? prev.inspectionTypeId,
                      }));
                    }}
                  >
                    {FAA_INSPECTOR_SPECIALTIES.map((s) => (
                      <option key={s.id} value={s.id} className="bg-navy-800">
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1.5">Inspection type</label>
                  <select
                    value={faaConfig.inspectionTypeId}
                    onChange={(e) => setFaaConfig((prev) => ({ ...prev, inspectionTypeId: e.target.value }))}
                    className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-sky-light focus:ring-1 focus:ring-sky-light"
                  >
                    {(FAA_INSPECTOR_SPECIALTIES.find((s) => s.id === faaConfig.specialtyId)?.inspectionTypes ?? []).map(
                      (t) => (
                        <option key={t.id} value={t.id} className="bg-navy-800">
                          {t.name}
                        </option>
                      )
                    )}
                  </select>
                </div>
              </div>
              {(faaConfig.partsScope?.length ?? 0) === 0 && (
                <p className="text-amber-400/90 text-xs mt-2">Select at least one Part (121, 135, and/or 145).</p>
              )}
            </GlassCard>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Select
              label="Assessment (optional)"
              value={selectedAssessment}
              onChange={(e) => setSelectedAssessment(e.target.value)}
            >
              <option value="" className="bg-navy-800">No assessment — use generic context</option>
              {assessments.map((a) => (
                <option key={a._id} value={a._id} className="bg-navy-800">
                  {a.data.companyName} - {new Date(a.importedAt).toLocaleDateString()}
                </option>
              ))}
            </Select>

            <Select
              label="Audit Rounds"
              value={totalRounds}
              onChange={(e) => setTotalRounds(Number(e.target.value))}
            >
              {[3, 5, 6, 8, 10, 12, 15].map((n) => (
                <option key={n} value={n} className="bg-navy-800">
                  {n} round{n > 1 ? 's' : ''}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2 mb-4">
            <span className="text-sm font-medium text-white/80">Attach images (optional)</span>
            <p className="text-xs text-white/60">Photos of logs, nameplates, or documents to include in the audit context.</p>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              onChange={handleImageAttach}
              className="hidden"
              disabled={isRunning}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => imageInputRef.current?.click()}
              disabled={isRunning}
              icon={<FiImage />}
            >
              Choose images
            </Button>
            {attachedImages.length > 0 && (
              <ul className="mt-2 space-y-1">
                {attachedImages.map((img, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 py-2 px-3 bg-white/5 rounded-lg text-sm">
                    <span className="truncate text-white/80">{img.name}</span>
                    <button
                      type="button"
                      onClick={() => removeAttachedImage(i)}
                      disabled={isRunning}
                      className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                      aria-label="Remove image"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedAgents.has('isbao-auditor') && (
            <div className="mb-4">
              <Select
                label="IS-BAO stage (IS-BAO auditor will focus only on this stage)"
                value={String(selectedIsbaoStage)}
                onChange={(e) => setSelectedIsbaoStage(Number(e.target.value) as ISBAOStage)}
              >
                <option value="1" className="bg-navy-800">Stage 1 — SMS infrastructure & written procedures</option>
                <option value="2" className="bg-navy-800">Stage 2 — Risk management in use</option>
                <option value="3" className="bg-navy-800">Stage 3 — SMS integrated into culture</option>
              </Select>
            </div>
          )}

          {completedReviews.length > 0 && (
            <GlassCard rounded="xl" padding="md" className="mb-6 border border-sky/20">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-sky-light flex items-center gap-2">
                  <FiFileText className="w-4 h-4" />
                  Paperwork Reviews ({completedReviews.length} completed)
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllReviews}
                    className="text-xs text-sky-light/80 hover:text-sky-light transition-colors"
                  >
                    Select all
                  </button>
                  <span className="text-white/30">|</span>
                  <button
                    type="button"
                    onClick={deselectAllReviews}
                    className="text-xs text-white/60 hover:text-white/80 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <p className="text-xs text-white/70 mb-3">
                Include completed paperwork review findings in the simulation. Agents will reference these when discussing compliance.
              </p>
              <div className="space-y-2 max-h-48 overflow-y-auto scrollbar-thin">
                {completedReviews.map((review: any) => {
                  const isSelected = selectedReviewIds.has(review._id);
                  const underReviewName = docNameMap[review.underReviewDocumentId] || 'Document under review';
                  const findingCount = Array.isArray(review.findings) ? review.findings.length : 0;
                  const criticalCount = Array.isArray(review.findings)
                    ? review.findings.filter((f: any) => f.severity === 'critical').length
                    : 0;
                  return (
                    <label
                      key={review._id}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? 'bg-sky/10 border-sky/30'
                          : 'bg-white/5 border-white/10 hover:bg-white/8'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleReview(review._id)}
                        className="mt-0.5 rounded border-white/30 bg-white/5 text-sky-light focus:ring-sky"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white/90 truncate">{underReviewName}</div>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <Badge
                            size="sm"
                            className={
                              review.verdict === 'pass'
                                ? 'bg-green-500/20 text-green-300'
                                : review.verdict === 'conditional'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-red-500/20 text-red-300'
                            }
                          >
                            {review.verdict}
                          </Badge>
                          {findingCount > 0 && (
                            <span className="text-xs text-white/60">
                              {findingCount} finding{findingCount !== 1 ? 's' : ''}
                              {criticalCount > 0 && (
                                <span className="text-red-400 ml-1">({criticalCount} critical)</span>
                              )}
                            </span>
                          )}
                          {review.reviewScope && (
                            <span className="text-xs text-white/50 truncate max-w-[150px]">
                              Scope: {review.reviewScope}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
              {selectedReviewIds.size > 0 && (
                <p className="text-xs text-sky-light/80 mt-2">
                  {selectedReviewIds.size} review{selectedReviewIds.size !== 1 ? 's' : ''} will be included in the simulation context.
                </p>
              )}
            </GlassCard>
          )}

          <GlassCard rounded="xl" padding="md" className="mb-6 border border-white/10">
            <h3 className="text-sm font-semibold text-sky-light mb-2">Data for this simulation</h3>
            <p className="text-xs text-white/70 mb-3">
              We run on what you have. If something is missing, we continue and you can add it later.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white/60">Assessment:</span>
                <span className={currentDataSummary.hasAssessment ? 'text-white' : 'text-amber-400/90'}>
                  {currentDataSummary.assessmentName}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white/60">Entity docs:</span>
                <span>{currentDataSummary.entityDocsWithText}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white/60">SMS docs:</span>
                <span>{currentDataSummary.smsDocsWithText}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white/60">Uploaded docs:</span>
                <span>{currentDataSummary.uploadedDocsWithText}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-white/60">Paperwork reviews:</span>
                <span className={currentDataSummary.paperworkReviewsIncluded > 0 ? 'text-sky-light' : 'text-white/40'}>
                  {currentDataSummary.paperworkReviewsIncluded}
                </span>
              </div>
            </div>
            {currentDataSummary.gaps.length > 0 && (
              <div className="pt-2 border-t border-white/10">
                <span className="text-xs text-amber-400/90 font-medium">Not provided (you can address later):</span>
                <ul className="mt-1 text-xs text-white/70 list-disc list-inside">
                  {currentDataSummary.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            )}
          </GlassCard>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <PageModelSelector field="auditSimModel" compact disabled={isRunning} />
            </div>
            <Button
              size="lg"
              onClick={handleStart}
              icon={<FiPlay />}
              className="min-w-[200px] shrink-0"
            >
              Start Audit Simulation
            </Button>
          </div>
        </GlassCard>
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
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleResume}
                  icon={<FiPlay />}
                  className="w-full sm:w-auto"
                >
                  Resume
                </Button>
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

      {!isRunning && messages.length > 0 && (
        <>
        <GlassCard rounded="xl" padding="md" className="mb-4">
          <h2 className="text-lg font-display font-bold mb-3 flex items-center gap-2">
            <FiList className="w-5 h-5 text-sky-light" />
            Discrepancies
          </h2>
          {discrepanciesLoading ? (
            <p className="text-white/70 text-sm flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-sky-light border-t-transparent rounded-full animate-spin" />
              Extracting discrepancies from transcript...
            </p>
          ) : (
            <>
              {discrepancies.length === 0 ? (
                <p className="text-white/60 text-sm">No formal discrepancies were extracted from this simulation.</p>
              ) : (
                <ul className="space-y-3">
                  {discrepancies.map((d) => (
                    <li
                      key={d.id}
                      className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col gap-1.5"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-white/95">{d.title}</span>
                        <Badge
                          size="sm"
                          className={
                            d.severity === 'critical'
                              ? 'bg-red-500/20 text-red-300'
                              : d.severity === 'major'
                                ? 'bg-amber-500/20 text-amber-300'
                                : d.severity === 'minor'
                                  ? 'bg-yellow-500/20 text-yellow-300'
                                  : 'bg-white/10 text-white/70'
                          }
                        >
                          {d.severity}
                        </Badge>
                        {d.sourceAgent && (
                          <span className="text-xs text-white/60">{d.sourceAgent}</span>
                        )}
                        {d.regulationRef && (
                          <span className="text-xs text-sky-light/90">{d.regulationRef}</span>
                        )}
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">{d.description}</p>
                    </li>
                  ))}
                </ul>
              )}
              {dataSummaryForRun && dataSummaryForRun.gaps.length > 0 && (
                <div className="mt-4 pt-4 border-t border-white/10">
                  <h3 className="text-sm font-semibold text-amber-400/90 mb-2">Address later</h3>
                  <p className="text-xs text-white/70 mb-2">
                    This simulation ran with the data above. The following were not provided; you can add them and re-run or run a follow-up sim.
                  </p>
                  <ul className="text-xs text-white/80 list-disc list-inside space-y-0.5">
                    {dataSummaryForRun.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </GlassCard>
        <GlassCard rounded="xl" padding="sm" className="mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="flex bg-white/5 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('chat')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    viewMode === 'chat' ? 'bg-sky/20 text-sky-light' : 'text-white/70 hover:text-white/70'
                  }`}
                >
                  <FiMessageSquare className="w-3.5 h-3.5" />
                  Chat
                </button>
                <button
                  onClick={() => setViewMode('compare')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    viewMode === 'compare' ? 'bg-sky/20 text-sky-light' : 'text-white/70 hover:text-white/70'
                  }`}
                >
                  <FiColumns className="w-3.5 h-3.5" />
                  Compare
                </button>
              </div>

              <span className="text-white/70 text-sm ml-2">
                {messages.length} exchanges across {rounds.size} round{rounds.size > 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSaveSimulation}
                icon={<FiSave className="w-3.5 h-3.5" />}
                className="bg-sky/20 text-sky-light hover:bg-sky/30"
              >
                Save
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMessages([]);
                  setCurrentRound(0);
                  setStatusText('');
                  setViewMode('chat');
                  setLoadedSimulationId(null);
                  setDiscrepancies([]);
                  setDiscrepanciesLoading(false);
                  setDataSummaryForRun(null);
                }}
              >
                New Simulation
              </Button>
            </div>
          </div>

          {simulationResults.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <label className="block text-xs text-white/70 mb-1.5">Saved Simulations</label>
              <div className="flex flex-wrap gap-2">
                {simulationResults.map((sim) => (
                  <div
                    key={sim._id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-all cursor-pointer ${
                      loadedSimulationId === sim._id
                        ? 'bg-sky/15 border-sky/40 text-sky-light'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80'
                    }`}
                    onClick={() => handleLoadSimulation(sim._id)}
                  >
                    <span className="truncate max-w-[200px]">{sim.name}</span>
                    <span className="text-white/60">{(sim as any).messageCount ?? 0} msgs</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSimulation(sim._id);
                      }}
                      className="ml-1 text-white/60 hover:text-red-400 transition-colors"
                    >
                      <FiTrash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {simulationResults.length >= 2 && (
            <div className="mt-4 pt-4 border-t border-white/10">
              <label className="block text-xs font-semibold text-white/80 mb-2">Compare two runs</label>
              <p className="text-xs text-white/60 mb-3">Select two saved runs to compare findings side-by-side.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Select
                  label="Run A"
                  selectSize="sm"
                  value={compareRunAId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setCompareRunAId(v);
                    setCompareFindingsA([]);
                  }}
                >
                  <option value="">Select run…</option>
                  {simulationResults.map((sim: any) => (
                    <option key={sim._id} value={sim._id}>{sim.name}</option>
                  ))}
                </Select>
                <Select
                  label="Run B"
                  selectSize="sm"
                  value={compareRunBId ?? ''}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    setCompareRunBId(v);
                    setCompareFindingsB([]);
                  }}
                >
                  <option value="">Select run…</option>
                  {simulationResults.map((sim: any) => (
                    <option key={sim._id} value={sim._id}>{sim.name}</option>
                  ))}
                </Select>
              </div>
              {(compareRunA || compareRunB) && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3 text-xs">
                    {compareRunA && (
                      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                        <div className="font-semibold text-white/90 truncate">{compareRunA.name}</div>
                        <div className="text-white/60 mt-0.5">
                          {(compareRunA.agentIds as string[])?.length ?? 0} agents · {(compareRunA.messages as any[])?.length ?? 0} messages
                        </div>
                      </div>
                    )}
                    {compareRunB && (
                      <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                        <div className="font-semibold text-white/90 truncate">{compareRunB.name}</div>
                        <div className="text-white/60 mt-0.5">
                          {(compareRunB.agentIds as string[])?.length ?? 0} agents · {(compareRunB.messages as any[])?.length ?? 0} messages
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => extractFindingsForCompare('A')}
                      disabled={!(compareRunA?.messages?.length) || compareFindingsALoading}
                    >
                      {compareFindingsALoading ? 'Extracting…' : 'Extract findings for Run A'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => extractFindingsForCompare('B')}
                      disabled={!(compareRunB?.messages?.length) || compareFindingsBLoading}
                    >
                      {compareFindingsBLoading ? 'Extracting…' : 'Extract findings for Run B'}
                    </Button>
                  </div>
                  {(compareFindingsA.length > 0 || compareFindingsB.length > 0) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[320px] overflow-y-auto">
                      <div>
                        <div className="text-xs font-semibold text-white/80 mb-2">Run A findings ({compareFindingsA.length})</div>
                        <ul className="space-y-2">
                          {compareFindingsA.length === 0 ? (
                            <li className="text-xs text-white/50 italic">None extracted yet.</li>
                          ) : (
                            compareFindingsA.map((d) => (
                              <li key={d.id} className="p-2 rounded border border-white/10 bg-white/5 text-xs">
                                <span className="font-medium text-white/90">{d.title}</span>
                                <Badge size="sm" className="ml-1">{d.severity}</Badge>
                                <p className="text-white/70 mt-0.5 line-clamp-2">{d.description}</p>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-white/80 mb-2">Run B findings ({compareFindingsB.length})</div>
                        <ul className="space-y-2">
                          {compareFindingsB.length === 0 ? (
                            <li className="text-xs text-white/50 italic">None extracted yet.</li>
                          ) : (
                            compareFindingsB.map((d) => (
                              <li key={d.id} className="p-2 rounded border border-white/10 bg-white/5 text-xs">
                                <span className="font-medium text-white/90">{d.title}</span>
                                <Badge size="sm" className="ml-1">{d.severity}</Badge>
                                <p className="text-white/70 mt-0.5 line-clamp-2">{d.description}</p>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </GlassCard>
        </>
      )}

      {(messages.length > 0 || isRunning) && viewMode === 'chat' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2 min-h-0">
          {Array.from(rounds.entries()).map(([round, roundMessages]) => (
            <div key={round}>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs font-semibold text-white/70 uppercase tracking-wider">
                  {round === -1 ? 'Post-Simulation Review' : `Round ${round}`}
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {roundMessages.map((msg) => {
                const isHost = msg.agentName === 'Audit Host';
                const agent = AUDIT_AGENTS.find((a) => a.id === msg.agentId);
                return (
                  <div
                    key={msg.id}
                    className={`p-5 rounded-xl border mb-3 transition-all ${
                      isHost ? 'bg-sky/10 border-sky/30' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{isHost ? '👤' : agent?.avatar}</span>
                      <div>
                        <span className="font-bold text-lg">{msg.agentName}</span>
                        <Badge className={`ml-3 ${isHost ? 'bg-sky/20 text-sky-light' : ''}`}>
                          {msg.role}
                        </Badge>
                      </div>
                    </div>
                    <div className="text-white/90 leading-relaxed whitespace-pre-wrap pl-4 sm:pl-11">
                      {msg.content}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div id="audit-chat-end" />
        </div>
      )}

      {messages.length > 0 && !isRunning && viewMode === 'compare' && (
        <div className="flex-1 min-h-0">
          <ComparisonView
            messages={messages}
            agentIds={Array.from(selectedAgents) as AuditAgent['id'][]}
          />
        </div>
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
