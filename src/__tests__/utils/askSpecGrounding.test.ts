import { describe, expect, it } from 'vitest';
import type { AskChunkSource } from '../../types/askSources';
import {
  ASK_SPEC_REFUSAL,
  answerContainsUncitedSpecClaim,
  applySpecGroundingGuard,
  buildSpecRefusal,
  isAircraftSpecQuery,
} from '../../utils/askSpecGrounding';

function chunk(tag: string, excerpt: string): AskChunkSource {
  return {
    tag,
    kind: 'chunk',
    documentId: 'doc1',
    chunkId: 'c1',
    docName: 'AMM 12-20-00',
    category: 'maintenance_manual',
    chunkIndex: 0,
    totalChunks: 1,
    startChar: 0,
    endChar: 100,
    score: 1,
    excerpt,
  };
}

describe('isAircraftSpecQuery', () => {
  it('flags grease / lubricant questions', () => {
    expect(isAircraftSpecQuery('what grease for the nose gear')).toBe(true);
    expect(isAircraftSpecQuery('Which lubricant on the flap tracks?')).toBe(true);
  });

  it('flags torque and part-number questions', () => {
    expect(isAircraftSpecQuery('torque for cylinder hold-down')).toBe(true);
    expect(isAircraftSpecQuery('alternate PN for the fuel pump')).toBe(true);
    expect(isAircraftSpecQuery('what is the P/N for the filter')).toBe(true);
  });

  it('flags interval / AMM task questions', () => {
    expect(isAircraftSpecQuery('TBO for the propeller')).toBe(true);
    expect(isAircraftSpecQuery('AMM task for landing gear lubrication')).toBe(true);
  });

  it('does not flag general compliance / process questions', () => {
    expect(isAircraftSpecQuery('what does 145.51 require')).toBe(false);
    expect(isAircraftSpecQuery('how should we document a CAR')).toBe(false);
    expect(isAircraftSpecQuery('explain SMS four pillars')).toBe(false);
  });
});

describe('answerContainsUncitedSpecClaim', () => {
  it('blocks uncited product recommendations', () => {
    expect(
      answerContainsUncitedSpecClaim('Use Aeroshell 22 on the nose gear.', []),
    ).toBe(true);
  });

  it('allows the same claim when faithfully cited against an excerpt', () => {
    const sources = [chunk('S1', 'Lubricate with Aeroshell 22 grease per AMM')];
    expect(
      answerContainsUncitedSpecClaim('Use Aeroshell 22 on the nose gear [S1].', sources),
    ).toBe(false);
  });

  it('blocks torque values without a citation', () => {
    expect(
      answerContainsUncitedSpecClaim('Tighten to 45 ft-lb.', []),
    ).toBe(true);
  });

  it('allows FAR / process explanations without tags', () => {
    expect(
      answerContainsUncitedSpecClaim(
        'Per 14 CFR §145.51 the repair station must have a housing suitable for its work.',
        [],
      ),
    ).toBe(false);
  });

  it('does not treat Required Inspection Items as a spec product claim', () => {
    expect(
      answerContainsUncitedSpecClaim(
        'Required Inspection Items must be inspected by authorized personnel.',
        [],
      ),
    ).toBe(false);
  });

  it('blocks MIL-spec grease names without citation', () => {
    expect(
      answerContainsUncitedSpecClaim('Apply MIL-PRF-81322 grease.', []),
    ).toBe(true);
  });
});

describe('applySpecGroundingGuard / buildSpecRefusal', () => {
  it('replaces uncited spec answers with the canned refusal', () => {
    const result = applySpecGroundingGuard('Use Aeroshell 22.', []);
    expect(result.blocked).toBe(true);
    expect(result.content).toBe(ASK_SPEC_REFUSAL);
    expect(result.content.toLowerCase()).not.toContain('aeroshell');
    expect(result.sources).toEqual([]);
  });

  it('keeps faithfully cited answers', () => {
    const sources = [chunk('S1', 'Lubricate with Aeroshell 22 grease')];
    const answer = 'Use Aeroshell 22 [S1].';
    const result = applySpecGroundingGuard(answer, sources);
    expect(result.blocked).toBe(false);
    expect(result.content).toBe(answer);
  });

  it('empty-retrieval refusal never invents a product', () => {
    const refusal = buildSpecRefusal();
    expect(refusal).toBe(ASK_SPEC_REFUSAL);
    expect(refusal.toLowerCase()).not.toMatch(/aeroshell|royco|mobil|grease type/);
  });

  it('adds Drive hint when manuals were not searched', () => {
    const refusal = buildSpecRefusal({ driveUnavailable: true });
    expect(refusal).toContain(ASK_SPEC_REFUSAL);
    expect(refusal.toLowerCase()).toContain('drive');
  });
});
