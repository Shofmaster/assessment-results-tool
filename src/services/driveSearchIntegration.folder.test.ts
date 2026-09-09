import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The linked-folder store end to end: a seat with a manuals folder and NO Google
 * Drive builds the shared index into the folder, searches it, and reports
 * coverage - and a second seat opening the same folder gets the same index.
 *
 * Also proves allowlisted library types (txt/xml/js/png/jpeg/pdf/docx) become
 * searchable via the folder half, and uploaded copies via the Convex half.
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

vi.mock('./embeddingClient', () => {
  /** Map distinctive phrases to orthogonal vectors so each query hits one doc. */
  const vectorForText = (text: string): number[] => {
    if (/brake/i.test(text)) return [1, 0, 0, 0, 0, 0, 0];
    if (/hydraulic/i.test(text)) return [0, 1, 0, 0, 0, 0, 0];
    if (/oxygen bottle/i.test(text)) return [0, 0, 1, 0, 0, 0, 0];
    if (/flap torque/i.test(text)) return [0, 0, 0, 1, 0, 0, 0];
    if (/time limits/i.test(text)) return [0, 0, 0, 0, 1, 0, 0];
    if (/wiring diagram/i.test(text)) return [0, 0, 0, 0, 0, 1, 0];
    if (/cabin pressure/i.test(text)) return [0, 0, 0, 0, 0, 0, 1];
    if (/entity policy/i.test(text)) return [0.5, 0.5, 0, 0, 0, 0, 0];
    return [0, 0, 0, 0, 0, 0, 0];
  };
  return {
    embedDocuments: vi.fn(async (texts: string[]) => texts.map((t) => vectorForText(t))),
    embedQuery: vi.fn(async (q: string) => vectorForText(q)),
  };
});
vi.mock('./rerankClient', () => ({
  rerankPassages: vi.fn(async (_q: string, passages: string[], k: number) =>
    passages.slice(0, k).map((_p, i) => ({ index: i, score: 1 - i * 0.01 })),
  ),
  applyRerankToChunks: (chunks: unknown[]) => chunks,
}));

/**
 * Type-aware extractor mock: mirrors DocumentExtractor routing by name/MIME
 * (including empty MIME + extension, the desktop walk hole). XML goes through
 * real ingestXmlText so tags are not searchable; images return OCR text.
 */
