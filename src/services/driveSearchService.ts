/**
 * Drive-hosted document search — the read path that replaces the Convex
 * `documentChunks.search` action. It returns the SAME result shape
 * ({ chunks, documents }) so existing consumers (AskPanel, discrepancy
 * research, audit sim) work unchanged.
 *
 * Flow: embed the query → load the project's Drive index → cosine-rank chunks
 * in-browser → re-fetch the matching passages live from the source document on
 * Drive (never persisted) → slice startChar/endChar for digital docs, or fall
 * back to a bounded full-document excerpt for scanned/OCR docs whose offsets
 * aren't reproducible.
 *
 * Dependencies are injected (loadIndex / embedQuery / readDocumentText) so this
 * orchestration is unit-testable without Drive, the embed proxy, or Convex.
 */
import { normalizeText } from '../../convex/_textUtils';
import type { DriveVectorIndex, IndexSearchHit, IndexDocSource } from './driveVectorIndex';
import { searchIndex } from './driveVectorIndex';

/** Matches the Convex search action's chunk shape (see documentChunks.search). */
export type SearchMatchType = 'semantic' | 'keyword' | 'both';

export interface SearchChunk {
  chunkId: string;
  documentId: string;
  docName: string;
  category: string;
  chunkIndex: number;
  totalChunks: number;
  text: string;
  startChar: number;
  endChar: number;
  score: number;
  /** Cosine similarity from vector retrieval (when available). */
  vectorScore?: number;
  /** 1-based keyword rank from full-text search (when available). */
  keywordRank?: number | null;
  matchType?: SearchMatchType;
  /** Cross-encoder relevance from Voyage rerank (when applied). */
  rerankScore?: number;
}

export interface SearchFullDocument {
  documentId: string;
  docName: string;
  category: string;
  text: string;
}

export interface DriveSearchResult {
  chunks: SearchChunk[];
  documents: SearchFullDocument[];
}

/** Optional metadata from federated search (Drive half availability, etc.). */
export interface FederatedSearchMeta {
  driveUnavailable?: boolean;
  driveError?: string;
}

export interface FederatedSearchResult extends DriveSearchResult {
  meta?: FederatedSearchMeta;
}

export interface DriveSearchArgs {
  query: string;
  /** Filter for Convex `documentChunks.search` only. */
  documentIds?: string[];
  /** Filter for the Drive `.aqv.json` index only. When omitted, Drive searches all indexed docs. */
  driveDocumentIds?: string[];
  categories?: string[];
  topK?: number;
  includeFullDocuments?: boolean;
  maxFullDocuments?: number;
  /** When false, skip Voyage reranking (faster; fusion order only). */
  allowRerank?: boolean;
}

/** A document reference, as carried by an index hit, for live re-fetch. */
export interface SearchDocRef {
  documentId: string;
  name: string;
  source: IndexDocSource;
  path: string;
  mimeType?: string;
}

export interface DriveSearchDeps {
  /** Loads the project's parsed Drive index (or null if none exists yet). */
  loadIndex: () => Promise<DriveVectorIndex | null>;
  /** Embeds the query string into a vector via /api/embed. */
  embedQuery: (query: string) => Promise<number[]>;
  /** Reads a document's full extracted text live from its source. Should be memoized per session. */
  readDocumentText: (ref: SearchDocRef) => Promise<string>;
}

const DEFAULT_TOP_K = 12;
const MAX_TOP_K = 64;
/** Cap per scanned/full document returned, matching the server's old limit. */
const MAX_FULL_DOCUMENT_CHARS = 120_000;

function clampDoc(text: string): string {
  return text.length > MAX_FULL_DOCUMENT_CHARS
    ? `${text.slice(0, MAX_FULL_DOCUMENT_CHARS)}\n[Truncated for retrieval cost limits.]`
    : text;
}

/**
 * Merge result sets from the federated stores (the Drive `.aqv.json` index for
 * no-copy external references, and the Convex documentChunks index for docs
 * Convex holds text for). Both halves embed with the same model + dimensions, so
 * scores are directly comparable. Dedupe by documentId:chunkIndex (keep highest
 * score), sort by score desc, slice to topK; carry only the full documents whose
 * chunks survived the slice.
 */
export function mergeSearchResults(
  parts: DriveSearchResult[],
  topK: number,
): DriveSearchResult {
  const chunkByKey = new Map<string, SearchChunk>();
  for (const part of parts) {
    for (const c of part.chunks) {
      const key = `${c.documentId}:${c.chunkIndex}`;
      const existing = chunkByKey.get(key);
      if (!existing || (c.score ?? 0) > (existing.score ?? 0)) chunkByKey.set(key, c);
    }
  }
  const chunks = Array.from(chunkByKey.values())
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, Math.max(1, topK));
  const keptDocIds = new Set(chunks.map((c) => c.documentId));
  const docById = new Map<string, SearchFullDocument>();
  for (const part of parts) {
    for (const d of part.documents) {
      if (keptDocIds.has(d.documentId) && !docById.has(d.documentId)) docById.set(d.documentId, d);
    }
  }
  return { chunks, documents: Array.from(docById.values()) };
}

