/**
 * Browser client for the authenticated /api/rerank proxy.
 */

export type RerankResult = {
  index: number;
  relevanceScore: number;
};

const sessionCache = new Map<string, RerankResult[]>();
const MAX_CACHE = 100;

function cacheKey(query: string, documents: string[], topK?: number): string {
  const docHash = documents.map((d) => d.length).join(',');
  return `${query}::${docHash}::${topK ?? 'all'}`;
}

/**
 * Rerank document passages for a query. Returns indices into the input `documents`
 * array sorted by relevance (best first). On failure, returns null so callers
 * can fall back to fusion order.
 */
export async function rerankPassages(
  query: string,
  documents: string[],
  topK?: number,
): Promise<RerankResult[] | null> {
  const trimmed = query.trim();
  if (!trimmed || documents.length === 0) return [];

  const key = cacheKey(trimmed, documents, topK);
  const cached = sessionCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch('/api/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: trimmed, documents, topK }),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { results?: RerankResult[] };
    const results = Array.isArray(payload.results) ? payload.results : [];
    if (sessionCache.size >= MAX_CACHE) {
      const first = sessionCache.keys().next().value;
      if (first) sessionCache.delete(first);
    }
    sessionCache.set(key, results);
    return results;
  } catch {
    return null;
  }
}

/** Apply rerank scores to chunks; returns reordered chunks with updated score field. */
export function applyRerankToChunks<T extends { text: string; score: number }>(
  chunks: T[],
  rerankResults: RerankResult[] | null,
): Array<T & { rerankScore?: number }> {
  if (!rerankResults || rerankResults.length === 0) return chunks;
  const reranked: Array<T & { rerankScore?: number }> = [];
  const used = new Set<number>();
  for (const hit of rerankResults) {
    const idx = hit.index;
    if (idx < 0 || idx >= chunks.length || used.has(idx)) continue;
    used.add(idx);
    reranked.push({
      ...chunks[idx],
      score: hit.relevanceScore,
      rerankScore: hit.relevanceScore,
    });
  }
  for (let i = 0; i < chunks.length; i += 1) {
    if (!used.has(i)) reranked.push(chunks[i]);
  }
  return reranked;
}
