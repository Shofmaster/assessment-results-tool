import { AUDIT_AGENTS } from '../data/auditAgentDefinitions';
import type { AuditAgent, AuditAgentId } from '../types/auditSimulation';

/** Context from paperwork-review perspective and latest audit simulation. */
export type AskAgentEntityContext = {
  selectedPerspective: string;
  faaParts: string[];
  publicUseEntityType?: string;
  publicUseFocus?: string;
};

export type ScoredAskAgent = { agent: AuditAgent; score: number };

export const ASK_AGENT_MIN_SCORE = 1;
export const ASK_AGENT_MAX_SUGGESTED = 3;
export const ASK_AGENT_MAX_AUTO_ROSTER = 4;
export const ASK_AGENT_ROUTING_HISTORY_TURNS = 3;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary match for short tokens; substring for longer phrases. */
export function queryIncludes(text: string, phrase: string): boolean {
  const lower = text.toLowerCase();
  const p = phrase.toLowerCase();
  if (p.length <= 4) {
    return new RegExp(`\\b${escapeRegExp(p)}\\b`, 'i').test(lower);
  }
  return lower.includes(p);
}

/**
 * Build scoring text from the current input plus recent user turns (newest last).
 * Keeps follow-up routing stable after the input box is cleared post-submit.
 */
export function buildRoutingQueryText(
  currentQuery: string,
  recentUserMessages: string[],
  maxMessages = ASK_AGENT_ROUTING_HISTORY_TURNS,
): string {
  const parts = recentUserMessages
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(-maxMessages);
  const current = currentQuery.trim();
  if (current) {
    const last = parts[parts.length - 1];
    if (last?.toLowerCase() !== current.toLowerCase()) {
      parts.push(current);
    }
  }
  return parts.join(' ').trim().toLowerCase();
}

