import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/claudeProxy', () => ({
  createClaudeMessage: vi.fn(),
}));

import { createClaudeMessage } from '../../services/claudeProxy';
import { parseLogbookText } from '../../services/logbookEntryParser';

describe('parseLogbookText OCR metadata hints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('injects OCR confidence/backend hints into parser prompt', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-01-10',
              workPerformed: 'Changed tire',
              fieldConfidence: {
                entryDate: 0.9,
                workPerformed: 0.85,
              },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text', {
      ocrConfidenceHint: 0.42,
      ocrBackendHint: 'claude_vision',
    });

    expect(result.entries.length).toBe(1);
    const callArgs = (createClaudeMessage as any).mock.calls[0][0];
    const userContent = callArgs.messages[0].content as string;
    expect(userContent).toContain('[OCR metadata]');
    expect(userContent).toContain('backend: claude_vision');
    expect(userContent).toContain('0.420');
  });

  it('normalizes legacy preventive entry type', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-02-14',
              workPerformed: 'Oil change and inspection',
              entryType: 'preventive',
              fieldConfidence: {
                entryDate: 0.9,
                workPerformed: 0.9,
                entryType: 0.8,
              },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries.length).toBe(1);
    expect(result.entries[0].entryType).toBe('preventive_maintenance');
  });
});
