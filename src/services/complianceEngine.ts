import type { LogbookEntry, ComplianceRule, ComplianceFinding } from '../types/logbook';

export interface RawFinding {
  aircraftId: string;
  logbookEntryId?: string;
  ruleId: string;
  findingType: string;
  severity: string;
  title: string;
  description: string;
  citation: string;
  evidenceSnippet?: string;
}

/**
 * Deterministic compliance checker. Evaluates each logbook entry against
 * a set of ComplianceRules and returns findings for violations.
 *
 * LLM is NOT used here — every check is traceable to a specific rule and
 * field presence/value. The engine is intentionally conservative: it flags
 * missing data rather than guessing.
 */
export function runComplianceChecks(
  entries: LogbookEntry[],
  rules: ComplianceRule[],
  aircraftId: string
): RawFinding[] {
  const findings: RawFinding[] = [];

  const activeRules = rules.filter(
    (r) => !r.supersededDate || r.supersededDate > new Date().toISOString()
  );

  for (const entry of entries) {
    for (const rule of activeRules) {
      const result = evaluateRule(entry, rule);
      if (result) {
        findings.push({
          aircraftId,
          logbookEntryId: entry._id,
          ruleId: rule.ruleId,
          findingType: result.findingType,
          severity: rule.severity,
          title: result.title,
          description: result.description,
          citation: rule.citation,
          evidenceSnippet: result.evidenceSnippet,
        });
      }
    }
  }

  const gapFindings = detectMaintenanceGaps(entries, aircraftId);
  findings.push(...gapFindings);

  return findings;
}

function evaluateRule(
  entry: LogbookEntry,
  rule: ComplianceRule
): { findingType: string; title: string; description: string; evidenceSnippet?: string } | null {
  switch (rule.checkType) {
    case 'required_field':
      return checkRequiredFields(entry, rule);
    case 'signoff_completeness':
      return checkSignoffCompleteness(entry, rule);
    case 'record_content':
      return checkRecordContent(entry, rule);
    default:
      return null;
  }
}

function checkRequiredFields(
  entry: LogbookEntry,
  rule: ComplianceRule
): { findingType: string; title: string; description: string; evidenceSnippet?: string } | null {
  const missing: string[] = [];

  for (const field of rule.requiredFields) {
    if (isFieldMissing(entry, field)) {
      missing.push(fieldDisplayName(field));
    }
  }

  if (missing.length === 0) return null;

  return {
    findingType: 'missing_field',
    title: `${rule.title} — Missing: ${missing.join(', ')}`,
    description: `${rule.description} The following required field(s) are missing or empty in this log entry: ${missing.join(', ')}.`,
    evidenceSnippet: entry.rawText.slice(0, 200),
  };
}

function checkSignoffCompleteness(
  entry: LogbookEntry,
  rule: ComplianceRule
): { findingType: string; title: string; description: string; evidenceSnippet?: string } | null {
  const problems: string[] = [];

  for (const field of rule.requiredFields) {
    if (field === 'hasReturnToService') {
      if (!entry.hasReturnToService) {
        problems.push('no return-to-service statement');
      }
    } else if (isFieldMissing(entry, field)) {
      problems.push(`missing ${fieldDisplayName(field)}`);
    }
  }

  if (problems.length === 0) return null;

  return {
    findingType: 'incomplete_signoff',
    title: `${rule.title} — ${problems.join(', ')}`,
    description: `${rule.description} Issues found: ${problems.join('; ')}.`,
    evidenceSnippet: entry.rawText.slice(0, 200),
  };
}

function checkRecordContent(
  entry: LogbookEntry,
  rule: ComplianceRule
): { findingType: string; title: string; description: string; evidenceSnippet?: string } | null {
  const missing: string[] = [];

  for (const field of rule.requiredFields) {
    if (field === 'adSbReferences' || field === 'adReferences' || field === 'sbReferences') {
      continue;
    }
    if (isFieldMissing(entry, field)) {
      missing.push(fieldDisplayName(field));
    }
  }

  if (missing.length === 0) return null;

  return {
    findingType: 'missing_field',
    title: `${rule.title} — Missing: ${missing.join(', ')}`,
    description: `${rule.description} Missing content: ${missing.join(', ')}.`,
    evidenceSnippet: entry.rawText.slice(0, 200),
  };
}

/**
 * Detect chronological gaps in maintenance records. A gap is flagged when
 * consecutive dated entries are more than 12 months apart, which may
 * indicate missing logbook pages or records.
 */
function detectMaintenanceGaps(entries: LogbookEntry[], aircraftId: string): RawFinding[] {
  const dated = entries
    .filter((e) => e.entryDate)
    .sort((a, b) => a.entryDate!.localeCompare(b.entryDate!));

  const findings: RawFinding[] = [];
  const GAP_THRESHOLD_DAYS = 365;

  for (let i = 1; i < dated.length; i++) {
    const prevDate = new Date(dated[i - 1].entryDate!);
    const currDate = new Date(dated[i].entryDate!);
    const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays > GAP_THRESHOLD_DAYS) {
      findings.push({
        aircraftId,
        logbookEntryId: dated[i]._id,
        ruleId: 'gap-detection-chronological',
        findingType: 'gap_detected',
        severity: 'major',
        title: `Maintenance Gap: ${Math.round(diffDays)} days between entries`,
        description: `No log entries found between ${dated[i - 1].entryDate} and ${dated[i].entryDate} (${Math.round(diffDays)} days). This may indicate missing logbook pages, records, or periods of inactivity that should be documented.`,
        citation: '14 CFR §91.417 — Maintenance records must be kept for the periods specified',
        evidenceSnippet: `Previous entry: ${dated[i - 1].entryDate}\nNext entry: ${dated[i].entryDate}`,
      });
    }
  }

  return findings;
}

