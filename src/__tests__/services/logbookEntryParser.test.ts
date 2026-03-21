import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../services/claudeProxy', () => ({
  createClaudeMessage: vi.fn(),
}));

import { createClaudeMessage } from '../../services/claudeProxy';
import {
  parseLogbookText,
  segmentLogbookTextIntoEntrySegments,
  classifyDocumentType,
} from '../../services/logbookEntryParser';

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

describe('classifyDocumentType', () => {
  it('identifies engine logbook', () => {
    expect(classifyDocumentType('Engine Log\nTSMOH 1234.5\nEngine serial E-12345')).toBe('engine_logbook');
  });

  it('identifies propeller logbook', () => {
    expect(classifyDocumentType('Propeller Log\nBlade inspection completed\nProp overhaul')).toBe('propeller_logbook');
  });

  it('identifies airframe logbook', () => {
    expect(classifyDocumentType('Aircraft Maintenance Record\nTTAF 5231.0\nAnnual inspection completed')).toBe('airframe_logbook');
  });

  it('identifies work order / 337 form', () => {
    expect(classifyDocumentType('FAA Form 337 Major Repair and Alteration')).toBe('work_order');
  });

  it('returns unknown for generic text', () => {
    expect(classifyDocumentType('Some random text without aviation keywords')).toBe('unknown');
  });
});

describe('segmentLogbookTextIntoEntrySegments — multi-signal boundaries', () => {
  it('segments entries separated by horizontal rules', () => {
    const text = [
      '01/15/2025 Replaced left brake caliper',
      'TT 4500.2',
      'Signed A Tech A&P 1234567',
      '------------------------------------',
      '01/20/2025 Oil change and filter',
      'TT 4512.8',
      'Signed A Tech A&P 1234567',
    ].join('\n');

    const segments = segmentLogbookTextIntoEntrySegments(text);
    expect(segments.length).toBe(2);
    expect(segments[0]).toContain('Replaced left brake caliper');
    expect(segments[1]).toContain('Oil change and filter');
  });

  it('segments entries separated by blank-line clusters', () => {
    const text = [
      '02/01/2025 Annual inspection IAW 14 CFR 91.409',
      'Aircraft returned to service',
      'Signed B Inspector IA 7654321',
      '',
      '',
      '',
      '03/15/2025 Replaced ELT battery',
      'TT 4600.1',
      'Signed C Mechanic A&P 2345678',
    ].join('\n');

    const segments = segmentLogbookTextIntoEntrySegments(text);
    expect(segments.length).toBe(2);
    expect(segments[0]).toContain('Annual inspection');
    expect(segments[1]).toContain('ELT battery');
  });
});

describe('post-processing enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('infers entry type from work description when Claude leaves it blank', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-03-01',
              workPerformed: 'Performed annual inspection IAW 14 CFR 91.409',
              rawText: '03/01/2025 Performed annual inspection IAW 14 CFR 91.409',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].entryType).toBe('inspection');
  });

  it('infers ATA chapter from work description', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-03-01',
              workPerformed: 'Replaced landing gear strut seal',
              rawText: '03/01/2025 Replaced landing gear strut seal',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].ataChapter).toBe('32');
  });

  it('extracts AD references from work text when Claude misses them', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-04-10',
              workPerformed: 'Complied with AD 2024-01-02 replaced fuel line',
              rawText: 'Complied with AD 2024-01-02 replaced fuel line',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].adReferences).toContain('AD 2024-01-02');
    expect(result.entries[0].entryType).toBe('ad_compliance');
  });

  it('extracts total time from rawText when Claude misses it', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-05-01',
              workPerformed: 'Oil change',
              rawText: '05/01/2025 Oil change TTAF: 5231.4',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].totalTimeAtEntry).toBe(5231.4);
  });

  it('rejects dates before 1940 as invalid', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '1800-01-01',
              workPerformed: 'Some work',
              rawText: 'Some work',
              fieldConfidence: { entryDate: 0.5, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].entryDate).toBeUndefined();
  });

  it('detects hasReturnToService from text when Claude misses it', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-06-01',
              workPerformed: 'Annual inspection. I certify that this aircraft is in airworthy condition.',
              rawText: 'Annual inspection. I certify that this aircraft is in airworthy condition.',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].hasReturnToService).toBe(true);
  });
});

describe('delimited format parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses tab-separated logbook data', async () => {
    const tsv = [
      'Date\tWork Performed\tTTAF\tSigner\tCert',
      '01/10/2025\tOil change\t4231.6\tJ Smith\t1234567',
      '01/15/2025\tTire replacement\t4245.0\tJ Smith\t1234567',
    ].join('\n');

    const result = await parseLogbookText(tsv);
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].workPerformed).toBe('Oil change');
    expect(result.entries[0].totalTimeAtEntry).toBe(4231.6);
    expect(result.entries[1].workPerformed).toBe('Tire replacement');
  });

  it('parses pipe-delimited logbook data', async () => {
    const piped = [
      'Date|Description|Hobbs|Mechanic',
      '2025-01-10|Oil change and filter|4231.6|J Smith',
      '2025-01-15|Replaced left brake pads|4245.0|J Smith',
    ].join('\n');

    const result = await parseLogbookText(piped);
    expect(result.entries.length).toBe(2);
  });

  it('handles quoted CSV fields with commas', async () => {
    const csv = [
      'Date,Work Performed,TTAF,Signer',
      '01/10/2025,"Oil change, filter, and screen cleaning",4231.6,J Smith',
      '01/15/2025,Tire replacement,4245.0,J Smith',
    ].join('\n');

    const result = await parseLogbookText(csv);
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].workPerformed).toBe('Oil change, filter, and screen cleaning');
  });
});

describe('document type in parse result', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns documentType in parse result', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-01-10',
              workPerformed: 'TSMOH engine overhaul completed',
              rawText: 'Engine Log TSMOH 1234',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('Engine Log\nTSMOH 1234\n01/10/2025 engine overhaul');
    expect(result.documentType).toBe('engine_logbook');
  });
});

describe('fuzzy deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes near-duplicate entries with minor OCR differences', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-01-10',
              workPerformed: 'Replaced left main tire and tube assembly',
              rawText: 'test1',
              confidence: 0.9,
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
            {
              entryDate: '2025-01-10',
              workPerformed: 'Replaced left main tire and tube asembly',
              rawText: 'test2',
              confidence: 0.7,
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.7 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries.length).toBe(1);
    // Should keep the higher-confidence version
    expect(result.entries[0].confidence).toBeGreaterThan(0.7);
  });
});
