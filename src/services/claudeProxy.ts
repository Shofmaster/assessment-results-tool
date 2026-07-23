import { authedJsonHeaders } from './authToken';

export type ClaudeMessageContent =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface ClaudeSystemBlock {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
}

/** A tool the model may call (Anthropic tool-use format). */
export interface ClaudeTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

/** A built-in Anthropic tool (e.g. web_search) that uses a type identifier instead of input_schema. */
export interface ClaudeBuiltinTool {
  type: string;
  name: string;
  /** Per-request cap on tool invocations (web search is billed per use). */
  max_uses?: number;
}

export type AnyClaudeTool = ClaudeTool | ClaudeBuiltinTool;

export interface ClaudeMessageParams {
  model: string;
  max_tokens: number;
  messages: Array<{
    role: 'user' | 'assistant';
    // Assistant turns replayed in a tool-use loop carry tool_use blocks.
    content: string | Array<ClaudeMessageContent | ClaudeToolUseBlock | ClaudeToolResultContent>;
  }>;
  system?: string | ClaudeSystemBlock[];
  temperature?: number;
  thinking?: { type: 'enabled'; budget_tokens: number };
  tools?: AnyClaudeTool[];
}

/** Content block returned when the model invokes a tool. */
export interface ClaudeToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, string>;
}

/** Content block sent back to the model with a tool's result. */
export interface ClaudeToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export interface ClaudeMessageResponse {
  stop_reason?: string;
  content: Array<{ type: string; text?: string } | ClaudeToolUseBlock>;
}

const DEFAULT_TIMEOUT_MS = 180000; // 3 minutes for long document extraction
/** No SSE bytes for this long → treat the stream as stalled. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 60_000;
/** Max retry attempts for transient upstream errors (429, 529, network). */
const DEFAULT_RETRIES = 4;
/** Initial backoff when no Retry-After header is provided. */
const DEFAULT_INITIAL_BACKOFF_MS = 2_000;
/** Upper cap so we never sleep more than this between attempts. */
const MAX_BACKOFF_MS = 60_000;

/** Parse the Retry-After header (seconds or HTTP-date) into milliseconds. */
function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_BACKOFF_MS);
  }
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diff = dateMs - Date.now();
    return diff > 0 ? Math.min(diff, MAX_BACKOFF_MS) : 0;
  }
  return null;
}

/** Compute backoff delay in ms for the nth retry attempt (0-indexed). */
function computeBackoffMs(
  attempt: number,
  retryAfterHeader: string | null,
): number {
  const fromHeader = parseRetryAfterMs(retryAfterHeader);
  if (fromHeader !== null) return fromHeader;
  const expo = DEFAULT_INITIAL_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.random() * 500;
  return Math.min(expo + jitter, MAX_BACKOFF_MS);
}

/** Error surfaced to callers when we've exhausted retries on a rate-limit response. */
export class ClaudeRateLimitError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'ClaudeRateLimitError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Thrown when the caller aborts the request via `signal` (e.g. user cancelled a long run). */
export class ClaudeRequestCancelledError extends Error {
  constructor(message = 'Request cancelled') {
    super(message);
    this.name = 'ClaudeRequestCancelledError';
  }
}

/** POST to Claude proxy with bearer auth; retry once with a fresh Clerk token on 401. */
async function authedClaudeFetch(
  url: string,
  init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> },
): Promise<Response> {
  const { headers: extraHeaders, ...rest } = init;
  let response = await fetch(url, {
    ...rest,
    headers: { ...(await authedJsonHeaders()), ...extraHeaders },
  });
  if (response.status === 401) {
    response = await fetch(url, {
      ...rest,
      headers: { ...(await authedJsonHeaders({ forceRefresh: true })), ...extraHeaders },
    });
  }
  return response;
}

function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (!signal) {
    return new Promise((r) => setTimeout(r, ms));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new ClaudeRequestCancelledError());
    };
    signal.addEventListener('abort', onAbort);
  });
}

