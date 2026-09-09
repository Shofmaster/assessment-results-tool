import { describe, expect, it } from 'vitest';
import {
  applyCitationFaithfulness,
  claimWindowBeforeTag,
  listItemClaimWindow,
  scoreClaimExcerptOverlap,
} from '../../utils/askCitationFaithfulness';
import type { AskChunkSource } from '../../types/askSources';

function chunk(tag: string, excerpt: string): AskChunkSource {
  return {
    tag,
    kind: 'chunk',
    documentId: 'doc1',
    chunkId: 'c1',
    docName: 'GMM',
    category: 'entity',
    chunkIndex: 0,
    totalChunks: 1,
    startChar: 0,
    endChar: 100,
    score: 1,
    excerpt,
  };
}

describe('scoreClaimExcerptOverlap', () => {
  it('scores high when claim and excerpt share tokens', () => {
    const score = scoreClaimExcerptOverlap(
      'Tooling must be calibrated annually',
      'All tooling shall be calibrated on an annual basis',
    );
    expect(score).toBeGreaterThan(0.15);
  });

  it('scores near zero for unrelated text', () => {
    const score = scoreClaimExcerptOverlap(
      'Landing gear retraction tests are required',
      'Hazardous materials shipping labels must be affixed',
    );
    expect(score).toBeLessThan(0.12);
  });
});

describe('claimWindowBeforeTag', () => {
  it('uses the sentence before the tag', () => {
    const answer = 'First sentence. Calibration is annual [S1].';
    const idx = answer.indexOf('[S1]');
    expect(claimWindowBeforeTag(answer, idx)).toContain('Calibration is annual');
  });
});

describe('listItemClaimWindow', () => {
  it('returns the full numbered step text', () => {
    const answer = 'Intro.\n1. Verify MEL relief for the item [S2].\nDone.';
    const idx = answer.indexOf('[S2]');
    expect(listItemClaimWindow(answer, idx)).toBe('Verify MEL relief for the item');
  });
});

describe('applyCitationFaithfulness', () => {
  it('strips weak citation tags and flags under-cited answers', () => {
    const sources = [chunk('S1', 'Hazardous materials shipping labels must be affixed')];
    const result = applyCitationFaithfulness(
      'Landing gear retraction tests are required [S1].',
      sources,
    );
    expect(result.demotedTags).toContain('S1');
    expect(result.content).not.toContain('[S1]');
    expect(result.underCited).toBe(true);
    expect(result.citedCount).toBe(0);
  });

  it('keeps faithful citations', () => {
    const sources = [chunk('S1', 'Tooling shall be calibrated annually per the quality manual')];
    const result = applyCitationFaithfulness(
      'Tooling must be calibrated annually [S1].',
      sources,
    );
    expect(result.demotedTags).toHaveLength(0);
    expect(result.content).toContain('[S1]');
    expect(result.underCited).toBe(false);
    expect(result.citedCount).toBe(1);
  });

  it('keeps trailing tags on short numbered steps that name the same doc/ATA', () => {
    const sources = [
      chunk('S1', 'MEL Item 32-40-01 Landing gear position indication. Repair category B.'),
    ];
    sources[0].docName = 'Aircraft MEL';
    const result = applyCitationFaithfulness(
      '1. Check MEL 32-40-01 landing gear indication [S1].\n2. Defer per category B if required [S1].',
      sources,
    );
    expect(result.content).toContain('[S1]');
    expect(result.demotedTags).not.toContain('S1');
  });
});
