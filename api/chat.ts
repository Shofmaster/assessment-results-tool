import { handleChat, type LLMProvider } from './_lib/dispatch.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { checkBodySize, validateClaudeRequest } from './_lib/validate.js';
import { applyCors } from './_lib/cors.js';
import { applyRateLimitForKey } from './_lib/rateLimit.js';
import {
  AiCredentialError,
  projectHintFromRequest,
  withResolvedKey,
} from './_lib/aiCredentials.js';

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

  // No env presence check here any more: a company can have its own key on
  // file while this runtime's environment is empty. Resolution below reports
  // a missing key with an actionable message.

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
    const credentialContext = {
      clerkToken: auth.token as string,
      userId: auth.userId as string,
      projectId: projectHintFromRequest(req),
    };
    const result = await withResolvedKey(provider, credentialContext, (apiKey) =>
      handleChat(
        provider,
        {
          model: validated.model,
          messages,
          system,
          max_tokens: validated.max_tokens,
          temperature,
          thinking: provider === 'anthropic' ? validated.thinking : undefined,
          tools: provider === 'anthropic' ? (validated.tools as any) : undefined,
        },
        apiKey,
      ),
    );
    res.status(200).json(result);
  } catch (error: any) {
    // Surface the actionable message ('add a key in Settings') rather than
    // the generic provider-failure copy below.
    if (error instanceof AiCredentialError) {
      console.error('[api/chat] credential', error.status, error.message);
      res.status(error.status).send(error.message);
      return;
    }
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
