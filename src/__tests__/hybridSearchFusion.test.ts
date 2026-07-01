import { describe, expect, it } from 'vitest';
import { reciprocalRankFusion, chunkFusionKey } from '../../convex/lib/hybridSearchFusion';

describe('reciprocalRankFusion', () => {
  it('ranks items appearing in both lists higher than single-list hits', () => {
    const rowA = { documentId: 'd1', chunkIndex: 0, text: 'AD 2020-01-01' };
    const rowB = { documentId: 'd2', chunkIndex: 0, text: 'other' };
    const fused = reciprocalRankFusion(
      [
        { key: chunkFusionKey('d1', 0), row: rowA, vectorScore: 0.7 },
        { key: chunkFusionKey('d2', 0), row: rowB, vectorScore: 0.9 },
      ],
      [{ key: chunkFusionKey('d1', 0), row: rowA }],
    );
    expect(fused[0].row).toEqual(rowA);
    expect(fused[0].matchType).toBe('both');
    expect(fused[1].matchType).toBe('semantic');
  });

  it('returns keyword-only hits when vector list is empty', () => {
    const row = { documentId: 'd3', chunkIndex: 2, text: '14 CFR 145.211' };
    const fused = reciprocalRankFusion(
      [],
      [{ key: chunkFusionKey('d3', 2), row }],
    );
    expect(fused).toHaveLength(1);
    expect(fused[0].matchType).toBe('keyword');
    expect(fused[0].keywordRank).toBe(1);
  });
});