export function scoreAskAgent(agent: AuditAgent, normalizedQuery: string, entity: AskAgentEntityContext): number {
  if (!normalizedQuery) {
    return scoreEntityBiasOnly(agent, entity);
  }

  const haystack = `${agent.name} ${agent.role} ${agent.id} ${agent.description || ''}`.toLowerCase();
  let score = 0;

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.length < 3) continue;
    if (haystack.includes(token)) score += 2;
  }

  // Regulatory / framework phrases
  if (queryIncludes(normalizedQuery, 'faa') && agent.id === 'faa-inspector') score += 4;
  if (queryIncludes(normalizedQuery, 'easa') && agent.id === 'easa-inspector') score += 4;
  if ((queryIncludes(normalizedQuery, 'isbao') || queryIncludes(normalizedQuery, 'is-bao')) && agent.id === 'isbao-auditor')
    score += 4;
  if (queryIncludes(normalizedQuery, 'nasa') && agent.id === 'nasa-auditor') score += 4;
  if (
    (queryIncludes(normalizedQuery, 'argus') || queryIncludes(normalizedQuery, 'wyvern')) &&
    agent.id === 'safety-auditor'
  )
    score += 3;
  if (
    queryIncludes(normalizedQuery, 'third-party safety') &&
    agent.id === 'safety-auditor'
  )
    score += 4;
  if (
    (queryIncludes(normalizedQuery, 'sms') || normalizedQuery.includes('safety management')) &&
    agent.id === 'sms-consultant'
  )
    score += 4;
  if (
    (queryIncludes(normalizedQuery, 'as9100') || queryIncludes(normalizedQuery, 'qms') || queryIncludes(normalizedQuery, 'iso 9001')) &&
    agent.id === 'as9100-auditor'
  )
    score += 4;
  if (queryIncludes(normalizedQuery, 'quality') && !normalizedQuery.includes('quality manager') && agent.id === 'as9100-auditor')
    score += 3;
  if (
    (queryIncludes(normalizedQuery, '145') ||
      queryIncludes(normalizedQuery, 'part 145') ||
      normalizedQuery.includes('repair station')) &&
    agent.id === 'faa-inspector'
  )
    score += 4;
  if (
    (queryIncludes(normalizedQuery, '8900') ||
      queryIncludes(normalizedQuery, 'fsims') ||
      normalizedQuery.includes('principal inspector') ||
      queryIncludes(normalizedQuery, 'poi') ||
      queryIncludes(normalizedQuery, 'pmi') ||
      queryIncludes(normalizedQuery, 'pai') ||
      queryIncludes(normalizedQuery, 'sas')) &&
    agent.id === 'faa-principal-inspector'
  )
    score += 5;
  if (
    (queryIncludes(normalizedQuery, 'dct') ||
      normalizedQuery.includes('traceability') ||
      normalizedQuery.includes('design compliance')) &&
    agent.id === 'faa-dct-traceability'
  )
    score += 5;
  if (
    (queryIncludes(normalizedQuery, 'part 91') || queryIncludes(normalizedQuery, 'part91')) &&
    (agent.id === 'faa-inspector' || agent.id === 'isbao-auditor')
  )
    score += 3;
  if (
    (queryIncludes(normalizedQuery, 'part 135') ||
      queryIncludes(normalizedQuery, '135') ||
      normalizedQuery.includes('charter') ||
      normalizedQuery.includes('air carrier')) &&
    agent.id === 'faa-inspector'
  )
    score += 3;
  if (queryIncludes(normalizedQuery, 'part 121') && agent.id === 'faa-inspector') score += 3;
  if (
    (normalizedQuery.includes('public use') ||
      normalizedQuery.includes('government aircraft') ||
      normalizedQuery.includes('law enforcement') ||
      normalizedQuery.includes('fire rescue')) &&
    agent.id === 'public-use-auditor'
  )
    score += 6;
  if (
    (normalizedQuery.includes('supply chain') ||
      normalizedQuery.includes('supplier') ||
      normalizedQuery.includes('vendor') ||
      normalizedQuery.includes('counterfeit')) &&
    agent.id === 'supply-chain-auditor'
  )
    score += 4;
  if (queryIncludes(normalizedQuery, 'nadcap') && agent.id === 'nadcap-auditor') score += 5;
  if (
    (queryIncludes(normalizedQuery, 'do-178') ||
      queryIncludes(normalizedQuery, 'do178') ||
      normalizedQuery.includes('software')) &&
    agent.id === 'do178c-auditor'
  )
    score += 4;
  if (
    (queryIncludes(normalizedQuery, 'do-254') || queryIncludes(normalizedQuery, 'do254')) &&
    agent.id === 'do254-auditor'
  )
    score += 4;
  if (queryIncludes(normalizedQuery, 'cyber') && agent.id === 'cybersecurity-auditor') score += 4;
  if (
    (queryIncludes(normalizedQuery, 'uas') || queryIncludes(normalizedQuery, 'evtol') || queryIncludes(normalizedQuery, 'drone')) &&
    agent.id === 'uas-evtol-auditor'
  )
    score += 4;
  if (
    (normalizedQuery.includes('calibration') || normalizedQuery.includes('laboratory') || queryIncludes(normalizedQuery, 'test lab')) &&
    agent.id === 'laboratory-auditor'
  )
    score += 4;
  if (
    (normalizedQuery.includes('airworthiness') || normalizedQuery.includes('type certificate') || normalizedQuery.includes('production approval')) &&
    agent.id === 'airworthiness-auditor'
  )
    score += 4;
  if (
    (normalizedQuery.includes('audit intelligence') || normalizedQuery.includes('cross-audit') || normalizedQuery.includes('learned pattern')) &&
    agent.id === 'audit-intelligence-analyst'
  )
    score += 4;

  // Entity personas
  if (
    (normalizedQuery.includes('shop owner') ||
      normalizedQuery.includes('certificate holder') ||
      normalizedQuery.includes('accountable manager')) &&
    agent.id === 'shop-owner'
  )
    score += 5;
  if (
    (normalizedQuery.includes('director of maintenance') ||
      normalizedQuery.includes('maintenance manager') ||
      queryIncludes(normalizedQuery, 'dom')) &&
    agent.id === 'dom-maintenance-manager'
  )
    score += 5;
  if (
    (normalizedQuery.includes('chief inspector') ||
      normalizedQuery.includes('quality manager') ||
      queryIncludes(normalizedQuery, 'qm ')) &&
    agent.id === 'chief-inspector-quality-manager'
  )
    score += 5;
  if (normalizedQuery.includes('safety manager') && agent.id === 'entity-safety-manager') score += 5;
  if (
    (normalizedQuery.includes('general manager') || queryIncludes(normalizedQuery, 'gm ')) &&
    agent.id === 'general-manager'
  )
    score += 4;

  score += scoreEntityBiasOnly(agent, entity);
  return score;
}

function scoreEntityBiasOnly(agent: AuditAgent, entity: AskAgentEntityContext): number {
  let score = 0;
  if (entity.selectedPerspective && entity.selectedPerspective !== 'generic' && entity.selectedPerspective === agent.id) {
    score += 4;
  }
  if (entity.faaParts.includes('145') && agent.id === 'faa-inspector') score += 3;
  if (entity.faaParts.includes('91') && (agent.id === 'faa-inspector' || agent.id === 'isbao-auditor')) score += 2;
  if (entity.faaParts.includes('135') && agent.id === 'faa-inspector') score += 2;
  if (entity.faaParts.includes('121') && agent.id === 'faa-inspector') score += 2;
  if (entity.selectedPerspective === 'public-use-auditor' && agent.id === 'public-use-auditor') score += 3;
  if (entity.publicUseEntityType && agent.id === 'public-use-auditor') score += 3;
  return score;
}

