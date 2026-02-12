import { useState } from 'react';
import { AUDIT_AGENTS } from '../services/auditAgents';
import type { AuditAgent, AuditMessage } from '../types/auditSimulation';

interface ComparisonViewProps {
  messages: AuditMessage[];
  agentIds: AuditAgent['id'][];
}

function getAgentStyle(agentId: string) {
  switch (agentId) {
    case 'faa-inspector':
      return { bg: 'bg-blue-500/10 border-blue-500/30', badge: 'bg-blue-500/20 text-blue-300', header: 'border-blue-500/40' };
    case 'shop-owner':
      return { bg: 'bg-amber-500/10 border-amber-500/30', badge: 'bg-amber-500/20 text-amber-300', header: 'border-amber-500/40' };
    case 'isbao-auditor':
      return { bg: 'bg-emerald-500/10 border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300', header: 'border-emerald-500/40' };
    case 'easa-inspector':
      return { bg: 'bg-indigo-500/10 border-indigo-500/30', badge: 'bg-indigo-500/20 text-indigo-300', header: 'border-indigo-500/40' };
    case 'as9100-auditor':
      return { bg: 'bg-violet-500/10 border-violet-500/30', badge: 'bg-violet-500/20 text-violet-300', header: 'border-violet-500/40' };
    case 'sms-consultant':
      return { bg: 'bg-teal-500/10 border-teal-500/30', badge: 'bg-teal-500/20 text-teal-300', header: 'border-teal-500/40' };
    case 'safety-auditor':
      return { bg: 'bg-rose-500/10 border-rose-500/30', badge: 'bg-rose-500/20 text-rose-300', header: 'border-rose-500/40' };
    default:
      return { bg: 'bg-white/5 border-white/10', badge: 'bg-white/10 text-white/60', header: 'border-white/20' };
  }
}

export default function ComparisonView({ messages, agentIds }: ComparisonViewProps) {
  // Build round list
  const roundSet = new Set<number>();
  messages.forEach((msg) => roundSet.add(msg.round));
  const roundNumbers = Array.from(roundSet).sort((a, b) => a - b);

  const [selectedRound, setSelectedRound] = useState<number>(roundNumbers[0] ?? 1);

  // Messages for the selected round, grouped by agent
  const roundMessages = messages.filter((msg) => msg.round === selectedRound);
  const messagesByAgent = new Map<string, AuditMessage[]>();
  roundMessages.forEach((msg) => {
    if (!messagesByAgent.has(msg.agentId)) messagesByAgent.set(msg.agentId, []);
    messagesByAgent.get(msg.agentId)!.push(msg);
  });

  const activeAgents = AUDIT_AGENTS.filter((a) => agentIds.includes(a.id));
  const columnClass =
    activeAgents.length <= 1
      ? 'grid-cols-1'
      : activeAgents.length === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';

  if (messages.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-white/40">
        No simulation data to compare.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Round Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto scrollbar-thin pb-1">
        {roundNumbers.map((round) => (
          <button
            key={round}
            onClick={() => setSelectedRound(round)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
              selectedRound === round
                ? 'bg-sky/20 text-sky-light border border-sky/40'
                : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10 hover:text-white/70'
            }`}
          >
            {round === -1 ? 'Post-Simulation Review' : `Round ${round}`}
          </button>
        ))}
      </div>

      {/* Agent Columns */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-h-0">
        <div className={`grid gap-3 ${columnClass}`}>
          {activeAgents.map((agent) => {
            const style = getAgentStyle(agent.id);
            const agentMsgs = messagesByAgent.get(agent.id) || [];

            return (
              <div
                key={agent.id}
                className={`flex flex-col rounded-xl border ${style.bg} overflow-hidden`}
              >
                {/* Agent Header */}
                <div className={`flex items-center gap-2 px-4 py-3 border-b ${style.header} bg-black/10`}>
                  <span className="text-xl">{agent.avatar}</span>
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">{agent.name}</div>
                    <div className={`text-xs truncate ${style.badge} inline-block px-1.5 py-0.5 rounded mt-0.5`}>
                      {agent.role}
                    </div>
                  </div>
                </div>

                {/* Agent Response(s) */}
                <div className="flex-1 p-4 overflow-y-auto max-h-[50vh] sm:max-h-[60vh]">
                  {agentMsgs.length === 0 ? (
                    <p className="text-white/30 text-sm italic">No response in this round.</p>
                  ) : (
                    agentMsgs.map((msg) => (
                      <div key={msg.id} className="mb-3 last:mb-0">
                        {msg.wasRevised && (
                          <span className="inline-block mb-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/20 text-amber-300">
                            Revised
                          </span>
                        )}
                        <div className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