export async function createClaudeMessage(
  params: ClaudeMessageParams,
  options?: {
    timeoutMs?: number;
    retries?: number;
    onRetry?: (info: { attempt: number; waitMs: number; status?: number }) => void;
    /** When aborted, fetch is aborted and `ClaudeRequestCancelledError` is thrown (no retries). */
    signal?: AbortSignal;
  },
): Promise<ClaudeMessageResponse> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.retries ?? DEFAULT_RETRIES;
  const userSignal = options?.signal;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (userSignal?.aborted) {
      throw new ClaudeRequestCancelledError();
    }
    // Perform one attempt. Returns:
    //  - { kind: 'ok', response } on success
    //  - { kind: 'retry', waitMs, status? } when the attempt should be retried
    //  - throws for terminal failures (404/400/timeout/exhausted rate-limit)
    const outcome = await (async (): Promise<
      | { kind: 'ok'; response: ClaudeMessageResponse }
      | { kind: 'retry'; waitMs: number; status?: number }
    > => {
      const composed = new AbortController();
      const timeoutId = setTimeout(() => composed.abort(), timeoutMs);
      const onUserAbort = () => {
        clearTimeout(timeoutId);
        composed.abort();
      };
      if (userSignal) {
        if (userSignal.aborted) {
          clearTimeout(timeoutId);
          throw new ClaudeRequestCancelledError();
        }
        userSignal.addEventListener('abort', onUserAbort, { once: true });
      }
      try {
        let response: Response;
        try {
          response = await authedClaudeFetch('/api/claude', {
            method: 'POST',
            body: JSON.stringify(params),
            signal: composed.signal,
          });
        } catch (err: unknown) {
          if (err instanceof Error && err.name === 'AbortError') {
            if (userSignal?.aborted) {
              throw new ClaudeRequestCancelledError();
            }
            throw new Error(`Claude request timed out after ${timeoutMs / 1000} seconds`);
          }
          // Network-level failures are retryable too.
          if (attempt >= maxRetries) throw err;
          return { kind: 'retry', waitMs: computeBackoffMs(attempt, null) };
        }

        if (response.ok) {
          const payload = (await response.json()) as ClaudeMessageResponse;
          return { kind: 'ok', response: payload };
        }

        const status = response.status;
        const retryAfter = response.headers?.get?.('retry-after') ?? null;
        const isRateLimit = status === 429 || status === 529;
        const isRetryable = isRateLimit || (status >= 500 && status < 600);
        const detail = await safeReadText(response);
        if (!isRetryable || attempt >= maxRetries) {
          if (isRateLimit) {
            throw new ClaudeRateLimitError(
              detail ||
                (status === 429
                  ? 'Anthropic rate limit hit — please wait and try again.'
                  : 'Anthropic is overloaded — please retry shortly.'),
              status,
              parseRetryAfterMs(retryAfter) ?? undefined,
            );
          }
          throw new Error(detail || `Claude request failed (${status})`);
        }
        return { kind: 'retry', waitMs: computeBackoffMs(attempt, retryAfter), status };
      } finally {
        clearTimeout(timeoutId);
        if (userSignal) {
          userSignal.removeEventListener('abort', onUserAbort);
        }
      }
    })();

    if (outcome.kind === 'ok') return outcome.response;
    options?.onRetry?.({
      attempt: attempt + 1,
      waitMs: outcome.waitMs,
      status: outcome.status,
    });
    try {
      await sleepWithAbort(outcome.waitMs, userSignal);
    } catch (e) {
      if (e instanceof ClaudeRequestCancelledError) throw e;
      throw e;
    }
  }
  // Should be unreachable because the inner block throws once retries are exhausted.
  throw new Error('Claude request failed after retries');
}

export interface ClaudeMessageStreamCallbacks {
  onText?: (text: string) => void;
}

/**
 * Call Claude with streaming (POST /api/claude?stream=true).
 * Invokes onText for each content_block_delta text chunk; resolves with the final message when done.
 * Overall + idle timeouts and an optional caller AbortSignal prevent perpetual "Thinking…" hangs.
 */
