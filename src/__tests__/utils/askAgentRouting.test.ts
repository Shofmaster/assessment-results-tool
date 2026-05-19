import { describe, expect, it } from 'vitest';
import { AUDIT_AGENTS } from '../../data/auditAgentDefinitions';
import {
  ASK_AGENT_MAX_AUTO_ROSTER,
  buildRoutingQueryText,
  fallbackSuggestedAgents,
  mergeAutoRoutedAgents,
  pickSuggestedAgents,
  queryIncludes,
  resolveRoutedAgentsForAsk,
  resolveSuggestedAgents,
  scoreAllAskAgents,
  type AskAgentEntityContext,
} from '../../utils/askAgentRouting';

const emptyEntity: AskAgentEntityContext = {
  selectedPerspective: 'generic',
  faaParts: [],
};

const part145Entity: AskAgentEntityContext = {
  selectedPerspective: 'generic',
  faaParts: ['145'],
};

describe('queryIncludes', () => {
  it('uses word boundaries for short numeric tokens', () => {
    expect(queryIncludes('part 135 charter', '135')).toBe(true);
    expect(queryIncludes('serial 2135', '135')).toBe(false);
  });
});

describe('buildRoutingQueryText', () => {
  it('combines current query with recent user turns', () => {
    const text = buildRoutingQueryText('follow up on mel', ['what is our MEL policy?'], 3);
    expect(text).toContain('mel policy');
    expect(text).toContain('follow up');
  });

  it('uses chat history when input is empty after submit', () => {
    const text = buildRoutingQueryText('', ['part 145 repair station manual'], 3);
    expect(text).toContain('part 145');
  });

  it('does not duplicate identical current and last message', () => {
    const text = buildRoutingQueryText('part 145', ['part 145'], 3);
    expect(text.match(/part 145/g)?.length).toBe(1);
  });
});

describe('resolveSuggestedAgents', () => {
  it('routes FAA part 145 queries to FAA inspector', () => {
    const agents = resolveSuggestedAgents('part 145 repair station', emptyEntity);
    expect(agents.map((a) => a.id)).toContain('faa-inspector');
  });

  it('routes DCT traceability queries to DCT specialist', () => {
    const agents = resolveSuggestedAgents('dct traceability mapping', emptyEntity);
    expect(agents[0]?.id).toBe('faa-dct-traceability');
  });

  it('does not return arbitrary top-3 when query has no signal', () => {
    const agents = resolveSuggestedAgents('hi', emptyEntity);
    expect(agents.length).toBeLessThanOrEqual(1);
  });

  it('uses entity fallback for configured part 145 scope', () => {
    const agents = resolveSuggestedAgents('', part145Entity);
    expect(agents.map((a) => a.id)).toContain('faa-inspector');
  });
});

describe('pickSuggestedAgents', () => {
  it('requires minimum score', () => {
    const scored = scoreAllAskAgents('zzz unknown topic', emptyEntity);
    const picked = pickSuggestedAgents(scored, { minScore: 5 });
    expect(picked).toHaveLength(0);
  });
});

describe('mergeAutoRoutedAgents', () => {
  it('caps merged roster size', () => {
    const suggested = resolveSuggestedAgents('faa easa isbao sms quality supply chain', emptyEntity);
    const merged = mergeAutoRoutedAgents(suggested, ['nasa-auditor'], AUDIT_AGENTS, ASK_AGENT_MAX_AUTO_ROSTER);
    expect(merged.length).toBeLessThanOrEqual(ASK_AGENT_MAX_AUTO_ROSTER);
    expect(merged.some((a) => a.id === 'nasa-auditor')).toBe(true);
  });

  it('keeps pinned experts first', () => {
    const suggested = resolveSuggestedAgents('part 145', emptyEntity);
    const merged = mergeAutoRoutedAgents(suggested, ['sms-consultant'], AUDIT_AGENTS);
    expect(merged[0]?.id).toBe('sms-consultant');
  });
});

describe('resolveRoutedAgentsForAsk', () => {
  it('manual mode ignores query changes', () => {
    const routed = resolveRoutedAgentsForAsk({
      manual: true,
      pickedIds: ['easa-inspector'],
      pinnedIds: [],
      routingQuery: 'part 145 faa',
      entity: emptyEntity,
    });
    expect(routed.map((a) => a.id)).toEqual(['easa-inspector']);
  });

  it('auto mode stays on topic for follow-up via routing history', () => {
    const routingQuery = buildRoutingQueryText('', ['what does our MEL say about deferrals?'], 3);
    const routed = resolveRoutedAgentsForAsk({
      manual: false,
      pickedIds: [],
      pinnedIds: [],
      routingQuery,
      entity: emptyEntity,
    });
    expect(routed.length).toBeGreaterThan(0);
  });
});

describe('fallbackSuggestedAgents', () => {
  it('prefers configured paperwork perspective', () => {
    const agents = fallbackSuggestedAgents({
      selectedPerspective: 'as9100-auditor',
      faaParts: [],
    });
    expect(agents[0]?.id).toBe('as9100-auditor');
  });
});