/**
 * Run a Drive-index search and assemble passages. Documents are read at most
 * once per call (cached locally), and again deduped by the injected
 * readDocumentText if it memoizes across calls.
 */
export async function driveDocumentSearch(
  args: DriveSearchArgs,
  deps: DriveSearchDeps,
): Promise<DriveSearchResult> {
  const query = args.query.trim();
  if (!query) return { chunks: [], documents: [] };

  const index = await deps.loadIndex();
  if (!index || index.chunks.length === 0) return { chunks: [], documents: [] };

  const topK = Math.max(1, Math.min(args.topK ?? DEFAULT_TOP_K, MAX_TOP_K));
  const queryVector = await deps.embedQuery(query);
  if (queryVector.length === 0) return { chunks: [], documents: [] };

  const hits = searchIndex(index, queryVector, topK, {
    documentIds: args.documentIds,
    categories: args.categories,
  });
  if (hits.length === 0) return { chunks: [], documents: [] };

  // Read each distinct hit document's text once (normalized for offset slicing).
  // Bounded parallelism: Drive file IO was the serial bottleneck on multi-hit queries.
  const normalizedTextByDoc = new Map<string, string>();
  const refByDoc = new Map<string, SearchDocRef>();
  for (const h of hits) {
    if (refByDoc.has(h.documentId)) continue;
    refByDoc.set(h.documentId, {
      documentId: h.documentId,
      name: h.docName,
      source: h.source,
      path: h.path,
      mimeType: h.mimeType,
    });
  }
  const READ_CONCURRENCY = 4;
  const refs = [...refByDoc.entries()];
  let readNext = 0;
  async function readWorker() {
    while (true) {
      const i = readNext++;
      if (i >= refs.length) return;
      const [docId, ref] = refs[i];
      try {
        const raw = await deps.readDocumentText(ref);
        normalizedTextByDoc.set(docId, normalizeText(raw));
      } catch {
        // Source unreadable right now — skip; its hits are dropped below.
      }
    }
  }
  if (refs.length > 0) {
    const n = Math.max(1, Math.min(READ_CONCURRENCY, refs.length));
    await Promise.all(Array.from({ length: n }, () => readWorker()));
  }

  const totalChunksByDoc = new Map(index.documents.map((d) => [d.documentId, d.chunkCount]));

  const chunks: SearchChunk[] = [];
  const scannedDocsSeen = new Set<string>();
  for (const hit of hits) {
    const normalized = normalizedTextByDoc.get(hit.documentId);
    if (normalized === undefined) continue;

    let text: string;
    let startChar = hit.startChar;
    let endChar = hit.endChar;
    if (hit.scanned) {
      // OCR offsets aren't reproducible across re-extraction, so we can't slice a
      // precise passage — emit the bounded full doc once per doc. Note: since
      // search is source-partitioned, uploaded scans (logbook/entity) are served
      // by Convex with exact stored offsets; only live-OCR'd no-copy *reference*
      // manuals reach this Drive fallback.
      if (scannedDocsSeen.has(hit.documentId)) continue;
      scannedDocsSeen.add(hit.documentId);
      text = clampDoc(normalized);
      startChar = 0;
      endChar = text.length;
    } else {
      text = normalized.slice(hit.startChar, hit.endChar).trim();
      if (!text) continue;
    }

    chunks.push({
      chunkId: `${hit.documentId}:${hit.chunkIndex}`,
      documentId: hit.documentId,
      docName: hit.docName,
      category: hit.category ?? '',
      chunkIndex: hit.chunkIndex,
      totalChunks: totalChunksByDoc.get(hit.documentId) ?? 0,
      text,
      startChar,
      endChar,
      score: hit.score,
    });
  }

  const documents: SearchFullDocument[] = [];
  if (args.includeFullDocuments && chunks.length > 0) {
    const orderedDocIds: string[] = [];
    const seen = new Set<string>();
    for (const c of chunks) {
      if (seen.has(c.documentId)) continue;
      seen.add(c.documentId);
      orderedDocIds.push(c.documentId);
    }
    const maxDocs = Math.max(
      1,
      Math.min(Math.floor(args.maxFullDocuments ?? orderedDocIds.length), orderedDocIds.length),
    );
    for (const docId of orderedDocIds.slice(0, maxDocs)) {
      const normalized = normalizedTextByDoc.get(docId);
      if (!normalized) continue;
      const meta = index.documents.find((d) => d.documentId === docId);
      documents.push({
        documentId: docId,
        docName: meta?.name ?? 'Company document',
        category: meta?.category ?? 'uploaded',
        text: clampDoc(normalized),
      });
    }
  }

  return { chunks, documents };
}

export type { IndexSearchHit };
