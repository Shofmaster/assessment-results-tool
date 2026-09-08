import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The linked-folder store end to end: a seat with a manuals folder and NO Google
 * Drive builds the shared index into the folder, searches it, and reports
 * coverage - and a second seat opening the same folder gets the same index.
 */

// --- fakes ------------------------------------------------------------------

type Perm = 'granted' | 'denied' | 'prompt';

class FakeFile {
  constructor(
    public name: string,
    public content: string,
  ) {}
  readonly kind = 'file' as const;
  async getFile() {
    const content = this.content;
    return {
      text: async () => content,
      arrayBuffer: async () => new TextEncoder().encode(content).buffer as ArrayBuffer,
    };
  }
  async createWritable() {
    let pending = '';
    return {
      write: async (c: string) => {
        pending += c;
      },
      close: async () => {
        this.content = pending;
      },
    };
  }
}

class FakeDir {
  readonly kind = 'directory' as const;
  private entriesMap = new Map<string, FakeDir | FakeFile>();
  permission: { read: Perm; readwrite: Perm } = { read: 'granted', readwrite: 'granted' };
  constructor(public name: string) {}
  addFile(name: string, content: string) {
    const f = new FakeFile(name, content);
    this.entriesMap.set(name, f);
    return f;
  }
  addDir(name: string) {
    const d = new FakeDir(name);
    this.entriesMap.set(name, d);
    return d;
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    const e = this.entriesMap.get(name);
    if (e instanceof FakeDir) return e;
    if (!opts?.create) throw new DOMException('missing', 'NotFoundError');
    return this.addDir(name);
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    const e = this.entriesMap.get(name);
    if (e instanceof FakeFile) return e;
    if (!opts?.create) throw new DOMException('missing', 'NotFoundError');
    return this.addFile(name, '');
  }
  async queryPermission(o: { mode: 'read' | 'readwrite' }) {
    return this.permission[o.mode];
  }
  async requestPermission(o: { mode: 'read' | 'readwrite' }) {
    return this.permission[o.mode];
  }
}

/** The folder "on disk" - shared by every seat in the test, like a mapped share. */
let share: FakeDir;
/** Which seat is "linked" (null = no folder linked on this seat). */
let linkedRoot: FakeDir | null;

