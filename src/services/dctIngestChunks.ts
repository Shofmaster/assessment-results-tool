import { fileDisplayPathForUpload } from '../utils/fileUploadPaths';

export function dctDisplayNameForFile(file: File): string {
  return fileDisplayPathForUpload(file);
}

export function filterXmlFilesFromFileList(files: FileList | File[]): File[] {
  const arr = Array.from(files as FileList | File[]);
  return arr.filter((f) => f.name.toLowerCase().endsWith('.xml'));
}

/**
 * Map items with bounded concurrency (e.g. Library DCT XML uploads, traceability text resolution).
 */
export async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
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
