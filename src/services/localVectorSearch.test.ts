import { describe, it, expect } from 'vitest';
import { normalizeText } from '../../convex/_textUtils';
import { splitIntoChunks, cosineSimilarity, searchVectors } from './localVectorSearch';

describe('splitIntoChunks', () => {
  it('returns no chunks for empty / whitespace-only text', () => {
    expect(splitIntoChunks('')).toEqual([]);
    expect(splitIntoChunks('   \n\t ')).toEqual([]);
  });

  it('returns a single chunk for text under the chunk size', () => {
    const chunks = splitIntoChunks('A short manual passage.', 1200, 200);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].chunkIndex).toBe(0);
    expect(chunks[0].text).toBe('A short manual passage.');
  });

  it('produces offsets that slice back to the chunk text against normalized input', () => {
    const raw = 'Para one sentence. Another sentence here.\n\nSecond paragraph follows with more words.';
    const normalized = normalizeText(raw);
    const chunks = splitIntoChunks(raw, 40, 10);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      // The stored offsets must reproduce the chunk text from the normalized form.
      expect(normalized.slice(c.startChar, c.endChar).trim()).toBe(c.text);
    }
  });

  it('overlaps consecutive chunks by roughly the overlap amount', () => {
    const raw = 'word '.repeat(400); // 2000 chars, no sentence breaks
    const chunks = splitIntoChunks(raw, 500, 100);
    expect(chunks.length).toBeGreaterThan(1);
    // Each subsequent chunk should start before the previous one ended.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].startChar).toBeLessThan(chunks[i - 1].endChar);
    }
  });

  it('assigns sequential chunk indexes', () => {
    const raw = 'sentence. '.repeat(300);
    const chunks = splitIntoChunks(raw, 300, 50);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });
});

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('is -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1, 6);
  });

  it('returns 0 for mismatched lengths or empty / zero vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('searchVectors', () => {
  const entries = [
    { id: 'a', vec: [1, 0, 0] },
    { id: 'b', vec: [0, 1, 0] },
    { id: 'c', vec: [0.9, 0.1, 0] },
  ];

  it('ranks by cosine similarity and respects topK', () => {
    const top = searchVectors([1, 0, 0], entries, (e) => e.vec, 2);
    expect(top).toHaveLength(2);
    expect(top[0].entry.id).toBe('a');
    expect(top[1].entry.id).toBe('c');
    expect(top[0].score).toBeGreaterThan(top[1].score);
  });

  it('returns [] for topK 0 or an empty query vector', () => {
    expect(searchVectors([1, 0, 0], entries, (e) => e.vec, 0)).toEqual([]);
    expect(searchVectors([], entries, (e) => e.vec, 5)).toEqual([]);
  });

  it('scores entries with mismatched vector length as 0', () => {
    const mixed = [
      { id: 'good', vec: [1, 0, 0] },
      { id: 'stale', vec: [1, 0] },
    ];
    const top = searchVectors([1, 0, 0], mixed, (e) => e.vec, 2);
    expect(top[0].entry.id).toBe('good');
    expect(top[1].score).toBe(0);
  });
});
