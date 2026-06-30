/**
 * Browser-side embedding client. Calls the authenticated /api/embed proxy so
 * the Voyage/OpenAI key never reaches the browser. Used to build the
 * Drive-hosted vector index and to embed search queries.
 */
import { authedJsonHeaders } from './authToken';
import {
  EMBED_MAX_TEXTS_PER_REQUEST,
  EMBED_MAX_CHARS_PER_TEXT,
} from '../constants/embedding';

interface EmbedResponse {
  embeddings: number[][];
  dimensions: number;
  model: string;
}

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const secs = Number(retryAfter.trim());
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, MAX_BACKOFF_MS);
  }
  return Math.min(INITIAL_BACKOFF_MS * 2 ** attempt + Math.random() * 250, MAX_BACKOFF_MS);
}

/** POST one batch to /api/embed, refreshing the token once on 401 and retrying transient errors. */
async function postEmbed(
  texts: string[],
  inputType: 'document' | 'query',
  signal?: AbortSignal,
): Promise<number[][]> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let res = await fetch('/api/embed', {
      method: 'POST',
      headers: await authedJsonHeaders(),
      body: JSON.stringify({ texts, inputType }),
      signal,
    });
    if (res.status === 401) {
      res = await fetch('/api/embed', {
        method: 'POST',
        headers: await authedJsonHeaders({ forceRefresh: true }),
        body: JSON.stringify({ texts, inputType }),
        signal,
      });
    }

    if (res.ok) {
      const payload = (await res.json()) as EmbedResponse;
      return payload.embeddings;
    }

    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    if (!retryable || attempt >= MAX_RETRIES) {
      const detail = await res.text().catch(() => '');
      throw new Error(detail || `Embedding request failed (${res.status})`);
    }
    await sleep(backoffMs(attempt, res.headers.get('retry-after')));
  }
  throw new Error('Embedding request failed after retries');
}

export interface EmbedDocumentsOptions {
  signal?: AbortSignal;
  /** Called after each batch with the count embedded so far (for progress UI). */
  onProgress?: (embedded: number, total: number) => void;
}

/**
 * Embed many document chunks, batched to the proxy's per-request cap. Returns
 * vectors aligned 1:1 with `texts`. Throws if any text exceeds the per-text cap
 * (chunks are sized well under it).
 */
export async function embedDocuments(
  texts: string[],
  options: EmbedDocumentsOptions = {},
): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_MAX_TEXTS_PER_REQUEST) {
    const batch = texts.slice(i, i + EMBED_MAX_TEXTS_PER_REQUEST);
    const vectors = await postEmbed(batch, 'document', options.signal);
    out.push(...vectors);
    options.onProgress?.(out.length, texts.length);
  }
  return out;
}

/** Embed a single search query. The query is clamped to the per-text cap. */
/**
 * Per-session cache of query embeddings keyed by the clamped query text. A search
 * embeds the same query string repeatedly (multi-turn Ask, re-runs, and the two
 * federated halves), so this avoids redundant /api/embed round-trips. Bounded to
 * keep memory flat; cleared implicitly on page reload.
 */
const queryEmbedCache = new Map<string, number[]>();
const QUERY_EMBED_CACHE_MAX = 200;

export async function embedQuery(text: string, signal?: AbortSignal): Promise<number[]> {
  const clamped = text.length > EMBED_MAX_CHARS_PER_TEXT ? text.slice(0, EMBED_MAX_CHARS_PER_TEXT) : text;
  const cached = queryEmbedCache.get(clamped);
  if (cached) return cached;
  const vectors = await postEmbed([clamped], 'query', signal);
  const embedding = vectors[0] ?? [];
  if (embedding.length) {
    // Simple FIFO bound: drop the oldest entry when full.
    if (queryEmbedCache.size >= QUERY_EMBED_CACHE_MAX) {
      const oldest = queryEmbedCache.keys().next().value;
      if (oldest !== undefined) queryEmbedCache.delete(oldest);
    }
    queryEmbedCache.set(clamped, embedding);
  }
  return embedding;
}
