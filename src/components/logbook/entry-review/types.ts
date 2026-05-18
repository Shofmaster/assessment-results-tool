export interface SmartReviewFinding {
  severity: 'critical' | 'major' | 'advisory';
  category:
    | 'missing_field'
    | 'inadequate_description'
    | 'signoff_deficiency'
    | 'regulatory_gap'
    | 'best_practice'
    | 'roster_mismatch'
    | 'capability_scope'
    | 'opspec_scope';
  field?: string;
  citation: string;
  issue: string;
  suggestedText?: string;
}

export type CrossCheckOutcome =
  | 'matched'
  | 'not_found'
  | 'ambiguous'
  | 'within_scope'
  | 'outside_scope'
  | 'unclear'
  | 'not_applicable';

export interface SmartReviewResult {
  overallCompliance: 'compliant' | 'minor_issues' | 'major_issues' | 'non_compliant';
  complianceScore: number;
  findings: SmartReviewFinding[];
  suggestedWorkPerformed?: string;
  suggestedRts?: string;
  regulatoryFramework: string;
  standardsApplied?: string[];
  crossChecks?: {
    rosterMatch?: CrossCheckOutcome;
    capabilityScope?: CrossCheckOutcome;
    opSpecScope?: CrossCheckOutcome;
  };
}

export type PageMode = 'compliance' | 'manualCompare';
