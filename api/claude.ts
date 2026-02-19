import Anthropic from '@anthropic-ai/sdk';

/** Send a single SSE event line (data: {...}\n\n) */
function sendSSE(res: any, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).send('Method not allowed');
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).send('Server is missing ANTHROPIC_API_KEY');
    return;
  }

  const streamRequested = req.query?.stream === 'true';

  try {
    const client = new Anthropic({ apiKey });
    const {
      model,
      max_tokens,
      messages,
      system,
      temperature,
      thinking,
      tools,
    } = req.body || {};

    if (!model || !max_tokens || !messages) {
      res.status(400).send('Missing required fields: model, max_tokens, messages');
      return;
    }

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
    if (streamRequested && res.headersSent) {
      try {
        sendSSE(res, { type: 'error', error: error?.message || 'Claude request failed' });
        res.end();
      } catch {
        // ignore
      }
    } else {
      res.status(500).send(error?.message || 'Claude request failed');
    }
  }
}
