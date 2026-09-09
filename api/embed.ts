import OpenAI from 'openai';
import { verifyRequestAuth } from './_lib/auth.js';
import { applyCors } from './_lib/cors.js';
import { applyRateLimitForKey } from './_lib/rateLimit.js';
import {
  AiCredentialError,
  projectHintFromRequest,
  withResolvedKey,
} from './_lib/aiCredentials.js';
import { EMBEDDING_DIMENSIONS } from '../convex/lib/embeddingConfig.js';

/**
 * Authenticated embedding proxy. Mirrors /api/claude: it holds the server-side
 * VOYAGE_API_KEY / OPENAI_API_KEY so the browser can turn text into vectors
 * without ever seeing the key. Used both to build the Drive-hosted vector index
 * and to embed search queries at lookup time.
 *
 * Request:  POST { texts: string[], inputType?: 'document' | 'query' }
 * Response: { embeddings: number[][], dimensions: number, model: string }
 *
 * The provider key is resolved per company from Convex (see
 * api/_lib/aiCredentials.ts), falling back to this runtime's VOYAGE_API_KEY /
 * OPENAI_API_KEY when no row exists. CLERK_SECRET_KEY + CONVEX_URL are still
 * required here for the auth guard.
 */

/** Embeddings are cheap; allow more headroom than the chat endpoints. */
const PER_USER_MAX_PER_MINUTE = 60;

// Caps — keep in sync with src/constants/embedding.ts (the client batches to these).
const MAX_TEXTS_PER_REQUEST = 128;
const MAX_CHARS_PER_TEXT = 8_000;
const MAX_TOTAL_CHARS = 600_000;

const VOYAGE_MODEL = process.env.VOYAGE_EMBEDDING_MODEL || 'voyage-3.5-lite';
const OPENAI_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const PROVIDER: 'openai' | 'voyage' =
  (process.env.EMBEDDING_PROVIDER || 'voyage').toLowerCase() === 'openai' ? 'openai' : 'voyage';

async function embedVoyage(
  texts: string[],
  inputType: 'document' | 'query',
  apiKey: string,
): Promise<number[][]> {
  const r = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: VOYAGE_MODEL,
      input: texts,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    const err = new Error(`Voyage embeddings failed (${r.status}): ${body.slice(0, 200)}`) as Error & {
      status?: number;
    };
    err.status = r.status;
    throw err;
  }
  const payload = (await r.json()) as { data?: Array<{ embedding?: number[] }> };
  return (payload.data || []).map((row) => row.embedding || []);
}

async function embedOpenai(texts: string[], apiKey: string): Promise<number[][]> {
  const client = new OpenAI({ apiKey });
  const resp = await client.embeddings.create({
    model: OPENAI_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return resp.data.map((row) => row.embedding);
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

  // Throttle per Clerk user so one approved account can't drain embedding spend.
  if (applyRateLimitForKey(`embed:${auth.userId}`, res, PER_USER_MAX_PER_MINUTE)) return;

  const body = req.body || {};
  const texts = body.texts;
  const inputType: 'document' | 'query' = body.inputType === 'query' ? 'query' : 'document';

  if (!Array.isArray(texts) || texts.length === 0) {
    res.status(400).send('Missing or empty field: texts');
    return;
  }
  if (texts.length > MAX_TEXTS_PER_REQUEST) {
    res.status(400).send(`Too many texts in one request (max ${MAX_TEXTS_PER_REQUEST}).`);
    return;
  }
  let totalChars = 0;
  for (const t of texts) {
    if (typeof t !== 'string' || t.length === 0) {
      res.status(400).send('Each text must be a non-empty string.');
      return;
    }
    if (t.length > MAX_CHARS_PER_TEXT) {
      res.status(400).send(`A text exceeds the ${MAX_CHARS_PER_TEXT}-char limit.`);
      return;
    }
    totalChars += t.length;
  }
  if (totalChars > MAX_TOTAL_CHARS) {
    res.status(400).send(`Total text exceeds the ${MAX_TOTAL_CHARS}-char limit.`);
    return;
  }

  try {
    const credentialContext = {
      clerkToken: auth.token as string,
      userId: auth.userId as string,
      projectId: projectHintFromRequest(req),
    };
    const embeddings = await withResolvedKey(PROVIDER, credentialContext, (apiKey) =>
      PROVIDER === 'openai'
        ? embedOpenai(texts, apiKey)
        : embedVoyage(texts, inputType, apiKey),
    );

    for (const e of embeddings) {
      if (!Array.isArray(e) || e.length !== EMBEDDING_DIMENSIONS) {
        console.error('[api/embed] dimension mismatch', {
          expected: EMBEDDING_DIMENSIONS,
          got: Array.isArray(e) ? e.length : typeof e,
        });
        res.status(502).send('Embedding provider returned unexpected dimensions.');
        return;
      }
    }

    // Audit trail for spend attribution (no text content logged).
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        endpoint: '/api/embed',
        userId: auth.userId,
        provider: PROVIDER,
        count: texts.length,
        inputType,
      })
    );

    res.status(200).json({
      embeddings,
      dimensions: EMBEDDING_DIMENSIONS,
      model: PROVIDER === 'openai' ? OPENAI_MODEL : VOYAGE_MODEL,
    });
  } catch (error: any) {
    // Surface the actionable message ('add a key in Settings') instead of
    // letting it fall through to the generic provider-failure copy below.
    if (error instanceof AiCredentialError) {
      console.error('[api/embed] credential', error.status, error.message);
      res.status(error.status).send(error.message);
      return;
    }
    const upstreamStatus: number =
      typeof error?.status === 'number' && error.status >= 400 && error.status < 600
        ? error.status
        : 500;
    console.error('[api/embed]', upstreamStatus, error?.message, error?.stack || '');
    const message =
      upstreamStatus === 429
        ? 'Embedding rate limit hit — please wait a moment and try again.'
        : upstreamStatus >= 400 && upstreamStatus < 500
          ? 'The embedding request was rejected. Please adjust and try again.'
          : 'Embedding request failed. Please try again.';
    res.status(upstreamStatus).send(message);
  }
}
