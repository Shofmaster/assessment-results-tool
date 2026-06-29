/**
 * In-browser vector search core for the Drive-hosted index. Pure and
 * dependency-light so it can run client-side with no Convex involvement:
 *
 *   - splitIntoChunks: chunk extracted text into overlapping spans, recording
 *     startChar/endChar offsets against the NORMALIZED text. These offsets are
 *     what get re-sliced from the live Drive document at answer time, so the
 *     chunker must stay byte-faithful to how the index was built.
 *   - cosineSimilarity / searchVectors: rank stored chunk vectors against a
 *     query vector and return the top-K.
 *
 * Ported from the original server implementation (convex/documentChunks.ts) so
 * existing offset semantics carry over unchanged.
 */
import { normalizeText } from '../../convex/_textUtils';
import { CHUNK_SIZE_CHARS, CHUNK_OVERLAP_CHARS } from '../constants/embedding';

export interface ChunkSpan {
  text: string;
  startChar: number;
  endChar: number;
  chunkIndex: number;
}

/**
 * Split text into overlapping chunks, preferring to break on paragraph / line /
 * sentence boundaries near the target size. Offsets are relative to the
 * normalized text (normalizeText), not the raw input.
 */
export function splitIntoChunks(
  raw: string,
  size = CHUNK_SIZE_CHARS,
  overlap = CHUNK_OVERLAP_CHARS,
): ChunkSpan[] {
  const text = normalizeText(raw);
  if (!text) return [];
  const chunks: ChunkSpan[] = [];
  let start = 0;
  while (start < text.length) {
    const maxEnd = Math.min(start + size, text.length);
    let end = maxEnd;
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', maxEnd);
      const lineBreak = text.lastIndexOf('\n', maxEnd);
      const sentenceBreak = Math.max(
        text.lastIndexOf('. ', maxEnd),
        text.lastIndexOf('? ', maxEnd),
        text.lastIndexOf('! ', maxEnd),
      );
      const candidate = [paragraphBreak, lineBreak, sentenceBreak]
        .filter((idx) => idx > start + Math.floor(size * 0.55))
        .sort((a, b) => b - a)[0];
      if (candidate !== undefined) end = candidate + 1;
    }
    const spanText = text.slice(start, end).trim();
    if (spanText) {
      chunks.push({ text: spanText, startChar: start, endChar: end, chunkIndex: chunks.length });
    }
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

/** Cosine similarity of two equal-length vectors. Returns 0 for degenerate input. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface ScoredEntry<T> {
  entry: T;
  score: number;
}

/**
 * Rank `entries` against `queryVector` by cosine similarity and return the top
 * `topK`. `getVector` extracts the stored vector from each entry. Entries whose
 * vector length differs from the query (e.g. stale dimensions) score 0.
 */
export function searchVectors<T>(
  queryVector: number[],
  entries: readonly T[],
  getVector: (entry: T) => number[],
  topK: number,
): Array<ScoredEntry<T>> {
  const k = Math.max(0, Math.floor(topK));
  if (k === 0 || queryVector.length === 0) return [];
  const scored: Array<ScoredEntry<T>> = [];
  for (const entry of entries) {
    scored.push({ entry, score: cosineSimilarity(queryVector, getVector(entry)) });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}
