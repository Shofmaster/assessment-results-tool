import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDctTraceabilitySystemPrompt } from '../../services/auditAgents';

vi.mock('../../services/claudeProxy', () => ({
  createClaudeMessage: vi.fn(),
}));

import { createClaudeMessage } from '../../services/claudeProxy';
import { runDctTraceabilityBatch } from '../../services/dctTraceabilityEngine';

describe('runDctTraceabilityBatch', () => {
  beforeEach(() => {
    vi.mocked(createClaudeMessage).mockClear();
    vi.mocked(createClaudeMessage).mockResolvedValue({
      content: [{ type: 'text', text: '[]' }],
    } as any);
  });

  it('forwards custom systemPrompt to createClaudeMessage', async () => {
    await runDctTraceabilityBatch(
      'claude-sonnet-4-20250514',
      [{ id: 'd1', name: 'Manual', text: 'x'.repeat(120) }],
      [{ comparisonId: 'c1', questionText: 'Is the procedure documented?' }],
      { systemPrompt: 'CUSTOM_DCT_SYSTEM_PROMPT' },
    );
    expect(createClaudeMessage).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(createClaudeMessage).mock.calls[0][0] as {
      system?: Array<{ type: string; text?: string; cache_control?: { type: string } }>;
    };
    expect(Array.isArray(payload.system)).toBe(true);
    expect(payload.system?.[0]?.type).toBe('text');
    expect(payload.system?.[0]?.text).toBe('CUSTOM_DCT_SYSTEM_PROMPT');
    expect(payload.system?.[0]?.cache_control?.type).toBe('ephemeral');
  });

  it('uses FAA DCT traceability default system prompt when systemPrompt omitted', async () => {
    await runDctTraceabilityBatch(
      'claude-sonnet-4-20250514',
      [{ id: 'd1', name: 'Manual', text: 'y'.repeat(120) }],
      [{ comparisonId: 'c1', questionText: 'Q?' }],
    );
    const payload = vi.mocked(createClaudeMessage).mock.calls[0][0] as {
      system?: Array<{ type: string; text?: string; cache_control?: { type: string } }>;
    };
    expect(Array.isArray(payload.system)).toBe(true);
    expect(payload.system?.[0]?.type).toBe('text');
    expect(payload.system?.[0]?.text).toBe(getDctTraceabilitySystemPrompt('faa-dct-traceability'));
    expect(payload.system?.[0]?.cache_control?.type).toBe('ephemeral');
  });

  // Regression: Claude sometimes returns underReviewDocumentId as "" or "   "
  // for rows with no supporting evidence. The old normalizer left that empty
  // string in the payload, which made Convex's v.id("documents") validator
  // throw `ArgumentValidationError` and the whole bulk mutation fail with
  // "Server Error Called by client".
  it('drops empty/whitespace/unknown underReviewDocumentId values', async () => {
    vi.mocked(createClaudeMessage).mockResolvedValueOnce({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            { comparisonId: 'c1', status: 'aligned', underReviewDocumentId: '' },
            { comparisonId: 'c2', status: 'gap', underReviewDocumentId: '   ' },
            { comparisonId: 'c3', status: 'mismatch', underReviewDocumentId: 'unknown-doc' },
            { comparisonId: 'c4', status: 'aligned', underReviewDocumentId: 'd1' },
          ]),
        },
      ],
    } as any);

    const results = await runDctTraceabilityBatch(
      'claude-sonnet-4-20250514',
      [{ id: 'd1', name: 'Manual', text: 'z'.repeat(120) }],
      [
        { comparisonId: 'c1', questionText: 'Q1?' },
        { comparisonId: 'c2', questionText: 'Q2?' },
        { comparisonId: 'c3', questionText: 'Q3?' },
        { comparisonId: 'c4', questionText: 'Q4?' },
      ],
    );

    const byId = Object.fromEntries(results.map((r) => [r.comparisonId, r]));
    expect(byId.c1.underReviewDocumentId).toBeUndefined();
    expect(byId.c2.underReviewDocumentId).toBeUndefined();
    expect(byId.c3.underReviewDocumentId).toBeUndefined();
    expect(byId.c4.underReviewDocumentId).toBe('d1');
  });
});
