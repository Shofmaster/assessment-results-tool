import Anthropic from '@anthropic-ai/sdk';
import { verifyRequestAuth } from './_lib/auth.js';
import { checkBodySize, validateClaudeRequest } from './_lib/validate.js';
import { applyCors } from './_lib/cors.js';
import { applyRateLimitForKey } from './_lib/rateLimit.js';
import {
  AiCredentialError,
  invalidateAiKey,
  isAuthRejection,
  projectHintFromRequest,
  resolveAiKey,
} from './_lib/aiCredentials.js';

/** Max AI requests per user per minute. Blunts runaway spend; tune as needed. */
const PER_USER_MAX_PER_MINUTE = 15;

/** Send a single SSE event line (data: {...}\n\n) */
function sendSSE(res: any, data: object) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

/** Anthropic attaches `status` to its thrown errors; dig it out of either shape. */
function upstreamStatusOf(error: any): number | undefined {
  if (typeof error?.status === 'number') return error.status;
  if (typeof error?.response?.status === 'number') return error.response.status;
  return undefined;
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

  // Throttle per Clerk user so one approved account can't drain Anthropic spend.
  if (applyRateLimitForKey(`user:${auth.userId}`, res, PER_USER_MAX_PER_MINUTE)) return;

  const streamRequested = req.query?.stream === 'true';

  const tooLarge = checkBodySize(req);
  if (tooLarge) {
    res.status(tooLarge.status).send(tooLarge.message);
    return;
  }

  try {
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

    // Which company pays for this call. The project hint is untrusted - Convex
    // re-authorizes it against the caller's memberships and drops it if bogus.
    const credentialContext = {
      clerkToken: auth.token as string,
      userId: auth.userId as string,
      projectId: projectHintFromRequest(req),
    };

    let resolved;
    try {
      resolved = await resolveAiKey('anthropic', credentialContext);
    } catch (credErr: any) {
      const status = credErr instanceof AiCredentialError ? credErr.status : 503;
      res.status(status).send(credErr?.message || 'No Anthropic key is configured.');
      return;
    }

    // Audit trail for AI spend: who called which model with what budget, and
    // whose key paid. Captured by Vercel log drains for cost attribution.
    console.log(
      JSON.stringify({
        ts: new Date().toISOString(),
        endpoint: '/api/claude',
        userId: auth.userId,
        model,
        max_tokens,
        thinking: thinking ? thinking.budget_tokens : 0,
        stream: streamRequested,
        credentialSource: resolved.source,
        companyId: resolved.companyId,
      })
    );

    const request = { model, max_tokens, messages, system, temperature, thinking, tools };

    if (streamRequested) {
      // Headers are flushed lazily, on the first event rather than up front, so
      // that a key rejected at the very start can still be retried on a clean
      // response. Once a byte is out, the status is fixed.
      let headersSent = false;
      const ensureHeaders = () => {
        if (headersSent) return;
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.status(200);
        if (typeof res.flushHeaders === 'function') res.flushHeaders();
        headersSent = true;
      };

      const runStream = async (apiKey: string) => {
        const stream = new Anthropic({ apiKey }).messages.stream(request);
        for await (const event of stream) {
          ensureHeaders();
          sendSSE(res, event);
          if (typeof res.flush === 'function') res.flush();
        }
        const finalMessage = await stream.finalMessage();
        ensureHeaders();
        sendSSE(res, { type: 'done', message: finalMessage });
      };

      try {
        await runStream(resolved.apiKey);
      } catch (streamErr: any) {
        const status = upstreamStatusOf(streamErr);

        // A rotated or revoked key: drop the cached copy and try once more.
        // Only safe while nothing has been written yet.
        if (isAuthRejection(status) && !headersSent) {
          invalidateAiKey(resolved.cacheKey);
          try {
            const retry = await resolveAiKey('anthropic', credentialContext);
            await runStream(retry.apiKey);
            res.end();
            return;
          } catch (retryErr: any) {
            const retryStatus = upstreamStatusOf(retryErr);
            const message = isAuthRejection(retryStatus)
              ? 'Your Anthropic key was rejected. A company admin should re-check it in Settings → AI Keys.'
              : retryErr?.message || 'Stream failed';
            if (!headersSent) {
              res.status(retryStatus && retryStatus >= 400 && retryStatus < 600 ? retryStatus : 500);
              res.send(message);
              return;
            }
            sendSSE(res, { type: 'error', error: message });
            res.end();
            return;
          }
        }

        ensureHeaders();
        sendSSE(res, { type: 'error', error: streamErr?.message || 'Stream failed' });
      }
      res.end();
      return;
    }

    let result;
    try {
      result = await new Anthropic({ apiKey: resolved.apiKey }).messages.create(request);
    } catch (err: any) {
      if (!isAuthRejection(upstreamStatusOf(err))) throw err;
      // Same one-shot retry as the streaming path.
      invalidateAiKey(resolved.cacheKey);
      const retry = await resolveAiKey('anthropic', credentialContext);
      result = await new Anthropic({ apiKey: retry.apiKey }).messages.create(request);
    }

    res.status(200).json(result);
  } catch (error: any) {
    // Preserve Anthropic error classification so the client can decide whether
    // to retry. The SDK attaches `status` (429/529/etc.) on its thrown errors.
    const upstreamStatus = upstreamStatusOf(error);
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
          : isAuthRejection(upstreamStatus)
            ? 'Your Anthropic key was rejected. A company admin should re-check it in Settings → AI Keys.'
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