vi.mock('./documentExtractor', async () => {
  const { ingestXmlText, isXmlIngestCandidate } = await import('./xmlIngest');

  function extOf(name: string): string {
    const i = name.lastIndexOf('.');
    return i >= 0 ? name.slice(i).toLowerCase() : '';
  }

  function resolveMime(name: string, mimeType?: string): string {
    if (mimeType && mimeType !== 'application/octet-stream') return mimeType;
    const map: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.txt': 'text/plain',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.xml': 'application/xml',
      '.js': 'application/javascript',
    };
    return map[extOf(name)] ?? mimeType ?? '';
  }

  /** Canned OCR/text for binary-ish fixtures keyed by filename. */
  const CANNED: Record<string, { text: string; backend: string }> = {
    'scan-oxygen.png': {
      text: 'Oxygen bottle hydrostatic test due date placard.',
      backend: 'claude_vision',
    },
    'flap-plate.jpeg': {
      text: 'Flap torque check placard for left wing.',
      backend: 'claude_vision',
    },
    'WD-29.pdf': {
      text: 'Wiring diagram for hydraulic pump circuit breaker.',
      backend: 'pdfjs_text',
    },
    'cabin-press.docx': {
      text: 'Cabin pressure controller adjustment procedure.',
      backend: 'mammoth',
    },
  };

  return {
    DocumentExtractor: class {
      async extractTextWithMetadata(buf: ArrayBuffer, name: string, mimeType?: string) {
        const effective = resolveMime(name, mimeType);
        if (isXmlIngestCandidate(name, effective)) {
          const raw = new TextDecoder().decode(buf);
          const xml = ingestXmlText(raw, name);
          const backend =
            xml.format.family === 'ata_ispec'
              ? 'xml_ata_ispec'
              : xml.format.family === 's1000d'
                ? 'xml_s1000d'
                : 'xml_generic';
          return { text: xml.readingText, metadata: { backend }, xmlIngest: xml };
        }
        const leaf = name.split(/[/\\]/).pop() ?? name;
        const canned = CANNED[leaf];
        if (canned) {
          return { text: canned.text, metadata: { backend: canned.backend } };
        }
        if (effective.startsWith('image/')) {
          return {
            text: new TextDecoder().decode(buf),
            metadata: { backend: 'claude_vision' as const },
          };
        }
        return {
          text: new TextDecoder().decode(buf),
          metadata: { backend: 'plain_text' as const },
        };
      }
      async extractText(buf: ArrayBuffer, name: string, mimeType?: string) {
        const r = await this.extractTextWithMetadata(buf, name, mimeType);
        return r.text;
      }
    },
  };
});

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
const GENERIC_XML = `<?xml version="1.0"?>
<manual>
  <title>Time Limits</title>
  <para>The Time Limits Section provides manufacturer recommended time limits.</para>
</manual>`;
const GULFSTREAM_JS = `XmlProc.Source["05-10-00-in_xml.js"] = '\\
<?xml version="1.0" encoding="iso-8859-1"?>\\
<printgroup><?REVNBR 60?><?REVDATE January 31/26?><?ATATITLE TIME LIMITS?><?ATANBR 05-10-00?>\\
  <inpgblk chapnbr="05" key="a" pgblknbr="00" sectnbr="10" subjnbr="00">\\
    <intro key="a1" id="idm1">\\
      <title>Time Limits</title>\\
      <topic id="t1">\\
        <title>Introduction</title>\\
        <para>The Time Limits Section provides manufacturer recommended time limits.</para>\\
      </topic>\\
    </intro>\\
  </inpgblk>\\
</printgroup>\\
';`;
/** Placeholder bytes — extractor mock returns canned OCR/text by filename. */
const PNG_BYTES = 'PNG-PLACEHOLDER';
const JPEG_BYTES = 'JPEG-PLACEHOLDER';
const PDF_BYTES = 'PDF-PLACEHOLDER';
const DOCX_BYTES = 'DOCX-PLACEHOLDER';

const ENTITY_POLICY_TEXT = 'Entity policy for tool calibration and entity policy records.';

type IndexMetaRow = {
  _id: string;
  name: string;
  path: string;
  source: string;
  category: string;
  contentHash?: string;
  mimeType?: string;
  hasConvexText?: boolean;
};