export async function createClaudeMessageStream(
  params: ClaudeMessageParams,
  callbacks: ClaudeMessageStreamCallbacks = {},
  options?: {
    timeoutMs?: number;
    /** Abort if no SSE bytes arrive for this long (default 60s). */
    idleTimeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<ClaudeMessageResponse> {
  const { onText } = callbacks;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const idleTimeoutMs = options?.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS;
  const userSignal = options?.signal;

  if (userSignal?.aborted) {
    throw new ClaudeRequestCancelledError();
  }

  const composed = new AbortController();
  let abortReason: 'user' | 'timeout' | 'idle' | null = null;
  const overallTimer = setTimeout(() => {
    abortReason = 'timeout';
    composed.abort();
  }, timeoutMs);
  const onUserAbort = () => {
    abortReason = 'user';
    clearTimeout(overallTimer);
    composed.abort();
  };
  if (userSignal) {
    userSignal.addEventListener('abort', onUserAbort, { once: true });
  }

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const clearIdleTimer = () => {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  };
  const bumpIdleTimer = () => {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      abortReason = 'idle';
      composed.abort();
    }, idleTimeoutMs);
  };

  const cleanup = () => {
    clearTimeout(overallTimer);
    clearIdleTimer();
    if (userSignal) {
      userSignal.removeEventListener('abort', onUserAbort);
    }
  };

  const abortError = (): Error => {
    if (abortReason === 'user' || userSignal?.aborted) {
      return new ClaudeRequestCancelledError();
    }
    if (abortReason === 'idle') {
      return new Error(
        `Claude stream stalled — no data for ${idleTimeoutMs / 1000} seconds. Please try again.`,
      );
    }
    return new Error(`Claude stream timed out after ${timeoutMs / 1000} seconds`);
  };

  try {
    let response: Response;
    try {
      bumpIdleTimer();
      response = await authedClaudeFetch('/api/claude?stream=true', {
        method: 'POST',
        body: JSON.stringify(params),
        signal: composed.signal,
      });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw abortError();
      }
      throw err;
    }

    if (!response.ok) {
      const detail = await safeReadText(response);
      const status = response.status;
      if (status === 429 || status === 529) {
        const waitMs = parseRetryAfterMs(response.headers.get('retry-after')) ?? undefined;
        throw new ClaudeRateLimitError(
          detail ||
            (status === 429
              ? 'Anthropic rate limit hit — please wait and try again.'
              : 'Anthropic is overloaded — please retry shortly.'),
          status,
          waitMs,
        );
      }
      throw new Error(detail || `Claude stream request failed (${status})`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Streaming response has no body');
    }
    const bodyReader = reader;

    const decoder = new TextDecoder();
    let buffer = '';

    return await new Promise<ClaudeMessageResponse>((resolve, reject) => {
      let settled = false;
      const onComposeAbort = () => {
        void bodyReader.cancel().catch(() => {});
        finish(abortError());
      };
      composed.signal.addEventListener('abort', onComposeAbort, { once: true });

      function finish(err?: Error, result?: ClaudeMessageResponse) {
        if (settled) return;
        settled = true;
        composed.signal.removeEventListener('abort', onComposeAbort);
        cleanup();
        if (err) reject(err);
        else if (result !== undefined) resolve(result);
      }

      function processLine(line: string) {
        if (!line.startsWith('data: ')) return;
        const payload = line.slice(6);
        if (payload === '[DONE]' || payload.trim() === '') return;
        try {
          const event = JSON.parse(payload) as {
            type: string;
            delta?: { type?: string; text?: string };
            message?: ClaudeMessageResponse;
            error?: string;
          };
          if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta' && event.delta.text) {
            onText?.(event.delta.text);
          }
          if (event.type === 'done' && event.message) {
            finish(undefined, event.message as ClaudeMessageResponse);
          }
          if (event.type === 'error') {
            finish(new Error(event.error || 'Stream error'));
          }
        } catch {
          // ignore malformed lines
        }
      }

      function pump(): Promise<void> {
        return bodyReader.read().then(({ done, value }) => {
          if (settled) return;
          if (done) {
            buffer.split('\n').forEach(processLine);
            if (!settled) finish(new Error('Stream ended without done event'));
            return;
          }
          bumpIdleTimer();
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split('\n\n');
          buffer = parts.pop() ?? '';
          parts.forEach((chunk) => {
            chunk.split('\n').forEach(processLine);
          });
          return pump();
        });
      }

      bumpIdleTimer();
      pump().catch((err) => {
        if (settled) return;
        if (err instanceof Error && err.name === 'AbortError') {
          finish(abortError());
          return;
        }
        finish(err instanceof Error ? err : new Error(String(err)));
      });
    });
  } catch (err) {
    cleanup();
    throw err;
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}
