import Anthropic from '@anthropic-ai/sdk';
import { verifyRequestAuth } from './lib/auth.js';
import { checkBodySize, validateClaudeRequest } from './lib/validate.js';

/** Send a single SSE event line (data: {...}\n\n) */
function sendSSE(res: any, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const auth = await verifyRequestAuth(req);
  if (!auth.ok) {
    res.status(auth.status ?? 401).send(auth.message ?? 'Unauthorized');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).send('Server is missing ANTHROPIC_API_KEY');
    return;
  }

  const streamRequested = req.query?.stream === 'true';

  const tooLarge = checkBodySize(req);
  if (tooLarge) {
    res.status(tooLarge.status).send(tooLarge.message);
    return;
  }

  try {
    const client = new Anthropic({ apiKey });
    const { messages, system, temperature } = req.body || {};

    if (!messages) {
      res.status(400).send('Missing required fields: model, max_tokens, messages');
      return;
    }

    const validated = validateClaudeRequest(req.body || {});
    if (!validated.ok) {
      res.status(validated.status).send(validated.message);
      return;
    }
    const { model, max_tokens, thinking } = validated;
    const tools = validated.tools as Anthropic.Messages.ToolUnion[] | undefined;

    if (streamRequested) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.status(200);
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const stream = client.messages.stream({
        model,
        max_tokens,
        messages,
        system,
        temperature,
        thinking,
        tools,
      });

      try {
        for await (const event of stream) {
          sendSSE(res, event);
          if (typeof res.flush === 'function') res.flush();
        }
        const finalMessage = await stream.finalMessage();
        sendSSE(res, { type: 'done', message: finalMessage });
      } catch (streamErr: any) {
        sendSSE(res, { type: 'error', error: streamErr?.message || 'Stream failed' });
      }
      res.end();
      return;
    }

    const result = await client.messages.create({
      model,
      max_tokens,
      messages,
      system,
      temperature,
      thinking,
      tools,
    });

    res.status(200).json(result);
  } catch (error: any) {
    // Preserve Anthropic error classification so the client can decide whether
    // to retry. The SDK attaches `status` (429/529/etc.) on its thrown errors.
    const upstreamStatus: number | undefined =
      typeof error?.status === 'number'
        ? error.status
        : typeof error?.response?.status === 'number'
          ? error.response.status
          : undefined;
    const retryAfterSeconds: string | undefined =
      typeof error?.headers?.['retry-after'] === 'string'
        ? error.headers['retry-after']
        : typeof error?.response?.headers?.get === 'function'
          ? (error.response.headers.get('retry-after') ?? undefined)
          : undefined;
    // Log the detail server-side only; clients get a generic message so
    // upstream internals (key hints, infra paths) never leak in responses.
    console.error('[api/claude]', upstreamStatus ?? 500, error?.message, error?.stack || '');
    const message =
      upstreamStatus === 429
        ? 'Anthropic rate limit hit — please wait a moment and try again.'
        : upstreamStatus === 529
          ? 'Anthropic is overloaded — please retry shortly.'
          : upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 500
            ? 'Claude rejected the request. Please adjust and try again.'
            : 'Claude request failed. Please try again.';
    if (streamRequested && res.headersSent) {
      try {
        sendSSE(res, { type: 'error', error: message, status: upstreamStatus });
        res.end();
      } catch {
        // ignore
      }
    } else {
      if (retryAfterSeconds) {
        try {
          res.setHeader('Retry-After', retryAfterSeconds);
        } catch {
          // header may already be sent in some runtimes
        }
      }
      // Pass through 4xx/5xx upstream statuses unchanged when they look valid.
      const statusToReturn =
        upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 600
          ? upstreamStatus
          : 500;
      res.status(statusToReturn).send(message);
    }
  }
}
