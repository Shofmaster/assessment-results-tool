import { describe, expect, it } from 'vitest';
import {
  inferApplicabilityTokens,
  inferApplicabilityTokensFromManualCorpus,
  mergeApplicabilityTokens,
  isDctApplicable,
} from '../../utils/dctApplicability';

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

  it('merges extraTokens from manual corpus with empty profile', () => {
    expect(
      isDctApplicable(
        'Part 145 Repair Station',
        undefined,
        undefined,
        {},
        {},
        inferApplicabilityTokensFromManualCorpus('We operate a Part 145 repair station within the United States.'),
      ),
    ).toBe(true);
  });

  it('mergeApplicabilityTokens unions profile and manual hints', () => {
    const t = mergeApplicabilityTokens(
      { repairStationType: 'Part 121 carrier' },
      'Also maintain Part 145 repair capability for contract work.',
    );
    expect(t).toContain('121');
    expect(t).toContain('145');
  });
});

describe('inferApplicabilityTokensFromManualCorpus', () => {
  it('detects Part 135 from ops manual text', () => {
    const t = inferApplicabilityTokensFromManualCorpus(
      'Operations conducted under 14 CFR Part 135 commuter rules.',
    );
    expect(t).toContain('135');
  });

  it('detects SMS from manual text', () => {
    const t = inferApplicabilityTokensFromManualCorpus('Safety Management System VP and risk assessment process.');
    expect(t).toContain('SMS');
  });
});
