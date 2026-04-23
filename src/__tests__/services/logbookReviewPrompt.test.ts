import { describe, expect, it } from 'vitest';
import {
  buildLogbookReviewSystem,
  buildLogbookReviewUser,
  compactCompanyContext,
  LOGBOOK_REVIEW_PRESETS,
  LOGBOOK_REVIEW_STANDARDS,
  LOGBOOK_REVIEW_STANDARD_MAP,
  type CompanyContextPacket,
} from '../../services/logbookReviewPrompt';

describe('LOGBOOK_REVIEW_STANDARDS catalog', () => {
  it('covers the major jurisdictions', () => {
    const ids = new Set(LOGBOOK_REVIEW_STANDARDS.map((s) => s.id));
    for (const id of [
      'part_43_general',
      'part_145',
      'easa_part_145',
      'easa_part_66',
      'uk_part_145',
      'car_571',
      'car_605',
      'icao_annex_8',
      'as9100',
    ] as const) {
      expect(ids.has(id)).toBe(true);
    }
  });
  it('every entry has a non-empty regulatory body', () => {
    for (const meta of LOGBOOK_REVIEW_STANDARDS) {
      expect(meta.body.length).toBeGreaterThan(20);
    }
  });
  it('presets reference only known standards', () => {
    for (const preset of LOGBOOK_REVIEW_PRESETS) {
      for (const id of preset.standards) {
        expect(LOGBOOK_REVIEW_STANDARD_MAP[id]).toBeDefined();
      }
    }
  });
});

describe('buildLogbookReviewSystem (multi-standard)', () => {
  it('includes every selected standard body', () => {
    const msg = buildLogbookReviewSystem({
      standards: ['part_43_general', 'easa_part_145', 'car_571'],
    });
    expect(msg).toContain('14 CFR 43.9(a) verbatim');
    expect(msg).toContain('145.A.50');
    expect(msg).toContain('CAR 571.03');
  });
  it('marks framework as "Multi" when mixing authorities', () => {
    const msg = buildLogbookReviewSystem({ standards: ['part_43_general', 'easa_part_145'] });
    expect(msg).toContain('"Multi"');
  });
  it('keeps single-authority framework label', () => {
    const msg = buildLogbookReviewSystem({ standards: ['easa_part_145', 'easa_part_66'] });
    expect(msg).toContain('"EASA"');
  });
  it('backward-compatible with the legacy `standard` prop', () => {
    const msg = buildLogbookReviewSystem({ standard: 'part_145' });
    expect(msg).toContain('14 CFR 145');
  });
});

describe('compactCompanyContext', () => {
  it('keeps opSpecs relevant to any selected cert part', () => {
    const input: CompanyContextPacket = {
      opSpecs: [
        { certPart: '135', paragraph: 'A003' },
        { certPart: '145', paragraph: 'A003' },
        { certPart: '121', paragraph: 'A003' },
      ],
    };
    const out = compactCompanyContext(input, ['part_145', 'part_135']);
    const parts = new Set((out.opSpecs ?? []).map((s) => s.certPart));
    expect(parts.has('145')).toBe(true);
    expect(parts.has('135')).toBe(true);
    expect(parts.has('121')).toBe(false);
  });
  it('caps roster and trims oversize strings', () => {
    const input: CompanyContextPacket = {
      roster: Array.from({ length: 200 }, (_, i) => ({ fullName: `Person ${i}` })),
      repairStation: { companyName: 'A'.repeat(999) },
    };
    const out = compactCompanyContext(input, ['part_43_general']);
    expect((out.roster ?? []).length).toBeLessThanOrEqual(40);
    expect(out.repairStation?.companyName?.length ?? 0).toBeLessThanOrEqual(120);
  });
});

describe('buildLogbookReviewUser', () => {
  it('includes structured company context json and the selected standards list', () => {
    const msg = buildLogbookReviewUser({
      mode: 'text',
      standards: ['part_43_general', 'part_145'],
      entryText: '01/01/2026 Changed oil and signed.',
      companyContext: {
        repairStation: { certNumber: 'RS12345' },
        roster: [{ fullName: 'Alex Doe', certificateNumber: 'A&P123' }],
      },
    });
    expect(msg).toContain('Selected standards: part_43_general, part_145');
    expect(msg).toContain('"certNumber": "RS12345"');
    expect(msg).toContain('Changed oil and signed.');
  });
});
