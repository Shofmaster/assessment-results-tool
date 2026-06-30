import { describe, it, expect, vi } from 'vitest';
import { hashText, isScannedBackend } from './indexTextUtils';

// refreshDriveIndex imports these directly, so mock them to keep the builder
// unit-testable without the embed proxy or real file parsing.
vi.mock('./embeddingClient', () => ({
  embedDocuments: vi.fn(async (texts: string[]) => texts.map(() => [1, 0, 0])),
}));
vi.mock('./documentExtractor', () => ({
  DocumentExtractor: class {
    async extractTextWithMetadata(_buf: ArrayBuffer, name: string) {
      if (name === 'empty.pdf') {
        return { text: '', metadata: { backend: 'pdfjs_text' as const } };
      }
      return {
        text: 'Brake wear limits and inspection intervals for the main landing gear.',
        metadata: { backend: 'pdfjs_text' as const },
      };
    }
  },
}));

import { refreshDriveIndex, type IndexableDoc } from './driveIndexBuilder';
import {
  createEmptyIndex,
  upsertDocument,
  serializeIndex,
  type DriveIndexIO,
  type DriveVectorIndex,
} from './driveVectorIndex';
import { SourceUnavailableError } from './documentSourceResolver';

describe('hashText', () => {
  it('is deterministic and 64 hex chars (SHA-256)', async () => {
    const a = await hashText('hello manual');
    const b = await hashText('hello manual');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different input', async () => {
    expect(await hashText('rev A')).not.toBe(await hashText('rev B'));
  });
});

describe('isScannedBackend', () => {
  it('treats OCR backends as scanned (offsets not reproducible)', () => {
    expect(isScannedBackend('claude_vision')).toBe(true);
    expect(isScannedBackend('external_ocr')).toBe(true);
  });

  it('treats deterministic text backends as not scanned', () => {
    expect(isScannedBackend('pdfjs_text')).toBe(false);
    expect(isScannedBackend('mammoth')).toBe(false);
    expect(isScannedBackend('plain_text')).toBe(false);
    expect(isScannedBackend('xml_s1000d')).toBe(false);
  });
});

/** In-memory DriveIndexIO seeded with an optional starting index. */
function makeIO(initial?: DriveVectorIndex): DriveIndexIO & { current(): string | null } {
  let content = initial ? serializeIndex(initial) : null;
  return {
    read: async () => content,
    write: async (c: string) => {
      content = c;
    },
    current: () => content,
  };
}

function gdriveDoc(over: Partial<IndexableDoc> = {}): IndexableDoc {
  return {
    documentId: 'd1',
    name: 'manual.pdf',
    source: 'gdrive',
    path: 'file-id',
    mimeType: 'application/pdf',
    category: 'maintenance_manual',
    ...over,
  };
}

describe('refreshDriveIndex — byte-hash short-circuit', () => {
  it('skips reading a document whose sourceHash matches the index', async () => {
    const seeded = upsertDocument(
      createEmptyIndex('p1', 'voyage-3.5-lite'),
      {
        documentId: 'd1',
        name: 'manual.pdf',
        source: 'gdrive',
        path: 'file-id',
        contentHash: 'texthash-old',
        sourceHash: 'bytes-A',
        scanned: false,
      },
      [{ chunkIndex: 0, startChar: 0, endChar: 10, embedding: [1, 0, 0] }],
    );
    const io = makeIO(seeded);
    const readBytes = vi.fn(async () => new ArrayBuffer(8));

    const result = await refreshDriveIndex({
      io,
      projectId: 'p1',
      docs: [gdriveDoc({ sourceHash: 'bytes-A' })],
      readBytes,
      builtAgainstVersion: 7,
    });

    expect(readBytes).not.toHaveBeenCalled();
    expect(result.skippedUnchanged).toBe(1);
    expect(result.indexed).toBe(0);
    expect(result.perDoc).toEqual([{ documentId: 'd1', name: 'manual.pdf', status: 'unchanged' }]);
    // Version is stamped on a complete run.
    expect(result.index.builtAgainstVersion).toBe(7);
  });

  it('re-reads and re-indexes when sourceHash changed, recording the new hash', async () => {
    const seeded = upsertDocument(
      createEmptyIndex('p1', 'voyage-3.5-lite'),
      {
        documentId: 'd1',
        name: 'manual.pdf',
        source: 'gdrive',
        path: 'file-id',
        contentHash: 'texthash-old',
        sourceHash: 'bytes-A',
        scanned: false,
      },
      [{ chunkIndex: 0, startChar: 0, endChar: 10, embedding: [1, 0, 0] }],
    );
    const io = makeIO(seeded);
    const readBytes = vi.fn(async () => new ArrayBuffer(8));

    const result = await refreshDriveIndex({
      io,
      projectId: 'p1',
      docs: [gdriveDoc({ sourceHash: 'bytes-B' })],
      readBytes,
    });

    expect(readBytes).toHaveBeenCalledTimes(1);
    expect(result.indexed).toBe(1);
    expect(result.perDoc[0].status).toBe('indexed');
    const entry = result.index.documents.find((d) => d.documentId === 'd1');
    expect(entry?.sourceHash).toBe('bytes-B');
  });
});

describe('refreshDriveIndex — coverage statuses', () => {
  it('marks an unreachable source as unavailable and leaves any entry untouched', async () => {
    const io = makeIO();
    const readBytes = vi.fn(async () => {
      throw new SourceUnavailableError('not linked', 'gdrive');
    });

    const result = await refreshDriveIndex({
      io,
      projectId: 'p1',
      docs: [gdriveDoc({ sourceHash: 'bytes-A' })],
      readBytes,
    });

    expect(result.unavailable).toBe(1);
    expect(result.perDoc[0].status).toBe('unavailable');
    expect(result.index.documents).toHaveLength(0);
  });

  it('marks a document with no extractable text as no-text', async () => {
    const io = makeIO();
    const readBytes = vi.fn(async () => new ArrayBuffer(8));

    const result = await refreshDriveIndex({
      io,
      projectId: 'p1',
      docs: [gdriveDoc({ name: 'empty.pdf', sourceHash: 'bytes-A' })],
      readBytes,
    });

    expect(result.perDoc[0].status).toBe('no-text');
    expect(result.index.documents.find((d) => d.documentId === 'd1')).toBeUndefined();
  });

  it('indexes a fresh document and reports it as indexed', async () => {
    const io = makeIO();
    const readBytes = vi.fn(async () => new ArrayBuffer(8));

    const result = await refreshDriveIndex({
      io,
      projectId: 'p1',
      docs: [gdriveDoc({ sourceHash: 'bytes-A' })],
      readBytes,
      builtAgainstVersion: 3,
    });

    expect(result.indexed).toBe(1);
    expect(result.perDoc[0].status).toBe('indexed');
    expect(result.index.chunks.length).toBeGreaterThan(0);
    expect(result.index.builtAgainstVersion).toBe(3);
  });
});
