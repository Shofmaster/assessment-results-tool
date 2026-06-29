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
import {
  driveDocumentSearch,
  type DriveSearchArgs,
  type DriveSearchResult,
  type DriveSearchDeps,
  type SearchDocRef,
} from './driveSearchService';
import {
  refreshDriveIndex,
  type IndexableDoc,
  type IndexProgress,
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
}

/** Raw Convex `documents` row fields this module reads. */
interface ConvexDocRow {
  _id: string;
  name: string;
  path: string;
  source: string;
  mimeType?: string;
  category?: string;
  storageId?: string;
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

/** Load the given projects' Drive indexes, merge, and run a search across them. */
async function runIndexSearch(
  convex: ConvexLike,
  service: GoogleDriveService,
  projectIds: string[],
  args: DriveSearchArgs,
): Promise<DriveSearchResult> {
  const loaded = await Promise.all(
    projectIds.map((pid) => loadIndex(createDriveIndexIO(service, indexFileName(pid)), pid)),
  );
  const present = loaded.filter((x): x is DriveVectorIndex => x !== null);
  if (present.length === 0) return { chunks: [], documents: [] };
  const merged = present.length === 1 ? present[0] : mergeIndexes(present);
  const deps: DriveSearchDeps = {
    loadIndex: async () => merged,
    embedQuery: (q: string) => embedQuery(q),
    readDocumentText: makeReadDocumentText(convex, service),
  };
  return driveDocumentSearch(args, deps);
}

/**
 * Drive-backed replacement for convex.action(api.documentChunks.search). Loads
 * the project's Drive index, ranks in-browser, and re-fetches passages live.
 * Returns the same { chunks, documents } shape as the old Convex action.
 */
export async function searchProjectDocuments(
  convex: ConvexLike,
  args: SearchProjectArgs,
): Promise<DriveSearchResult> {
  const service = await resolveDriveService(convex);
  return runIndexSearch(convex, service, [args.projectId], args);
}

/**
 * Company-wide search: merges every project index the user can see for the
 * company. Keeps Convex out of the search loop at the cost of loading several
 * `<projectId>.aqv.json` files per query.
 */
export async function searchCompanyDocuments(
  convex: ConvexLike,
  args: SearchCompanyArgs,
): Promise<DriveSearchResult> {
  const service = await resolveDriveService(convex);
  const projects = (await convex.query(api.projects.list, {})) as Array<{
    _id: string;
    companyId?: string;
  }>;
  const projectIds = (projects || [])
    .filter((p) => String(p.companyId) === String(args.companyId))
    .map((p) => String(p._id));
  if (projectIds.length === 0) return { chunks: [], documents: [] };
  return runIndexSearch(convex, service, projectIds, args);
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

export interface BuildIndexResult {
  indexed: number;
  skippedUnchanged: number;
  unavailable: number;
  removed: number;
  total: number;
}

/**
 * (Re)build the project's Drive vector index from its current Convex documents.
 * Incremental: unchanged docs are skipped. Used by the Library refresh button.
 */
export async function buildProjectDriveIndex(
  convex: ConvexLike,
  projectId: string,
  onProgress?: (p: IndexProgress) => void,
  signal?: AbortSignal,
): Promise<BuildIndexResult> {
  const service = await resolveDriveService(convex);
  const rows = (await convex.query(api.documents.listByProject, {
    projectId: projectId as Id<'projects'>,
  })) as ConvexDocRow[];
  const docs = (rows || []).map(mapToIndexableDoc);

  const io = createDriveIndexIO(service, indexFileName(projectId));
  const readBytes = makeByteReader(convex, service);

  const result = await refreshDriveIndex({
    io,
    projectId,
    docs,
    readBytes: (doc) => readBytes(doc),
    ocrModel: DEFAULT_CLAUDE_MODEL,
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
  };
}
