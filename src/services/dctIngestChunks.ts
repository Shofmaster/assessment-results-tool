import type { ParsedDctToolDocument } from './dctXmlParser';
import { fileDisplayPathForUpload } from '../utils/fileUploadPaths';

export const DEFAULT_DCT_INGEST_BATCH_SIZE = 12;
/** Maximum total questions across all documents in a single mutation call.
 * Each question costs 2 DB writes (dctQuestions + dctComparisons), plus reads
 * for deletes on update. Keeping this low avoids Convex per-transaction limits. */
export const MAX_QUESTIONS_PER_BATCH = 150;

export function dctDisplayNameForFile(file: File): string {
  return fileDisplayPathForUpload(file);
}

export function filterXmlFilesFromFileList(files: FileList | File[]): File[] {
  const arr = Array.from(files as FileList | File[]);
  return arr.filter((f) => f.name.toLowerCase().endsWith('.xml'));
}

/**
 * Call Convex ingestXmlBatch in chunks to stay under argument size limits.
 */
export async function ingestDctDocumentsInChunks(args: {
  ingestBatch: (payload: {
    projectId: string;
    documents: ParsedDctToolDocument[];
    skipExistingByHash?: boolean;
  }) => Promise<unknown>;
  projectId: string;
  documents: ParsedDctToolDocument[];
  skipExistingByHash?: boolean;
  batchSize?: number;
  onProgress?: (ingested: number, total: number, skipped: number) => void;
}): Promise<{ totalIngested: number; totalSkipped: number; chunkErrors: string[] }> {
  const { ingestBatch, projectId, documents, skipExistingByHash } = args;
  const batchSize = args.batchSize ?? DEFAULT_DCT_INGEST_BATCH_SIZE;
  const chunkErrors: string[] = [];
  let totalIngested = 0;
  let totalSkipped = 0;
  const total = documents.length;

  // Build question-count-aware batches so a single mutation never exceeds
  // MAX_QUESTIONS_PER_BATCH total questions (each question = 2 DB writes).
  const batches: ParsedDctToolDocument[][] = [];
  let current: ParsedDctToolDocument[] = [];
  let currentQCount = 0;
  for (const doc of documents) {
    const dq = doc.questions.length;
    if (current.length > 0 && (current.length >= batchSize || currentQCount + dq > MAX_QUESTIONS_PER_BATCH)) {
      batches.push(current);
      current = [];
      currentQCount = 0;
    }
    current.push(doc);
    currentQCount += dq;
  }
  if (current.length > 0) batches.push(current);

  for (let b = 0; b < batches.length; b++) {
    const chunk = batches[b];
    try {
      const result = await ingestBatch({ projectId, documents: chunk, skipExistingByHash }) as
        | { ingested?: number; skippedExisting?: number }
        | undefined;
      const ingested = typeof result?.ingested === 'number' ? result.ingested : chunk.length;
      const skipped = typeof result?.skippedExisting === 'number' ? result.skippedExisting : 0;
      totalIngested += ingested;
      totalSkipped += skipped;
      args.onProgress?.(totalIngested, total, totalSkipped);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      chunkErrors.push(`Batch ${b + 1}: ${msg}`);
    }
  }
  return { totalIngested, totalSkipped, chunkErrors };
}

/**
 * Map items with bounded concurrency (e.g. Library DCT XML uploads).
 */
export async function parallelMap<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }
  if (items.length === 0) return [];
  const n = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}
