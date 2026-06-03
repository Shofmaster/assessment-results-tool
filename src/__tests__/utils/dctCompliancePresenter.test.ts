import { describe, it, expect } from 'vitest';
import {
  statusBadgeClass,
  statusLabel,
  verdictFromStatus,
  findingSeverityBadgeClass,
  sortFindingsBySeverity,
  classifyRow,
  countApplicabilityBuckets,
  deriveStatusBreakdown,
  countFindingSeverities,
  parseEvidenceSegments,
  summarizeDocumentCheckResults,
  type DocumentCheckResultRow,
  type DocumentCheckSelectedRow,
  type EnrichedRowLike,
} from '../../utils/dctCompliancePresenter';

describe('status presentation helpers', () => {
  it('maps statuses to badge classes with a default', () => {
    expect(statusBadgeClass('green')).toContain('emerald');
    expect(statusBadgeClass('yellow')).toContain('amber');
    expect(statusBadgeClass('red')).toContain('red');
    expect(statusBadgeClass('anything-else')).toContain('white');
  });

  it('maps statuses to human labels', () => {
    expect(statusLabel('green')).toBe('Compliant');
    expect(statusLabel('yellow')).toBe('Review due');
    expect(statusLabel('red')).toBe('Action needed');
    expect(statusLabel('???')).toBe('Not started');
  });

  it('maps statuses to verdicts', () => {
    expect(verdictFromStatus('green')).toBe('pass');
    expect(verdictFromStatus('yellow')).toBe('conditional');
    expect(verdictFromStatus('red')).toBe('fail');
    expect(verdictFromStatus('')).toBe('pending');
  });
});

describe('finding severity helpers', () => {
  it('maps severities to badge classes with a default', () => {
    expect(findingSeverityBadgeClass('critical')).toContain('red');
    expect(findingSeverityBadgeClass('major')).toContain('amber');
    expect(findingSeverityBadgeClass('minor')).toContain('sky');
    expect(findingSeverityBadgeClass('observation')).toContain('white');
  });

  it('sorts findings critical → major → minor → observation without mutating input', () => {
    const input = [
      { severity: 'observation' as const, id: 1 },
      { severity: 'critical' as const, id: 2 },
      { severity: 'minor' as const, id: 3 },
      { severity: 'major' as const, id: 4 },
    ];
    const sorted = sortFindingsBySeverity(input);
    expect(sorted.map((f) => f.severity)).toEqual(['critical', 'major', 'minor', 'observation']);
    // original untouched
    expect(input[0].severity).toBe('observation');
  });
});

describe('classifyRow', () => {
  const ctx = { profile: null, settings: null };

  it('prefers a stored applicabilityState over the heuristic', () => {
    const row: EnrichedRowLike = {
      dctDocument: { peerGroupLabel: 'X' },
      comparison: { applicabilityState: 'not_applicable' },
    };
    expect(classifyRow(row, ctx).state).toBe('not_applicable');
  });

  it('falls back to the heuristic when no stored value is present', () => {
    const row: EnrichedRowLike = {
      dctDocument: { peerGroupLabel: 'X' },
      comparison: {},
    };
    const result = classifyRow(row, ctx);
    // With null profile/settings the heuristic returns a valid state + confidence
    expect(['applicable', 'unsure', 'not_applicable']).toContain(result.state);
    expect(typeof result.confidence).toBe('number');
  });
});

describe('countApplicabilityBuckets', () => {
  it('tallies each applicability bucket', () => {
    expect(
      countApplicabilityBuckets([
        { applicability: 'applicable' },
        { applicability: 'applicable' },
        { applicability: 'unsure' },
        { applicability: 'not_applicable' },
      ])
    ).toEqual({ applicable: 2, unsure: 1, not_applicable: 1 });
  });

  it('returns zeros for an empty list', () => {
    expect(countApplicabilityBuckets([])).toEqual({ applicable: 0, unsure: 0, not_applicable: 0 });
  });
});

