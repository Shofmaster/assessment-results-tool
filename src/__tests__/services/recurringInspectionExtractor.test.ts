import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurringInspectionExtractor } from '../../services/recurringInspectionExtractor';
import { createClaudeMessage } from '../../services/claudeProxy';

vi.mock('../../services/claudeProxy', () => ({
  createClaudeMessage: vi.fn(),
}));

const mockedCreateClaudeMessage = vi.mocked(createClaudeMessage);

function mockTextResponse(text: string) {
  return {
    content: [{ type: 'text' as const, text }],
    stop_reason: 'end_turn',
  };
}

describe('RecurringInspectionExtractor', () => {
  beforeEach(() => {
    mockedCreateClaudeMessage.mockReset();
  });

  it('returns no items when a document has no extracted text', async () => {
    const extractor = new RecurringInspectionExtractor();

    const result = await extractor.extractFromDocument(
      { id: 'doc-1', name: 'Empty Manual' },
      'claude-sonnet-test',
    );

    expect(result).toEqual({
      documentId: 'doc-1',
      documentName: 'Empty Manual',
      items: [],
    });
    expect(mockedCreateClaudeMessage).not.toHaveBeenCalled();
  });

  it('filters invalid intervals, normalizes parsed fields, and deduplicates titles', async () => {
    mockedCreateClaudeMessage.mockResolvedValue(
      mockTextResponse(`\`\`\`json
[
  {
    "title": "Torque Wrench Calibration",
    "category": "calibration",
    "intervalType": "calendar",
    "intervalMonths": 6,
    "lastPerformedAt": "2024-01-15T12:00:00Z",
    "documentExcerpt": "Torque wrenches shall be calibrated every 6 months.",
    "confidence": "high"
  },
  {
    "title": " torque wrench calibration ",
    "category": "calibration",
    "intervalType": "calendar",
    "intervalMonths": 12,
    "confidence": "medium"
  },
  {
    "title": "Tooling inspection",
    "category": "not-a-real-category",
    "intervalType": "not-real",
    "intervalDays": 30,
    "confidence": "mystery"
  },
  {
    "title": "Keyword match only",
    "category": "audit",
    "intervalType": "calendar",
    "confidence": "high"
  }
]
\`\`\``),
    );

    const extractor = new RecurringInspectionExtractor();
    const result = await extractor.extractFromDocument(
      {
        id: 'doc-2',
        name: 'Repair Station Manual',
        extractedText: 'Recurring inspection content',
      },
      'claude-sonnet-test',
    );

    expect(mockedCreateClaudeMessage).toHaveBeenCalledTimes(1);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      title: 'Torque Wrench Calibration',
      category: 'calibration',
      intervalType: 'calendar',
      intervalMonths: 6,
      lastPerformedAt: '2024-01-15',
      confidence: 'high',
    });
    expect(result.items[1]).toMatchObject({
      title: 'Tooling inspection',
      category: 'other',
      intervalType: 'calendar',
      intervalDays: 30,
      confidence: 'medium',
    });
  });

  it('chunks long documents and reports progress per chunk', async () => {
    mockedCreateClaudeMessage.mockResolvedValue(mockTextResponse('[]'));

    const extractor = new RecurringInspectionExtractor();
    const progress: string[] = [];
    const longText = 'A'.repeat(20_500);

    await extractor.extractFromDocument(
      {
        id: 'doc-3',
        name: 'Long Manual',
        extractedText: longText,
      },
      'claude-sonnet-test',
      (message) => progress.push(message),
    );

    expect(mockedCreateClaudeMessage).toHaveBeenCalledTimes(2);
    expect(progress).toEqual([
      'Scanning Long Manual (part 1/2)...',
      'Scanning Long Manual (part 2/2)...',
    ]);
  });

  it('keeps the most recent completion date found across documents and skips errors', async () => {
    mockedCreateClaudeMessage
      .mockResolvedValueOnce(
        mockTextResponse('[{"itemIndex":0,"lastPerformedAt":"2024-01-15","excerpt":"Older calibration record"}]'),
      )
      .mockRejectedValueOnce(new Error('temporary upstream failure'))
      .mockResolvedValueOnce(
        mockTextResponse(
          '[{"itemIndex":0,"lastPerformedAt":"2024-03-01","excerpt":"Newest calibration record"},{"itemIndex":1,"lastPerformedAt":"2024-02-10","excerpt":"Internal audit complete"}]',
        ),
      );

    const extractor = new RecurringInspectionExtractor();
    const result = await extractor.findCompletionDates(
      [
        { title: 'Torque wrench calibration' },
        { title: 'Internal audit' },
      ],
      [
        { id: 'doc-a', name: 'Calibration log', extractedText: 'Older completion record' },
        { id: 'doc-b', name: 'Broken log', extractedText: 'This lookup will fail' },
        { id: 'doc-c', name: 'Audit tracker', extractedText: 'Newest completion record' },
      ],
      'claude-sonnet-test',
    );

    expect(mockedCreateClaudeMessage).toHaveBeenCalledTimes(3);
    expect(result.get('Torque wrench calibration')).toBe('2024-03-01');
    expect(result.get('Internal audit')).toBe('2024-02-10');
  });
});
