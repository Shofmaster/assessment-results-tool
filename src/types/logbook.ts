/** Aircraft asset stored in Convex. */
export interface AircraftAsset {
  _id: string;
  projectId: string;
  userId: string;
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
  operator?: string;
  year?: number;
  baselineTotalTime?: number;
  baselineTotalCycles?: number;
  baselineTotalLandings?: number;
  baselineAsOfDate?: string;
  notes?: string;
  status?: "active" | "inactive" | "archived";
  createdAt: string;
  updatedAt: string;
}

/** Structured log entry parsed from scanned logbook. */
export interface LogbookEntry {
  _id: string;
  projectId: string;
  userId: string;
  aircraftId: string;
  sourceDocumentId?: string;
  sourcePage?: number;
  rawText: string;
  entryDate?: string;
  workPerformed?: string;
  ataChapter?: string;
  adReferences?: string[];
  sbReferences?: string[];
  adSbReferences?: string[];
  totalTimeAtEntry?: number;
  totalCyclesAtEntry?: number;
  totalLandingsAtEntry?: number;
  signerName?: string;
  signerCertNumber?: string;
  signerCertType?: string;
  returnToServiceStatement?: string;
  hasReturnToService?: boolean;
  entryType?: LogbookEntryType;
  confidence?: number;
  fieldConfidence?: Record<string, number>;
  userVerified?: boolean;

  // ── Structured compliance sub-fields ─────────────────────────────────────
  /** Structured AD compliance details extracted from this entry. */
  adComplianceDetails?: AdComplianceDetail[];
  /** Structured SB compliance details extracted from this entry. */
  sbComplianceDetails?: SbComplianceDetail[];
  /** Component install/remove/inspect mentions extracted from this entry. */
  componentMentions?: ComponentMention[];
  /** For regulatory_check entries: the CFR section basis (e.g. "91.413"). */
  regulatoryBasis?: string;
  /** For inspection entries: the inspection sub-type. */
  inspectionType?: InspectionSubType;
  /** Next-due date for recurring items (inspections, regulatory checks, recurring ADs). */
  nextDueDate?: string;
  /** Recurrence interval value (e.g. 24 for "every 24 months"). */
  recurrenceInterval?: number;
  /** Recurrence interval unit. */
  recurrenceUnit?: "hours" | "cycles" | "landings" | "calendar_months" | "calendar_days";

  createdAt: string;
  updatedAt: string;
}

// ─── Entry type taxonomy ──────────────────────────────────────────────────────

export type LogbookEntryType =
  | "maintenance"            // General MX: component replacement, repairs, troubleshooting
  | "preventive_maintenance" // Owner-performed / Part 43 Appendix A items
  | "alteration"             // STC, 337 forms, field approvals, engineering orders
  | "rebuilding"             // Overhaul, top overhaul, IRAN, remanufacture, SMOH
  | "inspection"             // Annual, 100-hr, progressive, condition, phase inspections
  | "regulatory_check"       // Transponder (91.413), altimeter/static (91.411), ELT (91.207), ADS-B, RVSM
  | "ad_compliance"          // Airworthiness Directive compliance
  | "sb_compliance"          // Service Bulletin / Service Letter compliance
  | "operational"            // Ferry permit, W&B, compass swing, equipment list, MEL deferral
  | "life_limited_component" // Component install/removal with TSN/TSO/life limit tracking
  // Legacy value kept for backward compatibility with older parsed entries.
  | "preventive"
  | "other";

export const LOGBOOK_ENTRY_TYPE_ORDER: LogbookEntryType[] = [
  "inspection",
  "ad_compliance",
  "sb_compliance",
  "regulatory_check",
  "maintenance",
  "preventive_maintenance",
  "alteration",
  "rebuilding",
  "life_limited_component",
  "operational",
  "other",
];

const LOGBOOK_ENTRY_TYPE_LABELS: Record<LogbookEntryType, string> = {
  maintenance: "Maintenance",
  preventive_maintenance: "Preventive Maintenance",
  alteration: "Alteration",
  rebuilding: "Rebuilding / Overhaul",
  inspection: "Inspection",
  regulatory_check: "Regulatory Check",
  ad_compliance: "AD Compliance",
  sb_compliance: "SB Compliance",
  operational: "Operational",
  life_limited_component: "Life-Limited Component",
  preventive: "Preventive Maintenance",
  other: "Other",
};

