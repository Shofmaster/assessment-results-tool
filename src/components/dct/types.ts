/** Shared types for the DCT Compliance view and its tab/panel components. */
import type { Id } from '../../../convex/_generated/dataModel';
import type { DctApplicabilityState } from '../../utils/dctApplicability';

/** The six tabs of the DCT Compliance view. */
export type TabKey = 'overview' | 'matrix' | 'findings' | 'document-check' | 'settings' | 'reports';

/**
 * Domain shapes for an "enriched" DCT comparison row (the join of a comparison
 * with its source DCT question + tool document, as returned by
 * `dctCompliance.listComparisonsEnriched`).
 *
 * The underlying Convex query is untyped (`any`), so these interfaces describe
 * the fields the DCT view actually reads. Index signatures keep them
 * forward-compatible with extra server fields and assignable to the looser
 * `EnrichedRowLike` consumed by `classifyRow`. Tightening here removes the
 * blanket `any[]` on the enriched query result inside `useDctData`.
 */
export interface DctQuestionReference {
  srcId?: string;
  /** Required to match the established `DctQuestionLike` contract in DctContextUi. */
  label: string;
  [k: string]: unknown;
}

export interface DctQuestion {
  text?: string;
  references?: DctQuestionReference[];
  [k: string]: unknown;
}

export interface DctComparison {
  _id: Id<'dctComparisons'>;
  status?: 'pending' | 'aligned' | 'gap' | 'mismatch' | string;
  resolved?: boolean;
  applicabilityState?: DctApplicabilityState | string;
  rationale?: string;
  [k: string]: unknown;
}

export interface DctDocumentMeta {
  _id: Id<'dctToolDocuments'> | string;
  fileName?: string;
  peerGroupLabel?: string;
  mlfLabel?: string;
  specialtyLabel?: string;
  [k: string]: unknown;
}

export interface DctEnrichedRow {
  comparison: DctComparison;
  question: DctQuestion;
  dctDocument: DctDocumentMeta;
  [k: string]: unknown;
}
