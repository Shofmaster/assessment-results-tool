import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFolderIndexIO, folderIndexExists, FolderNotWritableError } from './folderIndexStorage';
import { APP_FOLDER_NAME, enumerateDirectory, enumerateDirectoryMeta } from './localFileAccess';
import { createEmptyIndex, indexFileName, loadIndex, saveIndex, upsertDocument } from './driveVectorIndex';
import type { DesktopFolderBridge, LinkedFolder } from './localFileAccess';

/**
 * In-memory stand-in for the File System Access API - just enough surface for
 * the folder index IO and enumerateDirectory. Permission state is explicit so
 * the read-only / read-write paths can both be exercised.
 */
type Perm = 'granted' | 'denied' | 'prompt';

class FakeFile {
  constructor(
    public name: string,
    private content: string,
  ) {}
  readonly kind = 'file' as const;
  async getFile(): Promise<{
    name: string;
    size: number;
    lastModified: number;
    type: string;
    text(): Promise<string>;
    arrayBuffer(): Promise<ArrayBuffer>;
  }> {
    const content = this.content;
    const encoded = new TextEncoder().encode(content);
    return {
      name: this.name,
      size: encoded.byteLength,
      lastModified: 1_700_000_000_000,
      type: '',
      text: async () => content,
      arrayBuffer: async () =>
        encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer,
    };
  }
  async createWritable(): Promise<{ write(c: string): Promise<void>; close(): Promise<void> }> {
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
  permission: { read: Perm; readwrite: Perm } = { read: 'granted', readwrite: 'prompt' };
  grantWriteOnRequest = true;

  constructor(public name: string) {}

  addFile(name: string, content: string): FakeFile {
    const f = new FakeFile(name, content);
    this.entriesMap.set(name, f);
    return f;
  }
  addDir(name: string): FakeDir {
    const d = new FakeDir(name);
    this.entriesMap.set(name, d);
    return d;
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FakeDir> {
    const existing = this.entriesMap.get(name);
    if (existing instanceof FakeDir) return existing;
    if (existing) throw new DOMException('not a directory', 'TypeMismatchError');
    if (!opts?.create) throw new DOMException('missing', 'NotFoundError');
    return this.addDir(name);
  }
  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FakeFile> {
    const existing = this.entriesMap.get(name);
    if (existing instanceof FakeFile) return existing;
    if (existing) throw new DOMException('not a file', 'TypeMismatchError');
    if (!opts?.create) throw new DOMException('missing', 'NotFoundError');
    return this.addFile(name, '');
  }
  async queryPermission(opts: { mode: 'read' | 'readwrite' }): Promise<Perm> {
    return this.permission[opts.mode];
  }
  async requestPermission(opts: { mode: 'read' | 'readwrite' }): Promise<Perm> {
    if (opts.mode === 'readwrite' && this.grantWriteOnRequest) this.permission.readwrite = 'granted';
    return this.permission[opts.mode];
  }
  entries(): AsyncIterable<[string, FakeDir | FakeFile]> {
    const items = Array.from(this.entriesMap.entries());
    return {
      async *[Symbol.asyncIterator]() {
        for (const item of items) yield item;
      },
    };
  }
  has(name: string): boolean {
    return this.entriesMap.has(name);
  }
}

const asHandle = (d: FakeDir) => d as unknown as FileSystemDirectoryHandle;

describe('createFolderIndexIO', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads null when the folder has no index yet', async () => {
    const root = new FakeDir('manuals');
    const io = createFolderIndexIO(asHandle(root), indexFileName('p1'));
    expect(await io.read()).toBeNull();
    expect(await folderIndexExists(asHandle(root), indexFileName('p1'))).toBe(false);
  });

  it('writes under .aerogap/ and reads back the same content', async () => {
    const root = new FakeDir('manuals');
    const io = createFolderIndexIO(asHandle(root), indexFileName('p1'));
    await io.write('{"hello":1}');
    expect(root.has(APP_FOLDER_NAME)).toBe(true);
    expect(await io.read()).toBe('{"hello":1}');
    expect(await folderIndexExists(asHandle(root), indexFileName('p1'))).toBe(true);
    expect(Array.from((root as any).entriesMap.keys())).toEqual([APP_FOLDER_NAME]);
  });

  it('leaves a README explaining the folder, once', async () => {
    const root = new FakeDir('manuals');
    const io = createFolderIndexIO(asHandle(root), indexFileName('p1'));
    await io.write('a');
    const app = await root.getDirectoryHandle(APP_FOLDER_NAME);
    const readme = await (await (await app.getFileHandle('README.txt')).getFile()).text();
    expect(readme).toMatch(/no manual text/i);
    await io.write('b');
    expect(await io.read()).toBe('b');
  });

