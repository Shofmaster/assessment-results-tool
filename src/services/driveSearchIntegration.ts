/**
 * Glue between the app's Convex document model and the Drive-hosted vector
 * index. Exposes two self-contained entry points so call sites don't have to
 * plumb the Drive service or build dependency objects themselves:
 *
 *   - searchProjectDocuments(convex, args)  — drop-in replacement for the old
 *     convex.action(api.documentChunks.search, args). Same return shape.
 *   - buildProjectDriveIndex(convex, projectId, onProgress) — (re)builds the
 *     project's `<projectId>.aqv.json` index on Drive (used by the Library
 *     "Refresh search index" button).
 *
 * Source mapping rule: a document with a Convex `storageId` is read from Convex
 * storage via documents.getFileUrl (covers uploaded + previously-imported docs);
 * a document without one is a live link, read from its source (Drive / local).
 * Either way the bytes/text are read on demand and never written into the index
 * — only vectors + offsets are.
 */
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { resolveGoogleConfig } from '../utils/googleConfig';
import { getSharedDriveService, type GoogleDriveService } from './googleDrive';
import { createDriveIndexIO } from './driveIndexStorage';
import {
  indexFileName,
  loadIndex,
  type IndexDocSource,
  type DriveVectorIndex,
  type DriveIndexIO,
} from './driveVectorIndex';
import { embedQuery } from './embeddingClient';
import { DEFAULT_TOP_K, MAX_TOP_K, RERANK_CANDIDATES } from '../constants/search';
import { applyRerankToChunks, rerankPassages } from './rerankClient';
import {
  driveDocumentSearch,
  mergeSearchResults,
  type DriveSearchArgs,
  type DriveSearchResult,
  type DriveSearchDeps,
  type SearchDocRef,
  type FederatedSearchMeta,
  type FederatedSearchResult,
} from './driveSearchService';
import {
  refreshDriveIndex,
  type IndexableDoc,
  type IndexProgress,
  type IndexDocReport,
} from './driveIndexBuilder';
import {
  readSourceFile,
  type SourceResolveContext,
  SourceUnavailableError,
} from './documentSourceResolver';
import { DocumentExtractor } from './documentExtractor';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { searchPerfNow, searchPerfLog, searchPerfEvent } from '../utils/searchPerf';

/** Minimal shape of the Convex client (`useConvex()` / ConvexHttpClient). */
export interface ConvexLike {
  query: (ref: any, args: any) => Promise<any>;
  action: (ref: any, args: any) => Promise<any>;
}

/** Raw Convex `documents` row fields this module reads (from listIndexMetaByProject). */
interface ConvexDocRow {
  _id: string;
  name: string;
  path: string;
  source: string;
  mimeType?: string;
  category?: string;
  storageId?: string;
  /** SHA-256 of the source file bytes — drives the builder's byte-hash skip. */
  contentHash?: string;
  /**
   * True when Convex holds a resolvable text copy of this doc. Such docs are
   * owned + searched by the Convex documentChunks index, so the Drive index
   * skips them (avoids double-embedding). Only no-copy external references are
   * indexed on Drive.
   */
  hasConvexText?: boolean;
}

const DRIVE_PREFIX = 'google-drive://';

function stripDrivePrefix(path: string): string {
  return path.startsWith(DRIVE_PREFIX) ? path.slice(DRIVE_PREFIX.length) : path;
}

/** Map a Convex document row to the source-agnostic IndexableDoc shape. */
export function mapToIndexableDoc(doc: ConvexDocRow): IndexableDoc {
  let source: IndexDocSource;
  let path: string;
  if (doc.storageId) {
    source = 'uploaded';
    path = doc._id; // re-fetched via documents.getFileUrl({ documentId })
  } else if (doc.source === 'google-drive' || doc.source === 'gdrive') {
    source = 'gdrive';
    path = stripDrivePrefix(doc.path);
  } else if (doc.source === 'http-server') {
    source = 'http-server';
    path = doc.path;
  } else {
    source = 'local';
    path = doc.path;
  }
  return {
    documentId: doc._id,
    name: doc.name,
    source,
    path,
    mimeType: doc.mimeType,
    category: doc.category,
    sourceHash: doc.contentHash,
  };
}

