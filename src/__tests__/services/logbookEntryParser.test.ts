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

describe('new entry type classification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('classifies transponder check as regulatory_check', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-02-15',
              workPerformed: 'Transponder check per 91.413 completed satisfactorily',
              rawText: '02/15/2025 Transponder check per 91.413 completed satisfactorily',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].entryType).toBe('regulatory_check');
    expect(result.entries[0].regulatoryBasis).toBe('91.413');
  });

  it('classifies altimeter/static check as regulatory_check with 91.411', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-03-10',
              workPerformed: 'Altimeter and static system check per 91.411',
              rawText: '03/10/2025 Altimeter and static system check per 91.411',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].entryType).toBe('regulatory_check');
    expect(result.entries[0].regulatoryBasis).toBe('91.411');
  });

  it('classifies SB compliance entries and extracts SB details', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-04-01',
              workPerformed: 'Complied with SB 72-1045 mandatory service bulletin. Replaced fuel control unit.',
              rawText: '04/01/2025 Complied with SB 72-1045 mandatory. Replaced fuel control unit.',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].entryType).toBe('sb_compliance');
    expect(result.entries[0].sbReferences).toContain('SB 72-1045');
  });

  it('classifies life-limited component entries', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-05-20',
              workPerformed: 'Installed magneto P/N 10-163012-1 S/N A98765 TSN: 500.3 Life limit: 2000 hours',
              rawText: 'Installed magneto P/N 10-163012-1 S/N A98765 TSN: 500.3 Life limit: 2000 hours',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].entryType).toBe('life_limited_component');
  });

  it('classifies ferry permit as operational', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-06-01',
              workPerformed: 'Special flight permit issued for ferry flight to maintenance facility.',
              rawText: 'Special flight permit issued for ferry flight to maintenance facility.',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].entryType).toBe('operational');
  });

  it('promotes SB entries when SB references found but type is maintenance', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-07-10',
              workPerformed: 'SB 28-3210 fuel tank sealant inspection and repair',
              rawText: 'SB 28-3210 fuel tank sealant inspection and repair',
              entryType: 'maintenance',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9, entryType: 0.5 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].entryType).toBe('sb_compliance');
    expect(result.entries[0].sbReferences).toBeDefined();
    expect(result.entries[0].sbReferences!.length).toBeGreaterThan(0);
  });
});

