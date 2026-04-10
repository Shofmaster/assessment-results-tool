import { describe, expect, it } from 'vitest';
import { inferApplicabilityTokens, isDctApplicable } from '../../utils/dctApplicability';

describe('inferApplicabilityTokens', () => {
  it('detects Part 145 from repair station text', () => {
    const t = inferApplicabilityTokens({
      repairStationType: 'Part 145 repair station',
      operationsScope: '',
      certifications: [],
    });
    expect(t).toContain('145');
  });
});

describe('isDctApplicable', () => {
  it('returns true when showAllDcts', () => {
    expect(
      isDctApplicable('145F domestic', undefined, undefined, { repairStationType: 'Part 121' }, { showAllDcts: true }),
    ).toBe(true);
  });

  it('matches peer group when profile includes 145', () => {
    expect(
      isDctApplicable('Part 145 Repair Station', undefined, undefined, { repairStationType: '145' }, {}),
    ).toBe(true);
  });

  it('respects manual exclude list', () => {
    expect(
      isDctApplicable(
        'Part 145 Repair Station',
        undefined,
        undefined,
        { repairStationType: '145' },
        { excludedPeerGroupSubstrings: ['145'] },
      ),
    ).toBe(false);
  });
});
