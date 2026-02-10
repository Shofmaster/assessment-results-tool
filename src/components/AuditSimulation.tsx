import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import { AuditSimulationService, AUDIT_AGENTS } from '../services/auditAgents';
import { DocumentExtractor } from '../services/documentExtractor';
import { GoogleDriveService } from '../services/googleDrive';
import type { AuditAgent, AuditMessage, SelfReviewMode, SimulationResult } from '../types/auditSimulation';
import type { UploadedDocument } from '../types/googleDrive';
import { KBCurrencyChecker } from '../services/kbCurrencyChecker';
import { AuditSimulationPDFGenerator } from '../services/auditPdfGenerator';
import { AuditSimulationDOCXGenerator } from '../services/auditDocxGenerator';
import ComparisonView from './ComparisonView';
import { FiPlay, FiStopCircle, FiDownload, FiCheck, FiUpload, FiX, FiChevronDown, FiChevronRight, FiFile, FiCloud, FiRefreshCw, FiFolder, FiColumns, FiMessageSquare, FiSave, FiTrash2 } from 'react-icons/fi';

export default function AuditSimulation() {
  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [totalRounds, setTotalRounds] = useState(3);
  const [selectedAgents, setSelectedAgents] = useState<Set<AuditAgent['id']>>(
    new Set(AUDIT_AGENTS.map((a) => a.id))
  );
  const [messages, setMessages] = useState<AuditMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<AuditAgent['id'] | null>(null);
  const [globalUploadingFor, setGlobalUploadingFor] = useState<AuditAgent['id'] | null>(null);
  const [showGlobalKB, setShowGlobalKB] = useState(false);
  const [globalSyncError, setGlobalSyncError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const globalFileInputRef = useRef<HTMLInputElement>(null);
  const driveServiceRef = useRef<GoogleDriveService | null>(null);

  const assessments = useAppStore((state) => state.assessments);
  const regulatoryFiles = useAppStore((state) => state.regulatoryFiles);
  const entityDocuments = useAppStore((state) => state.entityDocuments);
  const uploadedDocuments = useAppStore((state) => state.uploadedDocuments);
  const agentKnowledgeBases = useAppStore((state) => state.agentKnowledgeBases);
  const addAgentDocument = useAppStore((state) => state.addAgentDocument);
  const removeAgentDocument = useAppStore((state) => state.removeAgentDocument);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  // Global KB state
  const googleClientId = useAppStore((state) => state.googleClientId);
  const googleApiKey = useAppStore((state) => state.googleApiKey);
  const googleAuth = useAppStore((state) => state.googleAuth);
  const globalAgentKnowledgeBases = useAppStore((state) => state.globalAgentKnowledgeBases);
  const globalKBSyncing = useAppStore((state) => state.globalKBSyncing);
  const setGlobalAgentKnowledgeBases = useAppStore((state) => state.setGlobalAgentKnowledgeBases);
  const addGlobalAgentDocument = useAppStore((state) => state.addGlobalAgentDocument);
  const removeGlobalAgentDocument = useAppStore((state) => state.removeGlobalAgentDocument);
  const setGlobalKBSyncing = useAppStore((state) => state.setGlobalKBSyncing);
  const setGoogleAuth = useAppStore((state) => state.setGoogleAuth);

  // Extended Thinking + Self-Review state
  const thinkingEnabled = useAppStore((state) => state.thinkingEnabled);
  const thinkingBudget = useAppStore((state) => state.thinkingBudget);
  const setThinkingEnabled = useAppStore((state) => state.setThinkingEnabled);
  const setThinkingBudget = useAppStore((state) => state.setThinkingBudget);
  const selfReviewMode = useAppStore((state) => state.selfReviewMode);
  const selfReviewMaxIterations = useAppStore((state) => state.selfReviewMaxIterations);
  const setSelfReviewMode = useAppStore((state) => state.setSelfReviewMode);
  const setSelfReviewMaxIterations = useAppStore((state) => state.setSelfReviewMaxIterations);

  // Shared Repository
  const sharedRepoConfig = useAppStore((state) => state.sharedRepoConfig);

  // KB Currency Check state
  const kbCurrencyResults = useAppStore((state) => state.kbCurrencyResults);
  const setKBCurrencyResult = useAppStore((state) => state.setKBCurrencyResult);
  const [checkingCurrencyFor, setCheckingCurrencyFor] = useState<string | null>(null);

  // Comparison view state
  const [viewMode, setViewMode] = useState<'chat' | 'compare'>('chat');
  const [loadedSimulationId, setLoadedSimulationId] = useState<string | null>(null);
  const simulationResults = useAppStore((state) => state.simulationResults);
  const addSimulationResult = useAppStore((state) => state.addSimulationResult);
  const removeSimulationResult = useAppStore((state) => state.removeSimulationResult);

  const getDriveService = useCallback(() => {
    if (!googleClientId || !googleApiKey) return null;
    if (!driveServiceRef.current) {
      driveServiceRef.current = new GoogleDriveService({ clientId: googleClientId, apiKey: googleApiKey });
    }
    // Always keep shared repo config in sync
    if (sharedRepoConfig?.enabled) {
      driveServiceRef.current.setSharedRepositoryConfig(sharedRepoConfig);
    } else {
      driveServiceRef.current.setSharedRepositoryConfig(null);
    }
    return driveServiceRef.current;
  }, [googleClientId, googleApiKey, sharedRepoConfig]);

  const syncGlobalKBFromDrive = useCallback(async () => {
    const drive = getDriveService();
    if (!drive) return;

    setGlobalKBSyncing(true);
    setGlobalSyncError(null);
    try {
      if (!drive.isSignedIn()) {
        const auth = await drive.signIn();
        setGoogleAuth(auth);
      }
      const data = await drive.loadGlobalKnowledgeBases();
      setGlobalAgentKnowledgeBases(data);
    } catch (err: any) {
      setGlobalSyncError(err.message);
    } finally {
      setGlobalKBSyncing(false);
    }
  }, [getDriveService, setGlobalKBSyncing, setGlobalAgentKnowledgeBases, setGoogleAuth]);

  const saveGlobalKBToDrive = useCallback(async (bases: typeof globalAgentKnowledgeBases) => {
    const drive = getDriveService();
    if (!drive) return;

    setGlobalKBSyncing(true);
    setGlobalSyncError(null);
    try {
      if (!drive.isSignedIn()) {
        const auth = await drive.signIn();
        setGoogleAuth(auth);
      }
      await drive.saveGlobalKnowledgeBases(bases);
    } catch (err: any) {
      setGlobalSyncError(err.message);
    } finally {
      setGlobalKBSyncing(false);
    }
  }, [getDriveService, setGlobalKBSyncing, setGoogleAuth]);

  // Load global KB from Drive on mount if signed in
  useEffect(() => {
    if (googleAuth.isSignedIn && googleClientId && googleApiKey) {
      syncGlobalKBFromDrive();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const getAgentStyle = (agentId: string) => {
    switch (agentId) {
      case 'faa-inspector':
        return { bg: 'bg-blue-500/10 border-blue-500/30', badge: 'bg-blue-500/20 text-blue-300' };
      case 'shop-owner':
        return { bg: 'bg-amber-500/10 border-amber-500/30', badge: 'bg-amber-500/20 text-amber-300' };
      case 'isbao-auditor':
        return { bg: 'bg-emerald-500/10 border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300' };
      case 'easa-inspector':
        return { bg: 'bg-indigo-500/10 border-indigo-500/30', badge: 'bg-indigo-500/20 text-indigo-300' };
      case 'as9100-auditor':
        return { bg: 'bg-violet-500/10 border-violet-500/30', badge: 'bg-violet-500/20 text-violet-300' };
      case 'sms-consultant':
        return { bg: 'bg-teal-500/10 border-teal-500/30', badge: 'bg-teal-500/20 text-teal-300' };
      case 'safety-auditor':
        return { bg: 'bg-rose-500/10 border-rose-500/30', badge: 'bg-rose-500/20 text-rose-300' };
      default:
        return { bg: 'bg-white/5 border-white/10', badge: 'bg-white/10 text-white/60' };
    }
  };

  const toggleAgent = (agentId: AuditAgent['id']) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        if (next.size > 1) next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const handleAgentFileUpload = async (agentId: AuditAgent['id'], files: FileList) => {
    setUploadingFor(agentId);
    const extractor = new DocumentExtractor();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buffer = await file.arrayBuffer();
        const text = await extractor.extractText(buffer, file.name, file.type);
        const doc: UploadedDocument = {
          id: `agent-${agentId}-${Date.now()}-${i}`,
          name: file.name,
          text,
          path: `local://${file.name}`,
          source: 'local',
          mimeType: file.type,
          extractedAt: new Date().toISOString(),
        };
        addAgentDocument(agentId, doc);
      } catch (err: any) {
        alert(`Failed to extract text from ${file.name}: ${err.message}`);
      }
    }

    setUploadingFor(null);
  };

  const handleGlobalAgentFileUpload = async (agentId: AuditAgent['id'], files: FileList) => {
    setGlobalUploadingFor(agentId);
    const extractor = new DocumentExtractor();
    const newBases = { ...globalAgentKnowledgeBases };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buffer = await file.arrayBuffer();
        const text = await extractor.extractText(buffer, file.name, file.type);
        const doc: UploadedDocument = {
          id: `global-${agentId}-${Date.now()}-${i}`,
          name: file.name,
          text,
          path: `global://${file.name}`,
          source: 'local',
          mimeType: file.type,
          extractedAt: new Date().toISOString(),
        };
        addGlobalAgentDocument(agentId, doc);
        newBases[agentId] = [...(newBases[agentId] || []), doc];
      } catch (err: any) {
        alert(`Failed to extract text from ${file.name}: ${err.message}`);
      }
    }

    setGlobalUploadingFor(null);
    // Sync to Drive after upload
    await saveGlobalKBToDrive(newBases);
  };

  const handleRemoveGlobalDoc = async (agentId: AuditAgent['id'], docId: string) => {
    removeGlobalAgentDocument(agentId, docId);
    const updatedBases = { ...globalAgentKnowledgeBases };
    updatedBases[agentId] = (updatedBases[agentId] || []).filter(d => d.id !== docId);
    await saveGlobalKBToDrive(updatedBases);
  };

  const handleCheckCurrency = async (agentId: AuditAgent['id'], scope: 'project' | 'global') => {
    const docs = scope === 'project'
      ? (agentKnowledgeBases[agentId] || [])
      : (globalAgentKnowledgeBases[agentId] || []);

    if (docs.length === 0) return;

    const key = `${scope}-${agentId}`;
    setCheckingCurrencyFor(key);
    const checker = new KBCurrencyChecker();

    for (const doc of docs) {
      setKBCurrencyResult(doc.id, {
        documentId: doc.id,
        documentName: doc.name,
        status: 'checking',
        latestRevision: '',
        summary: '',
        checkedAt: null,
      });
      const result = await checker.checkDocumentCurrency(doc);
      setKBCurrencyResult(doc.id, result);
      await new Promise((r) => setTimeout(r, 1000));
    }

    setCheckingCurrencyFor(null);
  };

  const handleExportPDF = async () => {
    const assessment = assessments.find((a) => a.id === selectedAssessment);
    const companyName = assessment?.data.companyName || 'Unknown';
    const activeAgents = AUDIT_AGENTS.filter((a) => selectedAgents.has(a.id));

    const generator = new AuditSimulationPDFGenerator();
    const pdfBytes = await generator.generateReport(companyName, messages, activeAgents);

    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `audit-simulation-${companyName.replace(/\s+/g, '-')}-${date}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportDOCX = async () => {
    const assessment = assessments.find((a) => a.id === selectedAssessment);
    const companyName = assessment?.data.companyName || 'Unknown';
    const activeAgents = AUDIT_AGENTS.filter((a) => selectedAgents.has(a.id));

    const generator = new AuditSimulationDOCXGenerator();
    const blob = await generator.generateReport(companyName, messages, activeAgents);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().split('T')[0];
    a.download = `audit-simulation-${companyName.replace(/\s+/g, '-')}-${date}.docx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveSimulation = () => {
    if (messages.length === 0) return;
    const assessment = assessments.find((a) => a.id === selectedAssessment);
    const agentIdList = Array.from(selectedAgents) as AuditAgent['id'][];
    const now = new Date();
    const result: SimulationResult = {
      id: `sim-${Date.now()}`,
      name: `${assessment?.data.companyName || 'Simulation'} — ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      assessmentId: selectedAssessment,
      assessmentName: assessment?.data.companyName || 'Unknown',
      agentIds: agentIdList,
      totalRounds: totalRounds,
      messages: [...messages],
      createdAt: now.toISOString(),
      thinkingEnabled,
      selfReviewMode,
    };
    addSimulationResult(result);
    setLoadedSimulationId(result.id);
  };

  const handleLoadSimulation = (simId: string) => {
    const sim = simulationResults.find((s) => s.id === simId);
    if (!sim) return;
    setMessages(sim.messages);
    setSelectedAssessment(sim.assessmentId);
    setSelectedAgents(new Set(sim.agentIds));
    setTotalRounds(sim.totalRounds);
    setLoadedSimulationId(sim.id);
    setViewMode('chat');
  };

  const handleDeleteSimulation = (simId: string) => {
    removeSimulationResult(simId);
    if (loadedSimulationId === simId) setLoadedSimulationId(null);
  };

  const handleStart = async () => {
    if (!selectedAssessment) {
      alert('Please select an assessment to simulate');
      return;
    }

    const assessment = assessments.find((a) => a.id === selectedAssessment);
    if (!assessment) return;

    setIsRunning(true);
    setMessages([]);
    setCurrentRound(0);
    abortRef.current = false;

    const service = new AuditSimulationService(
      assessment.data,
      regulatoryFiles.map((f) => f.name),
      entityDocuments.map((d) => d.name),
      uploadedDocuments
        .filter((d) => (d.text || '').length > 0)
        .map((d) => ({ name: d.name, text: d.text || '' })),
      agentKnowledgeBases,
      globalAgentKnowledgeBases,
      thinkingEnabled ? { enabled: true, budgetTokens: thinkingBudget } : undefined,
      selfReviewMode !== 'off' ? { mode: selfReviewMode, maxIterations: selfReviewMaxIterations } : undefined
    );

    try {
      await service.runSimulation(
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
        Array.from(selectedAgents)
      );
    } catch (error: any) {
      if (!abortRef.current) {
        alert(`Simulation error: ${error.message}`);
      }
    } finally {
      setIsRunning(false);
    }
  };

  const handleStop = () => {
    abortRef.current = true;
    setIsRunning(false);
    setStatusText('Simulation stopped');
  };

  // Group messages by round
  const rounds: Map<number, AuditMessage[]> = new Map();
  messages.forEach((msg) => {
    if (!rounds.has(msg.round)) rounds.set(msg.round, []);
    rounds.get(msg.round)!.push(msg);
  });

  // Count total agent-specific docs (project + global)
  const totalAgentDocs = Object.values(agentKnowledgeBases).reduce(
    (sum, docs) => sum + (docs?.length || 0),
    0
  );

  return (
    <div className="p-8 max-w-5xl mx-auto flex flex-col h-full">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Audit Simulation
        </h1>
        <p className="text-white/60 text-lg">
          Multi-agent audit simulation with {AUDIT_AGENTS.length} specialist auditors
        </p>
      </div>

      {/* Setup Panel */}
      {messages.length === 0 && !isRunning && (
        <div className="glass rounded-2xl p-6 mb-6 overflow-y-auto">
          <h2 className="text-xl font-display font-bold mb-4">Configure Simulation</h2>

          {/* Agent Cards — click to toggle */}
          <p className="text-sm text-white/50 mb-2">Click to select or deselect participants</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
            {AUDIT_AGENTS.map((agent) => {
              const style = getAgentStyle(agent.id);
              const isSelected = selectedAgents.has(agent.id);
              const projectDocCount = (agentKnowledgeBases[agent.id] || []).length;
              const globalDocCount = (globalAgentKnowledgeBases[agent.id] || []).length;
              const totalDocs = projectDocCount + globalDocCount;
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleAgent(agent.id)}
                  className={`relative p-4 rounded-xl border text-left transition-all ${
                    isSelected
                      ? `${style.bg} ring-2 ring-sky-light/60`
                      : 'bg-white/5 border-white/10 opacity-40'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-sky-light rounded-full flex items-center justify-center">
                      <FiCheck className="text-navy-900 text-xs" />
                    </div>
                  )}
                  <div className="text-3xl mb-2">{agent.avatar}</div>
                  <div className="font-bold text-sm">{agent.name}</div>
                  <div className="text-xs text-white/60 mt-1 line-clamp-2">{agent.role}</div>
                  {totalDocs > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-sky-lighter">
                      {globalDocCount > 0 && <FiCloud className="text-[10px]" />}
                      {projectDocCount > 0 && <FiFolder className="text-[10px]" />}
                      {totalDocs} doc{totalDocs !== 1 ? 's' : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Global Knowledge Base Section (Cloud-synced) */}
          <div className="mb-6">
            <button
              type="button"
              onClick={() => setShowGlobalKB(!showGlobalKB)}
              className="flex items-center gap-2 mb-3 group"
            >
              {showGlobalKB ? (
                <FiChevronDown className="text-white/40" />
              ) : (
                <FiChevronRight className="text-white/40" />
              )}
              <FiCloud className="text-sky-light" />
              <h3 className="text-lg font-display font-semibold">Global Knowledge Base</h3>
              {sharedRepoConfig?.enabled ? (
                <span className="text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded-full">
                  Shared Repository: {sharedRepoConfig.folderName || 'Active'}
                </span>
              ) : (
                <span className="text-xs bg-sky-light/20 text-sky-lighter px-2 py-0.5 rounded-full">
                  Shared via Drive
                </span>
              )}
              {globalKBSyncing && (
                <FiRefreshCw className="text-sky-lighter animate-spin text-sm" />
              )}
            </button>

            {showGlobalKB && (
              <div className="ml-4">
                <p className="text-sm text-white/50 mb-3">
                  Documents uploaded here are shared across all projects and all users with access to the Google Drive folder.
                  Changes sync automatically to Google Drive.
                </p>

                {!googleClientId || !googleApiKey ? (
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-sm text-amber-300 mb-3">
                    Configure Google Drive credentials in Settings to enable global knowledge bases.
                    <button
                      type="button"
                      onClick={() => setCurrentView('settings')}
                      className="ml-2 underline hover:no-underline"
                    >
                      Go to Settings
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-3">
                      <button
                        type="button"
                        onClick={syncGlobalKBFromDrive}
                        disabled={globalKBSyncing}
                        className="flex items-center gap-2 px-3 py-1.5 bg-sky-light/10 hover:bg-sky-light/20 border border-sky-light/30 rounded-lg text-sm text-sky-lighter transition-colors disabled:opacity-50"
                      >
                        <FiRefreshCw className={`text-xs ${globalKBSyncing ? 'animate-spin' : ''}`} />
                        Sync from Drive
                      </button>
                      {globalSyncError && (
                        <span className="text-xs text-red-400">{globalSyncError}</span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {AUDIT_AGENTS.map((agent) => {
                        const style = getAgentStyle(agent.id);
                        const globalDocs = globalAgentKnowledgeBases[agent.id] || [];
                        const isGlobalUploading = globalUploadingFor === agent.id;
                        const isExpanded = expandedAgent === `global-${agent.id}`;
                        const isCheckingGlobal = checkingCurrencyFor === `global-${agent.id}`;

                        return (
                          <div key={agent.id} className={`rounded-xl border ${style.bg} overflow-hidden`}>
                            <button
                              type="button"
                              onClick={() => setExpandedAgent(isExpanded ? null : `global-${agent.id}`)}
                              className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors"
                            >
                              {isExpanded ? (
                                <FiChevronDown className="text-white/40 flex-shrink-0" />
                              ) : (
                                <FiChevronRight className="text-white/40 flex-shrink-0" />
                              )}
                              <FiCloud className="text-sky-lighter flex-shrink-0 text-sm" />
                              <span className="text-xl">{agent.avatar}</span>
                              <span className="font-semibold flex-1">{agent.name}</span>
                              <span className="text-xs text-white/40">
                                {globalDocs.length} global doc{globalDocs.length !== 1 ? 's' : ''}
                              </span>
                            </button>

                            {isExpanded && (
                              <div className="px-4 pb-4 border-t border-white/10">
                                {globalDocs.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    {globalDocs.map((doc) => {
                                      const currencyResult = kbCurrencyResults[doc.id];
                                      return (
                                        <div
                                          key={doc.id}
                                          className="flex items-center gap-3 p-2 bg-white/5 rounded-lg group"
                                        >
                                          <FiCloud className="text-sky-lighter/60 flex-shrink-0 text-sm" />
                                          <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium truncate">{doc.name}</div>
                                            <div className="text-xs text-white/40">
                                              {(((doc.text || '').length) / 1000).toFixed(1)}k chars
                                              {doc.mimeType && ` · ${doc.mimeType.split('/').pop()}`}
                                            </div>
                                            {currencyResult && currencyResult.status !== 'unchecked' && (
                                              <div className="text-xs mt-1">
                                                <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${
                                                  currencyResult.status === 'current' ? 'bg-green-500/20 text-green-300' :
                                                  currencyResult.status === 'outdated' ? 'bg-red-500/20 text-red-300' :
                                                  currencyResult.status === 'checking' ? 'bg-yellow-500/20 text-yellow-300' :
                                                  currencyResult.status === 'error' ? 'bg-red-500/20 text-red-300' :
                                                  'bg-white/10 text-white/50'
                                                }`}>
                                                  {currencyResult.status === 'current' ? 'Current' :
                                                   currencyResult.status === 'outdated' ? 'Outdated' :
                                                   currencyResult.status === 'checking' ? 'Checking...' :
                                                   currencyResult.status === 'error' ? 'Error' : 'Unknown'}
                                                </span>
                                                {currencyResult.summary && currencyResult.status !== 'checking' && (
                                                  <span className="ml-2 text-white/40">{currencyResult.summary.substring(0, 80)}{currencyResult.summary.length > 80 ? '...' : ''}</span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveGlobalDoc(agent.id, doc.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                                            title="Remove from global knowledge base"
                                          >
                                            <FiX className="text-red-400 text-sm" />
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                <div className="mt-3 flex items-center gap-2 flex-wrap">
                                  <input
                                    ref={expandedAgent === (`global-${agent.id}`) ? globalFileInputRef : undefined}
                                    type="file"
                                    multiple
                                    accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp"
                                    className="hidden"
                                    onChange={(e) => {
                                      if (e.target.files && e.target.files.length > 0) {
                                        handleGlobalAgentFileUpload(agent.id, e.target.files);
                                        e.target.value = '';
                                      }
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={isGlobalUploading}
                                    onClick={() => globalFileInputRef.current?.click()}
                                    className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-sm transition-colors disabled:opacity-50"
                                  >
                                    {isGlobalUploading ? (
                                      <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Extracting text...
                                      </>
                                    ) : (
                                      <>
                                        <FiUpload className="text-sm" />
                                        Upload to Global KB
                                      </>
                                    )}
                                  </button>
                                  {globalDocs.length > 0 && (
                                    <button
                                      type="button"
                                      disabled={isCheckingGlobal}
                                      onClick={() => handleCheckCurrency(agent.id, 'global')}
                                      className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-sm text-amber-300 transition-colors disabled:opacity-50"
                                    >
                                      <FiRefreshCw className={`text-xs ${isCheckingGlobal ? 'animate-spin' : ''}`} />
                                      Check Currency
                                    </button>
                                  )}
                                </div>
                                <p className="text-xs text-white/30 mt-1">
                                  Shared with all users via Google Drive.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Project Agent Knowledge Bases Section */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FiFolder className="text-sky-light" />
              <h3 className="text-lg font-display font-semibold">Project Knowledge Bases</h3>
              {totalAgentDocs > 0 && (
                <span className="text-xs bg-sky-light/20 text-sky-lighter px-2 py-0.5 rounded-full">
                  {totalAgentDocs} total doc{totalAgentDocs !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <p className="text-sm text-white/50 mb-3">
              Upload documents specific to this project. These are scoped to the current project only.
            </p>

            <div className="space-y-2">
              {AUDIT_AGENTS.map((agent) => {
                const style = getAgentStyle(agent.id);
                const isExpanded = expandedAgent === agent.id;
                const docs = agentKnowledgeBases[agent.id] || [];
                const isUploading = uploadingFor === agent.id;
                const isCheckingProject = checkingCurrencyFor === `project-${agent.id}`;

                return (
                  <div key={agent.id} className={`rounded-xl border ${style.bg} overflow-hidden`}>
                    {/* Collapsible Header */}
                    <button
                      type="button"
                      onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors"
                    >
                      {isExpanded ? (
                        <FiChevronDown className="text-white/40 flex-shrink-0" />
                      ) : (
                        <FiChevronRight className="text-white/40 flex-shrink-0" />
                      )}
                      <span className="text-xl">{agent.avatar}</span>
                      <span className="font-semibold flex-1">{agent.name}</span>
                      <span className="text-xs text-white/40">
                        {docs.length} doc{docs.length !== 1 ? 's' : ''}
                      </span>
                    </button>

                    {/* Expanded Panel */}
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-white/10">
                        {/* Document List */}
                        {docs.length > 0 && (
                          <div className="mt-3 space-y-2">
                            {docs.map((doc) => {
                              const currencyResult = kbCurrencyResults[doc.id];
                              return (
                                <div
                                  key={doc.id}
                                  className="flex items-center gap-3 p-2 bg-white/5 rounded-lg group"
                                >
                                  <FiFile className="text-white/40 flex-shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium truncate">{doc.name}</div>
                                    <div className="text-xs text-white/40">
                                      {(((doc.text || '').length) / 1000).toFixed(1)}k chars
                                      {doc.mimeType && ` · ${doc.mimeType.split('/').pop()}`}
                                    </div>
                                    {currencyResult && currencyResult.status !== 'unchecked' && (
                                      <div className="text-xs mt-1">
                                        <span className={`inline-block px-1.5 py-0.5 rounded font-medium ${
                                          currencyResult.status === 'current' ? 'bg-green-500/20 text-green-300' :
                                          currencyResult.status === 'outdated' ? 'bg-red-500/20 text-red-300' :
                                          currencyResult.status === 'checking' ? 'bg-yellow-500/20 text-yellow-300' :
                                          currencyResult.status === 'error' ? 'bg-red-500/20 text-red-300' :
                                          'bg-white/10 text-white/50'
                                        }`}>
                                          {currencyResult.status === 'current' ? 'Current' :
                                           currencyResult.status === 'outdated' ? 'Outdated' :
                                           currencyResult.status === 'checking' ? 'Checking...' :
                                           currencyResult.status === 'error' ? 'Error' : 'Unknown'}
                                        </span>
                                        {currencyResult.summary && currencyResult.status !== 'checking' && (
                                          <span className="ml-2 text-white/40">{currencyResult.summary.substring(0, 80)}{currencyResult.summary.length > 80 ? '...' : ''}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => removeAgentDocument(agent.id, doc.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                                    title="Remove document"
                                  >
                                    <FiX className="text-red-400 text-sm" />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Upload + Check Currency Buttons */}
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                          <input
                            ref={expandedAgent === agent.id ? fileInputRef : undefined}
                            type="file"
                            multiple
                            accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp"
                            className="hidden"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                handleAgentFileUpload(agent.id, e.target.files);
                                e.target.value = '';
                              }
                            }}
                          />
                          <button
                            type="button"
                            disabled={isUploading}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 px-3 py-2 bg-white/10 hover:bg-white/15 border border-white/20 rounded-lg text-sm transition-colors disabled:opacity-50"
                          >
                            {isUploading ? (
                              <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Extracting text...
                              </>
                            ) : (
                              <>
                                <FiUpload className="text-sm" />
                                Upload Documents
                              </>
                            )}
                          </button>
                          {docs.length > 0 && (
                            <button
                              type="button"
                              disabled={isCheckingProject}
                              onClick={() => handleCheckCurrency(agent.id, 'project')}
                              className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg text-sm text-amber-300 transition-colors disabled:opacity-50"
                            >
                              <FiRefreshCw className={`text-xs ${isCheckingProject ? 'animate-spin' : ''}`} />
                              Check Currency
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-white/30 mt-1">
                          PDF, DOCX, TXT, or images. Text is extracted and added to this agent's context.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-white/80">
                Select Assessment
              </label>
              <select
                value={selectedAssessment}
                onChange={(e) => setSelectedAssessment(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
              >
                <option value="" className="bg-navy-800">Choose an assessment...</option>
                {assessments.map((a) => (
                  <option key={a.id} value={a.id} className="bg-navy-800">
                    {a.data.companyName} - {new Date(a.importedAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-white/80">
                Audit Rounds
              </label>
              <select
                value={totalRounds}
                onChange={(e) => setTotalRounds(Number(e.target.value))}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n} className="bg-navy-800">
                    {n} round{n > 1 ? 's' : ''} ({n * selectedAgents.size} total exchanges)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Extended Thinking + Self-Review Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Extended Thinking */}
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
              <div className="flex items-center gap-3 mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={thinkingEnabled}
                    onChange={(e) => setThinkingEnabled(e.target.checked)}
                    className="w-4 h-4 rounded bg-white/10 border-white/20 accent-sky-400"
                  />
                  <span className="text-sm font-semibold text-white/90">Extended Thinking</span>
                </label>
              </div>
              {thinkingEnabled && (
                <div>
                  <label className="block text-xs text-white/50 mb-1">Thinking Budget</label>
                  <select
                    value={thinkingBudget}
                    onChange={(e) => setThinkingBudget(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm focus:outline-none focus:border-sky-light transition-colors"
                  >
                    <option value={5000} className="bg-navy-800">5,000 tokens (Light)</option>
                    <option value={10000} className="bg-navy-800">10,000 tokens (Standard)</option>
                    <option value={15000} className="bg-navy-800">15,000 tokens (Deep)</option>
                  </select>
                  <p className="text-xs text-white/30 mt-1">
                    Agents reason internally before responding. Higher budgets = more thorough but slower/costlier.
                  </p>
                </div>
              )}
              {!thinkingEnabled && (
                <p className="text-xs text-white/30">
                  Enable to let agents reason deeply before responding.
                </p>
              )}
            </div>

            {/* Self-Review Iteration */}
            <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
              <label className="block text-sm font-semibold mb-2 text-white/90">
                Quality Review Mode
              </label>
              <select
                value={selfReviewMode}
                onChange={(e) => setSelfReviewMode(e.target.value as SelfReviewMode)}
                className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm focus:outline-none focus:border-sky-light transition-colors mb-2"
              >
                <option value="off" className="bg-navy-800">Off</option>
                <option value="per-turn" className="bg-navy-800">Per-Turn Self-Check</option>
                <option value="post-simulation" className="bg-navy-800">Post-Simulation Review</option>
              </select>
              {selfReviewMode !== 'off' && (
                <div>
                  <label className="block text-xs text-white/50 mb-1">Max Iterations</label>
                  <select
                    value={selfReviewMaxIterations}
                    onChange={(e) => setSelfReviewMaxIterations(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm focus:outline-none focus:border-sky-light transition-colors"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <option key={n} value={n} className="bg-navy-800">
                        {n} iteration{n > 1 ? 's' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-white/30 mt-1">
                    {selfReviewMode === 'per-turn'
                      ? 'Each response is reviewed for accuracy before the next agent speaks.'
                      : 'After all agents speak, the conversation is reviewed and agents revise.'}
                  </p>
                </div>
              )}
              {selfReviewMode === 'off' && (
                <p className="text-xs text-white/30">
                  Enable to have responses checked for regulatory accuracy.
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleStart}
            disabled={!selectedAssessment}
            className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiPlay />
            Start Audit Simulation
          </button>
        </div>
      )}

      {/* Status Bar */}
      {isRunning && (
        <div className="glass rounded-xl p-4 mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
            <span className="font-medium">{statusText}</span>
            <span className="text-white/40 text-sm">Round {currentRound} of {totalRounds}</span>
          </div>
          <button
            onClick={handleStop}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            <FiStopCircle />
            Stop
          </button>
        </div>
      )}

      {/* View Mode Toggle + Actions Bar */}
      {!isRunning && messages.length > 0 && (
        <div className="mb-4 glass rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              {/* Chat / Compare toggle */}
              <div className="flex bg-white/5 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('chat')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    viewMode === 'chat' ? 'bg-sky/20 text-sky-light' : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  <FiMessageSquare className="w-3.5 h-3.5" />
                  Chat
                </button>
                <button
                  onClick={() => setViewMode('compare')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                    viewMode === 'compare' ? 'bg-sky/20 text-sky-light' : 'text-white/50 hover:text-white/70'
                  }`}
                >
                  <FiColumns className="w-3.5 h-3.5" />
                  Compare
                </button>
              </div>

              <span className="text-white/40 text-sm ml-2">
                {messages.length} exchanges across {rounds.size} round{rounds.size > 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveSimulation}
                className="flex items-center gap-2 px-3 py-2 bg-sky/20 text-sky-light rounded-lg text-sm font-semibold hover:bg-sky/30 transition-all"
              >
                <FiSave className="w-3.5 h-3.5" />
                Save
              </button>
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-green-500/20 transition-all"
              >
                <FiDownload className="w-3.5 h-3.5" />
                Export PDF
              </button>
              <button
                onClick={handleExportDOCX}
                className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg text-sm font-semibold hover:shadow-lg hover:shadow-blue-500/20 transition-all"
              >
                <FiDownload className="w-3.5 h-3.5" />
                Export DOCX
              </button>
              <button
                onClick={() => {
                  setMessages([]);
                  setCurrentRound(0);
                  setStatusText('');
                  setViewMode('chat');
                  setLoadedSimulationId(null);
                }}
                className="px-3 py-2 glass glass-hover rounded-lg text-sm font-semibold transition-all"
              >
                New Simulation
              </button>
            </div>
          </div>

          {/* Saved Simulations Dropdown */}
          {simulationResults.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <label className="block text-xs text-white/40 mb-1.5">Saved Simulations</label>
              <div className="flex flex-wrap gap-2">
                {simulationResults.map((sim) => (
                  <div
                    key={sim.id}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-all cursor-pointer ${
                      loadedSimulationId === sim.id
                        ? 'bg-sky/15 border-sky/40 text-sky-light'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80'
                    }`}
                    onClick={() => handleLoadSimulation(sim.id)}
                  >
                    <span className="truncate max-w-[200px]">{sim.name}</span>
                    <span className="text-white/30">{sim.messages.length} msgs</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSimulation(sim.id);
                      }}
                      className="ml-1 text-white/30 hover:text-red-400 transition-colors"
                    >
                      <FiTrash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chat Messages (chat mode) */}
      {(messages.length > 0 || isRunning) && viewMode === 'chat' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2 min-h-0">
          {Array.from(rounds.entries()).map(([round, roundMessages]) => (
            <div key={round}>
              {/* Round Divider */}
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                  {round === -1 ? 'Post-Simulation Review' : `Round ${round}`}
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {/* Messages */}
              {roundMessages.map((msg) => {
                const agent = AUDIT_AGENTS.find((a) => a.id === msg.agentId);
                const style = getAgentStyle(msg.agentId);

                return (
                  <div
                    key={msg.id}
                    className={`p-5 rounded-xl border mb-3 ${style.bg} transition-all`}
                  >
                    {/* Agent Header */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{agent?.avatar}</span>
                      <div>
                        <span className="font-bold text-lg">{msg.agentName}</span>
                        <span className={`ml-3 px-2 py-0.5 rounded text-xs font-semibold ${style.badge}`}>
                          {msg.role}
                        </span>
                        {msg.wasRevised && (
                          <span className="ml-2 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300">
                            Revised
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Message Content */}
                    <div className="text-white/90 leading-relaxed whitespace-pre-wrap pl-11">
                      {msg.content}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          <div ref={chatEndRef} />
        </div>
      )}

      {/* Comparison View (compare mode) */}
      {messages.length > 0 && !isRunning && viewMode === 'compare' && (
        <div className="flex-1 min-h-0">
          <ComparisonView
            messages={messages}
            agentIds={Array.from(selectedAgents) as AuditAgent['id'][]}
          />
        </div>
      )}
    </div>
  );
}