vi.mock('./localFileAccess', async () => {
  const actual = await vi.importActual<typeof import('./localFileAccess')>('./localFileAccess');
  const toLinked = (root: FakeDir | null) =>
    root
      ? {
          kind: 'fsa' as const,
          name: root.name,
          handle: root as unknown as FileSystemDirectoryHandle,
          id: `fsa:${root.name}`,
        }
      : null;
  return {
    ...actual,
    getLinkedFolder: async () => toLinked(linkedRoot),
    getStoredManualsDirectory: async () => linkedRoot ?? undefined,
    readLinkedFile: async (folder: { handle?: FakeDir } | FakeDir, relativePath: string) => {
      const root = (folder as { handle?: FakeDir }).handle ?? (folder as FakeDir);
      const parts = relativePath.split('/');
      let dir = root;
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
      return (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).arrayBuffer();
    },
    readFileFromDirectory: async (root: FakeDir, relativePath: string) => {
      const parts = relativePath.split('/');
      let dir = root;
      for (const seg of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(seg);
      return (await (await dir.getFileHandle(parts[parts.length - 1])).getFile()).arrayBuffer();
    },
  };
});

// No Google Drive on this seat.
vi.mock('../utils/googleConfig', () => ({
  resolveGoogleConfig: () => ({ clientId: '', apiKey: '' }),
}));
vi.mock('./googleDrive', () => ({
  getSharedDriveService: () => {
    throw new Error('should not be called without credentials');
  },
}));

// Deterministic embeddings: the query vector matches the brake chunk.
vi.mock('./embeddingClient', () => ({
  embedDocuments: vi.fn(async (texts: string[]) => texts.map((t) => (/brake/i.test(t) ? [1, 0, 0] : [0, 1, 0]))),
  embedQuery: vi.fn(async () => [1, 0, 0]),
}));
vi.mock('./rerankClient', () => ({
  rerankPassages: vi.fn(async (_q: string, passages: string[], k: number) =>
    passages.slice(0, k).map((_p, i) => ({ index: i, score: 1 - i * 0.01 })),
  ),
  applyRerankToChunks: (chunks: unknown[]) => chunks,
}));
vi.mock('./documentExtractor', () => ({
  DocumentExtractor: class {
    async extractTextWithMetadata(buf: ArrayBuffer) {
      return { text: new TextDecoder().decode(buf), metadata: { backend: 'plain_text' as const } };
    }
    async extractText(buf: ArrayBuffer) {
      return new TextDecoder().decode(buf);
    }
  },
}));

import { getFunctionName, type FunctionReference } from 'convex/server';
import { api } from '../../convex/_generated/api';
import {
  buildProjectSearchIndexes,
  loadProjectIndexCoverage,
  searchProjectDocuments,
  clearDriveSearchCaches,
  fetchAllIndexMetaByProject,
} from './driveSearchIntegration';
import { APP_FOLDER_NAME } from './localFileAccess';
import { indexFileName } from './driveVectorIndex';

const BRAKE_TEXT = 'Brake wear limits and inspection intervals for the main landing gear.';
const HYDRAULIC_TEXT = 'Hydraulic system pressure check procedure and reservoir servicing.';

const rows = [
  { _id: 'doc-brake', name: 'AMM 32-40.txt', path: 'GV/AMM 32-40.txt', source: 'local', category: 'maintenance_manual', contentHash: 'h1' },
  { _id: 'doc-hyd', name: 'AMM 29-10.txt', path: 'GV/AMM 29-10.txt', source: 'local', category: 'maintenance_manual', contentHash: 'h2' },
  // Convex holds this one's text: owned by the Convex store, never in the folder index.
  { _id: 'doc-stored', name: 'GMM.pdf', path: 'GMM.pdf', source: 'local', category: 'entity', hasConvexText: true },
  // A Drive file: not readable from the folder, so not the folder index's business.
  { _id: 'doc-drive', name: 'IPC.pdf', path: 'drive-id', source: 'gdrive', category: 'parts_catalog' },
];

function makeConvex() {
  return {
    // Generated API refs are proxies (a fresh object per access), so compare by name.
    query: vi.fn(async (ref: FunctionReference<'query'>) => {
      const name = getFunctionName(ref);
      if (name === getFunctionName(api.documents.listIndexMetaByProject)) {
        return { page: rows, isDone: true, continueCursor: '' };
      }
      if (name === getFunctionName(api.documents.searchIndexState)) return { version: 3 };
      if (name === getFunctionName(api.userSettings.get)) return {};
      if (name === getFunctionName(api.projects.list)) return [];
      throw new Error(`unexpected query ${name}`);
    }),
    action: vi.fn(async () => ({ chunks: [], documents: [] })),
  };
}

beforeEach(() => {
  clearDriveSearchCaches();
  share = new FakeDir('manuals');
  const gv = share.addDir('GV');
  gv.addFile('AMM 32-40.txt', BRAKE_TEXT);
  gv.addFile('AMM 29-10.txt', HYDRAULIC_TEXT);
  linkedRoot = share;
});

describe('buildProjectSearchIndexes with a linked folder and no Drive', () => {
  it('writes the shared index into the folder and only indexes folder-sourced docs', async () => {
    const convex = makeConvex();
    const result = await buildProjectSearchIndexes(convex, 'p1');
    expect(result.stores).toEqual(['folder']);
    expect(result.total).toBe(2);
    expect(result.indexed).toBe(2);
    expect(result.perDoc.map((d) => d.documentId).sort()).toEqual(['doc-brake', 'doc-hyd']);

    const app = await share.getDirectoryHandle(APP_FOLDER_NAME);
    const file = await (await (await app.getFileHandle(indexFileName('p1'))).getFile()).text();
    const parsed = JSON.parse(file);
    expect(parsed.documents.map((d: { documentId: string }) => d.documentId).sort()).toEqual(['doc-brake', 'doc-hyd']);
    // Vectors + offsets only - never the manual text.
    expect(file).not.toContain('Brake wear');
    expect(parsed.builtAgainstVersion).toBe(3);
  });

  it('fails with a clear message when neither a folder nor Drive is available', async () => {
    linkedRoot = null;
    await expect(buildProjectSearchIndexes(makeConvex(), 'p1')).rejects.toThrow(/not configured|Link a manuals folder/i);
  });
});

describe('searchProjectDocuments over the folder index', () => {
  it('finds passages from the folder index without any Drive, and does not flag Drive as unavailable', async () => {
    const convex = makeConvex();
    await buildProjectSearchIndexes(convex, 'p1');
    const res = await searchProjectDocuments(convex, { projectId: 'p1', query: 'brake wear limits', topK: 3, allowRerank: false });
    expect(res.chunks.length).toBeGreaterThan(0);
    expect(res.chunks[0].documentId).toBe('doc-brake');
    expect(res.chunks[0].text).toContain('Brake wear');
    expect(res.meta?.driveUnavailable).toBeUndefined();
  });

  it('a second seat linking the same share searches the index the first seat built', async () => {
    const convex = makeConvex();
    await buildProjectSearchIndexes(convex, 'p1');
    // New session on another machine: fresh caches, same folder, read-only grant.
    clearDriveSearchCaches();
    const seat2 = new FakeDir('manuals');
    (seat2 as any).entriesMap = (share as any).entriesMap; // same files on the share
    seat2.permission = { read: 'granted', readwrite: 'prompt' };
    linkedRoot = seat2;
    const res = await searchProjectDocuments(makeConvex(), { projectId: 'p1', query: 'brake', topK: 3, allowRerank: false });
    expect(res.chunks[0]?.documentId).toBe('doc-brake');
  });
});

describe('loadProjectIndexCoverage', () => {
  it('reports folder-indexed docs without requiring Drive', async () => {
    const convex = makeConvex();
    const before = await loadProjectIndexCoverage(convex, 'p1');
    expect(before.driveAvailable).toBe(false);
    expect(before.folderLinked).toBe(true);
    expect(before.indexBuilt).toBe(false);

    await buildProjectSearchIndexes(convex, 'p1');
    const after = await loadProjectIndexCoverage(convex, 'p1');
    expect(after.indexBuilt).toBe(true);
    expect(after.rows.find((r) => r.documentId === 'doc-brake')?.inIndex).toBe(true);
    expect(after.rows.find((r) => r.documentId === 'doc-brake')?.searchableVia).toBe('folder');
    // Convex-held text is reported as searchable-via-convex, not "not indexed".
    expect(after.rows.find((r) => r.documentId === 'doc-stored')?.searchableVia).toBe('convex');
    const via = Object.fromEntries(after.rows.map((r) => [r.documentId, r.searchableVia]));
    expect(via).toEqual({
      'doc-brake': 'folder',
      'doc-hyd': 'folder',
      'doc-stored': 'convex',
      'doc-drive': null,
    });
  });

  it('does not throw when nothing external is configured', async () => {
    linkedRoot = null;
    const coverage = await loadProjectIndexCoverage(makeConvex(), 'p1');
    expect(coverage.folderLinked).toBe(false);
    expect(coverage.driveAvailable).toBe(false);
    expect(coverage.indexBuilt).toBe(false);
    expect(coverage.rows.map((r) => r.inIndex)).toEqual([false, false, true, false]);
  });
});

describe('fetchAllIndexMetaByProject', () => {
  it('walks cursor pages until isDone', async () => {
    const convex = {
      query: vi.fn(async (ref: FunctionReference<'query'>, args: { paginationOpts?: { cursor: string | null } }) => {
        const name = getFunctionName(ref);
        if (name !== getFunctionName(api.documents.listIndexMetaByProject)) {
          throw new Error(`unexpected query ${name}`);
        }
        if (!args.paginationOpts?.cursor) {
          return { page: [rows[0]], isDone: false, continueCursor: 'c1' };
        }
        expect(args.paginationOpts.cursor).toBe('c1');
        return { page: [rows[1]], isDone: true, continueCursor: '' };
      }),
      action: vi.fn(),
    };
    const all = await fetchAllIndexMetaByProject(convex, 'p1');
    expect(all.map((r) => r._id)).toEqual(['doc-brake', 'doc-hyd']);
    expect(convex.query).toHaveBeenCalledTimes(2);
  });
});
