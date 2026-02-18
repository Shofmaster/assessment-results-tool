import { handleChat, type LLMProvider } from './lib/dispatch';

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
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

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
  const { provider, model, messages, system, max_tokens, temperature, thinking, tools } = body || {};

  if (!provider || !model || !max_tokens || !messages) {
    res.status(400).send('Missing required fields: provider, model, max_tokens, messages');
    return;
  }

  const validProviders: LLMProvider[] = ['anthropic', 'openai'];
  if (!validProviders.includes(provider)) {
    res.status(400).send(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`);
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

  try {
    const result = await handleChat(provider, {
      model,
      messages,
      system,
      max_tokens,
      temperature,
      thinking: provider === 'anthropic' ? thinking : undefined,
      tools: provider === 'anthropic' ? tools : undefined,
    });
    res.status(200).json(result);
  } catch (error: any) {
    const msg = error?.message || 'Chat request failed';
    const status = isRateLimitError(error) ? 429 : 500;
    console.error('[api/chat]', status, msg, error?.stack || '');
    res.status(status).send(msg);
  }
}