describe('deriveStatusBreakdown', () => {
  it('reads from metrics.status', () => {
    expect(deriveStatusBreakdown({ metrics: { status: { aligned: 3, gap: 1 } } })).toEqual({
      aligned: 3,
      gap: 1,
      mismatch: 0,
      pending: 0,
    });
  });

  it('falls back to comparisonStats.status', () => {
    expect(deriveStatusBreakdown({ comparisonStats: { status: { mismatch: 2, pending: 5 } } })).toEqual({
      aligned: 0,
      gap: 0,
      mismatch: 2,
      pending: 5,
    });
  });

  it('returns zeros for missing summary', () => {
    expect(deriveStatusBreakdown(null)).toEqual({ aligned: 0, gap: 0, mismatch: 0, pending: 0 });
    expect(deriveStatusBreakdown(undefined)).toEqual({ aligned: 0, gap: 0, mismatch: 0, pending: 0 });
  });
});

describe('countFindingSeverities', () => {
  it('tallies severities', () => {
    expect(
      countFindingSeverities([
        { severity: 'critical' },
        { severity: 'critical' },
        { severity: 'minor' },
      ])
    ).toEqual({ critical: 2, major: 0, minor: 1, observation: 0 });
  });
});

describe('parseEvidenceSegments', () => {
  it('parses all four pipe-delimited segments and strips bold markers', () => {
    const text =
      '**Requirement**: must do X | Evidence: section 3 | Gap: missing Y | Corrective action: add Y';
    expect(parseEvidenceSegments(text)).toEqual({
      requirement: 'must do X',
      evidence: 'section 3',
      gap: 'missing Y',
      correctiveAction: 'add Y',
    });
  });

  it('returns {} when no recognized segment is present', () => {
    expect(parseEvidenceSegments('just some freeform prose')).toEqual({});
    expect(parseEvidenceSegments('')).toEqual({});
  });

  it('ignores empty values and unknown keys', () => {
    expect(parseEvidenceSegments('Requirement:  | Evidence: real | Notes: ignored')).toEqual({
      evidence: 'real',
    });
  });
});

describe('summarizeDocumentCheckResults', () => {
  const row = (id: string, text: string, fileName?: string): DocumentCheckSelectedRow => ({
    comparison: { _id: id },
    question: { text },
    dctDocument: { fileName },
  });

  it('joins AI results onto rows, sorts by severity, tallies, and derives verdict', () => {
    const selectedRows = [
      row('a', 'Q-A', 'file1.xml'),
      row('b', 'Q-B', 'file2.xml'),
      row('c', 'Q-C'),
    ];
    const resultRows: DocumentCheckResultRow[] = [
      { comparisonId: 'b', status: 'gap', severity: 'minor', rationale: 'r-b' },
      { comparisonId: 'a', status: 'mismatch', severity: 'critical', evidenceSnippet: 'e-a' },
      { comparisonId: 'c', status: 'aligned', severity: 'observation' },
    ];

    const { findings, severityTotals, statusTotals, verdict } = summarizeDocumentCheckResults(
      selectedRows,
      resultRows,
    );

    // sorted critical → minor → observation
    expect(findings.map((f) => f.comparisonId)).toEqual(['a', 'b', 'c']);
    expect(findings[0]).toMatchObject({
      comparisonId: 'a',
      questionText: 'Q-A',
      dctFileName: 'file1.xml',
      status: 'mismatch',
      severity: 'critical',
      evidenceSnippet: 'e-a',
      humanStatus: 'draft',
    });
    expect(severityTotals).toEqual({ critical: 1, major: 0, minor: 1, observation: 1 });
    expect(statusTotals).toEqual({ aligned: 1, gap: 1, mismatch: 1, pending: 0 });
    // critical present → fail
    expect(verdict).toBe('fail');
  });

  it('drops rows with no matching AI result', () => {
    const selectedRows = [row('a', 'Q-A'), row('missing', 'Q-missing')];
    const resultRows: DocumentCheckResultRow[] = [
      { comparisonId: 'a', status: 'aligned', severity: 'observation' },
    ];
    const { findings } = summarizeDocumentCheckResults(selectedRows, resultRows);
    expect(findings.map((f) => f.comparisonId)).toEqual(['a']);
  });

  it('verdict is conditional when gaps/mismatches but no critical', () => {
    const { verdict } = summarizeDocumentCheckResults([row('a', 'Q')], [
      { comparisonId: 'a', status: 'gap', severity: 'major' },
    ]);
    expect(verdict).toBe('conditional');
  });

  it('verdict is pass when everything aligned', () => {
    const { verdict } = summarizeDocumentCheckResults([row('a', 'Q')], [
      { comparisonId: 'a', status: 'aligned', severity: 'observation' },
    ]);
    expect(verdict).toBe('pass');
  });
});
