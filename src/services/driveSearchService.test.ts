import { describe, it, expect, vi } from 'vitest';
import { driveDocumentSearch, type DriveSearchDeps, type SearchDocRef } from './driveSearchService';
import {
  createEmptyIndex,
  upsertDocument,
  type DriveVectorIndex,
} from './driveVectorIndex';

function buildIndex(): DriveVectorIndex {
  let idx = createEmptyIndex('p', 'm');
  // Digital doc: two chunks with distinct vectors and offsets.
  idx = upsertDocument(
    idx,
    {
      documentId: 'd1',
      name: 'AMM.pdf',
      source: 'gdrive',
      path: 'drive-d1',
      mimeType: 'application/pdf',
      category: 'maintenance_manual',
      contentHash: 'h1',
      scanned: false,
    },
    [
      { chunkIndex: 0, startChar: 0, endChar: 11, embedding: [1, 0, 0] },
      { chunkIndex: 1, startChar: 12, endChar: 24, embedding: [0, 1, 0] },
    ],
  );
  // Scanned doc: offsets unreliable.
  idx = upsertDocument(
    idx,
    {
      documentId: 'd2',
      name: 'scan.pdf',
      source: 'gdrive',
      path: 'drive-d2',
      mimeType: 'application/pdf',
      category: 'regulatory',
      contentHash: 'h2',
      scanned: true,
    },
    [{ chunkIndex: 0, startChar: 0, endChar: 5, embedding: [0, 0, 1] }],
  );
  return idx;
}

function makeDeps(overrides: Partial<DriveSearchDeps> = {}): DriveSearchDeps {
  return {
    loadIndex: async () => buildIndex(),
    embedQuery: async () => [1, 0, 0],
    readDocumentText: async (ref: SearchDocRef) =>
      ref.documentId === 'd1' ? 'first chunk.. second chunk' : 'SCANNED FULL TEXT',
    ...overrides,
  };
}

describe('driveDocumentSearch', () => {
  it('returns empty for a blank query without touching the index', async () => {
    const loadIndex = vi.fn();
    const res = await driveDocumentSearch({ query: '  ' }, makeDeps({ loadIndex }));
    expect(res).toEqual({ chunks: [], documents: [] });
    expect(loadIndex).not.toHaveBeenCalled();
  });

  it('returns empty when no index exists yet', async () => {
    const res = await driveDocumentSearch({ query: 'oil' }, makeDeps({ loadIndex: async () => null }));
    expect(res.chunks).toEqual([]);
  });

  it('slices digital-doc passages from re-fetched text by offset', async () => {
    const res = await driveDocumentSearch({ query: 'first', topK: 1 }, makeDeps());
    expect(res.chunks).toHaveLength(1);
    const hit = res.chunks[0];
    expect(hit.documentId).toBe('d1');
    // normalizeText('first chunk.. second chunk').slice(0,11) === 'first chunk'
    expect(hit.text).toBe('first chunk');
    expect(hit.chunkId).toBe('d1:0');
    expect(hit.totalChunks).toBe(2);
  });

  it('emits a bounded full-doc passage for scanned docs instead of slicing', async () => {
    const res = await driveDocumentSearch({ query: 'scan', topK: 1 }, makeDeps({ embedQuery: async () => [0, 0, 1] }));
    expect(res.chunks).toHaveLength(1);
    expect(res.chunks[0].documentId).toBe('d2');
    expect(res.chunks[0].text).toBe('SCANNED FULL TEXT');
    expect(res.chunks[0].startChar).toBe(0);
  });

  it('drops hits whose source text cannot be read', async () => {
    const res = await driveDocumentSearch(
      { query: 'first', topK: 2 },
      makeDeps({
        readDocumentText: async () => {
          throw new Error('source unavailable');
        },
      }),
    );
    expect(res.chunks).toEqual([]);
  });

  it('includes bounded full documents when requested', async () => {
    const res = await driveDocumentSearch(
      { query: 'first', topK: 1, includeFullDocuments: true },
      makeDeps(),
    );
    expect(res.documents).toHaveLength(1);
    expect(res.documents[0].documentId).toBe('d1');
    expect(res.documents[0].text).toContain('first chunk');
  });

  it('respects category filtering', async () => {
    const res = await driveDocumentSearch(
      { query: 'anything', topK: 5, categories: ['regulatory'] },
      makeDeps({ embedQuery: async () => [0, 0, 1] }),
    );
    expect(res.chunks.every((c) => c.category === 'regulatory')).toBe(true);
  });
});
