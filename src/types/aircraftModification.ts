/**
 * Aircraft Modifications — client-side types.
 *
 * Mirrors the `aircraftModifications` / `aircraftModificationEdges` Convex tables
 * plus the DTOs used by the AI extraction flow (see
 * src/services/modificationExtraction.ts).
 */

export type ModType =
  | 'stc'
  | 'field_approval_337'
  | 'der_8110_3'
  | 'minor_alteration'
  | 'amoc'
  | 'other';

export type ModStatus = 'installed' | 'removed' | 'superseded';

export type ModEdgeKind =
  | 'depends_on'
  | 'conflicts_with'
  | 'interfaces_with'
  | 'shared_system';

export interface IcaRequirement {
  description: string;
  /** Free text, e.g. "12 months", "every 100 hours" */
  interval?: string;
  /** e.g. "STC SA01234NM ICA doc 25-1, Rev B" */
  reference?: string;
}

export interface AfmSupplementInfo {
  required: boolean;
  reference?: string;
  limitations?: string[];
}

export interface WeightBalanceImpact {
  weightChangeLbs?: number;
  arm?: number;
  momentChange?: number;
  notes?: string;
}

export interface RecurringInspection {
  description: string;
  interval?: number;
  /** "hours" | "cycles" | "calendar_months" | "calendar_days" */
  intervalUnit?: string;
  reference?: string;
}

/** Shared shape between stored records and extraction drafts. */
export interface ModificationFields {
  modType: ModType;
  title: string;
  /** STC number (SA01234NM), 337 date/FSDO ref, 8110-3 form number, etc. */
  approvalRef?: string;
  holder?: string;
  /** ISO date */
  dateInstalled?: string;
  description?: string;
  /** First entry = primary ATA chapter (used for graph grouping) */
  ataChapters?: string[];
  affectedSystems?: string[];
  status: ModStatus | string;
  icaRequirements?: IcaRequirement[];
  afmSupplement?: AfmSupplementInfo;
  weightBalance?: WeightBalanceImpact;
  placards?: string[];
  electricalLoadNotes?: string;
  recurringInspections?: RecurringInspection[];
}

/** A stored modification record (Convex row). */
export interface AircraftModification extends ModificationFields {
  _id: string;
  projectId: string;
  userId: string;
  aircraftId: string;
  supersededByModId?: string;
  sourceDocumentIds?: string[];
  form337RecordId?: string;
  extractionConfidence?: number;
  extractionModel?: string;
  userVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Threshold below which an AI-extracted, unverified mod is flagged for review. */
export const MOD_REVIEW_CONFIDENCE_THRESHOLD = 0.7;

/** Shared "needs review" rule — used by both the graph badge and detail banner. */
export function modNeedsReview(mod: Pick<AircraftModification, 'extractionConfidence' | 'userVerified'>): boolean {
  return (mod.extractionConfidence ?? 1) < MOD_REVIEW_CONFIDENCE_THRESHOLD && !mod.userVerified;
}

/** A stored relationship edge between two modifications (Convex row). */
export interface ModificationEdge {
  _id: string;
  projectId: string;
  userId: string;
  aircraftId: string;
  fromModId: string;
  toModId: string;
  kind: ModEdgeKind;
  ataChapter?: string;
  note?: string;
  /** "ai" | "manual" */
  source: string;
  createdAt: string;
  updatedAt: string;
}

// ── Extraction DTOs ─────────────────────────────────────────────────────────

/** A modification proposed by AI extraction (or 337 import), pre-save. */
export interface ExtractedModification extends ModificationFields {
  confidence?: number;
  sourceDocumentIds?: string[];
  form337RecordId?: string;
  /** Review-modal state only — never persisted. */
  dedupeMatch?: { existingModId: string; reason: string };
}

/** Edge endpoint: index into the extracted batch, or an existing mod's _id. */
export type ProposedEdgeRef = { newIndex: number } | { existingModId: string };

export interface ProposedEdge {
  from: ProposedEdgeRef;
  to: ProposedEdgeRef;
  kind: ModEdgeKind;
  ataChapter?: string;
  note?: string;
}

export interface ModExtractionResult {
  modifications: ExtractedModification[];
  edges: ProposedEdge[];
  warnings: string[];
}

export const MOD_TYPE_LABELS: Record<ModType, string> = {
  stc: 'STC',
  field_approval_337: 'Field Approval (337)',
  der_8110_3: 'DER 8110-3',
  minor_alteration: 'Minor Alteration',
  amoc: 'AMOC',
  other: 'Other',
};

export const MOD_EDGE_KIND_LABELS: Record<ModEdgeKind, string> = {
  depends_on: 'Depends on',
  conflicts_with: 'Conflicts with',
  interfaces_with: 'Interfaces with',
  shared_system: 'Shared system',
};

export const ALL_MOD_TYPES: ModType[] = [
  'stc',
  'field_approval_337',
  'der_8110_3',
  'minor_alteration',
  'amoc',
  'other',
];

export const ALL_MOD_EDGE_KINDS: ModEdgeKind[] = [
  'depends_on',
  'conflicts_with',
  'interfaces_with',
  'shared_system',
];
