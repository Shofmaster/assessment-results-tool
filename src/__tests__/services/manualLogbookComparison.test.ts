import { describe, expect, it } from 'vitest';
import {
  normalizeManualComparisonResult,
  alignComparisonToExpected,
  comparisonGapsToComplianceFindings,
  hashRequirementId,
} from '../../services/manualLogbookComparison';

describe('normalizeManualComparisonResult', () => {
  it('parses valid payload and recomputes summary', () => {
    const r = normalizeManualComparisonResult({
      inspectionType: '96/144',
      requiredItems: [
        {
          requirementText: 'Inspect landing gear',
          status: 'matched',
          manualEvidence: 'CMP 4.1',
          logEvidence: 'LG inspected',
        },
        {
          requirementText: 'Lubricate flight controls',
          status: 'missing',
          manualEvidence: 'CMP 4.2',
          logEvidence: '',
        },
      ],
      summary: { matched: 9, missing: 9, unclear: 9 },
    });
    expect(r.inspectionType).toBe('96/144');
    expect(r.requiredItems).toHaveLength(2);
    expect(r.summary).toEqual({ matched: 1, missing: 1, unclear: 0 });
  });

  it('defaults bad status to unclear', () => {
    const r = normalizeManualComparisonResult({
      inspectionType: 'A',
      requiredItems: [{ requirementText: 'X', status: 'bogus', manualEvidence: '', logEvidence: '' }],
    });
    expect(r.requiredItems[0].status).toBe('unclear');
  });

  it('throws on invalid payload', () => {
    expect(() => normalizeManualComparisonResult(null)).toThrow('Invalid comparison payload');
    expect(() => normalizeManualComparisonResult({})).toThrow('requiredItems');
  });
});

describe('alignComparisonToExpected', () => {
  it('fills missing rows with unclear', () => {
    const parsed = normalizeManualComparisonResult({
      inspectionType: 'T',
      requiredItems: [
        { requirementText: 'wrong', status: 'matched', manualEvidence: '', logEvidence: 'x' },
      ],
    });
    const expected = [
      { requirementText: 'First task', manualEvidence: 'M1' },
      { requirementText: 'Second task', manualEvidence: 'M2' },
    ];
    const aligned = alignComparisonToExpected(expected, parsed);
    expect(aligned).toHaveLength(2);
    expect(aligned[0].requirementText).toBe('First task');
    expect(aligned[0].status).toBe('matched');
    expect(aligned[1].requirementText).toBe('Second task');
    expect(aligned[1].status).toBe('unclear');
    expect(aligned[1].notes).toMatch(/No comparison row/);
  });
});

describe('comparisonGapsToComplianceFindings', () => {
  it('maps only missing and unclear to data_mismatch findings', () => {
    const result = normalizeManualComparisonResult({
      inspectionType: '96/144',
      requiredItems: [
        { requirementText: 'A', status: 'matched', manualEvidence: 'ma', logEvidence: 'la' },
        { requirementText: 'B', status: 'missing', manualEvidence: 'mb', logEvidence: '' },
        { requirementText: 'C', status: 'unclear', manualEvidence: 'mc', logEvidence: 'lc' },
      ],
    });
    const findings = comparisonGapsToComplianceFindings('aircraft-1', result, {
      logbookEntryId: 'entry-1' as any,
    });
    expect(findings).toHaveLength(2);
    expect(findings[0].findingType).toBe('data_mismatch');
    expect(findings[0].severity).toBe('major');
    expect(findings[0].ruleId).toMatch(/^manual-logbook:96-144:/);
    expect(findings[1].severity).toBe('minor');
    expect(findings[0].logbookEntryId).toBe('entry-1');
    expect(findings[0].citation).toContain('96/144');
  });
});

describe('hashRequirementId', () => {
  it('is stable for same inputs', () => {
    expect(hashRequirementId('T', 'req', 3)).toBe(hashRequirementId('T', 'req', 3));
    expect(hashRequirementId('T', 'req', 3)).not.toBe(hashRequirementId('T', 'req', 4));
  });
});
