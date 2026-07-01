/** Reciprocal rank fusion constant — standard RRF k=60. */
export const RRF_K = 60;

export type SearchMatchType = "semantic" | "keyword" | "both";

export type RankedChunkInput = {
  key: string;
  row: Record<string, unknown>;
  vectorScore?: number;
  keywordRank?: number;
};

export type FusedChunkResult = {
  row: Record<string, unknown>;
  fusionScore: number;
  vectorScore: number;
  keywordRank: number | null;
  matchType: SearchMatchType;
};

/**
 * Fuse vector and keyword ranked lists with reciprocal rank fusion.
 * Each list is ordered best-first; rank is 0-based index in that list.
 */
export function reciprocalRankFusion(
  vectorHits: Array<{ key: string; row: Record<string, unknown>; vectorScore: number }>,
  keywordHits: Array<{ key: string; row: Record<string, unknown> }>,
): FusedChunkResult[] {
  const byKey = new Map<
    string,
    {
      row: Record<string, unknown>;
      fusionScore: number;
      vectorScore: number;
      keywordRank: number | null;
    }
  >();

  for (let rank = 0; rank < vectorHits.length; rank += 1) {
    const hit = vectorHits[rank];
    const existing = byKey.get(hit.key) ?? {
      row: hit.row,
      fusionScore: 0,
      vectorScore: 0,
      keywordRank: null,
    };
    existing.fusionScore += 1 / (RRF_K + rank + 1);
    existing.vectorScore = hit.vectorScore;
    existing.row = hit.row;
    byKey.set(hit.key, existing);
  }

  for (let rank = 0; rank < keywordHits.length; rank += 1) {
    const hit = keywordHits[rank];
    const existing = byKey.get(hit.key) ?? {
      row: hit.row,
      fusionScore: 0,
      vectorScore: 0,
      keywordRank: null,
    };
    existing.fusionScore += 1 / (RRF_K + rank + 1);
    existing.keywordRank = rank + 1;
    existing.row = hit.row;
    byKey.set(hit.key, existing);
  }

  return Array.from(byKey.values())
    .map((entry) => ({
      ...entry,
      matchType:
        entry.vectorScore > 0 && entry.keywordRank !== null
          ? ("both" as const)
          : entry.keywordRank !== null
            ? ("keyword" as const)
            : ("semantic" as const),
    }))
    .sort((a, b) => b.fusionScore - a.fusionScore);
}

export function chunkFusionKey(documentId: string, chunkIndex: number): string {
  return `${documentId}:${chunkIndex}`;
}
