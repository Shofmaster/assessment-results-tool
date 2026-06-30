/**
 * Drive-hosted vector index — the heart of the "everything stays on Drive"
 * search. One index file per project (`<projectId>.aqv.json`) lives in the
 * app's Drive folder. It stores, per chunk, ONLY the embedding vector and the
 * startChar/endChar offsets into the source document — never the readable chunk
 * text. At answer time the matching passages are re-sliced live from the source
 * document on Drive, so no manual content is retained anywhere but Drive.
 *
 * This module is pure + I/O-injectable (DriveIndexIO) so the format and
 * transforms are unit-testable without network. The Google Drive read/write
 * implementation of DriveIndexIO is wired up in a later phase.
 */
import { EMBEDDING_DIMENSIONS } from '../constants/embedding';
import { searchVectors } from './localVectorSearch';

/** Bump when the on-disk shape changes incompatibly. */
export const INDEX_VERSION = 1 as const;

/** Source kinds, aligned with documentSourceResolver's DocumentSource. */
export type IndexDocSource = 'gdrive' | 'local' | 'http-server' | 'uploaded';

export interface IndexedDocument {
  documentId: string;
  name: string;
  source: IndexDocSource;
  /** For gdrive docs this is the Drive file id; otherwise the relative path. */
  path: string;
  mimeType?: string;
  category?: string;
  /** SHA-256 of the normalized text the chunks were built from — staleness check. */
  contentHash: string;
  /**
   * SHA-256 of the SOURCE file bytes, as recorded by Convex (`documents.contentHash`).
   * Lets a refresh skip re-reading a document's bytes entirely when the source is
   * unchanged. Optional: absent on legacy indexes and on docs that lack a byte
   * hash, in which case the builder falls back to the text-hash staleness check.
   */
  sourceHash?: string;
  /**
   * True when the text came from OCR (scanned/image PDF), so char offsets are
   * not reproducible on re-fetch and callers must use full-document mode rather
   * than slicing startChar/endChar.
   */
  scanned: boolean;
  chunkCount: number;
}

export interface IndexedChunk {
  documentId: string;
  chunkIndex: number;
  startChar: number;
  endChar: number;
  embedding: number[];
}

export interface DriveVectorIndex {
  version: typeof INDEX_VERSION;
  projectId: string;
  dimension: number;
  model: string;
  updatedAt: string;
  /**
   * The project's `searchIndexVersion` (Convex) this index was last built
   * against. A search compares it to the live version to decide, with a single
   * project-row read, whether an incremental rebuild is needed. Absent on legacy
   * indexes (treated as stale, forcing one rebuild).
   */
  builtAgainstVersion?: number;
  documents: IndexedDocument[];
  chunks: IndexedChunk[];
}

/** Storage backend for a single project's index file. */
export interface DriveIndexIO {
  /** Return the raw file contents, or null when the index file doesn't exist yet. */
  read(): Promise<string | null>;
  write(content: string): Promise<void>;
}

export function indexFileName(projectId: string): string {
  return `${projectId}.aqv.json`;
}

export function createEmptyIndex(projectId: string, model: string): DriveVectorIndex {
  return {
    version: INDEX_VERSION,
    projectId,
    dimension: EMBEDDING_DIMENSIONS,
    model,
    updatedAt: new Date().toISOString(),
    documents: [],
    chunks: [],
  };
}

/** Chunk payload as produced by the indexer (vector + offsets, no text). */
export interface DocumentChunkVectors {
  chunkIndex: number;
  startChar: number;
  endChar: number;
  embedding: number[];
}

/**
 * Insert or replace all chunks for one document. Any existing entry for the
 * same documentId (doc metadata + chunks) is removed first, so re-indexing a
 * changed document is idempotent. Returns a new index object (does not mutate).
 */
export function upsertDocument(
  index: DriveVectorIndex,
  doc: Omit<IndexedDocument, 'chunkCount'>,
  chunks: DocumentChunkVectors[],
): DriveVectorIndex {
  const documents = index.documents.filter((d) => d.documentId !== doc.documentId);
  const keptChunks = index.chunks.filter((c) => c.documentId !== doc.documentId);
  const newChunks: IndexedChunk[] = chunks.map((c) => ({
    documentId: doc.documentId,
    chunkIndex: c.chunkIndex,
    startChar: c.startChar,
    endChar: c.endChar,
    embedding: c.embedding,
  }));
  documents.push({ ...doc, chunkCount: newChunks.length });
  return {
    ...index,
    updatedAt: new Date().toISOString(),
    documents,
    chunks: [...keptChunks, ...newChunks],
  };
}

/** Remove a document and its chunks. Returns a new index object. */
export function removeDocument(index: DriveVectorIndex, documentId: string): DriveVectorIndex {
  return {
    ...index,
    updatedAt: new Date().toISOString(),
    documents: index.documents.filter((d) => d.documentId !== documentId),
    chunks: index.chunks.filter((c) => c.documentId !== documentId),
  };
}

