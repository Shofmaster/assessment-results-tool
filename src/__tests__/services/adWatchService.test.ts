import { describe, it, expect } from 'vitest';
import { parseAdFindings } from '../../services/adWatchService';
import { buildAdSearchPrompt } from '../../../convex/_adWatchShared';
import { normalizeAdNumber } from '../../../convex/_textUtils';

describe('normalizeAdNumber', () => {
  it('normalizes common AD number spellings to the base number', () => {
    expect(normalizeAdNumber('2026-04-05')).toBe('2026-04-05');
    expect(normalizeAdNumber('AD 2026-04-05')).toBe('2026-04-05');
    expect(normalizeAdNumber('ad2026-04-05')).toBe('2026-04-05');
    expect(normalizeAdNumber('2026-04-05R1')).toBe('2026-04-05');
    expect(normalizeAdNumber('AD 2026-04-5')).toBe('2026-04-05');
  });

  it('expands two-digit years', () => {
    expect(normalizeAdNumber('98-12-03')).toBe('1998-12-03');
    expect(normalizeAdNumber('05-08-12')).toBe('2005-08-12');
  });

  it('returns empty string for non-AD text', () => {
    expect(normalizeAdNumber('no ad here')).toBe('');
    expect(normalizeAdNumber('')).toBe('');
  });
});

describe('parseAdFindings', () => {
  it('parses a findings object from fenced JSON', () => {
    const out = parseAdFindings(`Here is what I found:
\`\`\`json
{"findings": [{"adNumber": "AD 2026-04-05", "title": "Wing spar inspection", "summary": "Inspect within 100 hours", "effectiveDate": "2026-03-01", "sourceUrl": "https://drs.faa.gov/x", "confidence": "high"}]}
\`\`\``);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      adNumber: '2026-04-05',
      title: 'Wing spar inspection',
      confidence: 'high',
      sourceUrl: 'https://drs.faa.gov/x',
    });
  });

  it('deduplicates by normalized AD number', () => {
    const out = parseAdFindings(
      '```json\n{"findings": [{"adNumber": "2026-04-05", "title": "A", "confidence": "high"}, {"adNumber": "AD 2026-04-05", "title": "B", "confidence": "low"}]}\n```',
    );
    expect(out).toHaveLength(1);
  });

  it('drops rows without an AD-shaped number and invalid URLs', () => {
    const out = parseAdFindings(
      '```json\n{"findings": [{"adNumber": "N/A", "title": "junk", "confidence": "high"}, {"adNumber": "2026-01-02", "title": "ok", "confidence": "weird", "sourceUrl": "javascript:alert(1)"}]}\n```',
    );
    expect(out).toHaveLength(1);
    expect(out[0].confidence).toBe('low'); // unknown confidence degrades to low
    expect(out[0].sourceUrl).toBeUndefined();
  });

  it('returns empty for no-findings responses and unparseable text', () => {
    expect(parseAdFindings('```json\n{"findings": []}\n```')).toEqual([]);
    expect(parseAdFindings('I could not find anything.')).toEqual([]);
  });

  it('parses a balanced findings object even without a json fence', () => {
    const out = parseAdFindings(
      'Sure — {"findings": [{"adNumber": "2025-09-10", "title": "Fuel pump", "confidence": "medium"}]} done.',
    );
    expect(out).toHaveLength(1);
    expect(out[0].adNumber).toBe('2025-09-10');
  });

  it('parses a bare top-level array of findings', () => {
    const out = parseAdFindings('[{"adNumber": "2024-12-01", "title": "Bracket", "confidence": "low"}]');
    expect(out).toHaveLength(1);
    expect(out[0].adNumber).toBe('2024-12-01');
  });
});

describe('buildAdSearchPrompt', () => {
  it('returns null when there is no make or model to search on', () => {
    expect(buildAdSearchPrompt({})).toBeNull();
    expect(buildAdSearchPrompt({ serial: 'X', year: 2020 })).toBeNull();
  });

  it('includes the make/model, lookback window, and optional serial/year', () => {
    const prompt = buildAdSearchPrompt({ make: 'Gulfstream', model: 'G650', serial: '6123', year: 2019 }, 12);
    expect(prompt).toContain('Gulfstream G650');
    expect(prompt).toContain('last 12 months');
    expect(prompt).toContain('serial 6123');
    expect(prompt).toContain('year 2019');
  });
});
