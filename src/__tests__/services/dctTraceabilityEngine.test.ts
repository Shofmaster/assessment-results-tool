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
    const payload = vi.mocked(createClaudeMessage).mock.calls[0][0] as { system: string };
    expect(payload.system).toBe('CUSTOM_DCT_SYSTEM_PROMPT');
  });

  it('uses FAA DCT traceability default system prompt when systemPrompt omitted', async () => {
    await runDctTraceabilityBatch(
      'claude-sonnet-4-20250514',
      [{ id: 'd1', name: 'Manual', text: 'y'.repeat(120) }],
      [{ comparisonId: 'c1', questionText: 'Q?' }],
    );
    const payload = vi.mocked(createClaudeMessage).mock.calls[0][0] as { system: string };
    expect(payload.system).toBe(getDctTraceabilitySystemPrompt('faa-dct-traceability'));
  });
});
