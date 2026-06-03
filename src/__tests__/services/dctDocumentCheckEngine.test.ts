import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getDctDocumentCheckSystemPrompt } from '../../services/auditAgents';

// Preserve the real error classes (the engine uses `instanceof` on them in its
// catch block); only stub the network call.
vi.mock('../../services/claudeProxy', async (importActual) => {
  const actual = await importActual<typeof import('../../services/claudeProxy')>();
  return { ...actual, createClaudeMessage: vi.fn() };
});

import { createClaudeMessage, ClaudeRateLimitError } from '../../services/claudeProxy';
import { runDctDocumentCheckBatch } from '../../services/dctDocumentCheckEngine';

const DOCS = [{ id: 'd1', name: 'Manual', text: 'x'.repeat(200), category: 'entity' }];

/** Build a content envelope shaped like a Claude message response. */
function textResponse(text: string) {
  return { content: [{ type: 'text', text }] } as any;
}

function makeQuestions(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    comparisonId: `c${i}`,
    questionText: `Question ${i}?`,
  }));
}

describe('runDctDocumentCheckBatch', () => {
  beforeEach(() => {
    vi.mocked(createClaudeMessage).mockReset();
    vi.mocked(createClaudeMessage).mockResolvedValue(textResponse('[]'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('system prompt wiring', () => {
    it('forwards a custom systemPrompt with ephemeral cache_control', async () => {
      await runDctDocumentCheckBatch('claude-sonnet-4-20250514', DOCS, makeQuestions(1), {
        systemPrompt: 'CUSTOM_DOC_CHECK_PROMPT',
      });
      expect(createClaudeMessage).toHaveBeenCalledTimes(1);
      const payload = vi.mocked(createClaudeMessage).mock.calls[0][0] as {
        system?: Array<{ type: string; text?: string; cache_control?: { type: string } }>;
      };
      expect(payload.system?.[0]?.text).toBe('CUSTOM_DOC_CHECK_PROMPT');
      expect(payload.system?.[0]?.cache_control?.type).toBe('ephemeral');
    });

    it('falls back to the default document-check system prompt', async () => {
      await runDctDocumentCheckBatch('claude-sonnet-4-20250514', DOCS, makeQuestions(1));
      const payload = vi.mocked(createClaudeMessage).mock.calls[0][0] as {
        system?: Array<{ type: string; text?: string }>;
      };
      expect(payload.system?.[0]?.text).toBe(
        getDctDocumentCheckSystemPrompt('faa-dct-traceability'),
      );
    });
  });

  describe('batching (spend cap)', () => {
    it('makes exactly one API call per batch — never more', async () => {
      vi.useFakeTimers();
      // 25 questions, batchSize 10 → ceil(25/10) = 3 batches = 3 calls.
      const promise = runDctDocumentCheckBatch(
        'claude-sonnet-4-20250514',
        DOCS,
        makeQuestions(25),
        { batchSize: 10 },
      );
      await vi.runAllTimersAsync();
      await promise;
      expect(createClaudeMessage).toHaveBeenCalledTimes(3);
    });

    it('reports cumulative progress capped at the question total', async () => {
      vi.useFakeTimers();
      const progress: Array<{ processed: number; total: number }> = [];
      const promise = runDctDocumentCheckBatch(
        'claude-sonnet-4-20250514',
        DOCS,
        makeQuestions(25),
        {
          batchSize: 10,
          onBatchProgress: (processed, total) => progress.push({ processed, total }),
        },
      );
      await vi.runAllTimersAsync();
      await promise;
      expect(progress.at(-1)).toEqual({ processed: 25, total: 25 });
      // processed never exceeds the total
      expect(progress.every((p) => p.processed <= p.total)).toBe(true);
    });
  });

  describe('result normalization', () => {
    it('coerces unknown/invalid severities to "observation" and keeps valid ones', async () => {
      vi.mocked(createClaudeMessage).mockResolvedValueOnce(
        textResponse(
          JSON.stringify([
            { comparisonId: 'c0', status: 'gap', severity: 'CRITICAL' },
            { comparisonId: 'c1', status: 'gap', severity: 'bogus' },
            { comparisonId: 'c2', status: 'gap' },
          ]),
        ),
      );
      const results = await runDctDocumentCheckBatch(
        'claude-sonnet-4-20250514',
        DOCS,
        makeQuestions(3),
      );
      const byId = Object.fromEntries(results.map((r) => [r.comparisonId, r]));
      expect(byId.c0.severity).toBe('critical'); // case-insensitive
      expect(byId.c1.severity).toBe('observation'); // invalid → fallback
      expect(byId.c2.severity).toBe('observation'); // missing → fallback
    });

    it('drops rows with missing comparisonId or an invalid status', async () => {
      vi.mocked(createClaudeMessage).mockResolvedValueOnce(
        textResponse(
          JSON.stringify([
            { comparisonId: '', status: 'gap' },
            { comparisonId: 'c1', status: 'not_a_status' },
            { comparisonId: 'c2', status: 'aligned' },
            'garbage',
            null,
          ]),
        ),
      );
      const results = await runDctDocumentCheckBatch(
        'claude-sonnet-4-20250514',
        DOCS,
        makeQuestions(3),
      );
      expect(results).toHaveLength(1);
      expect(results[0].comparisonId).toBe('c2');
    });

    // Regression: Claude returns "" / whitespace / unknown ids for no-evidence
    // rows; an empty string fails Convex's v.id("documents") validator and
    // breaks the whole bulk mutation, so they must be coerced to undefined.
    it('drops empty/whitespace/unknown underReviewDocumentId values', async () => {
      vi.mocked(createClaudeMessage).mockResolvedValueOnce(
        textResponse(
          JSON.stringify([
            { comparisonId: 'c0', status: 'aligned', underReviewDocumentId: '' },
            { comparisonId: 'c1', status: 'gap', underReviewDocumentId: '   ' },
            { comparisonId: 'c2', status: 'mismatch', underReviewDocumentId: 'ghost-doc' },
            { comparisonId: 'c3', status: 'aligned', underReviewDocumentId: 'd1' },
          ]),
        ),
      );
      const results = await runDctDocumentCheckBatch(
        'claude-sonnet-4-20250514',
        DOCS,
        makeQuestions(4),
      );
      const byId = Object.fromEntries(results.map((r) => [r.comparisonId, r]));
      expect(byId.c0.underReviewDocumentId).toBeUndefined();
      expect(byId.c1.underReviewDocumentId).toBeUndefined();
      expect(byId.c2.underReviewDocumentId).toBeUndefined();
      expect(byId.c3.underReviewDocumentId).toBe('d1');
    });
  });

  describe('resilience (no throw, surfaces errors)', () => {
    it('reports a parse error and returns no rows when the model emits non-JSON', async () => {
      vi.mocked(createClaudeMessage).mockResolvedValueOnce(
        textResponse('Sorry, I cannot help with that.'),
      );
      const onBatchError = vi.fn();
      const results = await runDctDocumentCheckBatch(
        'claude-sonnet-4-20250514',
        DOCS,
        makeQuestions(1),
        { onBatchError },
      );
      expect(results).toEqual([]);
      expect(onBatchError).toHaveBeenCalledWith(
        expect.objectContaining({ batchIndex: 0, reason: 'parse' }),
      );
    });

    it('reports an http error and does not throw when the API call rejects', async () => {
      vi.mocked(createClaudeMessage).mockRejectedValueOnce(new Error('boom 500'));
      const onBatchError = vi.fn();
      const results = await runDctDocumentCheckBatch(
        'claude-sonnet-4-20250514',
        DOCS,
        makeQuestions(1),
        { onBatchError },
      );
      expect(results).toEqual([]);
      expect(onBatchError).toHaveBeenCalledWith(
        expect.objectContaining({ batchIndex: 0, reason: 'http', message: 'boom 500' }),
      );
    });

    it('signals onRateLimit when the batch fails with a rate-limit error', async () => {
      vi.mocked(createClaudeMessage).mockRejectedValueOnce(
        new ClaudeRateLimitError('429', 429, 5000),
      );
      const onRateLimit = vi.fn();
      await runDctDocumentCheckBatch('claude-sonnet-4-20250514', DOCS, makeQuestions(1), {
        onRateLimit,
      });
      expect(onRateLimit).toHaveBeenCalledWith({ batchIndex: 0, waitMs: 5000 });
    });
  });

  describe('cancellation (spend safety)', () => {
    it('makes zero API calls when the signal is already aborted', async () => {
      const controller = new AbortController();
      controller.abort();
      const results = await runDctDocumentCheckBatch(
        'claude-sonnet-4-20250514',
        DOCS,
        makeQuestions(5),
        { signal: controller.signal },
      );
      expect(results).toEqual([]);
      expect(createClaudeMessage).not.toHaveBeenCalled();
    });

    it('stops issuing further batches once aborted mid-run', async () => {
      vi.useFakeTimers();
      const controller = new AbortController();
      vi.mocked(createClaudeMessage).mockResolvedValueOnce(textResponse('[]'));
      const promise = runDctDocumentCheckBatch(
        'claude-sonnet-4-20250514',
        DOCS,
        makeQuestions(20),
        { batchSize: 10, signal: controller.signal },
      );
      // Swallow either outcome: aborting during the inter-batch delay rejects
      // with ClaudeRequestCancelledError; aborting between iterations resolves
      // early. Both are valid — the spend-safety invariant we assert is simply
      // that no further API call is issued after the abort.
      const settled = promise.then(
        () => undefined,
        () => undefined,
      );
      await vi.advanceTimersByTimeAsync(0); // let the first batch settle and enter the delay
      controller.abort();
      await vi.runAllTimersAsync();
      await settled;
      expect(createClaudeMessage).toHaveBeenCalledTimes(1);
    });
  });
});