/**
 * Resolve a signed-in shared Drive service from the user's stored Google config.
 * Background callers (query-time retrieval, auto-loaded coverage) must pass
 * `interactive: false`: they run without a user gesture, so the interactive
 * popup could never open and the token acquisition would fail (or, before the
 * GIS error handling was added, hang the caller forever).
 */
async function resolveDriveService(
  convex: ConvexLike,
  options?: { interactive?: boolean },
): Promise<GoogleDriveService> {
  const settings = await convex.query(api.userSettings.get, {});
  const { clientId, apiKey } = resolveGoogleConfig(settings);
  if (!clientId || !apiKey) {
    throw new Error('Google Drive is not configured. Add Drive credentials in Settings to use search.');
  }
  const service = getSharedDriveService({ clientId, apiKey });
  await service.ensureValidToken(options);
  return service;
}

/** Build a byte reader spanning Convex-storage docs and live-linked sources. */
function makeByteReader(
  convex: ConvexLike,
  service: GoogleDriveService,
): (doc: Pick<IndexableDoc, 'documentId' | 'source' | 'path' | 'name' | 'mimeType' | 'documentSourceId' | 'contentHash'>) => Promise<ArrayBuffer> {
  const ctx: SourceResolveContext = {
    getDriveFile: (fileId: string) => service.downloadFile(fileId),
    model: DEFAULT_CLAUDE_MODEL,
  };
  return async (doc) => {
    if (doc.source === 'uploaded') {
      const url = await convex.query(api.documents.getFileUrl, {
        documentId: doc.documentId as Id<'documents'>,
      });
      if (!url) {
        throw new SourceUnavailableError(
          `Stored file for "${doc.name}" is no longer available.`,
          'gdrive',
        );
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new SourceUnavailableError(`Could not download "${doc.name}" (${res.status}).`, 'gdrive');
      }
      return res.arrayBuffer();
    }
    return readSourceFile(
      {
        source: doc.source,
        path: doc.path,
        name: doc.name,
        mimeType: doc.mimeType,
        documentSourceId: doc.documentSourceId,
        contentHash: doc.contentHash,
      },
      ctx,
    );
  };
}

/**
 * Session text cache for re-fetched passages (keyed by documentId). LRU-bounded
 * by total characters so long sessions with many large manuals don't grow RAM
 * without limit (mirrors the bounds on queryEmbedCache / indexMemCache).
 */
const sessionDocText = new Map<string, string>();
const SESSION_DOC_TEXT_MAX_CHARS = 24 * 1024 * 1024; // ~24M chars of extracted text
let sessionDocTextChars = 0;

function evictDocText(documentId: string): void {
  const prev = sessionDocText.get(documentId);
  if (prev !== undefined) {
    sessionDocTextChars -= prev.length;
    sessionDocText.delete(documentId);
  }
}

function cacheDocText(documentId: string, text: string): void {
  evictDocText(documentId); // re-insert so this key becomes most-recent
  sessionDocText.set(documentId, text);
  sessionDocTextChars += text.length;
  while (sessionDocTextChars > SESSION_DOC_TEXT_MAX_CHARS && sessionDocText.size > 1) {
    const oldest = sessionDocText.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    evictDocText(oldest);
  }
}

/** Drop cached passages for a specific set of documents (project-scoped rebuilds). */
function evictDocTextFor(documentIds: Iterable<string>): void {
  for (const id of documentIds) evictDocText(id);
}