/** True when a document is absent or its stored text hash no longer matches. */
export function isDocumentStale(
  index: DriveVectorIndex,
  documentId: string,
  contentHash: string,
): boolean {
  const doc = index.documents.find((d) => d.documentId === documentId);
  return !doc || doc.contentHash !== contentHash;
}

const EMBEDDING_DECIMALS = 6;

/** Round to a fixed precision to roughly halve JSON size; cosine ranking is unaffected. */
function roundVec(v: number[]): number[] {
  const f = 10 ** EMBEDDING_DECIMALS;
  return v.map((x) => Math.round(x * f) / f);
}

export function serializeIndex(index: DriveVectorIndex): string {
  return JSON.stringify({
    ...index,
    chunks: index.chunks.map((c) => ({ ...c, embedding: roundVec(c.embedding) })),
  });
}

/**
 * Parse + validate an index file. Returns null for unparseable / wrong-version
 * / wrong-projectId content so the caller can rebuild from scratch rather than
 * trusting a corrupt file. Malformed individual chunks are dropped.
 */
export function parseIndex(content: string, expectedProjectId?: string): DriveVectorIndex | null {
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.version !== INDEX_VERSION) return null;
  if (typeof obj.projectId !== 'string') return null;
  if (expectedProjectId && obj.projectId !== expectedProjectId) return null;
  if (typeof obj.dimension !== 'number') return null;

  const documents = Array.isArray(obj.documents) ? (obj.documents as IndexedDocument[]) : [];
  const rawChunks = Array.isArray(obj.chunks) ? obj.chunks : [];
  const chunks: IndexedChunk[] = [];
  for (const c of rawChunks) {
    const chunk = c as Record<string, unknown>;
    if (
      typeof chunk?.documentId === 'string' &&
      Number.isFinite(chunk?.chunkIndex) &&
      Number.isFinite(chunk?.startChar) &&
      Number.isFinite(chunk?.endChar) &&
      Array.isArray(chunk?.embedding)
    ) {
      chunks.push({
        documentId: chunk.documentId,
        chunkIndex: Number(chunk.chunkIndex),
        startChar: Number(chunk.startChar),
        endChar: Number(chunk.endChar),
        embedding: chunk.embedding as number[],
      });
    }
  }

  return {
    version: INDEX_VERSION,
    projectId: obj.projectId,
    dimension: Number(obj.dimension),
    model: typeof obj.model === 'string' ? obj.model : 'unknown',
    updatedAt: typeof obj.updatedAt === 'string' ? obj.updatedAt : new Date().toISOString(),
    builtAgainstVersion:
      typeof obj.builtAgainstVersion === 'number' ? obj.builtAgainstVersion : undefined,
    documents,
    chunks,
  };
}

/** Load + parse the project's index, or null when it doesn't exist / is corrupt. */
export async function loadIndex(
  io: DriveIndexIO,
  expectedProjectId?: string,
): Promise<DriveVectorIndex | null> {
  const content = await io.read();
  if (content === null) return null;
  return parseIndex(content, expectedProjectId);
}

/** Serialize + persist the index. */
export async function saveIndex(io: DriveIndexIO, index: DriveVectorIndex): Promise<void> {
  await io.write(serializeIndex(index));
}

export interface IndexSearchHit {
  documentId: string;
  docName: string;
  source: IndexDocSource;
  path: string;
  mimeType?: string;
  category?: string;
  scanned: boolean;
  chunkIndex: number;
  startChar: number;
  endChar: number;
  score: number;
}

/**
 * Rank the index's chunks against a query vector and return the top-K hits,
 * each joined back to its document metadata (so the caller knows where on Drive
 * to re-fetch the passage from, and whether the doc is OCR/scanned).
 */
export function searchIndex(
  index: DriveVectorIndex,
  queryVector: number[],
  topK: number,
  filter?: { documentIds?: string[]; categories?: string[] },
): IndexSearchHit[] {
  const docById = new Map(index.documents.map((d) => [d.documentId, d]));
  const allowDocs = filter?.documentIds ? new Set(filter.documentIds) : null;
  const allowCats = filter?.categories?.length ? new Set(filter.categories) : null;

  const candidates = index.chunks.filter((c) => {
    if (allowDocs && !allowDocs.has(c.documentId)) return false;
    if (allowCats) {
      const doc = docById.get(c.documentId);
      if (!doc || !allowCats.has(String(doc.category || ''))) return false;
    }
    return true;
  });

  const ranked = searchVectors(queryVector, candidates, (c) => c.embedding, topK);
  const hits: IndexSearchHit[] = [];
  for (const { entry, score } of ranked) {
    const doc = docById.get(entry.documentId);
    if (!doc) continue;
    hits.push({
      documentId: doc.documentId,
      docName: doc.name,
      source: doc.source,
      path: doc.path,
      mimeType: doc.mimeType,
      category: doc.category,
      scanned: doc.scanned,
      chunkIndex: entry.chunkIndex,
      startChar: entry.startChar,
      endChar: entry.endChar,
      score,
    });
  }
  return hits;
}
