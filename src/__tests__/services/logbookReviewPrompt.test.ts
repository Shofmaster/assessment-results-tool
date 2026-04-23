import { describe, expect, it } from 'vitest';
import {
  buildLogbookReviewSystem,
  buildLogbookReviewUser,
  compactCompanyContext,
  type CompanyContextPacket,
} from '../../services/logbookReviewPrompt';

describe('buildLogbookReviewSystem', () => {
  it('mentions selected standard scope', () => {
    expect(buildLogbookReviewSystem({ standard: 'part_145' })).toContain('Part 145');
    expect(buildLogbookReviewSystem({ standard: 'easa_part_145' })).toContain('EASA Part-145');
  });
});

describe('compactCompanyContext', () => {
  it('trims oversize values and caps section sizes', () => {
    const bigContext: CompanyContextPacket = {
      repairStation: {
        companyName: 'A'.repeat(300),
        certNumber: 'CERT-1',
        certTypesHeld: Array.from({ length: 20 }, (_, i) => `T${i}`),
        operationsScope: 'B'.repeat(400),
      },
      roster: Array.from({ length: 100 }, (_, i) => ({
        fullName: `Person ${i}`,
        certificateNumber: `C-${i}`,
      })),
      opSpecs: Array.from({ length: 100 }, (_, i) => ({
        certPart: i % 2 ? '145' : '135',
        paragraph: `A${i}`,
        title: 'X'.repeat(200),
      })),
    };

    const compact = compactCompanyContext(bigContext, 'part_145');
    expect(compact.repairStation?.companyName?.length).toBeLessThanOrEqual(240);
    expect(compact.repairStation?.certTypesHeld?.length).toBeLessThanOrEqual(12);
    expect((compact.roster ?? []).length).toBeLessThanOrEqual(40);
    expect((compact.opSpecs ?? []).every((x) => x.certPart === '145')).toBe(true);
  });
});

describe('buildLogbookReviewUser', () => {
  it('includes structured company context json and entry text', () => {
    const msg = buildLogbookReviewUser({
      mode: 'text',
      standard: 'part_43_general',
      entryText: '01/01/2026 Changed oil and signed.',
      companyContext: {
        repairStation: { certNumber: 'RS12345' },
        roster: [{ fullName: 'Alex Doe', certificateNumber: 'A&P123' }],
      },
    });
    expect(msg).toContain('Selected standard: part_43_general');
    expect(msg).toContain('"certNumber": "RS12345"');
    expect(msg).toContain('Changed oil and signed.');
  });
});
