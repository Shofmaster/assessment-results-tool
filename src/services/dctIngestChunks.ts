import type { ParsedDctToolDocument } from './dctXmlParser';

export const DEFAULT_DCT_INGEST_BATCH_SIZE = 12;

export function dctDisplayNameForFile(file: File): string {
  const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  if (rel && rel.trim().length > 0) {
    return rel.replace(/\\/g, '/');
  }
  return file.name;
}

export function filterXmlFilesFromFileList(files: FileList | File[]): File[] {
  const arr = Array.from(files as FileList | File[]);
  return arr.filter((f) => f.name.toLowerCase().endsWith('.xml'));
}

/**
 * Call Convex ingestXmlBatch in chunks to stay under argument size limits.
 */
export async function ingestDctDocumentsInChunks(args: {
  ingestBatch: (payload: { projectId: string; documents: ParsedDctToolDocument[] }) => Promise<unknown>;
  projectId: string;
  documents: ParsedDctToolDocument[];
  batchSize?: number;
  onProgress?: (ingested: number, total: number) => void;
}): Promise<{ totalIngested: number; chunkErrors: string[] }> {
  const { ingestBatch, projectId, documents } = args;
  const batchSize = args.batchSize ?? DEFAULT_DCT_INGEST_BATCH_SIZE;
  const chunkErrors: string[] = [];
  let totalIngested = 0;
  const total = documents.length;
  for (let i = 0; i < documents.length; i += batchSize) {
    const chunk = documents.slice(i, i + batchSize);
    try {
      await ingestBatch({ projectId, documents: chunk });
      totalIngested += chunk.length;
      args.onProgress?.(totalIngested, total);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      chunkErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${msg}`);
    }
  }
  return { totalIngested, chunkErrors };
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