function makeReadDocumentText(
  convex: ConvexLike,
  service: GoogleDriveService,
): DriveSearchDeps['readDocumentText'] {
  const readBytes = makeByteReader(convex, service);
  const extractor = new DocumentExtractor();
  return async (ref: SearchDocRef): Promise<string> => {
    const cached = sessionDocText.get(ref.documentId);
    if (cached !== undefined) {
      cacheDocText(ref.documentId, cached); // refresh LRU recency
      return cached;
    }
    const buffer = await readBytes({
      documentId: ref.documentId,
      source: ref.source,
      path: ref.path,
      name: ref.name,
      mimeType: ref.mimeType,
    });
    const text = await extractor.extractText(buffer, ref.name, ref.mimeType ?? '', DEFAULT_CLAUDE_MODEL);
    cacheDocText(ref.documentId, text);
    return text;
  };
}

/**
 * Wipe every Drive-search session cache: parsed indexes, extracted passage text,
 * and per-project Drive IO handles (which close over the signed-in Drive service).
 * Must be called on sign-out so nothing from the previous user's session — OAuth-
 * bound IO or document text — is reachable by the next user on this browser.
 */
export function clearDriveSearchCaches(): void {
  sessionDocText.clear();
  sessionDocTextChars = 0;
  indexMemCache.clear();
  ioByProject.clear();
}

export interface SearchProjectArgs extends DriveSearchArgs {
  projectId: string;
}

export interface SearchCompanyArgs extends DriveSearchArgs {
  companyId: string;
}

/** Args for the scope-dispatching entry point (mirrors the old Convex action). */
export interface SearchDocumentsArgs extends DriveSearchArgs {
  projectId?: string;
  companyId?: string;
}

/** Map with at most `limit` tasks in flight, preserving input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Merge several per-project indexes into one searchable in-memory index. */
function mergeIndexes(indexes: DriveVectorIndex[]): DriveVectorIndex {
  const base = indexes[0];
  return {
    version: base.version,
    projectId: 'merged',
    dimension: base.dimension,
    model: base.model,
    updatedAt: new Date().toISOString(),
    documents: indexes.flatMap((i) => i.documents),
    chunks: indexes.flatMap((i) => i.chunks),
  };
}

/** In-flight freshness builds, deduped per project so rapid searches don't double-build. */
const freshInFlight = new Map<string, Promise<DriveVectorIndex | null>>();

/**
 * Transient in-memory cache of the parsed Drive index, keyed by projectId. Purely
 * ephemeral session RAM — cleared on reload, never written to localStorage /
 * IndexedDB / Convex. Holds only vectors + char offsets (exactly what already lives
 * in the `.aqv.json` on Drive; no readable document text), mirroring the existing
 * `queryEmbedCache` / `sessionDocText` session caches. This is what lets a repeat
 * search skip the multi-MB Drive download + JSON.parse when nothing has changed.
 */
interface CachedIndex {
  version: number;
  index: DriveVectorIndex;
}
const indexMemCache = new Map<string, CachedIndex>();
const INDEX_CACHE_MAX = 12; // simple LRU bound (company search touches many projects)

/** Store an index in the mem cache, enforcing the LRU bound (oldest evicted first). */
function cacheIndex(projectId: string, version: number, index: DriveVectorIndex): void {
  indexMemCache.delete(projectId); // re-insert so this key becomes most-recent
  indexMemCache.set(projectId, { version, index });
  while (indexMemCache.size > INDEX_CACHE_MAX) {
    const oldest = indexMemCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    indexMemCache.delete(oldest);
  }
}

/**
 * Per-project, session-lived DriveIndexIO instances so the resolved Drive fileId
 * (and app-folder id) survive between queries. Without this, a fresh IO was created
 * per search and re-ran `ensureAppFolder` + `findFileInFolder` (2 Drive list calls)
 * every time. Entries are keyed to the service instance that created them so a
 * credential swap (new shared Drive service) can't reuse IO bound to the old OAuth.
 */
const ioByProject = new Map<string, { service: GoogleDriveService; io: DriveIndexIO }>();
function getProjectIndexIO(service: GoogleDriveService, projectId: string): DriveIndexIO {
  const entry = ioByProject.get(projectId);
  if (entry && entry.service === service) return entry.io;
  const io = createDriveIndexIO(service, indexFileName(projectId));
  ioByProject.set(projectId, { service, io });
  return io;
}

