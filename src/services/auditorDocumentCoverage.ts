import {
  AUDITOR_DOCUMENT_REQUIREMENTS,
  DOC_TYPE_LABELS,
  type AuditorCoverageAgentId,
} from '../config/auditorDocumentRequirements';
import { resolveDocumentType, suggestUploadCategoryForDocType, type KnownReferenceDocType, type UploadCategory } from './documentTypeResolver';

export interface CoverageSourceDocument {
  id: string;
  name: string;
  category?: string;
  documentType?: string;
}

export interface AuditorCoverageItem {
  agentId: AuditorCoverageAgentId;
  satisfiedCount: number;
  requiredCount: number;
  completionPercent: number;
  missingDocTypes: KnownReferenceDocType[];
  satisfiedDocTypes: KnownReferenceDocType[];
}

export interface PrioritizedMissingItem {
  docType: KnownReferenceDocType;
  label: string;
  coverageGain: number;
  priorityBucket: 'critical' | 'high' | 'medium' | 'low';
  suggestedUploadCategory: UploadCategory;
}

export interface AuditorCoverageSummary {
  /** Ordered array for rendering (use for .map() in components). */
  byAuditor: AuditorCoverageItem[];
  /** Keyed lookup for direct access by agent id. */
  byAuditorMap: Record<AuditorCoverageAgentId, AuditorCoverageItem>;
  prioritizedMissing: PrioritizedMissingItem[];
  ambiguousDocumentIds: string[];
}

/**
 * Build a full coverage summary given a set of auditor IDs and the documents
 * currently available (project library + shared reference + KB docs).
 */
export function buildAuditorCoverageSummary(
  auditorIds: AuditorCoverageAgentId[],
  documents: CoverageSourceDocument[],
  explicitOverrides?: Record<string, KnownReferenceDocType>,
): AuditorCoverageSummary {
  // Resolve all document types once
  const resolvedDocs = documents.map((doc) => {
    const resolution = resolveDocumentType(doc, explicitOverrides);
    return { ...doc, resolvedType: resolution.docType, ambiguous: resolution.ambiguous };
  });

  const availableTypes = new Set(resolvedDocs.map((d) => d.resolvedType));
  const ambiguousDocumentIds = resolvedDocs.filter((d) => d.ambiguous).map((d) => d.id);

  // Track how many auditors each doc type helps (for prioritization)
  const docTypeCoverageGain: Partial<Record<KnownReferenceDocType, number>> = {};

  const byAuditor: Record<string, AuditorCoverageItem> = {};

  for (const agentId of auditorIds) {
    const reqs = AUDITOR_DOCUMENT_REQUIREMENTS[agentId];
    if (!reqs) continue;

    const required = [
      ...reqs.coreShared,
      ...reqs.requiredSpecific,
    ] as KnownReferenceDocType[];

    const satisfied: KnownReferenceDocType[] = [];
    const missing: KnownReferenceDocType[] = [];

    for (const docType of required) {
      if (availableTypes.has(docType)) {
        satisfied.push(docType);
      } else {
        missing.push(docType);
        docTypeCoverageGain[docType] = (docTypeCoverageGain[docType] ?? 0) + 1;
      }
    }

    const completionPercent =
      required.length === 0 ? 100 : Math.round((satisfied.length / required.length) * 100);

    byAuditor[agentId] = {
      agentId,
      satisfiedCount: satisfied.length,
      requiredCount: required.length,
      completionPercent,
      missingDocTypes: missing,
      satisfiedDocTypes: satisfied,
    };
  }

  // Build prioritized missing list
  const allMissingTypes = new Set<KnownReferenceDocType>();
  for (const item of Object.values(byAuditor)) {
    for (const t of item.missingDocTypes) allMissingTypes.add(t);
  }

  const prioritizedMissing: PrioritizedMissingItem[] = Array.from(allMissingTypes)
    .map((docType) => {
      const gain = docTypeCoverageGain[docType] ?? 0;
      let priorityBucket: PrioritizedMissingItem['priorityBucket'];
      if (gain >= 4) priorityBucket = 'critical';
      else if (gain >= 3) priorityBucket = 'high';
      else if (gain >= 2) priorityBucket = 'medium';
      else priorityBucket = 'low';

      return {
        docType,
        label: DOC_TYPE_LABELS[docType] ?? docType,
        coverageGain: gain,
        priorityBucket,
        suggestedUploadCategory: suggestUploadCategoryForDocType(docType),
      };
    })
    .sort((a, b) => b.coverageGain - a.coverageGain || a.label.localeCompare(b.label));

  const byAuditorMap = byAuditor as Record<AuditorCoverageAgentId, AuditorCoverageItem>;

  return {
    byAuditor: Object.values(byAuditorMap),
    byAuditorMap,
    prioritizedMissing,
    ambiguousDocumentIds,
  };
}

/**
 * Order auditor coverage items with pinned IDs first, then by completion % ascending
 * (least covered first — most actionable).
 * Accepts either the array form or the map form of byAuditor.
 */
export function orderAuditorCoverageByPriority(
  byAuditor: AuditorCoverageItem[] | Record<AuditorCoverageAgentId, AuditorCoverageItem>,
  pinnedIds: AuditorCoverageAgentId[],
): AuditorCoverageItem[] {
  const items: AuditorCoverageItem[] = Array.isArray(byAuditor)
    ? byAuditor
    : Object.values(byAuditor);
  const byId = Object.fromEntries(items.map((i) => [i.agentId, i])) as Record<string, AuditorCoverageItem>;
  const pinned = pinnedIds.map((id) => byId[id]).filter(Boolean) as AuditorCoverageItem[];
  const rest = items
    .filter((item) => !pinnedIds.includes(item.agentId))
    .sort((a, b) => a.completionPercent - b.completionPercent);
  return [...pinned, ...rest];
}
