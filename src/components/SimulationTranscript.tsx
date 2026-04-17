/**
 * SimulationTranscript — post-run results display.
 *
 * Renders the gaps/findings card, view-mode controls, saved-simulation
 * library, run-comparison panel, chat transcript, and ComparisonView.
 * All state lives in the parent AuditSimulation orchestrator.
 */
import {
  FiList,
  FiPlusCircle,
  FiMessageSquare,
  FiColumns,
  FiSave,
  FiTrash2,
  FiSearch,
} from 'react-icons/fi';
import type { AuditAgent, AuditMessage, AuditDiscrepancy, SimulationDataSummary } from '../types/auditSimulation';
import { AUDIT_AGENTS } from '../services/auditAgents';
import { Button, GlassCard, Select, Badge } from './ui';
import ComparisonView from './ComparisonView';

// ── Local evidence-segment helpers ────────────────────────────────────────────

type EvidenceSegments = {
  requirement?: string;
  evidence?: string;
  gap?: string;
  correctiveAction?: string;
  recommendedAction?: string;
};

function normalizeEvidenceText(input: string): string {
  return (input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*>\s*/gm, '')
    .replace(/\*\*/g, '')
    .trim();
}

function parseEvidenceSegments(description: string): EvidenceSegments {
  const text = normalizeEvidenceText(description);
  if (!text) return {};

  const out: EvidenceSegments = {};

  if (text.includes('|')) {
    const parts = text
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const m = part.match(
        /^(Requirement|Evidence|Gap|Corrective action|Recommended action|Recommended corrective action)\s*:\s*([\s\S]*?)$/i
      );
      if (!m) continue;
      const rawLabel = String(m[1]).toLowerCase();
      const value = String(m[2] ?? '').trim();
      if (!value) continue;
      if (rawLabel === 'requirement') out.requirement = value;
      else if (rawLabel === 'evidence') out.evidence = value;
      else if (rawLabel === 'gap') out.gap = value;
      else if (rawLabel === 'corrective action') out.correctiveAction = value;
      else if (rawLabel === 'recommended action') out.recommendedAction = value;
      else if (rawLabel === 'recommended corrective action') out.recommendedAction = value;
    }
    if (out.requirement || out.evidence || out.gap || out.correctiveAction || out.recommendedAction) return out;
  }

  const extract = (label: string, next: string[]): string | undefined => {
    const nextGroup = next.length ? next.join('|') : '$';
    const re = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=(?:${nextGroup})|$)`, 'i');
    const m = text.match(re);
    const v = m?.[1]?.trim();
    return v || undefined;
  };

  return {
    requirement: extract('Requirement', ['Evidence', 'Gap', 'Corrective action', 'Recommended action', 'Recommended corrective action']),
    evidence: extract('Evidence', ['Gap', 'Corrective action', 'Recommended action', 'Recommended corrective action']),
    gap: extract('Gap', ['Corrective action', 'Recommended action', 'Recommended corrective action']),
    correctiveAction: extract('Corrective action', ['Recommended action', 'Recommended corrective action']),
    recommendedAction: extract('Recommended action', ['Recommended corrective action']) ?? extract('Recommended corrective action', ['Requirement', 'Evidence', 'Gap']),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface SimulationTranscriptProps {
  // Transcript content
  messages: AuditMessage[];
  rounds: Map<number, AuditMessage[]>;
  isRunning: boolean;
  viewMode: 'chat' | 'compare';
  selectedAgents: Set<AuditAgent['id']>;

  // Gaps/findings
  discrepancies: AuditDiscrepancy[];
  discrepanciesLoading: boolean;
  dataSummaryForRun: SimulationDataSummary | null;
  addingToEntityIssues: boolean;

  // Saved simulations
  simulationResults: any[];
  searchedSimulationResults: any[];
  loadedSimulationId: string | null;
  savedSimSearch: string;

  // Run comparison
  compareRunAId: string | null;
  compareRunBId: string | null;
  compareRunA: any;
  compareRunB: any;
  compareFindingsA: AuditDiscrepancy[];
  compareFindingsB: AuditDiscrepancy[];
  compareFindingsALoading: boolean;
  compareFindingsBLoading: boolean;

  // Handlers
  onSetViewMode: (mode: 'chat' | 'compare') => void;
  onSaveSimulation: (asDraft?: boolean) => void;
  onNewSimulation: () => void;
  onLoadSimulation: (id: string) => void;
  onDeleteSimulation: (id: string) => void;
  onAddAllToEntityIssues: () => void;
  onSetSavedSimSearch: (q: string) => void;
  onSetCompareRunAId: (id: string | null) => void;
  onSetCompareFindingsA: (f: AuditDiscrepancy[]) => void;
  onSetCompareRunBId: (id: string | null) => void;
  onSetCompareFindingsB: (f: AuditDiscrepancy[]) => void;
  onExtractFindingsForCompare: (side: 'A' | 'B') => void;
}

export default function SimulationTranscript({
  messages,
  rounds,
  isRunning,
  viewMode,
  selectedAgents,
  discrepancies,
  discrepanciesLoading,
  dataSummaryForRun,
  addingToEntityIssues,
  simulationResults,
  searchedSimulationResults,
  loadedSimulationId,
  savedSimSearch,
  compareRunAId,
  compareRunBId,
  compareRunA,
  compareRunB,
  compareFindingsA,
  compareFindingsB,
  compareFindingsALoading,
  compareFindingsBLoading,
  onSetViewMode,
  onSaveSimulation,
  onNewSimulation,
  onLoadSimulation,
  onDeleteSimulation,
  onAddAllToEntityIssues,
  onSetSavedSimSearch,
  onSetCompareRunAId,
  onSetCompareFindingsA,
  onSetCompareRunBId,
  onSetCompareFindingsB,
  onExtractFindingsForCompare,
}: SimulationTranscriptProps) {
  return (
    <>
      {/* ── Gaps/findings + view controls (hidden while running) ── */}
      {!isRunning && (
        <>
          <GlassCard rounded="xl" padding="md" className="mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <h2 className="text-lg font-display font-bold flex items-center gap-2">
                <FiList className="w-5 h-5 text-sky-light" />
                Gaps and findings
              </h2>
              {discrepancies.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<FiPlusCircle className="w-3.5 h-3.5" />}
                  onClick={onAddAllToEntityIssues}
                  disabled={addingToEntityIssues}
                  loading={addingToEntityIssues}
                >
                  Add all to entity issues
                </Button>
              )}
            </div>
            <p className="text-xs text-white/60 mb-3">
              This audit focuses on identifying gaps. Below are the problem areas extracted from the transcript.
            </p>
            {discrepanciesLoading ? (
              <p className="text-white/70 text-sm flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-sky-light border-t-transparent rounded-full animate-spin" />
                Extracting discrepancies from transcript...
              </p>
            ) : (
              <>
                {discrepancies.length === 0 ? (
                  <p className="text-white/60 text-sm">No problem areas were extracted from this simulation.</p>
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
                        {(() => {
                          const seg = parseEvidenceSegments(d.description);
                          const actionText = seg.correctiveAction ?? seg.recommendedAction;
                          const hasAny = seg.requirement || seg.evidence || seg.gap || actionText;

                          if (!hasAny) {
                            return <p className="text-sm text-white/80 leading-relaxed">{d.description}</p>;
                          }

                          return (
                            <div className="space-y-2">
                              {seg.requirement && (
                                <div className="space-y-1">
                                  <div className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">
                                    Requirement
                                  </div>
                                  <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{seg.requirement}</div>
                                </div>
                              )}
                              {seg.evidence && (
                                <div className="space-y-1">
                                  <div className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">
                                    Evidence
                                  </div>
                                  <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{seg.evidence}</div>
                                </div>
                              )}
                              {seg.gap && (
                                <div className="space-y-1">
                                  <div className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">
                                    Gap
                                  </div>
                                  <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{seg.gap}</div>
                                </div>
                              )}
                              {actionText && (
                                <div className="space-y-1">
                                  <div className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">
                                    Corrective action
                                  </div>
                                  <div className="text-sm text-white/80 whitespace-pre-wrap leading-relaxed">{actionText}</div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
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

          {/* ── View mode / save / saved sims / compare ── */}
          <GlassCard rounded="xl" padding="sm" className="mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="flex bg-white/5 rounded-lg p-0.5">
                  <button
                    onClick={() => onSetViewMode('chat')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-all ${
                      viewMode === 'chat' ? 'bg-sky/20 text-sky-light' : 'text-white/70 hover:text-white/70'
                    }`}
                  >
                    <FiMessageSquare className="w-3.5 h-3.5" />
                    Chat
                  </button>
                  <button
                    onClick={() => onSetViewMode('compare')}
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
                  onClick={() => onSaveSimulation()}
                  icon={<FiSave className="w-3.5 h-3.5" />}
                  className="bg-sky/20 text-sky-light hover:bg-sky/30"
                >
                  Save
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onNewSimulation}
                >
                  New Simulation
                </Button>
              </div>
            </div>

            {simulationResults.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10">
                <label className="block text-xs text-white/70 mb-1.5">Saved Simulations</label>
                <div className="relative mb-2 max-w-md">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 w-4 h-4" />
                  <input
                    type="text"
                    value={savedSimSearch}
                    onChange={(e) => onSetSavedSimSearch(e.target.value)}
                    placeholder="Search saved conversations (name + history)"
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-sky-light/40"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {searchedSimulationResults.map((sim) => (
                    <div
                      key={sim._id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border transition-all cursor-pointer ${
                        loadedSimulationId === sim._id
                          ? 'bg-sky/15 border-sky/40 text-sky-light'
                          : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white/80'
                      }`}
                      onClick={() => onLoadSimulation(sim._id)}
                    >
                      <span className="truncate max-w-[200px]">{sim.name}</span>
                      <span className="text-white/60">{(sim as any).messageCount ?? 0} msgs</span>
                      {(sim as any).matchedInHistory && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky/20 text-sky-light border border-sky/30">
                          history match
                        </span>
                      )}
                      {(sim as any).historySnippet && (
                        <span className="hidden sm:inline text-white/45 max-w-[280px] truncate">
                          {(sim as any).historySnippet}
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSimulation(sim._id);
                        }}
                        className="ml-1 text-white/60 hover:text-red-400 transition-colors"
                      >
                        <FiTrash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {searchedSimulationResults.length === 0 && (
                  <p className="mt-2 text-xs text-white/50">
                    No saved conversations match this search.
                  </p>
                )}
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
                      onSetCompareRunAId(e.target.value || null);
                      onSetCompareFindingsA([]);
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
                      onSetCompareRunBId(e.target.value || null);
                      onSetCompareFindingsB([]);
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
                        onClick={() => onExtractFindingsForCompare('A')}
                        disabled={!(compareRunA?.messages?.length) || compareFindingsALoading}
                      >
                        {compareFindingsALoading ? 'Extracting…' : 'Extract findings for Run A'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => onExtractFindingsForCompare('B')}
                        disabled={!(compareRunB?.messages?.length) || compareFindingsBLoading}
                      >
                        {compareFindingsBLoading ? 'Extracting…' : 'Extract findings for Run B'}
                      </Button>
                    </div>
                    {(compareFindingsA.length > 0 || compareFindingsB.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[320px] overflow-y-auto scrollbar-thin">
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

      {/* ── Chat transcript (shown during run and after) ── */}
      {viewMode === 'chat' && (
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
                void agent; // available for future use (e.g. avatar/color)
                return (
                  <div
                    key={msg.id}
                    className={`p-5 rounded-xl border mb-3 transition-all ${
                      isHost ? 'bg-sky/10 border-sky/30' : 'bg-white/5 border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-3">
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

      {/* ── Comparison view ── */}
      {!isRunning && viewMode === 'compare' && (
        <div className="flex-1 min-h-0">
          <ComparisonView
            messages={messages}
            agentIds={Array.from(selectedAgents) as AuditAgent['id'][]}
          />
        </div>
      )}
    </>
  );
}