/**
 * Return the project's Drive index, auto-rebuilding it first if stale. Staleness
 * is detected with a single cheap project-row read (documents.searchIndexState)
 * compared against the index's recorded builtAgainstVersion — so when nothing
 * changed this costs one small query and zero Drive/embed work. When the version
 * differs (doc added/changed/removed), it fetches lightweight metadata and runs
 * an incremental rebuild (only changed docs are read + embedded).
 *
 * Order matters for latency: the cheap version read happens FIRST, then the
 * in-memory cache is consulted, so an unchanged project returns with no Drive
 * download / folder-list calls / JSON.parse at all.
 */
async function ensureProjectIndexFresh(
  convex: ConvexLike,
  service: GoogleDriveService,
  projectId: string,
): Promise<DriveVectorIndex | null> {
  const inFlight = freshInFlight.get(projectId);
  if (inFlight) return inFlight;
  const run = (async (): Promise<DriveVectorIndex | null> => {
    const io = getProjectIndexIO(service, projectId);

    // 1. Cheap version read first. On failure, fall back to whatever we can load
    //    (cache or Drive) rather than failing the search.
    let version: number | null;
    try {
      const state = (await convex.query((api as any).documents.searchIndexState, {
        projectId: projectId as Id<'projects'>,
      })) as { version?: number } | null;
      version = state?.version ?? 0;
    } catch {
      version = null;
    }

    // 2. Cache hit fast path — no Drive I/O at all. When the version read failed,
    //    prefer a possibly-stale cached index over re-downloading every query.
    const cached = indexMemCache.get(projectId);
    if (cached && (version === null || cached.version === version)) {
      searchPerfEvent('index cache hit', { projectId, version });
      cacheIndex(projectId, cached.version, cached.index); // refresh LRU recency
      return cached.index;
    }

    // 3. Cache miss — load from Drive (download + parse).
    const loadStart = searchPerfNow();
    const index = await loadIndex(io, projectId);
    searchPerfLog('index download+parse', loadStart, {
      projectId,
      chunks: index?.chunks.length ?? 0,
    });

    if (version === null) {
      // Version unreadable — use whatever index we have rather than failing, but
      // don't cache it (we can't key it to a version).
      return index;
    }

    if (index && index.builtAgainstVersion === version) {
      cacheIndex(projectId, version, index); // fresh — cache for next query
      return index;
    }

    // Stale or missing: incremental rebuild against current document metadata.
    const rebuildStart = searchPerfNow();
    const rows = (await convex.query((api as any).documents.listIndexMetaByProject, {
      projectId: projectId as Id<'projects'>,
    })) as ConvexDocRow[];
    // Index only docs Convex does NOT own: no-copy external references (no
    // resolvable Convex text). Docs with a Convex text copy are served by the
    // Convex documentChunks index instead — see federated search below.
    const docs = (rows || [])
      .filter((r) => !r.hasConvexText)
      .map(mapToIndexableDoc);
    const readBytes = makeByteReader(convex, service);
    const result = await refreshDriveIndex({
      io,
      projectId,
      docs,
      readBytes: (doc) => readBytes(doc),
      ocrModel: DEFAULT_CLAUDE_MODEL,
      builtAgainstVersion: version,
      // docs is already filtered to Drive-owned (no Convex text); prune any legacy
      // entries for now-Convex-owned or deleted docs so the stores stay disjoint.
      pruneMissing: true,
    });
    searchPerfLog('index rebuild', rebuildStart, { projectId, indexed: result.indexed });
    // Passages for THIS project's docs may now be stale relative to the rebuilt
    // index; other projects' cached passages are unaffected.
    evictDocTextFor((rows || []).map((r) => r._id));
    cacheIndex(projectId, version, result.index);
    return result.index;
  })();
  freshInFlight.set(projectId, run);
  try {
    return await run;
  } finally {
    freshInFlight.delete(projectId);
  }
}

