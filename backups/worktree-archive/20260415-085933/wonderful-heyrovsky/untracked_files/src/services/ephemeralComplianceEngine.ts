/**
 * Ephemeral compliance engine — wraps the deterministic `runComplianceChecks`
 * for use in Entry Review where entries are `ParsedLogEntry[]` (not stored
 * `LogbookEntry[]`) and there's no real project/aircraft ID.
 */

import type { ParsedLogEntry, LogbookEntry, ComplianceRule } from '../types/logbook';
import { runComplianceChecks, type RawFinding } from './complianceEngine';
import { getDefaultRules } from './defaultComplianceRules';

type OperatorType = 'part91_owner' | 'part135' | 'part145' | 'ia_inspector' | 'other';

/**
 * Convert a `ParsedLogEntry` to the `LogbookEntry` shape the compliance engine
 * expects. Uses synthetic IDs that are stripped from results afterward.
 */
function toLogbookEntry(parsed: ParsedLogEntry, index: number): LogbookEntry {
  return {
    _id: `ephemeral-${index}`,
    projectId: 'ephemeral',
    userId: 'ephemeral',
    aircraftId: 'ephemeral',
    rawText: parsed.rawText,
    entryDate: parsed.entryDate,
    workPerformed: parsed.workPerformed,
    ataChapter: parsed.ataChapter,
    adReferences: parsed.adReferences,
    sbReferences: parsed.sbReferences,
    adSbReferences: parsed.adSbReferences,
    totalTimeAtEntry: parsed.totalTimeAtEntry,
    totalCyclesAtEntry: parsed.totalCyclesAtEntry,
    totalLandingsAtEntry: parsed.totalLandingsAtEntry,
    signerName: parsed.signerName,
    signerCertNumber: parsed.signerCertNumber,
    signerCertType: parsed.signerCertType,
    returnToServiceStatement: parsed.returnToServiceStatement,
    hasReturnToService: parsed.hasReturnToService,
    entryType: parsed.entryType,
    confidence: parsed.confidence,
    fieldConfidence: parsed.fieldConfidence,
    adComplianceDetails: parsed.adComplianceDetails,
    sbComplianceDetails: parsed.sbComplianceDetails,
    componentMentions: parsed.componentMentions,
    regulatoryBasis: parsed.regulatoryBasis,
    inspectionType: parsed.inspectionType,
    nextDueDate: parsed.nextDueDate,
    recurrenceInterval: parsed.recurrenceInterval,
    recurrenceUnit: parsed.recurrenceUnit,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export interface EphemeralComplianceResult {
  findings: RawFinding[];
  rulesApplied: number;
}

/**
 * Run deterministic compliance checks against parsed entries without needing
 * a Convex project or stored aircraft. Uses bundled default rules.
 */
export function runEphemeralComplianceChecks(
  parsed: ParsedLogEntry[],
  opts: {
    framework: 'FAA' | 'EASA';
    operatorType?: OperatorType;
    customRules?: ComplianceRule[];
  },
): EphemeralComplianceResult {
  const rules = opts.customRules ?? getDefaultRules(opts.framework, opts.operatorType);
  const entries = parsed.map(toLogbookEntry);
  const rawFindings = runComplianceChecks(entries, rules, 'ephemeral');

  // Keep ephemeral entry IDs for per-entry filtering, but clear the aircraft ID
  const findings = rawFindings.map((f) => ({
    ...f,
    aircraftId: '',
  }));

  return { findings, rulesApplied: rules.length };
}

/**
 * Get findings for a single parsed entry by index within a set.
 * Useful for rendering per-entry findings in EntryReviewCard.
 */
export function findingsForEntry(
  allFindings: RawFinding[],
  entryIndex: number,
): RawFinding[] {
  const ephId = `ephemeral-${entryIndex}`;
  return allFindings.filter((f) => f.logbookEntryId === ephId);
}
