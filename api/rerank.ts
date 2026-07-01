import { verifyRequestAuth } from './lib/auth.js';
import { applyCors } from './lib/cors.js';
import { applyRateLimitForKey } from './lib/rateLimit.js';

/**
 * Authenticated reranking proxy (Voyage rerank-2.5-lite).
 *
 * Request:  POST { query: string, documents: string[], topK?: number }
 * Response: { results: Array<{ index: number, relevanceScore: number }>, model: string }
 */

const PER_USER_MAX_PER_MINUTE = 60;
const MAX_DOCUMENTS_PER_REQUEST = 64;
const MAX_CHARS_PER_DOCUMENT = 8_000;
const MAX_QUERY_CHARS = 2_000;
const RERANK_MODEL = process.env.VOYAGE_RERANK_MODEL || 'rerank-2.5-lite';
const RERANK_TIMEOUT_MS = 8_000;

async function rerankVoyage(
  query: string,
  documents: string[],
  topK?: number,
): Promise<Array<{ index: number; relevance_score: number }>> {
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) throw new Error('Server is missing VOYAGE_API_KEY');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RERANK_TIMEOUT_MS);
  try {
    const r = await fetch('https://api.voyageai.com/v1/rerank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents,
        top_k: topK ?? documents.length,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      const err = new Error(`Voyage rerank failed (${r.status}): ${body.slice(0, 200)}`) as Error & {
        status?: number;
      };
      err.status = r.status;
      throw err;
    }
    const payload = (await r.json()) as {
      data?: Array<{ index?: number; relevance_score?: number }>;
    };
    return (payload.data || []).map((row) => ({
      index: typeof row.index === 'number' ? row.index : 0,
      relevance_score: typeof row.relevance_score === 'number' ? row.relevance_score : 0,
    }));
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req: any, res: any) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const auth = await verifyRequestAuth(req);
  if (!auth.ok) {
    res.status(auth.status ?? 401).send(auth.message ?? 'Unauthorized');
    return;
  }

  if (applyRateLimitForKey(`rerank:${auth.userId}`, res, PER_USER_MAX_PER_MINUTE)) return;

  const body = req.body || {};
  const query = body.query;
  const documents = body.documents;
  const topK = typeof body.topK === 'number' ? body.topK : undefined;

  if (typeof query !== 'string' || !query.trim()) {
    res.status(400).send('Missing or empty field: query');
    return;
  }
  if (query.length > MAX_QUERY_CHARS) {
    res.status(400).send(`Query exceeds the ${MAX_QUERY_CHARS}-char limit.`);
    return;
  }
  if (!Array.isArray(documents) || documents.length === 0) {
    res.status(400).send('Missing or empty field: documents');
    return;
  }
  if (documents.length > MAX_DOCUMENTS_PER_REQUEST) {
    res.status(400).send(`Too many documents in one request (max ${MAX_DOCUMENTS_PER_REQUEST}).`);
    return;
  }
  for (const doc of documents) {
    if (typeof doc !== 'string') {
      res.status(400).send('Each document must be a string.');
      return;
    }
    if (doc.length > MAX_CHARS_PER_DOCUMENT) {
      res.status(400).send(`A document exceeds the ${MAX_CHARS_PER_DOCUMENT}-char limit.`);
      return;
    }
  }

  try {
    const ranked = await rerankVoyage(query.trim(), documents, topK);
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        endpoint: '/api/rerank',
        userId: auth.userId,
        model: RERANK_MODEL,
        count: documents.length,
      }),
    );
    res.status(200).json({
      results: ranked.map((row) => ({
        index: row.index,
        relevanceScore: row.relevance_score,
      })),
      model: RERANK_MODEL,
    });
  } catch (error: any) {
    const upstreamStatus: number =
      typeof error?.status === 'number' && error.status >= 400 && error.status < 600
        ? error.status
        : error?.name === 'AbortError'
          ? 504
          : 500;
    console.error('[api/rerank]', upstreamStatus, error?.message, error?.stack || '');
    const message =
      upstreamStatus === 429
        ? 'Rerank rate limit hit — please wait a moment and try again.'
        : upstreamStatus === 504
          ? 'Rerank request timed out — results will use fusion order.'
          : upstreamStatus >= 400 && upstreamStatus < 500
            ? 'The rerank request was rejected. Please adjust and try again.'
            : 'Rerank request failed. Please try again.';
    res.status(upstreamStatus).send(message);
  }
}