/** Run a search across already-loaded indexes (merged when more than one). */
async function runSearchOnIndexes(
  convex: ConvexLike,
  service: GoogleDriveService,
  indexes: DriveVectorIndex[],
  args: DriveSearchArgs,
): Promise<DriveSearchResult> {
  if (indexes.length === 0) return { chunks: [], documents: [] };
  const merged = indexes.length === 1 ? indexes[0] : mergeIndexes(indexes);
  const deps: DriveSearchDeps = {
    loadIndex: async () => merged,
    embedQuery: (q: string) => embedQuery(q),
    readDocumentText: makeReadDocumentText(convex, service),
  };
  // `documentIds` is Convex-only; Drive filtering uses `driveDocumentIds`.
  const driveArgs: DriveSearchArgs = {
    ...args,
    documentIds: args.driveDocumentIds,
    topK: retrievalTopK(args),
  };
  return driveDocumentSearch(driveArgs, deps);
}

function clampTopK(topK?: number): number {
  return Math.max(1, Math.min(topK ?? DEFAULT_TOP_K, MAX_TOP_K));
}

function retrievalTopK(args: DriveSearchArgs): number {
  const finalK = clampTopK(args.topK);
  if (args.allowRerank === false) return finalK;
  return Math.max(finalK, Math.min(RERANK_CANDIDATES, MAX_TOP_K));
}

async function finalizeFederatedResults(
  parts: DriveSearchResult[],
  args: DriveSearchArgs,
): Promise<DriveSearchResult> {
  const finalK = clampTopK(args.topK);
  const merged = mergeSearchResults(parts, retrievalTopK(args));
  if (args.allowRerank === false || merged.chunks.length === 0) {
    return {
      chunks: merged.chunks.slice(0, finalK),
      documents: merged.documents,
    };
  }

  const pool = merged.chunks.slice(0, Math.min(RERANK_CANDIDATES, merged.chunks.length));
  const rerankResults = await rerankPassages(
    args.query,
    pool.map((c) => c.text),
    finalK,
  );
  const reranked = applyRerankToChunks(pool, rerankResults).slice(0, finalK);
  const keptDocIds = new Set(reranked.map((c) => c.documentId));
  const documents = merged.documents.filter((d) => keptDocIds.has(d.documentId));
  return { chunks: reranked, documents };
}

/**
 * Run the Drive half of a federated search, tolerating an unconfigured/unavailable
 * Drive: returns empty results instead of throwing, so projects whose searchable
 * docs all live in Convex still work. `loadIndexes` supplies the project (or
 * merged company) indexes once the Drive service is resolved.
 */
async function driveSearchSafe(
  convex: ConvexLike,
  args: DriveSearchArgs,
  loadIndexes: (service: GoogleDriveService) => Promise<DriveVectorIndex[]>,
): Promise<{ result: DriveSearchResult; meta?: FederatedSearchMeta }> {
  try {
    // Never interactive: an Ask/search runs with no user gesture, so a Drive
    // sign-in popup can't open — fail fast into the driveUnavailable path instead.
    const service = await resolveDriveService(convex, { interactive: false });
    const indexes = await loadIndexes(service);
    const result = await runSearchOnIndexes(convex, service, indexes, args);
    return { result };
  } catch (err) {
    const driveError = err instanceof Error ? err.message : String(err);
    return {
      result: { chunks: [], documents: [] },
      meta: { driveUnavailable: true, driveError },
    };
  }
}

/** Run the Convex documentChunks.search half, tolerating any backend error. */
async function convexSearchHalf(
  convex: ConvexLike,
  scope: { projectId?: string; companyId?: string },
  args: DriveSearchArgs,
): Promise<DriveSearchResult> {
  try {
    const res = (await convex.action((api as any).documentChunks.search, {
      ...scope,
      query: args.query,
      documentIds: args.documentIds,
      categories: args.categories,
      topK: retrievalTopK(args),
      includeFullDocuments: args.includeFullDocuments,
      maxFullDocuments: args.maxFullDocuments,
    })) as DriveSearchResult | null;
    return res && Array.isArray(res.chunks) ? res : { chunks: [], documents: [] };
  } catch {
    return { chunks: [], documents: [] };
  }
}

