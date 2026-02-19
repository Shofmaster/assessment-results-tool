import { useState, useRef } from 'react';
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
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { getConvexErrorMessage } from '../utils/convexError';
import { Button, GlassCard } from './ui';
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
  useAllProjectAgentDocs,
  useSharedAgentDocsByAgents,
} from '../hooks/useConvexData';
import { DocumentExtractor } from '../services/documentExtractor';
import { ClaudeAnalyzer, type DocWithOptionalText } from '../services/claudeApi';
import { AuditSimulationService, AUDIT_AGENTS } from '../services/auditAgents';
import { DEFAULT_FAA_CONFIG } from '../data/faaInspectorTypes';
import { RevisionChecker } from '../services/revisionChecker';
import type { Id } from '../../convex/_generated/dataModel';
import type { SelfReviewMode } from '../types/auditSimulation';
import type { UploadedDocument } from '../types/document';

const STEPS = [
  { id: 1, title: 'Upload documents', short: 'Upload' },
  { id: 2, title: 'Run analysis', short: 'Analysis' },
  { id: 3, title: 'Audit simulation', short: 'Audit Sim' },
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
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const [simulationRounds, setSimulationRounds] = useState(8);
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationDone, setSimulationDone] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  const [reviewReferenceId, setReviewReferenceId] = useState('');
  const [reviewUnderReviewId, setReviewUnderReviewId] = useState('');
  const [reviewStarted, setReviewStarted] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const [revisionRunning, setRevisionRunning] = useState(false);
  const [revisionDone, setRevisionDone] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [revisionCount, setRevisionCount] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const assessmentInputRef = useRef<HTMLInputElement>(null);

  const addDocument = useAddDocument();
  const addAssessment = useAddAssessment();
  const addAnalysis = useAddAnalysis();
  const addSimulationResult = useAddSimulationResult();
  const setDocumentRevisions = useSetDocumentRevisions();
  const addDocumentReview = useAddDocumentReview();

  const settings = useUserSettings();
  const thinkingEnabled = settings?.thinkingEnabled ?? false;
  const thinkingBudget = settings?.thinkingBudget ?? 10000;
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

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to run the guided audit.</p>
          <Button onClick={() => navigate('/projects')}>Go to Projects</Button>
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
        const text = await extractor.extractText(buffer, file.name, file.type);
        await addDocument({
          projectId: activeProjectId as Id<'projects'>,
          category: uploadCategory,
          name: file.name,
          path: `local://${file.name}`,
          source: 'local',
          mimeType: file.type || undefined,
          size: file.size,
          extractedText: text,
          extractedAt: new Date().toISOString(),
        });
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

  const handleRunAnalysis = async () => {
    if (!activeProjectId || !selectedAssessmentId) {
      setAnalysisError('Select an assessment first.');
      return;
    }
    const assessment = assessments.find((a: any) => a._id === selectedAssessmentId);
    if (!assessment) return;

    setAnalysisRunning(true);
    setAnalysisError(null);
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

    try {
      const analyzer = new ClaudeAnalyzer(
        thinkingEnabled ? { enabled: true, budgetTokens: thinkingBudget } : undefined
      );
      let result: any;
      if (uploadedWithText.length > 0) {
        result = await analyzer.analyzeWithDocuments(
          assessment.data,
          regulatory,
          entity,
          uploadedWithText,
          sms
        );
      } else {
        const base = await analyzer.analyzeAssessment(assessment.data, regulatory, entity, sms);
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
      setAnalysisDone(true);
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
        thinkingEnabled ? { enabled: true, budgetTokens: thinkingBudget } : undefined,
        selfReviewMode !== 'off' ? { mode: selfReviewMode, maxIterations: selfReviewMaxIterations } : undefined,
        DEFAULT_FAA_CONFIG
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
      await addSimulationResult({
        projectId: activeProjectId as Id<'projects'>,
        originalId: `sim-${Date.now()}`,
        name: `${assessment.data.companyName} - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        assessmentId: selectedAssessmentId,
        assessmentName: assessment.data.companyName,
        agentIds: SIMULATION_AGENT_IDS,
        totalRounds: simulationRounds,
        messages,
        createdAt: now.toISOString(),
        thinkingEnabled,
        selfReviewMode,
        faaConfig: DEFAULT_FAA_CONFIG,
      });
      setSimulationDone(true);
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
        referenceDocumentId: reviewReferenceId as Id<'documents'>,
        underReviewDocumentId: reviewUnderReviewId as Id<'documents'>,
        status: 'draft',
        findings: [],
      });
      setReviewStarted(true);
    } catch (err: any) {
      setReviewError(getConvexErrorMessage(err) || 'Failed to create review');
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
        uploadedForRevisions
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

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
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
              Analyze the selected assessment against your documents.
            </p>
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
            {analysisError && (
              <p className="text-red-400 text-sm mb-2">{analysisError}</p>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                onClick={handleRunAnalysis}
                disabled={analysisRunning || !selectedAssessmentId}
                loading={analysisRunning}
                icon={!analysisRunning ? <FiFileText /> : undefined}
              >
                {analysisRunning ? 'Running...' : 'Run analysis'}
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
            {simulationError && (
              <p className="text-red-400 text-sm mb-2">{simulationError}</p>
            )}
            <div className="flex gap-3">
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
                  View in Audit Sim <FiExternalLink className="inline" />
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
              Start a document review: compare a document under review against a reference.
            </p>
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
            {reviewError && (
              <p className="text-red-400 text-sm mb-2">{reviewError}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleStartReview}
                disabled={!reviewReferenceId || !reviewUnderReviewId}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl font-semibold disabled:opacity-50"
              >
                <FiCheckSquare />
                Start review
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="px-5 py-2.5 bg-white/10 rounded-xl font-medium"
              >
                Skip
              </button>
            </div>
            {reviewStarted && (
              <p className="mt-3 text-green-400 text-sm flex items-center gap-2">
                <FiCheck /> Review started.{' '}
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
                <span className="font-medium">Audit Sim</span>
                <FiExternalLink className="text-white/70" />
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
