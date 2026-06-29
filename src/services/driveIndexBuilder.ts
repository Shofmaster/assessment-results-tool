/**
 * Client-side indexing orchestrator for the Drive-hosted vector index.
 *
 * For each project document it: reads the source bytes (live, via
 * documentSourceResolver — never persisted), extracts text + backend metadata,
 * hashes the normalized text to skip unchanged docs, chunks, embeds the chunks
 * through /api/embed, and upserts {vector + offsets} into the project's
 * `<projectId>.aqv.json` index on Drive. Chunk TEXT is sent to the embedding
 * provider but never written to the index — only vectors and char offsets are.
 */
import { DocumentExtractor } from './documentExtractor';
import { hashText, isScannedBackend } from './indexTextUtils';
import { SourceUnavailableError } from './documentSourceResolver';
import { splitIntoChunks } from './localVectorSearch';
import { embedDocuments } from './embeddingClient';
import {
  type DriveVectorIndex,
  type DriveIndexIO,
  type IndexDocSource,
  loadIndex,
  saveIndex,
  createEmptyIndex,
  upsertDocument,
  removeDocument,
  isDocumentStale,
} from './driveVectorIndex';
import { normalizeText } from '../../convex/_textUtils';
import { VOYAGE_EMBEDDING_MODEL } from '../constants/embedding';

export { hashText, isScannedBackend } from './indexTextUtils';

/** A project document to index, with enough to read its source live. */
export interface IndexableDoc {
  documentId: string;
  name: string;
  source: IndexDocSource;
  /** Drive file id for `gdrive`; relative path otherwise. */
  path: string;
  mimeType?: string;
  category?: string;
  /** For `http-server` source: which configured documentSources row to fetch from. */
  documentSourceId?: string;
  /** Optional precomputed byte hash — used only for the source text cache key. */
  contentHash?: string;
}

export type IndexPhase = 'extract' | 'embed' | 'skip' | 'unavailable' | 'save' | 'done';

export interface IndexProgress {
  phase: IndexPhase;
  documentId?: string;
  docName?: string;
  done: number;
  total: number;
}

export interface RefreshDriveIndexOptions {
  io: DriveIndexIO;
  projectId: string;
  docs: IndexableDoc[];
  /**
   * Reads the raw bytes for a document, live from its source. The builder never
   * persists these bytes. Throw SourceUnavailableError to signal an unlinked /
   * unreachable source (the existing index entry is then left untouched).
   */
  readBytes: (doc: IndexableDoc) => Promise<ArrayBuffer>;
  /** Model used for OCR fallback during text extraction. */
  ocrModel?: string;
  /** Embedding model label recorded in the index header. */
  model?: string;
  signal?: AbortSignal;
  /**
   * Remove index entries for documents not present in `docs`. Default true.
   * Skipped automatically if the run is aborted partway (so unprocessed docs
   * aren't wrongly dropped).
   */
  pruneMissing?: boolean;
  onProgress?: (p: IndexProgress) => void;
}

export interface RefreshDriveIndexResult {
  index: DriveVectorIndex;
  indexed: number;
  skippedUnchanged: number;
  unavailable: number;
  removed: number;
  aborted: boolean;
}

/**
 * Build or incrementally refresh the project's Drive index against `docs`.
 * Unchanged documents (same normalized-text hash) are skipped; sources that
 * can't be read are left as-is in the index (not dropped) so a transient Drive
 * hiccup doesn't wipe entries.
 */
export async function refreshDriveIndex(
  opts: RefreshDriveIndexOptions,
): Promise<RefreshDriveIndexResult> {
  const model = opts.model ?? VOYAGE_EMBEDDING_MODEL;
  let index = (await loadIndex(opts.io, opts.projectId)) ?? createEmptyIndex(opts.projectId, model);
  const extractor = new DocumentExtractor();
  const seen = new Set<string>();

  let indexed = 0;
  let skippedUnchanged = 0;
  let unavailable = 0;
  let removed = 0;
  let aborted = false;
  let done = 0;
  const total = opts.docs.length;

  for (const doc of opts.docs) {
    if (opts.signal?.aborted) {
      aborted = true;
      break;
    }
    seen.add(doc.documentId);
    opts.onProgress?.({ phase: 'extract', documentId: doc.documentId, docName: doc.name, done, total });

    let buffer: ArrayBuffer;
    try {
      buffer = await opts.readBytes(doc);
    } catch (err) {
      // Source not linked / unreachable: keep any existing index entry untouched.
      if (err instanceof SourceUnavailableError) {
        unavailable += 1;
        opts.onProgress?.({ phase: 'unavailable', documentId: doc.documentId, docName: doc.name, done, total });
        done += 1;
        continue;
      }
      throw err;
    }

    const extracted = await extractor.extractTextWithMetadata(
      buffer,
      doc.name,
      doc.mimeType ?? '',
      opts.ocrModel,
    );
    const contentHash = await hashText(normalizeText(extracted.text));

    if (!isDocumentStale(index, doc.documentId, contentHash)) {
      skippedUnchanged += 1;
      opts.onProgress?.({ phase: 'skip', documentId: doc.documentId, docName: doc.name, done, total });
      done += 1;
      continue;
    }

    const spans = splitIntoChunks(extracted.text);
    if (spans.length === 0) {
      // Nothing extractable — drop any stale entry for this doc.
      if (!isDocumentStale(index, doc.documentId, contentHash)) removed += 1;
      index = removeDocument(index, doc.documentId);
      done += 1;
      continue;
    }

    opts.onProgress?.({ phase: 'embed', documentId: doc.documentId, docName: doc.name, done, total });
    const vectors = await embedDocuments(
      spans.map((s) => s.text),
      { signal: opts.signal },
    );

    index = upsertDocument(
      index,
      {
        documentId: doc.documentId,
        name: doc.name,
        source: doc.source,
        path: doc.path,
        mimeType: doc.mimeType,
        category: doc.category,
        contentHash,
        scanned: isScannedBackend(extracted.metadata.backend),
      },
      spans.map((s, i) => ({
        chunkIndex: s.chunkIndex,
        startChar: s.startChar,
        endChar: s.endChar,
        embedding: vectors[i] ?? [],
      })),
    );
    indexed += 1;
    done += 1;
  }

  // Prune entries for documents that no longer exist — only on a complete run.
  if (!aborted && (opts.pruneMissing ?? true)) {
    const toRemove = index.documents.filter((d) => !seen.has(d.documentId)).map((d) => d.documentId);
    for (const id of toRemove) {
      index = removeDocument(index, id);
      removed += 1;
    }
  }

  opts.onProgress?.({ phase: 'save', done, total });
  await saveIndex(opts.io, index);
  opts.onProgress?.({ phase: 'done', done, total });

  return { index, indexed, skippedUnchanged, unavailable, removed, aborted };
}