/**
 * Federated project search. Queries both stores in parallel and merges:
 *   - Drive .aqv.json index — no-copy external references (auto-refreshed when a
 *     document changed; one cheap searchIndexState read when nothing changed).
 *   - Convex documentChunks.search — docs Convex holds a text copy for.
 * Returns the same { chunks, documents } shape as the old Convex action, so all
 * callers are unchanged. Works even when Google Drive is not configured.
 */
export async function searchProjectDocuments(
  convex: ConvexLike,
  args: SearchProjectArgs,
): Promise<FederatedSearchResult> {
  const [drive, convexHalf] = await Promise.all([
    driveSearchSafe(convex, args, async (service) => {
      const index = await ensureProjectIndexFresh(convex, service, args.projectId);
      return index ? [index] : [];
    }),
    convexSearchHalf(convex, { projectId: args.projectId }, args),
  ]);
  const merged = await finalizeFederatedResults([drive.result, convexHalf], args);
  return drive.meta ? { ...merged, meta: drive.meta } : merged;
}

/**
 * Federated company-wide search: merges every project's Drive index the user can
 * see for the company (each auto-refreshed first) with one company-scoped Convex
 * search. Per-query Convex cost for the Drive half is one searchIndexState read
 * per project (plus a metadata read for any project whose documents changed).
 */
export async function searchCompanyDocuments(
  convex: ConvexLike,
  args: SearchCompanyArgs,
): Promise<FederatedSearchResult> {
  const [drive, convexHalf] = await Promise.all([
    driveSearchSafe(convex, args, async (service) => {
      const projects = (await convex.query(api.projects.list, {})) as Array<{
        _id: string;
        companyId?: string;
      }>;
      const projectIds = (projects || [])
        .filter((p) => String(p.companyId) === String(args.companyId))
        .map((p) => String(p._id));
      if (projectIds.length === 0) return [];
      // Bounded pool: a cold company search would otherwise open one Drive
      // download/parse (and possibly a rebuild) per project all at once.
      const loaded = await mapWithConcurrency(projectIds, 4, (pid) =>
        ensureProjectIndexFresh(convex, service, pid),
      );
      return loaded.filter((x): x is DriveVectorIndex => x !== null);
    }),
    convexSearchHalf(convex, { companyId: args.companyId }, args),
  ]);
  const merged = await finalizeFederatedResults([drive.result, convexHalf], args);
  return drive.meta ? { ...merged, meta: drive.meta } : merged;
}

/**
 * Scope-dispatching entry point matching the old action's precedence: a
 * companyId means company-wide search (even if a projectId is also present),
 * otherwise project-scoped.
 */
export async function searchDocuments(
  convex: ConvexLike,
  args: SearchDocumentsArgs,
): Promise<FederatedSearchResult> {
  if (args.companyId) return searchCompanyDocuments(convex, { ...args, companyId: args.companyId });
  if (args.projectId) return searchProjectDocuments(convex, { ...args, projectId: args.projectId });
  return { chunks: [], documents: [] };
}

/** One document's current searchability, for the Library coverage panel. */
export interface CoverageRow {
  documentId: string;
  name: string;
  category?: string;
  /** True when the document is searchable in either store (Drive index or Convex). */
  inIndex: boolean;
  /**
   * Which store makes this doc searchable: 'drive' (no-copy external reference in
   * the .aqv.json index), 'convex' (Convex holds a text copy), or null (not yet
   * searchable anywhere).
   */
  searchableVia: 'drive' | 'convex' | null;
  /** True when indexed from OCR (offsets non-reproducible; full-doc retrieval). */
  scanned: boolean;
  /** Passage count from the Drive index (0 for Convex-served docs). */
  chunkCount: number;
}

export interface ProjectIndexCoverage {
  /** False when no `<projectId>.aqv.json` exists yet (index never built). */
  indexBuilt: boolean;
  rows: CoverageRow[];
}

/**
 * Read-only snapshot of which project documents are currently searchable. Loads
 * the Drive index header + lightweight document metadata and joins them — used by
 * the Library "Search coverage" panel. Does not rebuild anything.
 */
