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
} from './driveVectorIndex';
import { embedQuery } from './embeddingClient';
import { DEFAULT_TOP_K, MAX_TOP_K } from '../constants/search';
import {
  driveDocumentSearch,
  mergeSearchResults,
  type DriveSearchArgs,
  type DriveSearchResult,
  type DriveSearchDeps,
  type SearchDocRef,
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

/** Resolve a signed-in shared Drive service from the user's stored Google config. */
async function resolveDriveService(convex: ConvexLike): Promise<GoogleDriveService> {
  const settings = await convex.query(api.userSettings.get, {});
  const { clientId, apiKey } = resolveGoogleConfig(settings);
  if (!clientId || !apiKey) {
    throw new Error('Google Drive is not configured. Add Drive credentials in Settings to use search.');
  }
  const service = getSharedDriveService({ clientId, apiKey });
  await service.ensureValidToken();
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

/** Session text cache for re-fetched passages (keyed by documentId). */
const sessionDocText = new Map<string, string>();

function makeReadDocumentText(
  convex: ConvexLike,
  service: GoogleDriveService,
): DriveSearchDeps['readDocumentText'] {
  const readBytes = makeByteReader(convex, service);
  const extractor = new DocumentExtractor();
  return async (ref: SearchDocRef): Promise<string> => {
    const cached = sessionDocText.get(ref.documentId);
    if (cached !== undefined) return cached;
    const buffer = await readBytes({
      documentId: ref.documentId,
      source: ref.source,
      path: ref.path,
      name: ref.name,
      mimeType: ref.mimeType,
    });
    const text = await extractor.extractText(buffer, ref.name, ref.mimeType ?? '', DEFAULT_CLAUDE_MODEL);
    sessionDocText.set(ref.documentId, text);
    return text;
  };
}

/** Clear the session passage cache (e.g. after rebuilding the index). */
export function clearDriveSearchSessionCache(): void {
  sessionDocText.clear();
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
 * Return the project's Drive index, auto-rebuilding it first if stale. Staleness
 * is detected with a single cheap project-row read (documents.searchIndexState)
 * compared against the index's recorded builtAgainstVersion — so when nothing
 * changed this costs one small query and zero Drive/embed work. When the version
 * differs (doc added/changed/removed), it fetches lightweight metadata and runs
 * an incremental rebuild (only changed docs are read + embedded).
 */
async function ensureProjectIndexFresh(
  convex: ConvexLike,
  service: GoogleDriveService,
  projectId: string,
): Promise<DriveVectorIndex | null> {
  const inFlight = freshInFlight.get(projectId);
  if (inFlight) return inFlight;
  const run = (async (): Promise<DriveVectorIndex | null> => {
    const io = createDriveIndexIO(service, indexFileName(projectId));
    const index = await loadIndex(io, projectId);

    let version: number;
    try {
      const state = (await convex.query((api as any).documents.searchIndexState, {
        projectId: projectId as Id<'projects'>,
      })) as { version?: number } | null;
      version = state?.version ?? 0;
    } catch {
      // Version unreadable — use whatever index we have rather than failing.
      return index;
    }

    if (index && index.builtAgainstVersion === version) return index; // fresh

    // Stale or missing: incremental rebuild against current document metadata.
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
    clearDriveSearchSessionCache();
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
  return driveDocumentSearch(args, deps);
}

function clampTopK(topK?: number): number {
  return Math.max(1, Math.min(topK ?? DEFAULT_TOP_K, MAX_TOP_K));
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
): Promise<DriveSearchResult> {
  try {
    const service = await resolveDriveService(convex);
    const indexes = await loadIndexes(service);
    return await runSearchOnIndexes(convex, service, indexes, args);
  } catch {
    // Drive not configured, token failure, or index read error — fall back to
    // whatever the Convex half returns rather than failing the whole query.
    return { chunks: [], documents: [] };
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
      topK: clampTopK(args.topK),
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
): Promise<DriveSearchResult> {
  const [drive, convexHalf] = await Promise.all([
    driveSearchSafe(convex, args, async (service) => {
      const index = await ensureProjectIndexFresh(convex, service, args.projectId);
      return index ? [index] : [];
    }),
    convexSearchHalf(convex, { projectId: args.projectId }, args),
  ]);
  return mergeSearchResults([drive, convexHalf], clampTopK(args.topK));
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
): Promise<DriveSearchResult> {
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
      const loaded = await Promise.all(
        projectIds.map((pid) => ensureProjectIndexFresh(convex, service, pid)),
      );
      return loaded.filter((x): x is DriveVectorIndex => x !== null);
    }),
    convexSearchHalf(convex, { companyId: args.companyId }, args),
  ]);
  return mergeSearchResults([drive, convexHalf], clampTopK(args.topK));
}

/**
 * Scope-dispatching entry point matching the old action's precedence: a
 * companyId means company-wide search (even if a projectId is also present),
 * otherwise project-scoped.
 */
export async function searchDocuments(
  convex: ConvexLike,
  args: SearchDocumentsArgs,
): Promise<DriveSearchResult> {
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
  const service = await resolveDriveService(convex);
  const io = createDriveIndexIO(service, indexFileName(projectId));
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

  const io = createDriveIndexIO(service, indexFileName(projectId));
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

  // Re-fetched passages may now be stale relative to a rebuilt index.
  clearDriveSearchSessionCache();

  return {
    indexed: result.indexed,
    skippedUnchanged: result.skippedUnchanged,
    unavailable: result.unavailable,
    removed: result.removed,
    total: docs.length,
    perDoc: result.perDoc,
  };
}
