export type FAAPartScope = '121' | '135' | '145';

export interface FAAInspectionType {
  id: string;
  name: string;
  description: string;
  applicableParts: FAAPartScope[];
  regulations: string[];
  focusAreas: string[];
}

export interface FAAInspectorSpecialty {
  id: string;
  name: string;
  description: string;
  inspectionTypes: FAAInspectionType[];
}

export interface FAAConfig {
  partsScope: FAAPartScope[];
  specialtyId: string;
  inspectionTypeId: string;
}

export interface AuditAgent {
  id: 'faa-inspector' | 'shop-owner' | 'audited-entity' | 'isbao-auditor' | 'easa-inspector' | 'as9100-auditor' | 'sms-consultant' | 'safety-auditor';
  name: string;
  role: string;
  avatar: string;
  color: string;
}

export interface AuditMessage {
  id: string;
  agentId: AuditAgent['id'];
  agentName: string;
  role: string;
  content: string;
  timestamp: string;
  round: number;
  reviewIteration?: number;
  wasRevised?: boolean;
}

export interface ThinkingConfig {
  enabled: boolean;
  budgetTokens: number;
}

export type SelfReviewMode = 'off' | 'per-turn' | 'post-simulation';

export interface SelfReviewConfig {
  mode: SelfReviewMode;
  maxIterations: number;
}

export type KBCurrencyStatus = 'unchecked' | 'checking' | 'current' | 'outdated' | 'unknown' | 'error';

export interface KBDocumentCurrencyResult {
  documentId: string;
  documentName: string;
  status: KBCurrencyStatus;
  latestRevision: string;
  summary: string;
  checkedAt: string | null;
}

export interface AuditSimulationConfig {
  totalRounds: number;
  assessmentId: string;
  thinking?: ThinkingConfig;
  selfReview?: SelfReviewConfig;
}

/** A single discrepancy, finding, or non-conformance identified during the audit simulation. */
export interface AuditDiscrepancy {
  id: string;
  /** Brief title or category. */
  title: string;
  /** Detailed description of the discrepancy. */
  description: string;
  /** critical | major | minor | observation */
  severity: 'critical' | 'major' | 'minor' | 'observation';
  /** Agent(s) or role that raised or is responsible for this finding (e.g. "FAA Inspector"). */
  sourceAgent?: string;
  /** Regulation or standard reference when applicable (e.g. "14 CFR §145.109"). */
  regulationRef?: string;
}

/** Answer from the audit host when an auditor asks a question during the simulation. */
export type AuditorQuestionAnswerType = 'yes' | 'no' | 'text' | 'document';

export interface AuditorQuestionAnswer {
  type: AuditorQuestionAnswerType;
  /** For 'text': the entered text. For 'document': "name: <name>\n\n<extracted text>". */
  value: string;
}

/** A completed paperwork review formatted for inclusion in audit simulation context. */
export interface PaperworkReviewContext {
  /** Name of the document that was reviewed. */
  documentUnderReview: string;
  /** Names of reference documents it was compared against. */
  referenceDocuments: string[];
  /** Pass, conditional, or fail. */
  verdict: 'pass' | 'conditional' | 'fail';
  /** Findings from the review. */
  findings: Array<{
    severity: 'critical' | 'major' | 'minor' | 'observation';
    location?: string;
    description: string;
  }>;
  /** Optional review scope. */
  reviewScope?: string;
  /** Optional notes from the reviewer. */
  notes?: string;
  /** When the review was completed. */
  completedAt?: string;
}

/** Summary of what data was available for the simulation (for realism and "address later" tracking). */
export interface SimulationDataSummary {
  hasAssessment: boolean;
  assessmentName: string;
  entityDocsWithText: number;
  smsDocsWithText: number;
  uploadedDocsWithText: number;
  /** Number of completed paperwork reviews included. */
  paperworkReviewsIncluded: number;
  /** Agent id -> count of library docs with text. */
  agentLibraryCounts: Record<string, number>;
  /** Human-readable gaps: things not provided so the sim proceeded with what we have; can be addressed later. */
  gaps: string[];
}

export interface SimulationResult {
  id: string;
  name: string;
  assessmentId: string;
  assessmentName: string;
  agentIds: AuditAgent['id'][];
  totalRounds: number;
  messages: AuditMessage[];
  createdAt: string;
  thinkingEnabled: boolean;
  selfReviewMode: SelfReviewMode;
  faaConfig?: FAAConfig;
  /** When set, the IS-BAO auditor focused only on this stage (1, 2, or 3). */
  isbaoStage?: 1 | 2 | 3;
  /** Discrepancies extracted from the simulation transcript when complete. */
  discrepancies?: AuditDiscrepancy[];
  /** What data was available and what was missing (address later). */
  dataSummary?: SimulationDataSummary;
  /** Number of paperwork reviews that were included in the simulation context. */
  paperworkReviewsIncluded?: number;
}
