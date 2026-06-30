import { describe, it, expect } from 'vitest';
import {
  INDEX_VERSION,
  createEmptyIndex,
  upsertDocument,
  removeDocument,
  isDocumentStale,
  serializeIndex,
  parseIndex,
  loadIndex,
  saveIndex,
  searchIndex,
  indexFileName,
  type DriveIndexIO,
  type DriveVectorIndex,
} from './driveVectorIndex';
import { EMBEDDING_DIMENSIONS } from '../constants/embedding';

function docMeta(id: string, extra: Partial<Parameters<typeof upsertDocument>[1]> = {}) {
  return {
    documentId: id,
    name: `${id}.pdf`,
    source: 'gdrive' as const,
    path: `drive-file-${id}`,
    mimeType: 'application/pdf',
    category: 'maintenance_manual',
    contentHash: `hash-${id}`,
    scanned: false,
    ...extra,
  };
}

function chunk(i: number, embedding: number[]) {
  return { chunkIndex: i, startChar: i * 100, endChar: i * 100 + 80, embedding };
}

describe('createEmptyIndex', () => {
  it('creates a versioned, empty index for the project', () => {
    const idx = createEmptyIndex('proj1', 'voyage-3.5-lite');
    expect(idx.version).toBe(INDEX_VERSION);
    expect(idx.projectId).toBe('proj1');
    expect(idx.dimension).toBe(EMBEDDING_DIMENSIONS);
    expect(idx.documents).toEqual([]);
    expect(idx.chunks).toEqual([]);
  });
});

describe('indexFileName', () => {
  it('is per-project', () => {
    expect(indexFileName('abc123')).toBe('abc123.aqv.json');
  });
});

describe('upsertDocument', () => {
  it('adds a document and its chunks with a correct chunkCount', () => {
    let idx = createEmptyIndex('p', 'm');
    idx = upsertDocument(idx, docMeta('d1'), [chunk(0, [1, 0]), chunk(1, [0, 1])]);
    expect(idx.documents).toHaveLength(1);
    expect(idx.documents[0].chunkCount).toBe(2);
    expect(idx.chunks).toHaveLength(2);
    expect(idx.chunks.every((c) => c.documentId === 'd1')).toBe(true);
  });

  it('replaces existing chunks for the same document (idempotent re-index)', () => {
    let idx = createEmptyIndex('p', 'm');
    idx = upsertDocument(idx, docMeta('d1'), [chunk(0, [1, 0]), chunk(1, [0, 1])]);
    idx = upsertDocument(idx, docMeta('d1', { contentHash: 'hash-d1-v2' }), [chunk(0, [1, 1])]);
    expect(idx.documents).toHaveLength(1);
    expect(idx.documents[0].contentHash).toBe('hash-d1-v2');
    expect(idx.documents[0].chunkCount).toBe(1);
    expect(idx.chunks).toHaveLength(1);
  });

  it('does not mutate the input index', () => {
    const idx = createEmptyIndex('p', 'm');
    const next = upsertDocument(idx, docMeta('d1'), [chunk(0, [1, 0])]);
    expect(idx.documents).toHaveLength(0);
    expect(next).not.toBe(idx);
  });
});

describe('removeDocument', () => {
  it('drops a document and its chunks but leaves others', () => {
    let idx = createEmptyIndex('p', 'm');
    idx = upsertDocument(idx, docMeta('d1'), [chunk(0, [1, 0])]);
    idx = upsertDocument(idx, docMeta('d2'), [chunk(0, [0, 1])]);
    idx = removeDocument(idx, 'd1');
    expect(idx.documents.map((d) => d.documentId)).toEqual(['d2']);
    expect(idx.chunks.every((c) => c.documentId === 'd2')).toBe(true);
  });
});

describe('isDocumentStale', () => {
  it('is true when the document is missing or the hash changed', () => {
    let idx = createEmptyIndex('p', 'm');
    idx = upsertDocument(idx, docMeta('d1'), [chunk(0, [1, 0])]);
    expect(isDocumentStale(idx, 'd1', 'hash-d1')).toBe(false);
    expect(isDocumentStale(idx, 'd1', 'different')).toBe(true);
    expect(isDocumentStale(idx, 'missing', 'whatever')).toBe(true);
  });
});

