import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/claudeProxy', () => ({
  createClaudeMessage: vi.fn(),
}));

import { createClaudeMessage } from '../../services/claudeProxy';
import { parseLogbookText, segmentLogbookTextIntoEntrySegments } from '../../services/logbookEntryParser';

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

  it('segments logbook text by date to signature boundaries', () => {
    const text = [
      '01/10/2025 Removed tire and replaced tube',
      'TT 4231.6',
      'Signed J Smith A&P 1234567',
      '',
      '01/12/2025 Performed annual inspection',
      'Aircraft returned to service',
      'Signature M Jones IA 7654321',
    ].join('\n');

    const segments = segmentLogbookTextIntoEntrySegments(text);
    expect(segments.length).toBe(2);
    expect(segments[0]).toContain('Removed tire and replaced tube');
    expect(segments[0]).toContain('Signed J Smith A&P 1234567');
    expect(segments[1]).toContain('Performed annual inspection');
    expect(segments[1]).toContain('Signature M Jones IA 7654321');
  });

  it('aggregates parsed entries from multiple entry segments', async () => {
    (createClaudeMessage as any).mockImplementation(async ({ messages }: any) => {
      const prompt: string = messages[0].content;
      if (prompt.includes('01/10/2025')) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify([
                {
                  entryDate: '2025-01-10',
                  workPerformed: 'Removed tire and replaced tube',
                  signerName: 'J Smith',
                  fieldConfidence: { entryDate: 0.9, workPerformed: 0.9, signerName: 0.8 },
                },
              ]),
            },
          ],
        };
      }
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify([
              {
                entryDate: '2025-01-12',
                workPerformed: 'Performed annual inspection',
                signerName: 'M Jones',
                fieldConfidence: { entryDate: 0.9, workPerformed: 0.9, signerName: 0.8 },
              },
            ]),
          },
        ],
      };
    });

    const text = [
      '01/10/2025 Removed tire and replaced tube',
      'TT 4231.6',
      'Signed J Smith A&P 1234567',
      '',
      '01/12/2025 Performed annual inspection',
      'Aircraft returned to service',
      'Signature M Jones IA 7654321',
    ].join('\n');

    const result = await parseLogbookText(text, { debug: true });
    expect(result.entries.length).toBe(2);
    expect(result.entries.map((e) => e.entryDate).sort()).toEqual(['2025-01-10', '2025-01-12']);
    expect(result.diagnostics?.strategyUsed).toBe('entry_segments');
    expect(result.diagnostics?.totalSegments).toBe(2);
    expect((createClaudeMessage as any).mock.calls.length).toBe(2);
  });
});
