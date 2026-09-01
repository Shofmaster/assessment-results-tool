import { describe, expect, it } from 'vitest';
import { expandAviationQuery } from '../../utils/aviationQueryExpand';

describe('expandAviationQuery', () => {
  it('expands common aviation acronyms', () => {
    const out = expandAviationQuery('Where is the MEL for icing?');
    expect(out.toLowerCase()).toContain('minimum equipment list');
    expect(out).toContain('Where is the MEL for icing?');
  });

  it('expands ATA chapter mentions', () => {
    const out = expandAviationQuery('landing gear ATA 32 checks');
    expect(out).toMatch(/ATA chapter 32/i);
  });

  it('expands AD-style numbers', () => {
    const out = expandAviationQuery('Does AD 2024-12-01 apply?');
    expect(out.toLowerCase()).toContain('airworthiness directive');
  });

  it('returns empty/whitespace unchanged', () => {
    expect(expandAviationQuery('')).toBe('');
    expect(expandAviationQuery('   ')).toBe('');
  });

  it('leaves plain questions mostly intact when no expanders match', () => {
    const q = 'How often must tooling be calibrated?';
    expect(expandAviationQuery(q)).toBe(q);
  });
});
