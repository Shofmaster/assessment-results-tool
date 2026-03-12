import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClaudeMessage, createClaudeMessageStream } from '../../services/claudeProxy';
import type { ClaudeMessageParams } from '../../services/claudeProxy';

const SAMPLE_PARAMS: ClaudeMessageParams = {
  model: 'claude-sonnet-4-6',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
};

describe('createClaudeMessage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to /api/claude with JSON body', async () => {
    const mockResponse = {
      ok: true,
      json: () => Promise.resolve({ content: [{ type: 'text', text: 'Hi' }] }),
    };
    (fetch as any).mockResolvedValue(mockResponse);

    await createClaudeMessage(SAMPLE_PARAMS);

    expect(fetch).toHaveBeenCalledWith(
      '/api/claude',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SAMPLE_PARAMS),
      }),
    );
  });

  it('returns parsed JSON response on success', async () => {
    const expected = { content: [{ type: 'text', text: 'Response' }], stop_reason: 'end_turn' };
    (fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(expected),
    });

    const result = await createClaudeMessage(SAMPLE_PARAMS);
    expect(result).toEqual(expected);
  });

  it('throws on non-ok response with detail text', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
      text: () => Promise.resolve('Rate limited'),
    });

    await expect(createClaudeMessage(SAMPLE_PARAMS)).rejects.toThrow('Rate limited');
  });

  it('throws generic message when detail text is empty', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve(''),
    });

    await expect(createClaudeMessage(SAMPLE_PARAMS)).rejects.toThrow(
      'Claude request failed (500)',
    );
  });

  it('wraps AbortError as timeout', async () => {
    const abortError = new DOMException('The operation was aborted', 'AbortError');
    (fetch as any).mockRejectedValue(abortError);

    await expect(
      createClaudeMessage(SAMPLE_PARAMS, { timeoutMs: 100 }),
    ).rejects.toThrow(/timed out/);
  });

  it('re-throws non-abort errors', async () => {
    const networkError = new TypeError('Failed to fetch');
    (fetch as any).mockRejectedValue(networkError);

    await expect(createClaudeMessage(SAMPLE_PARAMS)).rejects.toThrow('Failed to fetch');
  });
});

describe('createClaudeMessageStream', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends POST to /api/claude?stream=true', async () => {
    const doneEvent = `data: ${JSON.stringify({ type: 'done', message: { content: [{ type: 'text', text: 'hi' }] } })}\n\n`;
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(doneEvent));
        controller.close();
      },
    });
    (fetch as any).mockResolvedValue({
      ok: true,
      body: stream,
    });

    await createClaudeMessageStream(SAMPLE_PARAMS);

    expect(fetch).toHaveBeenCalledWith(
      '/api/claude?stream=true',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(SAMPLE_PARAMS),
      }),
    );
  });

  it('fires onText callback for content_block_delta events', async () => {
    const events = [
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } })}\n\n`,
      `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: ' World' } })}\n\n`,
      `data: ${JSON.stringify({ type: 'done', message: { content: [{ type: 'text', text: 'Hello World' }] } })}\n\n`,
    ];
    const stream = new ReadableStream({
      start(controller) {
        for (const e of events) {
          controller.enqueue(new TextEncoder().encode(e));
        }
        controller.close();
      },
    });
    (fetch as any).mockResolvedValue({ ok: true, body: stream });

    const chunks: string[] = [];
    await createClaudeMessageStream(SAMPLE_PARAMS, {
      onText: (text) => chunks.push(text),
    });

    expect(chunks).toEqual(['Hello', ' World']);
  });

  it('throws on non-ok response', async () => {
    (fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal error'),
    });

    await expect(createClaudeMessageStream(SAMPLE_PARAMS)).rejects.toThrow('Internal error');
  });

  it('throws when response body is missing', async () => {
    (fetch as any).mockResolvedValue({ ok: true, body: null });

    await expect(createClaudeMessageStream(SAMPLE_PARAMS)).rejects.toThrow(
      'Streaming response has no body',
    );
  });

  it('throws when stream ends without done event', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'partial' } })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    (fetch as any).mockResolvedValue({ ok: true, body: stream });

    await expect(createClaudeMessageStream(SAMPLE_PARAMS)).rejects.toThrow(
      'Stream ended without done event',
    );
  });

  it('rejects on stream error event', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            `data: ${JSON.stringify({ type: 'error', error: 'Something broke' })}\n\n`,
          ),
        );
        controller.close();
      },
    });
    (fetch as any).mockResolvedValue({ ok: true, body: stream });

    await expect(createClaudeMessageStream(SAMPLE_PARAMS)).rejects.toThrow('Something broke');
  });
});