describe('structured sub-field extraction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('extracts AD compliance details from text when LLM misses them', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-03-15',
              workPerformed: 'Complied with AD 2024-01-02. Terminating action performed. P/N 12345-6 installed. Next due: 500 hours',
              rawText: 'Complied with AD 2024-01-02. Terminating action performed. P/N 12345-6 installed. Next due: 500 hours',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    const entry = result.entries[0];
    expect(entry.adComplianceDetails).toBeDefined();
    expect(entry.adComplianceDetails!.length).toBeGreaterThan(0);
    expect(entry.adComplianceDetails![0].adNumber).toBe('AD 2024-01-02');
    expect(entry.adComplianceDetails![0].complianceMethod).toBe('terminating_action');
    expect(entry.adComplianceDetails![0].partNumbers).toContain('12345-6');
  });

  it('extracts SB compliance details from text when LLM misses them', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-04-20',
              workPerformed: 'SB 72-1045 complied. Mandatory service bulletin accomplished.',
              rawText: 'SB 72-1045 complied. Mandatory service bulletin accomplished.',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    const entry = result.entries[0];
    expect(entry.sbComplianceDetails).toBeDefined();
    expect(entry.sbComplianceDetails!.length).toBeGreaterThan(0);
    expect(entry.sbComplianceDetails![0].sbNumber).toBe('SB 72-1045');
    expect(entry.sbComplianceDetails![0].complianceStatus).toBe('complied');
    expect(entry.sbComplianceDetails![0].recommendationLevel).toBe('mandatory');
  });

  it('extracts component mentions (P/N, S/N, TSN, TSO) from text', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-05-10',
              workPerformed: 'Removed and replaced alternator. Installed P/N ALT-2024 S/N SER-9876 TSN: 1234.5 TSO: 500.2',
              rawText: 'Removed and replaced alternator. Installed P/N ALT-2024 S/N SER-9876 TSN: 1234.5 TSO: 500.2',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    const entry = result.entries[0];
    expect(entry.componentMentions).toBeDefined();
    expect(entry.componentMentions!.length).toBeGreaterThan(0);
    expect(entry.componentMentions![0].partNumber).toBe('ALT-2024');
    expect(entry.componentMentions![0].serialNumber).toBe('SER-9876');
    expect(entry.componentMentions![0].tsn).toBe(1234.5);
    expect(entry.componentMentions![0].tso).toBe(500.2);
    expect(entry.componentMentions![0].action).toBe('replaced');
  });

  it('infers inspection sub-type for annual inspections', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-06-15',
              workPerformed: 'Performed annual inspection IAW 14 CFR 91.409',
              rawText: '06/15/2025 Performed annual inspection IAW 14 CFR 91.409',
              entryType: 'inspection',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9, entryType: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].inspectionType).toBe('annual');
  });

  it('infers inspection sub-type for 100-hour inspections', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-07-01',
              workPerformed: '100-hour inspection completed. Aircraft airworthy.',
              rawText: '07/01/2025 100-hour inspection completed.',
              entryType: 'inspection',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9, entryType: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].inspectionType).toBe('100_hour');
  });

  it('extracts recurrence interval from text', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-08-01',
              workPerformed: 'AD 2024-05-10 recurring every 500 hours. Initial compliance performed.',
              rawText: 'AD 2024-05-10 recurring every 500 hours. Initial compliance performed.',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    const entry = result.entries[0];
    expect(entry.recurrenceInterval).toBe(500);
    expect(entry.recurrenceUnit).toBe('hours');
  });

  it('extracts calendar month recurrence interval', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-09-01',
              workPerformed: 'Transponder check per 91.413. Required every 24 months.',
              rawText: 'Transponder check per 91.413. Required every 24 months.',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    const entry = result.entries[0];
    expect(entry.recurrenceInterval).toBe(24);
    expect(entry.recurrenceUnit).toBe('calendar_months');
  });

  it('preserves LLM-provided sub-fields when present', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-10-01',
              workPerformed: 'Complied with AD 2024-03-05.',
              rawText: 'Complied with AD 2024-03-05.',
              adComplianceDetails: [
                {
                  adNumber: 'AD 2024-03-05',
                  complianceMethod: 'one_time',
                  complianceDescription: 'Replaced wing spar cap per AD',
                  confidence: 0.95,
                },
              ],
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    const entry = result.entries[0];
    expect(entry.adComplianceDetails).toBeDefined();
    expect(entry.adComplianceDetails![0].complianceMethod).toBe('one_time');
    expect(entry.adComplianceDetails![0].complianceDescription).toBe('Replaced wing spar cap per AD');
    expect(entry.adComplianceDetails![0].confidence).toBe(0.95);
  });

  it('extracts component life limit data', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-11-01',
              workPerformed: 'Installed crankshaft P/N LW-12345 S/N CS-001 TSN: 0 CSN: 0 Life limit: 2000 hours',
              rawText: 'Installed crankshaft P/N LW-12345 S/N CS-001 TSN: 0 CSN: 0 Life limit: 2000 hours',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    const entry = result.entries[0];
    expect(entry.componentMentions).toBeDefined();
    expect(entry.componentMentions![0].partNumber).toBe('LW-12345');
    expect(entry.componentMentions![0].serialNumber).toBe('CS-001');
    expect(entry.componentMentions![0].tsn).toBe(0);
    expect(entry.componentMentions![0].csn).toBe(0);
    expect(entry.componentMentions![0].isLifeLimited).toBe(true);
    expect(entry.componentMentions![0].lifeLimit).toBe(2000);
    expect(entry.componentMentions![0].lifeLimitUnit).toBe('hours');
  });

  it('infers ELT check regulatory basis', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify([
            {
              entryDate: '2025-12-01',
              workPerformed: 'ELT inspection and battery replacement per 91.207',
              rawText: 'ELT inspection and battery replacement per 91.207',
              fieldConfidence: { entryDate: 0.9, workPerformed: 0.9 },
            },
          ]),
        },
      ],
    });

    const result = await parseLogbookText('sample text');
    expect(result.entries[0].entryType).toBe('regulatory_check');
    expect(result.entries[0].regulatoryBasis).toBe('91.207');
  });
});