export function scoreAllAskAgents(
  normalizedQuery: string,
  entity: AskAgentEntityContext,
  agents: AuditAgent[] = AUDIT_AGENTS,
): ScoredAskAgent[] {
  return agents
    .map((agent) => ({ agent, score: scoreAskAgent(agent, normalizedQuery, entity) }))
    .sort((a, b) => b.score - a.score || a.agent.name.localeCompare(b.agent.name));
}

export function pickSuggestedAgents(
  scored: ScoredAskAgent[],
  options?: { minScore?: number; maxCount?: number },
): AuditAgent[] {
  const minScore = options?.minScore ?? ASK_AGENT_MIN_SCORE;
  const maxCount = options?.maxCount ?? ASK_AGENT_MAX_SUGGESTED;
  const qualified = scored.filter((entry) => entry.score >= minScore);
  return qualified.slice(0, maxCount).map((entry) => entry.agent);
}

/** Explicit fallback when no query/heuristic clears the score threshold. */
export function fallbackSuggestedAgents(
  entity: AskAgentEntityContext,
  agents: AuditAgent[] = AUDIT_AGENTS,
): AuditAgent[] {
  const ids: AuditAgentId[] = [];
  const push = (id: AuditAgentId) => {
    if (!ids.includes(id) && agents.some((a) => a.id === id)) ids.push(id);
  };

  if (entity.selectedPerspective && entity.selectedPerspective !== 'generic') {
    push(entity.selectedPerspective as AuditAgentId);
  }
  if (entity.faaParts.includes('145')) push('faa-inspector');
  if (entity.faaParts.includes('135')) push('faa-inspector');
  if (entity.faaParts.includes('121')) push('faa-inspector');
  if (entity.faaParts.includes('91')) {
    push('faa-inspector');
    push('isbao-auditor');
  }
  if (entity.publicUseEntityType || entity.selectedPerspective === 'public-use-auditor') {
    push('public-use-auditor');
  }

  const resolved = ids
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is AuditAgent => Boolean(a));
  if (resolved.length > 0) return resolved.slice(0, ASK_AGENT_MAX_SUGGESTED);

  const inspector = agents.find((a) => a.id === 'faa-inspector');
  return inspector ? [inspector] : agents.slice(0, 1);
}

export function resolveSuggestedAgents(
  routingQuery: string,
  entity: AskAgentEntityContext,
  agents: AuditAgent[] = AUDIT_AGENTS,
): AuditAgent[] {
  const scored = scoreAllAskAgents(routingQuery, entity, agents);
  const picked = pickSuggestedAgents(scored);
  if (picked.length > 0) return picked;
  return fallbackSuggestedAgents(entity, agents);
}

/** Auto mode: pinned experts first, then top suggestions, capped. */
export function mergeAutoRoutedAgents(
  suggested: AuditAgent[],
  pinnedIds: AuditAgentId[],
  agents: AuditAgent[] = AUDIT_AGENTS,
  maxRoster = ASK_AGENT_MAX_AUTO_ROSTER,
): AuditAgent[] {
  const mergedIds: AuditAgentId[] = [];
  const seen = new Set<string>();

  for (const id of pinnedIds) {
    if (seen.has(id)) continue;
    if (!agents.some((a) => a.id === id)) continue;
    seen.add(id);
    mergedIds.push(id);
  }
  for (const agent of suggested) {
    if (seen.has(agent.id)) continue;
    seen.add(agent.id);
    mergedIds.push(agent.id);
  }

  return mergedIds
    .slice(0, maxRoster)
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is AuditAgent => Boolean(a));
}

export function resolveManualRoutedAgents(
  pickedIds: AuditAgentId[],
  agents: AuditAgent[] = AUDIT_AGENTS,
): AuditAgent[] {
  return pickedIds
    .map((id) => agents.find((a) => a.id === id))
    .filter((a): a is AuditAgent => Boolean(a));
}

export function resolveRoutedAgentsForAsk(args: {
  manual: boolean;
  pickedIds: AuditAgentId[];
  pinnedIds: AuditAgentId[];
  routingQuery: string;
  entity: AskAgentEntityContext;
  agents?: AuditAgent[];
}): AuditAgent[] {
  const agents = args.agents ?? AUDIT_AGENTS;
  if (args.manual) {
    return resolveManualRoutedAgents(args.pickedIds, agents);
  }
  const suggested = resolveSuggestedAgents(args.routingQuery, args.entity, agents);
  return mergeAutoRoutedAgents(suggested, args.pinnedIds, agents);
}