export async function loadProjectIndexCoverage(
  convex: ConvexLike,
  projectId: string,
): Promise<ProjectIndexCoverage> {
  // Auto-loaded on splash/library mount (no user gesture) — never pop a sign-in.
  const service = await resolveDriveService(convex, { interactive: false });
  const io = getProjectIndexIO(service, projectId);
  const index = await loadIndex(io, projectId);
  const rows = (await convex.query((api as any).documents.listIndexMetaByProject, {
    projectId: projectId as Id<'projects'>,
  })) as ConvexDocRow[];
  const byId = new Map((index?.documents ?? []).map((d) => [d.documentId, d]));
  return {
    indexBuilt: index !== null,
    rows: (rows || []).map((r) => {
      const entry = byId.get(r._id);
      // Convex-owned docs (with a Convex text copy) are searched via the Convex
      // documentChunks index and never appear in the Drive index — so report them
      // as searchable-via-convex rather than falsely flagging them "not indexed".
      const searchableVia: 'drive' | 'convex' | null = entry
        ? 'drive'
        : r.hasConvexText
          ? 'convex'
          : null;
      return {
        documentId: r._id,
        name: r.name,
        category: r.category,
        inIndex: searchableVia !== null,
        searchableVia,
        scanned: entry?.scanned ?? false,
        chunkCount: entry?.chunkCount ?? 0,
      };
    }),
  };
}

export interface BuildIndexResult {
  indexed: number;
  skippedUnchanged: number;
  unavailable: number;
  removed: number;
  total: number;
  /** Per-document outcome for the search-coverage panel. */
  perDoc: IndexDocReport[];
}

/**
 * (Re)build the project's Drive vector index from its current Convex documents.
 * Incremental: unchanged docs are skipped (byte-hash short-circuit). Used by the
 * Library refresh button. Stamps the project's current searchIndexVersion so the
 * auto-refresh path treats the result as fresh afterward.
 */
export async function buildProjectDriveIndex(
  convex: ConvexLike,
  projectId: string,
  onProgress?: (p: IndexProgress) => void,
  signal?: AbortSignal,
): Promise<BuildIndexResult> {
  const service = await resolveDriveService(convex);
  const rows = (await convex.query((api as any).documents.listIndexMetaByProject, {
    projectId: projectId as Id<'projects'>,
  })) as ConvexDocRow[];
  // Only no-copy external references belong in the Drive index; docs Convex holds
  // text for are served by Convex. pruneMissing then drops any legacy entries for
  // now-Convex-owned (or deleted) docs so the two stores can't double up.
  const docs = (rows || [])
    .filter((r) => !r.hasConvexText)
    .map(mapToIndexableDoc);

  let version = 0;
  try {
    const state = (await convex.query((api as any).documents.searchIndexState, {
      projectId: projectId as Id<'projects'>,
    })) as { version?: number } | null;
    version = state?.version ?? 0;
  } catch {
    // Non-fatal: index just won't get a fresh version stamp this run.
  }

  const io = getProjectIndexIO(service, projectId);
  const readBytes = makeByteReader(convex, service);

  const result = await refreshDriveIndex({
    io,
    projectId,
    docs,
    readBytes: (doc) => readBytes(doc),
    ocrModel: DEFAULT_CLAUDE_MODEL,
    builtAgainstVersion: version,
    pruneMissing: true,
    signal,
    onProgress,
  });

  // Re-fetched passages for this project may now be stale relative to the rebuilt
  // index (other projects' caches are untouched). Re-seed the index cache with the
  // freshly built index so the next search skips the Drive re-download.
  evictDocTextFor((rows || []).map((r) => r._id));
  indexMemCache.delete(projectId);
  cacheIndex(projectId, version, result.index);

  return {
    indexed: result.indexed,
    skippedUnchanged: result.skippedUnchanged,
    unavailable: result.unavailable,
    removed: result.removed,
    total: docs.length,
    perDoc: result.perDoc,
  };
}
