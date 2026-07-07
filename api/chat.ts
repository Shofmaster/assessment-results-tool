import { handleChat, type LLMProvider } from './_lib/dispatch.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { checkBodySize, validateClaudeRequest } from './_lib/validate.js';
import { applyCors } from './_lib/cors.js';
import { applyRateLimitForKey } from './_lib/rateLimit.js';

/** Max AI requests per user per minute. Blunts runaway spend; tune as needed. */
const PER_USER_MAX_PER_MINUTE = 15;

function isRateLimitError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    msg.includes('429') ||
    msg.includes('rate limit') ||
    msg.includes('tokens per minute') ||
    msg.includes('overloaded')
  );
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

  // Throttle per Clerk user so one approved account can't drain AI spend.
  if (applyRateLimitForKey(`user:${auth.userId}`, res, PER_USER_MAX_PER_MINUTE)) return;

  // Vercel may send body as string; parse if needed
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      res.status(400).send('Invalid JSON body');
      return;
    }
  }
  const { provider, model, messages, system, max_tokens, temperature } = body || {};

  if (!provider || !model || !max_tokens || !messages) {
    res.status(400).send('Missing required fields: provider, model, max_tokens, messages');
    return;
  }

  const validProviders: LLMProvider[] = ['anthropic', 'openai'];
  if (!validProviders.includes(provider)) {
    res.status(400).send(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`);
    return;
  }

  const tooLarge = checkBodySize(req);
  if (tooLarge) {
    res.status(tooLarge.status).send(tooLarge.message);
    return;
  }

  const validated = validateClaudeRequest(body || {}, provider);
  if (!validated.ok) {
    res.status(validated.status).send(validated.message);
    return;
  }

  // Fail fast with a clear message if the chosen provider's API key is missing
  if (provider === 'anthropic' && !process.env.ANTHROPIC_API_KEY) {
    res.status(503).send(
      'AI (Claude) is not configured: ANTHROPIC_API_KEY is not set on the server. Add it in Vercel → Project → Settings → Environment Variables (or in .env when using vercel dev), or switch to OpenAI in Settings.'
    );
    return;
  }
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    res.status(503).send(
      'AI (OpenAI) is not configured: OPENAI_API_KEY is not set on the server. Add it in Vercel → Project → Settings → Environment Variables (or in .env when using vercel dev), or switch to Claude in Settings.'
    );
    return;
  }

  // Audit trail for AI spend: who called which provider/model with what budget.
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      endpoint: '/api/chat',
      userId: auth.userId,
      provider,
      model: validated.model,
      max_tokens: validated.max_tokens,
      thinking: validated.thinking ? validated.thinking.budget_tokens : 0,
    })
  );

  try {
    const result = await handleChat(provider, {
      model: validated.model,
      messages,
      system,
      max_tokens: validated.max_tokens,
      temperature,
      thinking: provider === 'anthropic' ? validated.thinking : undefined,
      tools: provider === 'anthropic' ? (validated.tools as any) : undefined,
    });
    res.status(200).json(result);
  } catch (error: any) {
    // Log the detail server-side only; clients get a generic message so
    // upstream internals never leak in responses.
    const status = isRateLimitError(error) ? 429 : 500;
    console.error('[api/chat]', status, error?.message, error?.stack || '');
    res.status(status).send(
      status === 429
        ? 'AI provider rate limit hit — please wait a moment and try again.'
        : 'Chat request failed. Please try again.'
    );
  }
}