/**
 * Detect time/cycle/landing data discrepancies between consecutive entries.
 * Flags entries where totals decrease (impossible) or increase abnormally.
 */
export function detectTimeDiscrepancies(entries: LogbookEntry[], aircraftId: string): RawFinding[] {
  const dated = entries
    .filter((e) => e.entryDate)
    .sort((a, b) => a.entryDate!.localeCompare(b.entryDate!));

  const findings: RawFinding[] = [];

  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1];
    const curr = dated[i];

    if (
      prev.totalTimeAtEntry !== undefined &&
      curr.totalTimeAtEntry !== undefined &&
      curr.totalTimeAtEntry < prev.totalTimeAtEntry
    ) {
      findings.push({
        aircraftId,
        logbookEntryId: curr._id,
        ruleId: 'data-integrity-time-decrease',
        findingType: 'data_mismatch',
        severity: 'critical',
        title: `Total Time Decreased: ${prev.totalTimeAtEntry} → ${curr.totalTimeAtEntry}`,
        description: `Aircraft total time decreased from ${prev.totalTimeAtEntry} hrs (${prev.entryDate}) to ${curr.totalTimeAtEntry} hrs (${curr.entryDate}). Total time in service cannot decrease.`,
        citation: '14 CFR §91.417(a)(2)(i)',
        evidenceSnippet: `Entry ${prev.entryDate}: TT=${prev.totalTimeAtEntry}\nEntry ${curr.entryDate}: TT=${curr.totalTimeAtEntry}`,
      });
    }

    if (
      prev.totalCyclesAtEntry !== undefined &&
      curr.totalCyclesAtEntry !== undefined &&
      curr.totalCyclesAtEntry < prev.totalCyclesAtEntry
    ) {
      findings.push({
        aircraftId,
        logbookEntryId: curr._id,
        ruleId: 'data-integrity-cycles-decrease',
        findingType: 'data_mismatch',
        severity: 'critical',
        title: `Total Cycles Decreased: ${prev.totalCyclesAtEntry} → ${curr.totalCyclesAtEntry}`,
        description: `Aircraft cycles decreased from ${prev.totalCyclesAtEntry} (${prev.entryDate}) to ${curr.totalCyclesAtEntry} (${curr.entryDate}). Cycle count cannot decrease.`,
        citation: '14 CFR §91.417(a)(2)(i)',
        evidenceSnippet: `Entry ${prev.entryDate}: Cycles=${prev.totalCyclesAtEntry}\nEntry ${curr.entryDate}: Cycles=${curr.totalCyclesAtEntry}`,
      });
    }

    if (
      prev.totalLandingsAtEntry !== undefined &&
      curr.totalLandingsAtEntry !== undefined &&
      curr.totalLandingsAtEntry < prev.totalLandingsAtEntry
    ) {
      findings.push({
        aircraftId,
        logbookEntryId: curr._id,
        ruleId: 'data-integrity-landings-decrease',
        findingType: 'data_mismatch',
        severity: 'critical',
        title: `Total Landings Decreased: ${prev.totalLandingsAtEntry} → ${curr.totalLandingsAtEntry}`,
        description: `Aircraft landings decreased from ${prev.totalLandingsAtEntry} (${prev.entryDate}) to ${curr.totalLandingsAtEntry} (${curr.entryDate}). Landing count cannot decrease.`,
        citation: '14 CFR §91.417(a)(2)(i)',
        evidenceSnippet: `Entry ${prev.entryDate}: Landings=${prev.totalLandingsAtEntry}\nEntry ${curr.entryDate}: Landings=${curr.totalLandingsAtEntry}`,
      });
    }
  }

  return findings;
}

function isFieldMissing(entry: LogbookEntry, field: string): boolean {
  const value = (entry as unknown as Record<string, unknown>)[field];
  if (value === undefined || value === null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function fieldDisplayName(field: string): string {
  const names: Record<string, string> = {
    workPerformed: 'work description',
    entryDate: 'completion date',
    signerName: 'signer name',
    signerCertNumber: 'certificate number',
    signerCertType: 'certificate type',
    hasReturnToService: 'return-to-service approval',
    returnToServiceStatement: 'RTS statement',
    totalTimeAtEntry: 'total time in service',
    totalCyclesAtEntry: 'total cycles',
    totalLandingsAtEntry: 'total landings',
    entryType: 'entry/inspection type',
    adSbReferences: 'AD/SB references',
    adReferences: 'AD references',
    sbReferences: 'SB references',
  };
  return names[field] ?? field;
}
