import { describe, it, expect } from 'vitest';
import { AUDIT_AGENTS } from '../../services/auditAgents';

describe('AUDIT_AGENTS registry', () => {
  it('contains at least 10 agents', () => {
    expect(AUDIT_AGENTS.length).toBeGreaterThanOrEqual(10);
  });

  it('has unique ids', () => {
    const ids = AUDIT_AGENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every agent has required fields', () => {
    for (const agent of AUDIT_AGENTS) {
      expect(agent.id).toBeTruthy();
      expect(typeof agent.id).toBe('string');
      expect(agent.name).toBeTruthy();
      expect(typeof agent.name).toBe('string');
      expect(agent.role).toBeTruthy();
      expect(typeof agent.role).toBe('string');
      expect(agent.avatar).toBeTruthy();
      expect(agent.color).toBeTruthy();
    }
  });

  it('includes known agent ids', () => {
    const ids = AUDIT_AGENTS.map((a) => a.id);
    const expected = [
      'faa-inspector',
      'shop-owner',
      'dom-maintenance-manager',
      'chief-inspector-quality-manager',
      'entity-safety-manager',
      'general-manager',
      'isbao-auditor',
      'easa-inspector',
      'as9100-auditor',
      'sms-consultant',
    ];
    for (const id of expected) {
      expect(ids).toContain(id);
    }
  });

  it('each agent name is human-readable (not empty, not just an id)', () => {
    for (const agent of AUDIT_AGENTS) {
      expect(agent.name.length).toBeGreaterThan(2);
      expect(agent.name).not.toBe(agent.id);
    }
  });
});