const rows: IndexMetaRow[] = [
  {
    _id: 'doc-brake',
    name: 'AMM 32-40.txt',
    path: 'GV/AMM 32-40.txt',
    source: 'local',
    category: 'maintenance_manual',
    contentHash: 'h1',
    mimeType: 'text/plain',
  },
  {
    _id: 'doc-hyd',
    name: 'AMM 29-10.txt',
    path: 'GV/AMM 29-10.txt',
    source: 'local',
    category: 'maintenance_manual',
    contentHash: 'h2',
    mimeType: 'text/plain',
  },
  {
    _id: 'doc-xml',
    name: '05-10-00.xml',
    path: 'GV/05-10-00.xml',
    source: 'local',
    category: 'maintenance_manual',
    contentHash: 'h-xml',
    // Empty MIME simulates desktop linkedFolder walk.
    mimeType: '',
  },
  {
    _id: 'doc-js-xml',
    name: '05-10-00-in_xml.js',
    path: 'GV/05-10-00-in_xml.js',
    source: 'local',
    category: 'maintenance_manual',
    contentHash: 'h-js',
    mimeType: '',
  },
  {
    _id: 'doc-png',
    name: 'scan-oxygen.png',
    path: 'GV/scan-oxygen.png',
    source: 'local',
    category: 'maintenance_manual',
    contentHash: 'h-png',
    mimeType: '',
  },
  {
    _id: 'doc-jpeg',
    name: 'flap-plate.jpeg',
    path: 'GV/flap-plate.jpeg',
    source: 'local',
    category: 'maintenance_manual',
    contentHash: 'h-jpeg',
    mimeType: '',
  },
  {
    _id: 'doc-pdf',
    name: 'WD-29.pdf',
    path: 'GV/WD-29.pdf',
    source: 'local',
    category: 'wiring_diagram',
    contentHash: 'h-pdf',
    mimeType: 'application/pdf',
  },
  {
    _id: 'doc-docx',
    name: 'cabin-press.docx',
    path: 'GV/cabin-press.docx',
    source: 'local',
    category: 'maintenance_manual',
    contentHash: 'h-docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  },
  // Convex holds this one's text: owned by the Convex store, never in the folder index.
  {
    _id: 'doc-stored',
    name: 'GMM.pdf',
    path: 'GMM.pdf',
    source: 'local',
    category: 'entity',
    hasConvexText: true,
  },
  // Uploaded PNG scan with Convex text — searchable only via Convex half.
  {
    _id: 'doc-uploaded-png',
    name: 'logbook-scan.png',
    path: 'logbook-scan.png',
    source: 'local',
    category: 'logbook_scan',
    mimeType: 'image/png',
    hasConvexText: true,
  },
  // A Drive file: not readable from the folder, so not the folder index's business.
  {
    _id: 'doc-drive',
    name: 'IPC.pdf',
    path: 'drive-id',
    source: 'gdrive',
    category: 'parts_catalog',
  },
];

const FOLDER_OWNED_IDS = [
  'doc-brake',
  'doc-hyd',
  'doc-xml',
  'doc-js-xml',
  'doc-png',
  'doc-jpeg',
  'doc-pdf',
  'doc-docx',
];

function makeConvex(metaRows: IndexMetaRow[] = rows) {
  return {
    // Generated API refs are proxies (a fresh object per access), so compare by name.
    query: vi.fn(async (ref: FunctionReference<'query'>) => {
      const name = getFunctionName(ref);
      if (name === getFunctionName(api.documents.listIndexMetaByProject)) {
        return { page: metaRows, isDone: true, continueCursor: '' };
      }
      if (name === getFunctionName(api.documents.searchIndexState)) return { version: 3 };
      if (name === getFunctionName(api.userSettings.get)) return {};
      if (name === getFunctionName(api.projects.list)) return [];
      throw new Error(`unexpected query ${name}`);
    }),
    action: vi.fn(async (ref: FunctionReference<'action'>, args: { query?: string }) => {
      const name = getFunctionName(ref);
      if (name === getFunctionName(api.documentChunks.search)) {
        const q = args.query ?? '';
        // Uploaded Convex-owned docs: return a hit when the query matches.
        if (/entity policy/i.test(q) || /entity/i.test(q)) {
          return {
            chunks: [
              {
                chunkId: 'doc-stored:0',
                documentId: 'doc-stored',
                docName: 'GMM.pdf',
                category: 'entity',
                chunkIndex: 0,
                totalChunks: 1,
                text: ENTITY_POLICY_TEXT,
                startChar: 0,
                endChar: ENTITY_POLICY_TEXT.length,
                score: 0.95,
                matchType: 'semantic' as const,
              },
            ],
            documents: [],
          };
        }
        if (/oxygen bottle/i.test(q) || /logbook/i.test(q)) {
          return {
            chunks: [
              {
                chunkId: 'doc-uploaded-png:0',
                documentId: 'doc-uploaded-png',
                docName: 'logbook-scan.png',
                category: 'logbook_scan',
                chunkIndex: 0,
                totalChunks: 1,
                text: 'Oxygen bottle hydrostatic test due date placard from uploaded scan.',
                startChar: 0,
                endChar: 60,
                score: 0.9,
                matchType: 'semantic' as const,
              },
            ],
            documents: [],
          };
        }
        return { chunks: [], documents: [] };
      }
      return { chunks: [], documents: [] };
    }),
  };
}

function seedShareWithLibraryTypes() {
  share = new FakeDir('manuals');
  const gv = share.addDir('GV');
  gv.addFile('AMM 32-40.txt', BRAKE_TEXT);
  gv.addFile('AMM 29-10.txt', HYDRAULIC_TEXT);
  gv.addFile('05-10-00.xml', GENERIC_XML);
  gv.addFile('05-10-00-in_xml.js', GULFSTREAM_JS);
  gv.addFile('scan-oxygen.png', PNG_BYTES);
  gv.addFile('flap-plate.jpeg', JPEG_BYTES);
  gv.addFile('WD-29.pdf', PDF_BYTES);
  gv.addFile('cabin-press.docx', DOCX_BYTES);
  linkedRoot = share;
}

beforeEach(() => {
  clearDriveSearchCaches();
  seedShareWithLibraryTypes();
});

describe('buildProjectSearchIndexes with a linked folder and no Drive', () => {
  it('writes the shared index into the folder and only indexes folder-sourced docs', async () => {
    const convex = makeConvex();
    const result = await buildProjectSearchIndexes(convex, 'p1');
    expect(result.stores).toEqual(['folder']);
    expect(result.total).toBe(FOLDER_OWNED_IDS.length);
    expect(result.indexed).toBe(FOLDER_OWNED_IDS.length);
    expect(result.perDoc.map((d) => d.documentId).sort()).toEqual([...FOLDER_OWNED_IDS].sort());

    const app = await share.getDirectoryHandle(APP_FOLDER_NAME);
    const file = await (await (await app.getFileHandle(indexFileName('p1'))).getFile()).text();
    const parsed = JSON.parse(file);
    expect(parsed.documents.map((d: { documentId: string }) => d.documentId).sort()).toEqual(
      [...FOLDER_OWNED_IDS].sort(),
    );
    // Vectors + offsets only - never the manual text.
    expect(file).not.toContain('Brake wear');
    expect(file).not.toContain('Time Limits');
    // Convex-owned uploads must never appear in the folder index.
    expect(parsed.documents.map((d: { documentId: string }) => d.documentId)).not.toContain('doc-stored');
    expect(parsed.documents.map((d: { documentId: string }) => d.documentId)).not.toContain(
      'doc-uploaded-png',
    );
    expect(parsed.builtAgainstVersion).toBe(3);
  });

  it('fails with a clear message when neither a folder nor Drive is available', async () => {
    linkedRoot = null;
    await expect(buildProjectSearchIndexes(makeConvex(), 'p1')).rejects.toThrow(
      /not configured|Link a manuals folder/i,
    );
  });
});

describe('searchProjectDocuments over the folder index', () => {
  it('finds passages from the folder index without any Drive, and does not flag Drive as unavailable', async () => {
    const convex = makeConvex();
    await buildProjectSearchIndexes(convex, 'p1');
    const res = await searchProjectDocuments(convex, {
      projectId: 'p1',
      query: 'brake wear limits',
      topK: 3,
      allowRerank: false,
    });
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
    const res = await searchProjectDocuments(makeConvex(), {
      projectId: 'p1',
      query: 'brake',
      topK: 3,
      allowRerank: false,
    });
    expect(res.chunks[0]?.documentId).toBe('doc-brake');
  });

  it('finds linked XML (empty MIME) via folder search after index build', async () => {
    const convex = makeConvex();
    await buildProjectSearchIndexes(convex, 'p1');
    const res = await searchProjectDocuments(convex, {
      projectId: 'p1',
      query: 'time limits',
      topK: 5,
      allowRerank: false,
    });
    const ids = res.chunks.map((c) => c.documentId);
    expect(ids.some((id) => id === 'doc-xml' || id === 'doc-js-xml')).toBe(true);
    // Tags must not leak into searchable text (xml ingest strips them).
    expect(res.chunks.some((c) => /<para>|<printgroup>/i.test(c.text))).toBe(false);
  });

  it('finds linked PNG and JPEG (OCR text) via folder search', async () => {
    const convex = makeConvex();
    await buildProjectSearchIndexes(convex, 'p1');
    const png = await searchProjectDocuments(convex, {
      projectId: 'p1',
      query: 'oxygen bottle',
      topK: 3,
      allowRerank: false,
    });
    expect(png.chunks[0]?.documentId).toBe('doc-png');
    expect(png.chunks[0]?.text).toMatch(/oxygen bottle/i);

    const jpeg = await searchProjectDocuments(convex, {
      projectId: 'p1',
      query: 'flap torque',
      topK: 3,
      allowRerank: false,
    });
    expect(jpeg.chunks[0]?.documentId).toBe('doc-jpeg');
    expect(jpeg.chunks[0]?.text).toMatch(/flap torque/i);
  });

  it('finds linked PDF and DOCX via folder search', async () => {
    const convex = makeConvex();
    await buildProjectSearchIndexes(convex, 'p1');
    const pdf = await searchProjectDocuments(convex, {
      projectId: 'p1',
      query: 'wiring diagram',
      topK: 3,
      allowRerank: false,
    });
    expect(pdf.chunks[0]?.documentId).toBe('doc-pdf');

    const docx = await searchProjectDocuments(convex, {
      projectId: 'p1',
      query: 'cabin pressure',
      topK: 3,
      allowRerank: false,
    });
    expect(docx.chunks[0]?.documentId).toBe('doc-docx');
  });

  it('merges Convex-owned uploaded docs with folder hits and never double-indexes them', async () => {
    const convex = makeConvex();
    await buildProjectSearchIndexes(convex, 'p1');
    const res = await searchProjectDocuments(convex, {
      projectId: 'p1',
      query: 'entity policy',
      topK: 5,
      allowRerank: false,
    });
    expect(res.chunks.some((c) => c.documentId === 'doc-stored')).toBe(true);
    expect(res.chunks.find((c) => c.documentId === 'doc-stored')?.text).toMatch(/entity policy/i);

    const app = await share.getDirectoryHandle(APP_FOLDER_NAME);
    const file = await (await (await app.getFileHandle(indexFileName('p1'))).getFile()).text();
    const parsed = JSON.parse(file);
    const folderIds = parsed.documents.map((d: { documentId: string }) => d.documentId);
    expect(folderIds).not.toContain('doc-stored');
    expect(folderIds).not.toContain('doc-uploaded-png');
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
    // Linked allowlisted types are searchable via folder.
    for (const id of FOLDER_OWNED_IDS) {
      expect(after.rows.find((r) => r.documentId === id)?.searchableVia).toBe('folder');
    }
    // Convex-held text is reported as searchable-via-convex, not "not indexed".
    expect(after.rows.find((r) => r.documentId === 'doc-stored')?.searchableVia).toBe('convex');
    expect(after.rows.find((r) => r.documentId === 'doc-uploaded-png')?.searchableVia).toBe(
      'convex',
    );
    const via = Object.fromEntries(after.rows.map((r) => [r.documentId, r.searchableVia]));
    expect(via['doc-drive']).toBeNull();
    expect(via['doc-xml']).toBe('folder');
    expect(via['doc-png']).toBe('folder');
  });

  it('does not throw when nothing external is configured', async () => {
    linkedRoot = null;
    const coverage = await loadProjectIndexCoverage(makeConvex(), 'p1');
    expect(coverage.folderLinked).toBe(false);
    expect(coverage.driveAvailable).toBe(false);
    expect(coverage.indexBuilt).toBe(false);
    // Convex-owned still inIndex; folder/drive owned are not.
    expect(coverage.rows.find((r) => r.documentId === 'doc-stored')?.inIndex).toBe(true);
    expect(coverage.rows.find((r) => r.documentId === 'doc-brake')?.inIndex).toBe(false);
  });
});

describe('fetchAllIndexMetaByProject', () => {
  it('walks cursor pages until isDone', async () => {
    const convex = {
      query: vi.fn(
        async (
          ref: FunctionReference<'query'>,
          args: { paginationOpts?: { cursor: string | null } },
        ) => {
          const name = getFunctionName(ref);
          if (name !== getFunctionName(api.documents.listIndexMetaByProject)) {
            throw new Error(`unexpected query ${name}`);
          }
          if (!args.paginationOpts?.cursor) {
            return { page: [rows[0]], isDone: false, continueCursor: 'c1' };
          }
          expect(args.paginationOpts.cursor).toBe('c1');
          return { page: [rows[1]], isDone: true, continueCursor: '' };
        },
      ),
      action: vi.fn(),
    };
    const all = await fetchAllIndexMetaByProject(convex, 'p1');
    expect(all.map((r) => r._id)).toEqual(['doc-brake', 'doc-hyd']);
    expect(convex.query).toHaveBeenCalledTimes(2);
  });
});
