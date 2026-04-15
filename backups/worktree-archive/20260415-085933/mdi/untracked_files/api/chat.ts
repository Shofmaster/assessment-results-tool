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

  const { provider, model, messages, system, max_tokens, temperature, thinking, tools } = req.body || {};

  if (!provider || !model || !max_tokens || !messages) {
    res.status(400).send('Missing required fields: provider, model, max_tokens, messages');
    return;
  }

  const validProviders: LLMProvider[] = ['anthropic', 'openai'];
  if (!validProviders.includes(provider)) {
    res.status(400).send(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`);
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
    res.status(status).send(msg);
  }
}
