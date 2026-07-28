/**
 * Persistent cache for Claude-vision OCR results, keyed by source-file bytes.
 *
 * OCR is the only genuinely expensive step in document indexing: one Claude
 * request per rasterized page. Without a cache the same scanned manual is
 * re-OCR'd on every index rebuild AND again at query time (search re-extracts
 * the document to slice passage text out of it), so a single manual can cost
 * its full page price many times over.
 *
 * Entries are cached PER PAGE so a run that aborts, hits the page limit, or
 * stops early still keeps what it paid for. The key includes the model and a
 * format version, so switching OCR models or changing the rasterization
 * parameters invalidates cleanly instead of serving stale transcriptions.
 *
 * The stored value is extracted text from the user's own documents, so the
 * database is listed in sessionCleanup.ts and wiped when a different user signs
 * in on this browser. Every function here is best-effort: IndexedDB being
 * unavailable (private mode, quota, SSR/tests) degrades to "no cache", never an
 * error.
 */

const IDB_NAME = 'aviation-ocr-cache';
const IDB_STORE = 'pages';
/** Bump when rasterization or the prompt changes in a way that alters output. */
const CACHE_FORMAT_VERSION = 1;

/** Entries older than this are dropped on read — bounds unbounded growth. */
const MAX_ENTRY_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

export interface CachedOcrPage {
  text: string;
  confidence?: number;
  /** Epoch ms; used for age-based eviction. */
  storedAt: number;
}

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) {
        req.result.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** SHA-256 hex of raw bytes — the cache identity of a source file. */
export async function hashBytes(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * `pageIndex` is the 1-based PDF page number, or `null` for a whole-file image
 * (which has no page dimension).
 */
function cacheKey(sourceHash: string, pageIndex: number | null, model: string): string {
  return `v${CACHE_FORMAT_VERSION}:${model}:${sourceHash}:${pageIndex ?? 'img'}`;
}

export async function getCachedOcrPage(
  sourceHash: string,
  pageIndex: number | null,
  model: string,
): Promise<CachedOcrPage | null> {
  if (!idbAvailable()) return null;
  try {
    const db = await openIdb();
    try {
      const entry = await new Promise<CachedOcrPage | undefined>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(cacheKey(sourceHash, pageIndex, model));
        req.onsuccess = () => resolve(req.result as CachedOcrPage | undefined);
        req.onerror = () => reject(req.error);
      });
      if (!entry || typeof entry.text !== 'string') return null;
      if (Date.now() - (entry.storedAt ?? 0) > MAX_ENTRY_AGE_MS) return null;
      return entry;
    } finally {
      db.close();
    }
  } catch {
    return null;
  }
}

export async function putCachedOcrPage(
  sourceHash: string,
  pageIndex: number | null,
  model: string,
  page: { text: string; confidence?: number },
): Promise<void> {
  if (!idbAvailable()) return;
  // Never cache a failed transcription — it would poison the doc permanently.
  if (!page.text.trim()) return;
  try {
    const db = await openIdb();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const value: CachedOcrPage = {
          text: page.text,
          confidence: page.confidence,
          storedAt: Date.now(),
        };
        tx.objectStore(IDB_STORE).put(value, cacheKey(sourceHash, pageIndex, model));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  } catch {
    // Quota exceeded / private mode — indexing continues uncached.
  }
}
