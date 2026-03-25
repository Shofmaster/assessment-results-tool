import { useState, useRef, useEffect, useMemo } from 'react';
import {
  FiUpload,
  FiChevronRight,
  FiChevronLeft,
  FiFileText,
  FiUsers,
  FiCheckSquare,
  FiRefreshCw,
  FiLoader,
  FiCheck,
  FiAlertCircle,
  FiFolder,
  FiFile,
  FiCloud,
  FiExternalLink,
  FiImage,
  FiX,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { getConvexErrorMessage } from '../utils/convexError';
import { Button, GlassCard } from './ui';
import { PageModelSelector } from './PageModelSelector';
import { MODELS_SUPPORTING_THINKING } from '../constants/claude';
import {
  useDocuments,
  useAssessments,
  useAddDocument,
  useAddAssessment,
  useAddAnalysis,
  useAddSimulationResult,
  useSetDocumentRevisions,
  useAddDocumentReview,
  useUserSettings,
  useDefaultClaudeModel,
  useAuditSimModel,
  useAllProjectAgentDocs,
  useSharedAgentDocsByAgents,
  useEntityIssues,
  useAddEntityIssue,
  useAllSharedReferenceDocs,
  usePaperworkReviewModel,
  usePaperworkReviewAgentId,
  useUpdateDocumentReview,
  useLogProductEvent,
  useAnalyses,
  useSimulationResults,
  useAnalysis,
  useSimulationResult,
  useGenerateUploadUrl,
} from '../hooks/useConvexData';
import { DocumentExtractor } from '../services/documentExtractor';
import { ClaudeAnalyzer, type DocWithOptionalText, type AttachedImage } from '../services/claudeApi';
import { AuditSimulationService, AUDIT_AGENTS, extractDiscrepanciesFromTranscript, getPaperworkReviewSystemPrompt } from '../services/auditAgents';
import { DEFAULT_FAA_CONFIG } from '../data/faaInspectorTypes';
import { RevisionChecker } from '../services/revisionChecker';
import { PDFReportGenerator } from '../services/pdfGenerator';
import { AuditSimulationDOCXGenerator } from '../services/auditDocxGenerator';
import { buildAuditorCoverageSummary } from '../services/auditorDocumentCoverage';
import { inferDocType } from '../services/documentTypeResolver';
import { DOC_TYPE_LABELS, type AuditorCoverageAgentId } from '../config/auditorDocumentRequirements';
import type { Id } from '../../convex/_generated/dataModel';
import type { AuditAgent, SelfReviewMode } from '../types/auditSimulation';
import type { UploadedDocument } from '../types/document';

const STEPS = [
  { id: 1, title: 'Upload documents', short: 'Upload' },
  { id: 2, title: 'Run analysis', short: 'Analysis' },
  { id: 3, title: 'Audit simulation', short: 'Audit Simulation' },
  { id: 4, title: 'Paperwork review', short: 'Review' },
  { id: 5, title: 'Revision check', short: 'Revisions' },
  { id: 6, title: 'Summary', short: 'Summary' },
];

type DocCategory = 'regulatory' | 'entity' | 'sms' | 'reference' | 'uploaded';

const REGULATORY_CATEGORIES = [
  'CFRs',
  'IS-BAO Standards',
  'EASA Regulations',
  'Advisory Circulars',
  'Other Standards',
];

interface FileProgressItem {
  name: string;
  status: 'pending' | 'extracting' | 'done' | 'error';
  error?: string;
}

const SIMULATION_AGENT_IDS = AUDIT_AGENTS.map((a) => a.id);

/** Score how well a reference doc matches an under-review doc (higher = better). */
function scorePair(underName: string, underCat: string, refName: string, refCat: string, refDocType?: string): number {
  const underType = inferDocType(underName, underCat);
  const refType = refDocType ?? inferDocType(refName, refCat);
  if (underType === refType && underType !== 'other') return 100;
  const underWords = new Set(underName.toLowerCase().split(/[\s\-_.]+/));
  const refWords = new Set(refName.toLowerCase().split(/[\s\-_.]+/));
  let overlap = 0;
  for (const w of underWords) {
    if (w.length > 2 && refWords.has(w)) overlap += 10;
  }
  if ((underCat === 'entity' && refCat === 'regulatory') || (underCat === 'sms' && refCat === 'regulatory')) overlap += 20;
  return overlap;
}

export default function GuidedAudit() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [uploadCategory, setUploadCategory] = useState<DocCategory>('regulatory');
  const [regulatorySubcategory, setRegulatorySubcategory] = useState(REGULATORY_CATEGORIES[0]);
  const [fileProgress, setFileProgress] = useState<FileProgressItem[]>([]);
  const [assessmentImported, setAssessmentImported] = useState(false);

  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [analysisBatchMode, setAnalysisBatchMode] = useState<'all' | 'single'>('all');
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [simulationRounds, setSimulationRounds] = useState(8);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationDone, setSimulationDone] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);
  const [addSimDiscrepanciesToEntityIssues, setAddSimDiscrepanciesToEntityIssues] = useState(true);

  const [reviewReferenceId, setReviewReferenceId] = useState('');
  const [reviewUnderReviewId, setReviewUnderReviewId] = useState('');
  const [reviewAuditorIds, setReviewAuditorIds] = useState<Set<AuditAgent['id']>>(new Set());
  const [reviewStarted, setReviewStarted] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewBatchRunning, setReviewBatchRunning] = useState(false);
  const [reviewBatchCount, setReviewBatchCount] = useState(0);

  const [revisionRunning, setRevisionRunning] = useState(false);
  const [revisionDone, setRevisionDone] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [revisionCount, setRevisionCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const assessmentInputRef = useRef<HTMLInputElement>(null);
  const [analysisAttachedImages, setAnalysisAttachedImages] = useState<Array<{ name: string } & AttachedImage>>([]);
  const analysisImageInputRef = useRef<HTMLInputElement>(null);

  const addDocument = useAddDocument();
  const addAssessment = useAddAssessment();
  const addAnalysis = useAddAnalysis();
  const addSimulationResult = useAddSimulationResult();
  const setDocumentRevisions = useSetDocumentRevisions();
  const addDocumentReview = useAddDocumentReview();
  const addEntityIssue = useAddEntityIssue();
  const updateDocumentReview = useUpdateDocumentReview();
  const generateUploadUrl = useGenerateUploadUrl();
  const sharedRefDocs = (useAllSharedReferenceDocs() || []) as any[];
  const paperworkReviewModel = usePaperworkReviewModel();
  const paperworkReviewAgentId = usePaperworkReviewAgentId();
  const logProductEvent = useLogProductEvent();

  const settings = useUserSettings();
  const defaultModel = useDefaultClaudeModel();
  const auditSimModel = useAuditSimModel();
  const thinkingBudget = settings?.thinkingBudget ?? 10000;
  const analysisThinkingEnabled = (settings?.thinkingEnabled ?? false) && MODELS_SUPPORTING_THINKING.has(defaultModel);
  const auditSimThinkingEnabled = (settings?.thinkingEnabled ?? false) && MODELS_SUPPORTING_THINKING.has(auditSimModel);
  const selfReviewMode = (settings?.selfReviewMode || 'off') as SelfReviewMode;
  const selfReviewMaxIterations = settings?.selfReviewMaxIterations ?? 2;

  const regulatoryFiles = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const smsDocuments = (useDocuments(activeProjectId || undefined, 'sms') || []) as any[];
  const referenceDocuments = (useDocuments(activeProjectId || undefined, 'reference') || []) as any[];
  const uploadedDocuments = (useDocuments(activeProjectId || undefined, 'uploaded') || []) as any[];
  const allDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const assessments = (useAssessments(activeProjectId || undefined) || []) as any[];
  const allProjectAgentDocs = (useAllProjectAgentDocs(activeProjectId || undefined) || []) as any[];
  const sharedAgentDocs = (useSharedAgentDocsByAgents(SIMULATION_AGENT_IDS) || []) as any[];
  const entityIssues = (useEntityIssues(activeProjectId || undefined) || []) as any[];
  const analyses = (useAnalyses(activeProjectId || undefined) || []) as any[];
  const simulationResults = (useSimulationResults(activeProjectId || undefined) || []) as any[];
  const latestAnalysis = analyses.length > 0
    ? analyses.slice().sort((a: any, b: any) => (a.analysisDate > b.analysisDate ? -1 : 1))[0]
    : null;
  const latestSim = simulationResults.length > 0
    ? simulationResults.slice().sort((a: any, b: any) => (a.createdAt > b.createdAt ? -1 : 1))[0]
    : null;
  const fullAnalysis = useAnalysis(latestAnalysis?._id ?? undefined);
  const fullSimResult = useSimulationResult(latestSim?._id ?? undefined);
  const exportedAnalysisRef = useRef(false);
  const exportedSimRef = useRef(false);

  // Auto-select first assessment when only one exists
  useEffect(() => {
    if (assessments.length === 1 && !selectedAssessmentId) {
      setSelectedAssessmentId(assessments[0]._id);
    }
  }, [assessments, selectedAssessmentId]);

  // Auto-export reports when Summary step is reached (runs when data loads)
  useEffect(() => {
    if (step !== 6 || !activeProjectId) return;
    const runExports = async () => {
      try {
        void logProductEvent({
          eventType: 'first_run_complete',
          projectId: activeProjectId as any,
          properties: JSON.stringify({
            hasAnalysis: !!fullAnalysis,
            hasSimulation: !!fullSimResult,
          }),
        }).catch(() => {});

        if (fullAnalysis && !exportedAnalysisRef.current) {
          const assessment = assessments.find((a: any) => a._id === fullAnalysis.assessmentId);
          if (assessment?.data) {
            exportedAnalysisRef.current = true; // set before async to avoid duplicate runs
            const generator = new PDFReportGenerator();
            const pdfBytes = await generator.generateReport(
              assessment.data,
              fullAnalysis.findings,
              fullAnalysis.recommendations,
              fullAnalysis.compliance
            );
            const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audit-report-${(assessment.data.companyName || 'audit').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success('Analysis PDF downloaded');
          }
        }
        if (fullSimResult?.messages?.length && fullSimResult.assessmentName && !exportedSimRef.current) {
          exportedSimRef.current = true; // set before async to avoid duplicate runs
          const docxGen = new AuditSimulationDOCXGenerator();
          const docxBlob = await docxGen.generateReport(
            fullSimResult.assessmentName,
            fullSimResult.messages,
            AUDIT_AGENTS
          );
          const url = URL.createObjectURL(docxBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `audit-simulation-${(fullSimResult.assessmentName || 'sim').replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.docx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success('Simulation DOCX downloaded');
        }
      } catch (err: any) {
        toast.error('Export failed', { description: getConvexErrorMessage(err) });
      }
    };
    runExports();
  }, [step, activeProjectId, fullAnalysis, fullSimResult, assessments]);

  const getDocsForAgent = (agentId: string): { id: string; name: string; text: string; source: string; addedAt: string }[] => {
    const projectDocs = allProjectAgentDocs.filter((d: any) => d.agentId === agentId);
    const shared = sharedAgentDocs.filter((d: any) => d.agentId === agentId);
    const combined = [...shared, ...projectDocs];
    return combined
      .filter((d: any) => (d.extractedText || '').length > 0)
      .map((d: any) => ({
        id: d._id,
        name: d.name,
        text: d.extractedText || '',
        source: d.source || 'local',
        addedAt: d.extractedAt || d.addedAt || new Date().toISOString(),
      }));
  };

  const coverageAuditorIds = useMemo(
    () => AUDIT_AGENTS.map((a) => a.id).filter((id): id is AuditorCoverageAgentId => id !== 'audit-host'),
    []
  );
  const coverageDocuments = useMemo(() => {
    const projectDocs = allDocuments.map((d: any) => ({
      id: d._id,
      name: d.name,
      category: d.category,
      documentType: undefined,
    }));
    const sharedReference = sharedRefDocs.map((d: any) => ({
      id: d._id,
      name: d.name,
      category: 'reference',
      documentType: d.documentType,
    }));
    const agentKnowledge = [...allProjectAgentDocs, ...sharedAgentDocs].map((d: any) => ({
      id: d._id,
      name: d.name,
      category: 'reference',
      documentType: undefined,
    }));
    return [...projectDocs, ...sharedReference, ...agentKnowledge];
  }, [allDocuments, allProjectAgentDocs, sharedAgentDocs, sharedRefDocs]);
  const coverageSummary = useMemo(
    () => buildAuditorCoverageSummary(coverageAuditorIds, coverageDocuments),
    [coverageAuditorIds, coverageDocuments]
  );

  const regulatoryTextCount = regulatoryFiles.filter((d: any) => (d.extractedText || '').trim().length > 0).length;
  const entityTextCount = entityDocuments.filter((d: any) => (d.extractedText || '').trim().length > 0).length;
  const smsTextCount = smsDocuments.filter((d: any) => (d.extractedText || '').trim().length > 0).length;
  const uploadedTextCount = uploadedDocuments.filter((d: any) => (d.extractedText || '').trim().length > 0).length;

  const totalRequiredCount = coverageSummary.byAuditor.reduce((sum, item) => sum + (item.requiredCount || 0), 0);
  const totalSatisfiedCount = coverageSummary.byAuditor.reduce(
    (sum, item) => sum + (item.satisfiedCount || 0),
    0
  );
  const overallCoveragePercent = totalRequiredCount === 0 ? 100 : Math.round((totalSatisfiedCount / totalRequiredCount) * 100);

  const underReviewEvidenceCount = entityTextCount + smsTextCount + uploadedTextCount;
  const projectReferenceEvidenceCount = regulatoryTextCount + referenceDocuments.filter((d: any) => (d.extractedText || '').trim().length > 0).length;
  const sharedReferenceEvidenceCount = sharedRefDocs.filter((d: any) => (d.extractedText || '').trim().length > 0).length;

  const handleQueueCategoryClick = (suggestedCategory: DocCategory, docTypeLabel: string) => {
    setUploadCategory(suggestedCategory);
    toast.message(`Upload target set to ${suggestedCategory}`, {
      description: `Next recommended type: ${docTypeLabel}`,
    });
  };

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to run the guided audit.</p>
          <Button onClick={() => navigate('/logbook')}>Open Logbook</Button>
        </GlassCard>
      </div>
    );
  }

  const totalDocs = regulatoryFiles.length + entityDocuments.length + smsDocuments.length + referenceDocuments.length + uploadedDocuments.length;

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files?.length || !activeProjectId) return;
    const extractor = new DocumentExtractor();
    const items: FileProgressItem[] = Array.from(files).map((f) => ({ name: f.name, status: 'pending' as const }));
    setFileProgress(items);

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setFileProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: 'extracting' } : p)));

      try {
        const buffer = await file.arrayBuffer();
        const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, defaultModel);
        let storageId: any = undefined;
        try {
          const uploadUrl = await generateUploadUrl();
          const uploadResult = await fetch(uploadUrl, {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream' },
            body: file,
          });
          const uploadJson = await uploadResult.json();
          storageId = uploadJson.storageId;
        } catch {
          // Best-effort storage upload. Extraction still succeeds without it.
        }
        await addDocument({
          projectId: activeProjectId as Id<'projects'>,
          category: uploadCategory,
          name: file.name,
          path: `local://${file.name}`,
          source: 'local',
          mimeType: file.type || undefined,
          size: file.size,
          storageId,
          extractedText: extracted.text,
          extractionMeta: extracted.metadata,
          extractedAt: new Date().toISOString(),
        } as any);
        setFileProgress((prev) => prev.map((p, idx) => (idx === i ? { ...p, status: 'done' } : p)));
      } catch (err: any) {
        setFileProgress((prev) =>
          prev.map((p, idx) => (idx === i ? { ...p, status: 'error', error: getConvexErrorMessage(err) } : p))
        );
      }
    }
  };

  const handleImportAssessment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeProjectId) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await addAssessment({
        projectId: activeProjectId as Id<'projects'>,
        originalId: `assessment-${Date.now()}`,
        data,
        importedAt: new Date().toISOString(),
      });
      setAssessmentImported(true);
    } catch (err: any) {
      toast.error('Failed to import assessment', { description: getConvexErrorMessage(err) });
    }
    e.target.value = '';
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

  const handleAnalysisImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    if (toAdd.length) setAnalysisAttachedImages((prev) => [...prev, ...toAdd]);
    e.target.value = '';
  };

  const removeAnalysisImage = (index: number) => {
    setAnalysisAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const runSingleAnalysis = async (assessment: any): Promise<void> => {
    const regulatory: DocWithOptionalText[] = regulatoryFiles.map((f: any) => ({
      name: f.name,
      ...(f.extractedText ? { text: f.extractedText } : {}),
    }));
    const entity: DocWithOptionalText[] = entityDocuments.map((d: any) => ({
      name: d.name,
      ...(d.extractedText ? { text: d.extractedText } : {}),
    }));
    const sms: DocWithOptionalText[] = smsDocuments.map((d: any) => ({
      name: d.name,
      ...(d.extractedText ? { text: d.extractedText } : {}),
    }));
    const uploadedWithText: { name: string; text: string }[] = uploadedDocuments
      .filter((d: any) => (d.extractedText || '').length > 0)
      .map((d: any) => ({ name: d.name, text: d.extractedText || '' }));
    const imagePayload = analysisAttachedImages.length
      ? { attachedImages: analysisAttachedImages.map(({ media_type, data }) => ({ media_type, data })) }
      : {};

    const analyzer = new ClaudeAnalyzer(
      analysisThinkingEnabled ? { enabled: true, budgetTokens: thinkingBudget } : undefined,
      defaultModel
    );
    let result: any;
    if (uploadedWithText.length > 0) {
      result = await analyzer.analyzeWithDocuments(
        assessment.data,
        regulatory,
        entity,
        uploadedWithText,
        sms,
        imagePayload
      );
    } else {
      const base = await analyzer.analyzeAssessment(
        assessment.data,
        regulatory,
        entity,
        sms,
        imagePayload
      );
      result = {
        assessmentId: assessment._id,
        companyName: assessment.data.companyName,
        analysisDate: new Date().toISOString(),
        findings: base.findings,
        recommendations: base.recommendations,
        compliance: base.compliance,
      };
    }
    await addAnalysis({
      projectId: activeProjectId as Id<'projects'>,
      assessmentId: result.assessmentId,
      companyName: result.companyName,
      analysisDate: result.analysisDate,
      findings: result.findings,
      recommendations: result.recommendations,
      compliance: result.compliance,
      documentAnalyses: result.documentAnalyses,
      combinedInsights: result.combinedInsights,
    });
  };

  const handleRunAnalysis = async () => {
    const toRun = analysisBatchMode === 'all'
      ? assessments
      : assessments.filter((a: any) => a._id === selectedAssessmentId);
    if (!activeProjectId || toRun.length === 0) {
      setAnalysisError(analysisBatchMode === 'all' ? 'No assessments to analyze.' : 'Select an assessment first.');
      return;
    }

    setAnalysisRunning(true);
    setAnalysisError(null);
    try {
      for (let i = 0; i < toRun.length; i++) {
        await runSingleAnalysis(toRun[i]);
        if (i < toRun.length - 1) {
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
      setAnalysisDone(true);
      if (toRun.length > 0 && !selectedAssessmentId) {
        setSelectedAssessmentId(toRun[0]._id);
      }
    } catch (err: any) {
      setAnalysisError(getConvexErrorMessage(err) || 'Analysis failed');
    } finally {
      setAnalysisRunning(false);
    }
  };

  const handleRunSimulation = async () => {
    if (!activeProjectId || !selectedAssessmentId) {
      setSimulationError('Select an assessment first.');
      return;
    }
    const assessment = assessments.find((a: any) => a._id === selectedAssessmentId);
    if (!assessment) return;

    setSimulationRunning(true);
    setSimulationError(null);
    const uploadedWithText: { name: string; text: string }[] = uploadedDocuments
      .filter((d: any) => (d.extractedText || '').length > 0)
      .map((d: any) => ({ name: d.name, text: d.extractedText || '' }));

    const agentDocs = Object.fromEntries(
      AUDIT_AGENTS.map((a) => [a.id, getDocsForAgent(a.id)])
    );

    const entityDocs: { name: string; text?: string }[] = entityDocuments.map((d: any) => ({
      name: d.name,
      ...(d.extractedText ? { text: d.extractedText } : {}),
    }));
    const smsDocs: { name: string; text?: string }[] = smsDocuments.map((d: any) => ({
      name: d.name,
      ...(d.extractedText ? { text: d.extractedText } : {}),
    }));

    try {
      const service = new AuditSimulationService(
        assessment.data,
        [],
        entityDocs,
        smsDocs,
        uploadedWithText,
        agentDocs,
        agentDocs,
        auditSimThinkingEnabled ? { enabled: true, budgetTokens: thinkingBudget } : undefined,
        selfReviewMode !== 'off' ? { mode: selfReviewMode, maxIterations: selfReviewMaxIterations } : undefined,
        DEFAULT_FAA_CONFIG,
        undefined, // isbaoStage
        undefined, // publicUseConfig
        undefined, // dataContext
        undefined, // participantAgentIds
        [],        // paperworkReviews
        auditSimModel
      );

      const messages: any[] = [];
      await service.runSimulation(
        simulationRounds,
        (msg) => messages.push(msg),
        () => {},
        () => {},
        SIMULATION_AGENT_IDS
      );

      const now = new Date();
      const simId = `sim-${Date.now()}`;
      await addSimulationResult({
        projectId: activeProjectId as Id<'projects'>,
        originalId: simId,
        name: `${assessment.data.companyName} - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        assessmentId: selectedAssessmentId,
        assessmentName: assessment.data.companyName,
        agentIds: SIMULATION_AGENT_IDS,
        totalRounds: simulationRounds,
        messages,
        createdAt: now.toISOString(),
        thinkingEnabled: auditSimThinkingEnabled,
        selfReviewMode,
        faaConfig: DEFAULT_FAA_CONFIG,
      });
      setSimulationDone(true);

      if (addSimDiscrepanciesToEntityIssues && messages.length > 0) {
        try {
          const discrepancies = await extractDiscrepanciesFromTranscript(messages, undefined, auditSimModel);
          for (const d of discrepancies) {
            await addEntityIssue({
              projectId: activeProjectId as Id<'projects'>,
              assessmentId: selectedAssessmentId,
              source: 'audit_sim',
              sourceId: simId,
              severity: d.severity,
              title: d.title,
              description: d.description,
              regulationRef: d.regulationRef,
            });
          }
          if (discrepancies.length > 0) {
            toast.success(`${discrepancies.length} discrepancy(ies) added to Entity issues`);
          }
        } catch {
          toast.error('Could not extract discrepancies for Entity issues');
        }
      }
    } catch (err: any) {
      setSimulationError(getConvexErrorMessage(err) || 'Simulation failed');
    } finally {
      setSimulationRunning(false);
    }
  };

  const handleStartReview = async () => {
    if (!activeProjectId || !reviewReferenceId || !reviewUnderReviewId) {
      setReviewError('Select both reference and under-review documents.');
      return;
    }
    setReviewError(null);
    try {
      await addDocumentReview({
        projectId: activeProjectId as Id<'projects'>,
        referenceDocumentIds: [reviewReferenceId as Id<'documents'>],
        underReviewDocumentId: reviewUnderReviewId as Id<'documents'>,
        auditorIds: Array.from(reviewAuditorIds),
        status: 'draft',
        findings: [],
      });
      setReviewStarted(true);
    } catch (err: any) {
      setReviewError(getConvexErrorMessage(err) || 'Failed to create review');
    }
  };

  const handleSmartPairAndRunAI = async () => {
    if (!activeProjectId) return;
    const underReviewCandidates = [...entityDocuments, ...smsDocuments, ...uploadedDocuments].filter(
      (d: any) => (d.extractedText || '').trim().length > 0
    );
    const refProjectDocs = [...regulatoryFiles, ...referenceDocuments].filter((d: any) => (d.extractedText || '').trim().length > 0);
    const refSharedDocs = sharedRefDocs.filter((d: any) => (d.extractedText || '').trim().length > 0);
    if (underReviewCandidates.length === 0 || (refProjectDocs.length === 0 && refSharedDocs.length === 0)) {
      setReviewError('Need at least one under-review doc (entity/sms/uploaded with text) and one reference (regulatory/reference).');
      return;
    }
    setReviewBatchRunning(true);
    setReviewError(null);
    const batchId = `guided-${Date.now()}`;
    const analyzer = new ClaudeAnalyzer(undefined, paperworkReviewModel);
    const perspectiveId = paperworkReviewAgentId || 'generic';
    const systemPrompt = getPaperworkReviewSystemPrompt(perspectiveId);
    let created = 0;
    try {
      for (const underDoc of underReviewCandidates) {
        let bestRef: { source: 'project' | 'shared'; doc: any } | null = null;
        let bestScore = 0;
        for (const ref of refProjectDocs) {
          if (!(ref.extractedText || '').trim()) continue;
          const s = scorePair(underDoc.name, underDoc.category || '', ref.name, ref.category || '', undefined);
          if (s > bestScore) {
            bestScore = s;
            bestRef = { source: 'project', doc: ref };
          }
        }
        for (const ref of refSharedDocs) {
          const s = scorePair(underDoc.name, underDoc.category || '', ref.name, 'shared', ref.documentType);
          if (s > bestScore) {
            bestScore = s;
            bestRef = { source: 'shared', doc: ref };
          }
        }
        if (!bestRef || bestScore < 5) bestRef = refProjectDocs.length > 0
          ? { source: 'project', doc: refProjectDocs[0] }
          : refSharedDocs.length > 0 ? { source: 'shared', doc: refSharedDocs[0] } : null;
        if (!bestRef) continue;

        const refText = (bestRef.doc.extractedText || '').trim();
        const underText = (underDoc.extractedText || '').trim();
        if (!refText || !underText) continue;

        const reviewId = await addDocumentReview({
          projectId: activeProjectId as Id<'projects'>,
          underReviewDocumentId: underDoc._id as Id<'documents'>,
          auditorIds: Array.from(reviewAuditorIds),
          status: 'draft',
          findings: [],
          batchId,
          referenceDocumentIds: bestRef.source === 'project' ? [bestRef.doc._id as Id<'documents'>] : undefined,
          sharedReferenceDocumentIds: bestRef.source === 'shared' ? [bestRef.doc._id as Id<'sharedReferenceDocuments'>] : undefined,
        });
        const suggested = await analyzer.suggestPaperworkFindings(
          refText,
          underText,
          bestRef.doc.name,
          underDoc.name,
          undefined,
          undefined,
          undefined,
          systemPrompt
        );
        const findings = suggested.map((f: any) => ({
          id: crypto.randomUUID(),
          severity: f.severity || 'minor',
          location: f.location,
          description: f.description || '',
        }));
        await updateDocumentReview({ reviewId, findings });
        created++;
        await new Promise((r) => setTimeout(r, 500));
      }
      setReviewBatchCount(created);
      setReviewStarted(true);
      if (created > 0) toast.success(`${created} review(s) created with AI findings`);
    } catch (err: any) {
      setReviewError(getConvexErrorMessage(err) || 'Smart pair failed');
    } finally {
      setReviewBatchRunning(false);
    }
  };

  const handleRunRevisionCheck = async () => {
    if (!activeProjectId) return;
    setRevisionRunning(true);
    setRevisionError(null);
    try {
      const checker = new RevisionChecker();
      const uploadedForRevisions: UploadedDocument[] = uploadedDocuments.map((d: any) => ({
        id: d._id,
        name: d.name,
        text: d.extractedText || '',
        path: d.path,
        source: d.source,
        mimeType: d.mimeType,
        extractedAt: d.extractedAt,
      }));
      const revisions = await checker.extractRevisionLevels(
        regulatoryFiles.map((f: any) => ({
          id: f._id,
          name: f.name,
          path: f.path,
          category: f.category || undefined,
          size: f.size || 0,
          importedAt: f.extractedAt,
        })),
        entityDocuments.map((f: any) => ({
          id: f._id,
          name: f.name,
          path: f.path,
          size: f.size || 0,
          importedAt: f.extractedAt,
        })),
        uploadedForRevisions,
        [],
        defaultModel
      );
      await setDocumentRevisions({
        projectId: activeProjectId as Id<'projects'>,
        revisions: revisions.map((r) => ({
          originalId: r.id,
          documentName: r.documentName,
          documentType: r.documentType,
          sourceDocumentId: r.sourceDocumentId,
          category: r.category,
          detectedRevision: r.detectedRevision,
          latestKnownRevision: r.latestKnownRevision,
          isCurrentRevision: r.isCurrentRevision ?? undefined,
          lastCheckedAt: r.lastCheckedAt ?? undefined,
          searchSummary: r.searchSummary,
          status: r.status,
        })),
      });
      setRevisionCount(revisions.length);
      setRevisionDone(true);
    } catch (err: any) {
      setRevisionError(getConvexErrorMessage(err) || 'Revision check failed');
    } finally {
      setRevisionRunning(false);
    }
  };

  const referenceDocs = referenceDocuments.length > 0 ? referenceDocuments : allDocuments;
  const underReviewDocs = allDocuments;
  const toggleReviewAuditor = (auditorId: AuditAgent['id']) => {
    setReviewAuditorIds((prev) => {
      const next = new Set(prev);
      if (next.has(auditorId)) {
        next.delete(auditorId);
      } else {
        next.add(auditorId);
      }
      return next;
    });
  };

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Guided Audit
        </h1>
        <p className="text-white/60 text-lg">
          Upload company documents and run a complete audit in one flow
        </p>
      </div>

      {/* Stepper */}
      <div className="flex flex-wrap gap-2 mb-8">
        {STEPS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStep(s.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              step === s.id
                ? 'bg-sky/30 text-white border border-sky-light/40'
                : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'
            }`}
          >
            {s.id}. {s.short}
          </button>
        ))}
      </div>

      <GlassCard className="mb-6">
        {/* Step 1: Upload */}
        {step === 1 && (
          <>
            <h2 className="text-xl font-display font-bold mb-4">1. Upload documents</h2>
            <p className="text-white/60 text-sm mb-4">
              Add documents by category. Text is extracted so analysis and audit can use the content.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['regulatory', 'entity', 'sms', 'reference', 'uploaded'] as DocCategory[]).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setUploadCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium ${
                    uploadCategory === cat ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'bg-white/5 text-white/70'
                  }`}
                >
                  {cat === 'regulatory' && <FiFolder className="inline mr-1" />}
                  {cat === 'entity' && <FiFile className="inline mr-1" />}
                  {cat === 'sms' && <FiFileText className="inline mr-1" />}
                  {cat === 'reference' && <FiCheckSquare className="inline mr-1" />}
                  {cat === 'uploaded' && <FiCloud className="inline mr-1" />}
                  {cat}
                </button>
              ))}
            </div>
            {uploadCategory === 'regulatory' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-white/80 mb-2">Regulatory category</label>
                <select
                  value={regulatorySubcategory}
                  onChange={(e) => setRegulatorySubcategory(e.target.value)}
                  className="w-full max-w-xs px-4 py-2 bg-white/10 border border-white/20 rounded-xl text-white"
                >
                  {REGULATORY_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-navy-800">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={(e) => handleUploadFiles(e.target.files)}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                icon={<FiUpload />}
              >
                Add files ({uploadCategory})
              </Button>
            </div>
            <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-4">
              <h3 className="text-sm font-semibold text-white mb-3">Coverage by auditor</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                {coverageSummary.byAuditor.map((item) => {
                  const agent = AUDIT_AGENTS.find((a) => a.id === item.agentId);
                  const isComplete = item.missingDocTypes.length === 0;
                  return (
                    <div key={item.agentId} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-white/80 truncate">{agent?.name || item.agentId}</span>
                        <span className={`text-xs ${isComplete ? 'text-green-400' : 'text-amber-300'}`}>
                          {item.satisfiedCount}/{item.requiredCount} ({item.completionPercent}%)
                        </span>
                      </div>
                      {!isComplete && (
                        <p className="mt-1 text-[11px] text-white/55 truncate">
                          Missing: {item.missingDocTypes.slice(0, 2).map((t) => DOC_TYPE_LABELS[t]).join(', ')}
                          {item.missingDocTypes.length > 2 ? ` +${item.missingDocTypes.length - 2} more` : ''}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              <h4 className="text-xs font-semibold text-white/80 mb-2">Best next uploads</h4>
              {coverageSummary.prioritizedMissing.length === 0 ? (
                <p className="text-xs text-green-300">All required baseline document types are currently covered.</p>
              ) : (
                <div className="space-y-2">
                  {coverageSummary.prioritizedMissing.slice(0, 6).map((item) => (
                    <div key={item.docType} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs text-white">{item.label}</p>
                        <p className="text-[11px] text-white/60">
                          Helps {item.coverageGain} auditor{item.coverageGain > 1 ? 's' : ''} • {item.priorityBucket}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleQueueCategoryClick(item.suggestedUploadCategory, item.label)}
                        className="text-xs px-2 py-1 rounded-md bg-sky/20 text-sky-lighter border border-sky-light/30"
                      >
                        Upload to {item.suggestedUploadCategory}
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {coverageSummary.ambiguousDocumentIds.length > 0 && (
                <p className="mt-3 text-[11px] text-amber-300/90">
                  {coverageSummary.ambiguousDocumentIds.length} document{coverageSummary.ambiguousDocumentIds.length > 1 ? 's are' : ' is'} currently mapped as "Other".
                </p>
              )}
            </div>
            {fileProgress.length > 0 && (
              <div className="space-y-2 mb-4">
                {fileProgress.map((fp, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 bg-white/5 rounded-lg text-sm">
                    {fp.status === 'extracting' && <FiLoader className="animate-spin text-sky-400" />}
                    {fp.status === 'done' && <FiCheck className="text-green-400" />}
                    {fp.status === 'error' && <FiAlertCircle className="text-red-400" />}
                    <span className="truncate flex-1">{fp.name}</span>
                    <span className="text-white/70 text-xs">
                      {fp.status === 'extracting' && 'Extracting...'}
                      {fp.status === 'done' && 'Done'}
                      {fp.status === 'error' && fp.error}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-white/10 pt-4 mt-4">
              <label className="block text-sm font-medium text-white/80 mb-2">Import assessment (optional)</label>
              <input
                ref={assessmentInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportAssessment}
              />
              <button
                type="button"
                onClick={() => assessmentInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl text-sm"
              >
                <FiFileText />
                {assessmentImported ? 'Assessment imported' : 'Import assessment JSON'}
              </button>
            </div>
            <p className="text-white/70 text-xs mt-4">
              Documents: {totalDocs} total (regulatory: {regulatoryFiles.length}, entity: {entityDocuments.length}, SMS: {smsDocuments.length},
              reference: {referenceDocuments.length}, uploaded: {uploadedDocuments.length})
            </p>
          </>
        )}

        {/* Step 2: Analysis */}
        {step === 2 && (
          <>
            <h2 className="text-xl font-display font-bold mb-4">2. Run analysis</h2>
            <p className="text-white/60 text-sm mb-4">
              Analyze assessment(s) against your documents. Batch mode runs analysis for all assessments.
            </p>

            <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white/90">Readiness checklist (before analysis)</div>
                  <div className="text-xs text-white/60 font-inter mt-1">
                    {analysisBatchMode === 'all'
                      ? `Assessments available: ${assessments.length}`
                      : `Single assessment selected: ${selectedAssessmentId ? 'Yes' : 'No'}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/60 font-inter">Evidence coverage</div>
                  <div className="text-lg font-semibold text-white">
                    {overallCoveragePercent}
                    <span className="text-sm text-white/60">%</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    ok: analysisBatchMode === 'all' ? assessments.length > 0 : !!selectedAssessmentId,
                    title: 'Assessment ready',
                    detail:
                      analysisBatchMode === 'all'
                        ? `${assessments.length} assessment(s) found`
                        : selectedAssessmentId
                          ? 'Assessment selected'
                          : 'Choose an assessment to run',
                  },
                  {
                    ok: regulatoryTextCount > 0,
                    title: 'Regulatory evidence present',
                    detail: `${regulatoryTextCount} regulatory doc(s) with extracted text`,
                  },
                  {
                    ok: entityTextCount + smsTextCount + uploadedTextCount > 0,
                    title: 'Entity/SMS evidence present',
                    detail: `${underReviewEvidenceCount} doc(s) with extracted text`,
                  },
                  {
                    ok: coverageSummary.prioritizedMissing.length === 0,
                    title: 'Coverage baseline satisfied',
                    detail: coverageSummary.prioritizedMissing.length === 0
                      ? 'No prioritized missing doc types'
                      : `${coverageSummary.prioritizedMissing.length} prioritized missing doc type(s)`,
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className={`rounded-xl p-3 border ${
                      item.ok ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-amber-400/25 bg-amber-500/10'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${item.ok ? 'text-emerald-200' : 'text-amber-200'}`}>
                        {item.ok ? 'Ready' : 'Needs evidence'}
                      </span>
                    </div>
                    <div className="text-white/90 font-semibold text-sm mt-1">{item.title}</div>
                    <div className="text-xs text-white/65 mt-1 font-inter">{item.detail}</div>
                  </div>
                ))}
              </div>

              {coverageSummary.prioritizedMissing.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-amber-200">Missing evidence to improve outputs</div>
                      <div className="text-xs text-amber-100/70 font-inter mt-1">
                        Uploading these improves coverage across audit personas (fewer “Other/unknown” mappings).
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="shrink-0 px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-white/90 hover:bg-white/15 text-xs font-semibold transition-colors"
                    >
                      Upload missing evidence
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {coverageSummary.prioritizedMissing.slice(0, 4).map((item) => (
                      <button
                        key={item.docType}
                        type="button"
                        onClick={() => {
                          setStep(1);
                          setUploadCategory(item.suggestedUploadCategory);
                          toast.message(`Upload target set to ${item.suggestedUploadCategory}`, {
                            description: `Next recommended type: ${item.label}`,
                          });
                        }}
                        className="px-3 py-2 rounded-lg bg-sky/20 border border-sky-light/30 text-sky-lighter hover:bg-sky/25 text-xs font-semibold transition-colors"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-white/80 mb-2">Mode</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="analysisMode"
                    checked={analysisBatchMode === 'all'}
                    onChange={() => setAnalysisBatchMode('all')}
                    className="rounded"
                  />
                  <span>All assessments ({assessments.length})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="analysisMode"
                    checked={analysisBatchMode === 'single'}
                    onChange={() => setAnalysisBatchMode('single')}
                    className="rounded"
                  />
                  <span>Single assessment</span>
                </label>
              </div>
            </div>
            {analysisBatchMode === 'single' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-white/80 mb-2">Assessment</label>
                <select
                  value={selectedAssessmentId}
                  onChange={(e) => setSelectedAssessmentId(e.target.value)}
                  className="w-full max-w-md px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white"
                >
                  <option value="" className="bg-navy-800">Choose assessment...</option>
                  {assessments.map((a: any) => (
                    <option key={a._id} value={a._id} className="bg-navy-800">
                      {a.data.companyName} – {new Date(a.importedAt).toLocaleDateString()}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2 mb-4">
              <span className="text-sm font-medium text-white/80">Attach images (optional)</span>
              <p className="text-xs text-white/60">Photos of logs, nameplates, or documents to include in the analysis.</p>
              <input
                ref={analysisImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                onChange={handleAnalysisImageAttach}
                className="hidden"
                disabled={analysisRunning}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => analysisImageInputRef.current?.click()}
                disabled={analysisRunning}
                icon={<FiImage />}
              >
                Choose images
              </Button>
              {analysisAttachedImages.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {analysisAttachedImages.map((img, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 py-2 px-3 bg-white/5 rounded-lg text-sm">
                      <span className="truncate text-white/80">{img.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAnalysisImage(i)}
                        disabled={analysisRunning}
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
            {analysisError && (
              <p className="text-red-400 text-sm mb-2">{analysisError}</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <PageModelSelector field="claudeModel" compact disabled={analysisRunning} />
              </div>
              <Button
                type="button"
                onClick={handleRunAnalysis}
                disabled={analysisRunning || (analysisBatchMode === 'single' && !selectedAssessmentId) || assessments.length === 0}
                loading={analysisRunning}
                icon={!analysisRunning ? <FiFileText /> : undefined}
              >
                {analysisRunning ? 'Running...' : analysisBatchMode === 'all' ? `Run analysis (${assessments.length} assessments)` : 'Run analysis'}
              </Button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-2.5 bg-white/10 rounded-xl font-medium"
              >
                Skip
              </button>
            </div>
            {analysisDone && (
              <p className="mt-3 text-green-400 text-sm flex items-center gap-2">
                <FiCheck /> Analysis saved.{' '}
                <button
                  type="button"
                  onClick={() => navigate('/analysis')}
                  className="underline hover:no-underline"
                >
                  View in Analysis <FiExternalLink className="inline" />
                </button>
              </p>
            )}
          </>
        )}

        {/* Step 3: Audit simulation */}
        {step === 3 && (
          <>
            <h2 className="text-xl font-display font-bold mb-4">3. Audit simulation</h2>
            <p className="text-white/60 text-sm mb-4">
              Run a multi-agent audit simulation. All agents participate by default.
            </p>

            <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white/90">Readiness checklist (before simulation)</div>
                  <div className="text-xs text-white/60 font-inter mt-1">
                    {selectedAssessmentId ? 'Assessment selected' : 'Select an assessment first'} • Evidence docs with text: {underReviewEvidenceCount}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-white/60 font-inter">Evidence coverage</div>
                  <div className="text-lg font-semibold text-white">
                    {overallCoveragePercent}
                    <span className="text-sm text-white/60">%</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    ok: !!selectedAssessmentId,
                    title: 'Assessment selected',
                    detail: selectedAssessmentId ? 'Ready to simulate' : 'Choose an assessment',
                  },
                  {
                    ok: underReviewEvidenceCount > 0,
                    title: 'Grounding evidence present',
                    detail: underReviewEvidenceCount > 0 ? `${underReviewEvidenceCount} doc(s) with extracted text` : 'Upload entity/SMS/uploaded docs',
                  },
                  {
                    ok: coverageSummary.prioritizedMissing.length === 0,
                    title: 'Coverage baseline satisfied',
                    detail: coverageSummary.prioritizedMissing.length === 0
                      ? 'No prioritized missing doc types'
                      : `${coverageSummary.prioritizedMissing.length} prioritized missing doc type(s)`,
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className={`rounded-xl p-3 border ${
                      item.ok ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-amber-400/25 bg-amber-500/10'
                    }`}
                  >
                    <div className="text-white/90 font-semibold text-sm">{item.title}</div>
                    <div className="text-xs text-white/65 mt-1 font-inter">{item.detail}</div>
                  </div>
                ))}
              </div>

              {coverageSummary.prioritizedMissing.length > 0 && (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
                  <div className="text-sm font-semibold text-amber-200">Missing evidence may reduce audit quality</div>
                  <div className="text-xs text-amber-100/70 font-inter mt-1">
                    Uploading recommended doc types typically reduces “unknown” mappings and improves traceability cues.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {coverageSummary.prioritizedMissing.slice(0, 4).map((item) => (
                      <button
                        key={item.docType}
                        type="button"
                        onClick={() => {
                          setStep(1);
                          setUploadCategory(item.suggestedUploadCategory);
                        }}
                        className="px-3 py-2 rounded-lg bg-sky/20 border border-sky-light/30 text-sky-lighter hover:bg-sky/25 text-xs font-semibold transition-colors"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Assessment</label>
                <select
                  value={selectedAssessmentId}
                  onChange={(e) => setSelectedAssessmentId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white"
                >
                  <option value="" className="bg-navy-800">Choose assessment...</option>
                  {assessments.map((a: any) => (
                    <option key={a._id} value={a._id} className="bg-navy-800">
                      {a.data.companyName}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Rounds</label>
                <select
                  value={simulationRounds}
                  onChange={(e) => setSimulationRounds(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white"
                >
                  {[3, 5, 6, 8, 10, 12, 15].map((n) => (
                    <option key={n} value={n} className="bg-navy-800">
                      {n} round{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addSimDiscrepanciesToEntityIssues}
                  onChange={(e) => setAddSimDiscrepanciesToEntityIssues(e.target.checked)}
                  className="rounded"
                  disabled={simulationRunning}
                />
                <span className="text-sm text-white/80">Add simulation discrepancies to Entity issues</span>
              </label>
            </div>
            {simulationError && (
              <p className="text-red-400 text-sm mb-2">{simulationError}</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <PageModelSelector field="auditSimModel" compact disabled={simulationRunning} />
              </div>
              <Button
                type="button"
                onClick={handleRunSimulation}
                disabled={simulationRunning || !selectedAssessmentId}
                loading={simulationRunning}
                icon={!simulationRunning ? <FiUsers /> : undefined}
              >
                {simulationRunning ? 'Running...' : 'Run audit simulation'}
              </Button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-5 py-2.5 bg-white/10 rounded-xl font-medium"
              >
                Skip
              </button>
            </div>
            {simulationDone && (
              <p className="mt-3 text-green-400 text-sm flex items-center gap-2">
                <FiCheck /> Simulation saved.{' '}
                <button
                  type="button"
                  onClick={() => navigate('/audit')}
                  className="underline hover:no-underline"
                >
                  View in Audit Simulation <FiExternalLink className="inline" />
                </button>
              </p>
            )}
          </>
        )}

        {/* Step 4: Paperwork review */}
        {step === 4 && (
          <>
            <h2 className="text-xl font-display font-bold mb-4">4. Paperwork review</h2>
            <p className="text-white/60 text-sm mb-4">
              Smart-pair documents by type and run AI findings, or manually select reference and under-review documents.
            </p>

            <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-white/90">Missing evidence check (before review)</div>
                  <div className="text-xs text-white/60 font-inter mt-1">
                    Under-review evidence docs: {underReviewEvidenceCount} • Reference docs (project/shared): {projectReferenceEvidenceCount + sharedReferenceEvidenceCount}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="shrink-0 px-3 py-2 rounded-lg bg-white/10 border border-white/15 text-white/90 hover:bg-white/15 text-xs font-semibold transition-colors"
                >
                  Upload docs
                </button>
              </div>

              {(projectReferenceEvidenceCount + sharedReferenceEvidenceCount === 0 || underReviewEvidenceCount === 0) && (
                <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 p-3">
                  <div className="text-sm font-semibold text-amber-200">Review will be limited until evidence is uploaded</div>
                  <div className="text-xs text-amber-100/70 font-inter mt-1">
                    The smart-pair step needs at least one under-review doc with extracted text and one reference/regulatory doc (or shared reference).
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Reference document</label>
                <select
                  value={reviewReferenceId}
                  onChange={(e) => setReviewReferenceId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white"
                >
                  <option value="" className="bg-navy-800">Choose reference...</option>
                  {referenceDocs.map((d: any) => (
                    <option key={d._id} value={d._id} className="bg-navy-800">
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Under review</label>
                <select
                  value={reviewUnderReviewId}
                  onChange={(e) => setReviewUnderReviewId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white"
                >
                  <option value="" className="bg-navy-800">Choose document...</option>
                  {underReviewDocs.map((d: any) => (
                    <option key={d._id} value={d._id} className="bg-navy-800">
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-white/80 mb-2">
                Auditors for paperwork reviews <span className="text-white/50 font-normal">(optional, multi-select)</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {AUDIT_AGENTS.filter((agent) => agent.id !== 'audit-host').map((agent) => {
                  const selected = reviewAuditorIds.has(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => toggleReviewAuditor(agent.id)}
                      className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                        selected
                          ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                          : 'bg-white/5 border-white/15 text-white/80 hover:bg-white/10'
                      }`}
                      aria-pressed={selected}
                    >
                      {agent.name}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-white/50 mt-1">
                Leave empty to keep reviews generic, or assign one or more auditors to each created review.
              </p>
            </div>
            {reviewError && (
              <p className="text-red-400 text-sm mb-2">{reviewError}</p>
            )}
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleSmartPairAndRunAI}
                disabled={reviewBatchRunning}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl font-semibold disabled:opacity-50"
              >
                {reviewBatchRunning ? <FiLoader className="animate-spin" /> : <FiCheckSquare />}
                {reviewBatchRunning ? 'Smart pairing...' : 'Smart pair and run AI'}
              </button>
              <button
                type="button"
                onClick={handleStartReview}
                disabled={!reviewReferenceId || !reviewUnderReviewId || reviewBatchRunning}
                className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/15 border border-white/20 rounded-xl font-medium disabled:opacity-50"
              >
                Start manual review
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="px-5 py-2.5 bg-white/10 rounded-xl font-medium"
              >
                Skip
              </button>
            </div>
            {(reviewStarted || reviewBatchCount > 0) && (
              <p className="mt-3 text-green-400 text-sm flex items-center gap-2">
                <FiCheck />
                {reviewBatchCount > 0 ? `${reviewBatchCount} review(s) created with AI findings.` : 'Review started.'}{' '}
                <button
                  type="button"
                  onClick={() => navigate('/review')}
                  className="underline hover:no-underline"
                >
                  Open Paperwork Review <FiExternalLink className="inline" />
                </button>
              </p>
            )}
          </>
        )}

        {/* Step 5: Revision check */}
        {step === 5 && (
          <>
            <h2 className="text-xl font-display font-bold mb-4">5. Revision check</h2>
            <p className="text-white/60 text-sm mb-4">
              Scan documents for revision levels and optionally verify they are current.
            </p>
            {revisionError && (
              <p className="text-red-400 text-sm mb-2">{revisionError}</p>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleRunRevisionCheck}
                disabled={revisionRunning}
                loading={revisionRunning}
                icon={!revisionRunning ? <FiRefreshCw /> : undefined}
              >
                {revisionRunning ? 'Scanning...' : 'Run revision scan'}
              </Button>
              <button
                type="button"
                onClick={() => setStep(6)}
                className="px-5 py-2.5 bg-white/10 rounded-xl font-medium"
              >
                Skip
              </button>
            </div>
            {revisionDone && (
              <p className="mt-3 text-green-400 text-sm flex items-center gap-2">
                <FiCheck /> {revisionCount} document(s) scanned.{' '}
                <button
                  type="button"
                  onClick={() => navigate('/revisions')}
                  className="underline hover:no-underline"
                >
                  View in Revisions <FiExternalLink className="inline" />
                </button>
              </p>
            )}
          </>
        )}

        {/* Step 6: Summary */}
        {step === 6 && (
          <>
            <h2 className="text-xl font-display font-bold mb-4">6. Summary</h2>
            <p className="text-white/60 text-sm mb-6">
              Your guided audit flow is complete. Open any page below for full details.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => navigate('/analysis')}
                className="p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left flex items-center justify-between"
              >
                <span className="font-medium">Analysis</span>
                <FiExternalLink className="text-white/70" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/audit')}
                className="p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left flex items-center justify-between"
              >
                <span className="font-medium">Audit Simulation</span>
                <FiExternalLink className="text-white/70" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/entity-issues')}
                className="p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left flex items-center justify-between"
              >
                <span className="font-medium">Entity issues</span>
                <span className="flex items-center gap-2">
                  {entityIssues.length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                      {entityIssues.length}
                    </span>
                  )}
                  <FiExternalLink className="text-white/70" />
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/review')}
                className="p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left flex items-center justify-between"
              >
                <span className="font-medium">Paperwork Review</span>
                <FiExternalLink className="text-white/70" />
              </button>
              <button
                type="button"
                onClick={() => navigate('/revisions')}
                className="p-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-left flex items-center justify-between"
              >
                <span className="font-medium">Revisions</span>
                <FiExternalLink className="text-white/70" />
              </button>
            </div>
          </>
        )}
      </GlassCard>

      {/* Next / Back */}
      <div className="flex justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 text-white/70 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <FiChevronLeft />
          Back
        </button>
        {step < 6 && (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky/20 text-sky-lighter border border-sky-light/30"
          >
            Next
            <FiChevronRight />
          </button>
        )}
      </div>
    </div>
  );
}
