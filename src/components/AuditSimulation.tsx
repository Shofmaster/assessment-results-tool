import { useState, useRef, useEffect } from 'react';
import { FiPlay, FiStopCircle, FiCheck, FiUpload, FiX, FiColumns, FiMessageSquare, FiSave, FiTrash2, FiCloud } from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import { AuditSimulationService, AUDIT_AGENTS } from '../services/auditAgents';
import {
  useAssessments,
  useDocuments,
  useAllProjectAgentDocs,
  useAllSharedAgentDocs,
  useAddProjectAgentDoc,
  useRemoveProjectAgentDoc,
  useSimulationResults,
  useAddSimulationResult,
  useRemoveSimulationResult,
  useUserSettings,
} from '../hooks/useConvexData';
import type { AuditAgent, AuditMessage, SelfReviewMode, SimulationResult } from '../types/auditSimulation';
import ComparisonView from './ComparisonView';

export default function AuditSimulation() {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  const [selectedAssessment, setSelectedAssessment] = useState('');
  const [totalRounds, setTotalRounds] = useState(3);
  const [selectedAgents, setSelectedAgents] = useState<Set<AuditAgent['id']>>(
    new Set(AUDIT_AGENTS.map((a) => a.id))
  );
  const [messages, setMessages] = useState<AuditMessage[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [viewMode, setViewMode] = useState<'chat' | 'compare'>('chat');
  const [loadedSimulationId, setLoadedSimulationId] = useState<string | null>(null);

  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const settings = useUserSettings();
  const thinkingEnabled = settings?.thinkingEnabled ?? false;
  const thinkingBudget = settings?.thinkingBudget ?? 10000;
  const selfReviewMode = (settings?.selfReviewMode || 'off') as SelfReviewMode;
  const selfReviewMaxIterations = settings?.selfReviewMaxIterations ?? 2;

  const assessments = (useAssessments(activeProjectId || undefined) || []) as any[];
  const regulatoryFiles = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const uploadedDocuments = (useDocuments(activeProjectId || undefined, 'uploaded') || []) as any[];
  const allProjectAgentDocs = (useAllProjectAgentDocs(activeProjectId || undefined) || []) as any[];
  const allSharedAgentDocs = (useAllSharedAgentDocs() || []) as any[];

  const simulationResults = (useSimulationResults(activeProjectId || undefined) || []) as any[];
  const addSimulationResult = useAddSimulationResult();
  const removeSimulationResult = useRemoveSimulationResult();

  const addProjectAgentDoc = useAddProjectAgentDoc();
  const removeProjectAgentDoc = useRemoveProjectAgentDoc();

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [uploadingFor, setUploadingFor] = useState<AuditAgent['id'] | null>(null);

  useEffect(() => {
    if (messages.length > 0) {
      const el = document.getElementById('audit-chat-end');
      el?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (!activeProjectId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="glass rounded-2xl p-12 text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to run simulations.</p>
          <button
            onClick={() => setCurrentView('projects')}
            className="px-6 py-2 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

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
    const { DocumentExtractor } = await import('../services/documentExtractor');
    const extractor = new DocumentExtractor();

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const buffer = await file.arrayBuffer();
        const text = await extractor.extractText(buffer, file.name, file.type);
        await addProjectAgentDoc({
          projectId: activeProjectId as any,
          agentId,
          name: file.name,
          path: `local://${file.name}`,
          source: 'local',
          mimeType: file.type,
          extractedText: text,
          extractedAt: new Date().toISOString(),
        });
      } catch (err: any) {
        alert(`Failed to extract text from ${file.name}: ${err.message}`);
      }
    }

    setUploadingFor(null);
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

  const handleStart = async () => {
    if (!selectedAssessment) {
      alert('Please select an assessment to simulate');
      return;
    }

    const assessment = assessments.find((a: any) => a._id === selectedAssessment);
    if (!assessment) return;

    setIsRunning(true);
    setMessages([]);
    setCurrentRound(0);
    abortRef.current = false;

    const service = new AuditSimulationService(
      assessment.data,
      regulatoryFiles.map((f: any) => f.name),
      entityDocuments.map((d: any) => d.name),
      uploadedDocuments
        .filter((d: any) => (d.extractedText || '').length > 0)
        .map((d: any) => ({ name: d.name, text: d.extractedText || '' })),
      Object.fromEntries(
        AUDIT_AGENTS.map((a) => [a.id, getDocsForAgent(a.id)])
      ) as any,
      Object.fromEntries(
        AUDIT_AGENTS.map((a) => [a.id, getDocsForAgent(a.id)])
      ) as any,
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

  const handleSaveSimulation = async () => {
    if (messages.length === 0) return;
    const assessment = assessments.find((a: any) => a._id === selectedAssessment);
    const agentIdList = Array.from(selectedAgents) as AuditAgent['id'][];
    const now = new Date();
    const result: SimulationResult = {
      id: `sim-${Date.now()}`,
      name: `${assessment?.data.companyName || 'Simulation'} - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      assessmentId: selectedAssessment,
      assessmentName: assessment?.data.companyName || 'Unknown',
      agentIds: agentIdList,
      totalRounds: totalRounds,
      messages: [...messages],
      createdAt: now.toISOString(),
      thinkingEnabled,
      selfReviewMode,
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
    });
    setLoadedSimulationId(simId);
  };

  const handleLoadSimulation = (simId: string) => {
    const sim = simulationResults.find((s: any) => s._id === simId);
    if (!sim) return;
    setMessages(sim.messages);
    setSelectedAssessment(sim.assessmentId);
    setSelectedAgents(new Set(sim.agentIds));
    setTotalRounds(sim.totalRounds);
    setLoadedSimulationId(sim._id);
    setViewMode('chat');
  };

  const handleDeleteSimulation = async (simId: string) => {
    await removeSimulationResult({ simulationId: simId as any });
    if (loadedSimulationId === simId) setLoadedSimulationId(null);
  };

  const rounds: Map<number, AuditMessage[]> = new Map();
  messages.forEach((msg) => {
    if (!rounds.has(msg.round)) rounds.set(msg.round, []);
    rounds.get(msg.round)!.push(msg);
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto flex flex-col h-full">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Audit Simulation
        </h1>
        <p className="text-white/60 text-lg">
          Multi-agent audit simulation with {AUDIT_AGENTS.length} specialist auditors
        </p>
      </div>

      {messages.length === 0 && !isRunning && (
        <div className="glass rounded-2xl p-6 mb-6 overflow-y-auto">
          <h2 className="text-xl font-display font-bold mb-4">Configure Simulation</h2>

          <p className="text-sm text-white/50 mb-2">Click to select or deselect participants</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
            {AUDIT_AGENTS.map((agent) => {
              const isSelected = selectedAgents.has(agent.id);
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => toggleAgent(agent.id)}
                  className={`relative p-4 rounded-xl border text-left transition-all ${
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
                  <div className="text-xs text-white/60 mt-1 line-clamp-2">{agent.role}</div>
                </button>
              );
            })}
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-display font-semibold mb-3 flex items-center gap-2">
              <FiCloud className="text-sky-light" />
              Agent Knowledge Bases
            </h3>
            <div className="space-y-3">
              {AUDIT_AGENTS.map((agent) => {
                const isExpanded = expandedAgent === agent.id;
                const isUploading = uploadingFor === agent.id;
                const projectDocs = projectDocsByAgent[agent.id] || [];
                const sharedDocs = sharedDocsByAgent[agent.id] || [];
                return (
                  <div key={agent.id} className="glass rounded-xl border border-white/10">
                    <button
                      onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
                      className="w-full flex items-center justify-between p-4"
                      type="button"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-white/80">{agent.name}</span>
                        <span className="text-xs text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                          {sharedDocs.length + projectDocs.length} doc(s)
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 border-t border-white/5 pt-3">
                        <div className="space-y-2">
                          {sharedDocs.map((doc) => (
                            <div key={doc._id} className="flex items-center justify-between text-sm text-white/70">
                              <span className="truncate">{doc.name}</span>
                              <span className="text-xs text-green-400">Shared</span>
                            </div>
                          ))}
                          {projectDocs.map((doc) => (
                            <div key={doc._id} className="flex items-center justify-between text-sm text-white/70">
                              <span className="truncate">{doc.name}</span>
                              <button
                                type="button"
                                onClick={() => removeProjectAgentDoc({ documentId: doc._id })}
                                className="text-red-400/60 hover:text-red-400"
                              >
                                <FiX />
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-2">
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
                  <option key={a._id} value={a._id} className="bg-navy-800">
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
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n} className="bg-navy-800">
                    {n} round{n > 1 ? 's' : ''}
                  </option>
                ))}
              </select>
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

      {isRunning && (
        <div className="glass rounded-xl p-4 mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse" />
            <span className="font-medium">{statusText}</span>
            <span className="text-white/40 text-sm">Round {currentRound} of {totalRounds}</span>
          </div>
          <button
            onClick={handleStop}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors"
          >
            <FiStopCircle />
            Stop
          </button>
        </div>
      )}

      {!isRunning && messages.length > 0 && (
        <div className="mb-4 glass rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-2">
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

          {simulationResults.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white/10">
              <label className="block text-xs text-white/40 mb-1.5">Saved Simulations</label>
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
                    <span className="text-white/30">{sim.messages.length} msgs</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSimulation(sim._id);
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

      {(messages.length > 0 || isRunning) && viewMode === 'chat' && (
        <div className="flex-1 overflow-y-auto scrollbar-thin space-y-2 min-h-0">
          {Array.from(rounds.entries()).map(([round, roundMessages]) => (
            <div key={round}>
              <div className="flex items-center gap-3 my-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                  {round === -1 ? 'Post-Simulation Review' : `Round ${round}`}
                </span>
                <div className="flex-1 h-px bg-white/10" />
              </div>

              {roundMessages.map((msg) => {
                const agent = AUDIT_AGENTS.find((a) => a.id === msg.agentId);
                return (
                  <div
                    key={msg.id}
                    className="p-5 rounded-xl border mb-3 bg-white/5 border-white/10 transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{agent?.avatar}</span>
                      <div>
                        <span className="font-bold text-lg">{msg.agentName}</span>
                        <span className="ml-3 px-2 py-0.5 rounded text-xs font-semibold bg-white/10 text-white/60">
                          {msg.role}
                        </span>
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
    </div>
  );
}