export function getLogbookEntryTypeLabel(entryType?: string): string {
  if (!entryType) return "Other";
  const key = entryType as LogbookEntryType;
  return LOGBOOK_ENTRY_TYPE_LABELS[key] ?? entryType.replace(/_/g, " ");
}

// ─── Inspection sub-types ─────────────────────────────────────────────────────

export type InspectionSubType =
  | "annual"
  | "100_hour"
  | "progressive"
  | "condition"
  | "phase"
  | "ica"             // Instructions for Continued Airworthiness
  | "conformity"
  | "pre_purchase"
  | "other_inspection";

// ─── Structured AD compliance detail ──────────────────────────────────────────

export interface AdComplianceDetail {
  /** AD number (e.g. "AD 2024-01-02", "AD 2019-26-51R2"). */
  adNumber: string;
  /** How this AD was complied with. */
  complianceMethod?: "terminating_action" | "recurring" | "one_time" | "initial" | "not_applicable";
  /** If recurring: the recurrence interval value. */
  recurrenceInterval?: number;
  /** If recurring: the recurrence interval unit. */
  recurrenceUnit?: "hours" | "cycles" | "landings" | "calendar_months" | "calendar_days";
  /** Free-text description of what was done to comply. */
  complianceDescription?: string;
  /** Part numbers involved in the compliance action. */
  partNumbers?: string[];
  /** If recurring: estimated next compliance date or time. */
  nextDueHint?: string;
  /** Confidence in this extraction (0-1). */
  confidence?: number;
}

// ─── Structured SB compliance detail ──────────────────────────────────────────

export interface SbComplianceDetail {
  /** SB/SL number (e.g. "SB 72-1045", "SL M80-15"). */
  sbNumber: string;
  /** Status of this SB compliance. */
  complianceStatus?: "complied" | "deferred" | "not_applicable" | "in_progress";
  /** If recurring: the recurrence interval value. */
  recurrenceInterval?: number;
  /** If recurring: the recurrence interval unit. */
  recurrenceUnit?: "hours" | "cycles" | "landings" | "calendar_months" | "calendar_days";
  /** Free-text description of what was done. */
  complianceDescription?: string;
  /** Manufacturer recommendation level. */
  recommendationLevel?: "mandatory" | "recommended" | "optional" | "alert";
  /** Confidence in this extraction (0-1). */
  confidence?: number;
}

// ─── Component mention extracted from entry text ──────────────────────────────

export interface ComponentMention {
  /** What happened to the component. */
  action: "installed" | "removed" | "inspected" | "overhauled" | "repaired" | "replaced";
  /** Part number. */
  partNumber?: string;
  /** Serial number. */
  serialNumber?: string;
  /** Component description/name. */
  description?: string;
  /** Time since new at the time of the action. */
  tsn?: number;
  /** Time since overhaul at the time of the action. */
  tso?: number;
  /** Cycles since new. */
  csn?: number;
  /** Whether this is a life-limited part. */
  isLifeLimited?: boolean;
  /** Life limit value (if known from the entry text). */
  lifeLimit?: number;
  /** Life limit unit. */
  lifeLimitUnit?: "hours" | "cycles" | "landings" | "calendar_months";
  /** Confidence in this extraction (0-1). */
  confidence?: number;
}

/** Component installed on or removed from an aircraft. */
export interface AircraftComponent {
  _id: string;
  projectId: string;
  userId: string;
  aircraftId: string;
  partNumber: string;
  serialNumber?: string;
  description: string;
  ataChapter?: string;
  position?: string;
  isLifeLimited?: boolean;
  lifeLimit?: number;
  lifeLimitUnit?: "hours" | "cycles" | "landings" | "calendar_months";
  tsnAtInstall?: number;
  tsoAtInstall?: number;
  cyclesAtInstall?: number;
  aircraftTimeAtInstall?: number;
  aircraftCyclesAtInstall?: number;
  installDate?: string;
  removeDate?: string;
  installLogbookEntryId?: string;
  removeLogbookEntryId?: string;
  status: "installed" | "removed" | "scrapped";
  createdAt: string;
  updatedAt: string;
}