  it('requests write permission lazily and refuses when it is not granted', async () => {
    const root = new FakeDir('manuals');
    root.grantWriteOnRequest = false;
    const io = createFolderIndexIO(asHandle(root), indexFileName('p1'));
    await expect(io.write('x')).rejects.toBeInstanceOf(FolderNotWritableError);
    expect(await io.read()).toBeNull();
  });

  it('creates .aerogap when write is granted from a click', async () => {
    const root = new FakeDir('manuals');
    root.permission.readwrite = 'prompt';
    root.grantWriteOnRequest = true;
    const io = createFolderIndexIO(asHandle(root), indexFileName('p1'));
    await io.write('{"ok":1}');
    expect(root.has(APP_FOLDER_NAME)).toBe(true);
    expect(await io.read()).toBe('{"ok":1}');
  });

  it('round-trips a real vector index through loadIndex/saveIndex', async () => {
    const root = new FakeDir('manuals');
    const io = createFolderIndexIO(asHandle(root), indexFileName('p1'));
    const index = upsertDocument(
      createEmptyIndex('p1', 'test-model'),
      { documentId: 'd1', name: 'AMM.pdf', source: 'local', path: 'GV/AMM.pdf', contentHash: 'h', scanned: false },
      [{ chunkIndex: 0, startChar: 0, endChar: 10, embedding: [0.1, 0.2] }],
    );
    await saveIndex(io, index);
    const loaded = await loadIndex(io, 'p1');
    expect(loaded?.documents).toHaveLength(1);
    expect(loaded?.chunks[0]).toMatchObject({ documentId: 'd1', startChar: 0, endChar: 10 });
    const second = createFolderIndexIO(asHandle(root), indexFileName('p1'));
    expect((await loadIndex(second, 'p1'))?.documents[0]?.name).toBe('AMM.pdf');
  });

  it('desktop falls back to seat-local index when the share is read-only', async () => {
    const localStore = new Map<string, string>();
    const bridge: DesktopFolderBridge = {
      pick: async () => ({ cancelled: true }),
      status: async () => ({ linked: true, path: 'C:\\share\\manuals', name: 'manuals' }),
      listMeta: async () => [],
      readFile: async () => new ArrayBuffer(0),
      readAppFile: async () => null,
      writeAppFile: async () => {
        const err = new Error('EACCES: permission denied');
        (err as { code?: string }).code = 'EACCES';
        throw err;
      },
      canWriteAppFolder: async () => false,
      readLocalIndex: async (name) => localStore.get(name) ?? null,
      writeLocalIndex: async (name, content) => {
        localStore.set(name, content);
        return true;
      },
    };
    const localFileAccess = await import('./localFileAccess');
    vi.spyOn(localFileAccess, 'getDesktopFolderBridge').mockReturnValue(bridge);

    const folder: LinkedFolder = {
      kind: 'desktop',
      name: 'manuals',
      path: 'C:\\share\\manuals',
      id: 'C:\\share\\manuals',
    };
    const io = createFolderIndexIO(folder, indexFileName('p1'));
    await io.write('{"local":1}');
    expect(localStore.get(indexFileName('p1'))).toBe('{"local":1}');
    expect(await io.read()).toBe('{"local":1}');
    expect(io.lastWriteLocation?.()).toBe('local');
  });
});

describe('enumerateDirectory', () => {
  it('skips the .aerogap folder so the index is never registered as a manual', async () => {
    const root = new FakeDir('manuals');
    root.addFile('AMM.pdf', 'pdf');
    root.addDir('GV').addFile('SRM.pdf', 'pdf');
    root.addDir(APP_FOLDER_NAME).addFile(indexFileName('p1'), '{}');
    const entries = await enumerateDirectory(asHandle(root));
    expect(entries.map((e) => e.relativePath).sort()).toEqual(['AMM.pdf', 'GV/SRM.pdf']);
  });

  it('stops walking when the abort signal fires', async () => {
    const root = new FakeDir('manuals');
    root.addFile('AMM.pdf', 'pdf');
    root.addDir('GV').addFile('SRM.pdf', 'pdf');
    const controller = new AbortController();
    controller.abort();
    await expect(enumerateDirectory(asHandle(root), '', controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
  });
});

describe('enumerateDirectoryMeta', () => {
  it('returns size/mtime without reading file bytes', async () => {
    const root = new FakeDir('manuals');
    root.addFile('AMM.pdf', 'pdf-bytes');
    root.addDir('GV').addFile('SRM.pdf', 'srm');
    const metas = await enumerateDirectoryMeta(asHandle(root));
    expect(metas.map((m) => m.relativePath).sort()).toEqual(['AMM.pdf', 'GV/SRM.pdf']);
    expect(metas.every((m) => m.size > 0 && m.lastModified > 0)).toBe(true);
  });
});
