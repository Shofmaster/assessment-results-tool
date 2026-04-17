/**
 * UI-enriched agent type list for AdminPanel tabs.
 * Derives display colour from the gradient class stored on each AuditAgent.
 */
import { AUDIT_AGENTS } from '../data/auditAgentDefinitions';
import type { AuditAgentCategory } from '../types/auditSimulation';

export interface AdminAgentType {
  id: string;
  name: string;
  category: AuditAgentCategory;
  description: string;
  color: string; // Tailwind text-* class
}

function gradientToTextColor(gradientClass: string): string {
  const c = gradientClass;
  if (c.includes('blue')) return 'text-blue-400';
  if (c.includes('zinc')) return 'text-zinc-300';
  if (c.includes('amber')) return 'text-amber-400';
  if (c.includes('slate')) return 'text-slate-400';
  if (c.includes('emerald')) return 'text-emerald-400';
  if (c.includes('indigo')) return 'text-indigo-400';
  if (c.includes('violet')) return 'text-violet-400';
  if (c.includes('teal')) return 'text-teal-400';
  if (c.includes('rose')) return 'text-rose-400';
  if (c.includes('purple')) return 'text-purple-400';
  if (c.includes('stone')) return 'text-stone-400';
  if (c.includes('sky')) return 'text-sky-400';
  if (c.includes('orange')) return 'text-orange-400';
  if (c.includes('cyan')) return 'text-cyan-400';
  if (c.includes('green')) return 'text-green-400';
  if (c.includes('red')) return 'text-red-400';
  if (c.includes('yellow')) return 'text-yellow-400';
  if (c.includes('lime')) return 'text-lime-400';
  if (c.includes('fuchsia')) return 'text-fuchsia-400';
  if (c.includes('pink')) return 'text-pink-400';
  return 'text-white/60';
}

export const AGENT_TYPES: AdminAgentType[] = AUDIT_AGENTS
  .filter(a => a.id !== 'audit-host')
  .map(a => ({
    id: a.id,
    name: a.name,
    category: a.category as AuditAgentCategory,
    description: a.description,
    color: gradientToTextColor(a.color),
  }));