/** A compliance rule stored in the database. */
export interface ComplianceRule {
  _id: string;
  ruleId: string;
  cfrPart: string;
  cfrSection: string;
  title: string;
  description: string;
  requiredFields: string[];
  checkType: "required_field" | "signoff_completeness" | "interval_compliance" | "record_content";
  severity: "critical" | "major" | "minor";
  citation: string;
  effectiveDate?: string;
  supersededDate?: string;
  regulatoryPack: string;
  version: number;
  createdAt: string;
}

/** A finding generated by the compliance engine. */
export interface ComplianceFinding {
  _id: string;
  projectId: string;
  userId: string;
  aircraftId: string;
  logbookEntryId?: string;
  ruleId: string;
  findingType: "missing_field" | "incomplete_signoff" | "missed_inspection" | "gap_detected" | "data_mismatch";
  severity: "critical" | "major" | "minor";
  title: string;
  description: string;
  citation: string;
  evidenceSnippet?: string;
  status: "open" | "acknowledged" | "resolved" | "false_positive";
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  convertedToIssueId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Intermediate representation from the LLM logbook parser before saving. */
export interface ParsedLogEntry {
  rawText: string;
  sourcePage?: number;
  entryDate?: string;
  workPerformed?: string;
  ataChapter?: string;
  adReferences?: string[];
  sbReferences?: string[];
  adSbReferences?: string[];
  totalTimeAtEntry?: number;
  totalCyclesAtEntry?: number;
  totalLandingsAtEntry?: number;
  signerName?: string;
  signerCertNumber?: string;
  signerCertType?: string;
  returnToServiceStatement?: string;
  hasReturnToService?: boolean;
  entryType?: LogbookEntryType;
  confidence: number;
  fieldConfidence: Record<string, number>;

  // ── Structured compliance sub-fields ─────────────────────────────────────
  adComplianceDetails?: AdComplianceDetail[];
  sbComplianceDetails?: SbComplianceDetail[];
  componentMentions?: ComponentMention[];
  regulatoryBasis?: string;
  inspectionType?: InspectionSubType;
  nextDueDate?: string;
  recurrenceInterval?: number;
  recurrenceUnit?: "hours" | "cycles" | "landings" | "calendar_months" | "calendar_days";
}

// ─── Gap & Continuity warning types (Bluetail-inspired) ──────────────────────

/** A gap between two consecutive logbook entries that exceeds a threshold. */
export interface LogbookGapWarning {
  beforeEntryId: string;
  afterEntryId: string;
  beforeDate: string;
  afterDate: string;
  /** Number of calendar days between the two entries. */
  gapDays: number;
}

/** A total-time inconsistency between consecutive logbook entries. */
export interface LogbookContinuityWarning {
  entryId: string;
  entryDate: string;
  previousTotalTime: number;
  currentTotalTime: number;
  /** Positive = increase, negative = decrease (always an error). */
  deltaHours: number;
}

function normalizeRefs(refs?: string[]): string[] {
  if (!refs || refs.length === 0) return [];
  const unique = new Set(
    refs
      .map((ref) => ref.trim())
      .filter((ref) => ref.length > 0)
  );
  return Array.from(unique);
}

export function getAllAdSbReferences(entry: Pick<LogbookEntry, "adReferences" | "sbReferences" | "adSbReferences">): string[] {
  return normalizeRefs([
    ...(entry.adReferences ?? []),
    ...(entry.sbReferences ?? []),
    ...(entry.adSbReferences ?? []),
  ]);
}

export function hasAdReference(entry: Pick<LogbookEntry, "entryType" | "adReferences" | "adSbReferences">): boolean {
  if (entry.entryType === "ad_compliance") return true;
  if ((entry.adReferences?.length ?? 0) > 0) return true;
  return (entry.adSbReferences ?? []).some((ref) => /^AD\b/i.test(ref.trim()));
}

export function hasSbReference(entry: Pick<LogbookEntry, "entryType" | "sbReferences" | "adSbReferences">): boolean {
  if ((entry as any).entryType === "sb_compliance") return true;
  if ((entry.sbReferences?.length ?? 0) > 0) return true;
  return (entry.adSbReferences ?? []).some((ref) => /^SB\b/i.test(ref.trim()));
}