describe('serializeIndex / parseIndex', () => {
  it('round-trips through JSON', () => {
    let idx = createEmptyIndex('p', 'voyage-3.5-lite');
    idx = upsertDocument(idx, docMeta('d1'), [chunk(0, [0.123456789, 0.5])]);
    const parsed = parseIndex(serializeIndex(idx));
    expect(parsed).not.toBeNull();
    expect(parsed!.projectId).toBe('p');
    expect(parsed!.documents[0].documentId).toBe('d1');
    expect(parsed!.chunks).toHaveLength(1);
    // Embedding is rounded to 6 decimals on serialize.
    expect(parsed!.chunks[0].embedding[0]).toBeCloseTo(0.123457, 6);
  });

  it('preserves builtAgainstVersion and per-document sourceHash through JSON', () => {
    let idx = createEmptyIndex('p', 'voyage-3.5-lite');
    idx = upsertDocument(idx, docMeta('d1', { sourceHash: 'bytes-A' }), [chunk(0, [1, 0])]);
    idx = { ...idx, builtAgainstVersion: 42 };
    const parsed = parseIndex(serializeIndex(idx));
    expect(parsed!.builtAgainstVersion).toBe(42);
    expect(parsed!.documents[0].sourceHash).toBe('bytes-A');
  });

  it('rejects bad JSON, wrong version, and wrong projectId', () => {
    expect(parseIndex('not json')).toBeNull();
    expect(parseIndex(JSON.stringify({ version: 999, projectId: 'p' }))).toBeNull();
    let idx = createEmptyIndex('p', 'm');
    idx = upsertDocument(idx, docMeta('d1'), [chunk(0, [1, 0])]);
    expect(parseIndex(serializeIndex(idx), 'different-project')).toBeNull();
    expect(parseIndex(serializeIndex(idx), 'p')).not.toBeNull();
  });

  it('drops malformed chunks but keeps the index usable', () => {
    const tampered = {
      version: INDEX_VERSION,
      projectId: 'p',
      dimension: 2,
      model: 'm',
      updatedAt: new Date().toISOString(),
      documents: [],
      chunks: [
        { documentId: 'd1', chunkIndex: 0, startChar: 0, endChar: 10, embedding: [1, 0] },
        { documentId: 'd1', chunkIndex: 1, startChar: 'bad', endChar: 10, embedding: [0, 1] },
        { documentId: 'd1', chunkIndex: 2, startChar: 0, endChar: 10 }, // no embedding
      ],
    };
    const parsed = parseIndex(JSON.stringify(tampered));
    expect(parsed).not.toBeNull();
    expect(parsed!.chunks).toHaveLength(1);
  });
});

describe('loadIndex / saveIndex', () => {
  function memoryIO(): DriveIndexIO & { store: { content: string | null } } {
    const store: { content: string | null } = { content: null };
    return {
      store,
      read: async () => store.content,
      write: async (content: string) => {
        store.content = content;
      },
    };
  }

  it('returns null when no file exists yet, then round-trips after save', async () => {
    const io = memoryIO();
    expect(await loadIndex(io, 'p')).toBeNull();
    let idx = createEmptyIndex('p', 'm');
    idx = upsertDocument(idx, docMeta('d1'), [chunk(0, [1, 0])]);
    await saveIndex(io, idx);
    const loaded = await loadIndex(io, 'p');
    expect(loaded!.documents[0].documentId).toBe('d1');
  });
});

describe('searchIndex', () => {
  function buildIndex(): DriveVectorIndex {
    let idx = createEmptyIndex('p', 'm');
    idx = upsertDocument(idx, docMeta('d1', { category: 'maintenance_manual', scanned: false }), [
      chunk(0, [1, 0, 0]),
      chunk(1, [0.8, 0.2, 0]),
    ]);
    idx = upsertDocument(idx, docMeta('d2', { category: 'regulatory', scanned: true }), [
      chunk(0, [0, 1, 0]),
    ]);
    return idx;
  }

  it('returns top-K hits joined to document metadata', () => {
    const hits = searchIndex(buildIndex(), [1, 0, 0], 2);
    expect(hits).toHaveLength(2);
    expect(hits[0].documentId).toBe('d1');
    expect(hits[0].docName).toBe('d1.pdf');
    expect(hits[0].source).toBe('gdrive');
    expect(hits[0].path).toBe('drive-file-d1');
    expect(hits[0].score).toBeGreaterThan(hits[1].score);
  });

  it('surfaces the scanned flag so callers can avoid offset slicing', () => {
    const hits = searchIndex(buildIndex(), [0, 1, 0], 1);
    expect(hits[0].documentId).toBe('d2');
    expect(hits[0].scanned).toBe(true);
  });

  it('filters by documentIds and categories', () => {
    const byDoc = searchIndex(buildIndex(), [1, 0, 0], 5, { documentIds: ['d2'] });
    expect(byDoc.every((h) => h.documentId === 'd2')).toBe(true);
    const byCat = searchIndex(buildIndex(), [1, 0, 0], 5, { categories: ['regulatory'] });
    expect(byCat.every((h) => h.category === 'regulatory')).toBe(true);
  });
});
