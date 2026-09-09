import type { BadgeVariant } from '../ui';
import type { PaperworkReviewForPdf } from '../../services/paperworkReviewPdfGenerator';

export type ReviewVerdict = 'pass' | 'conditional' | 'fail';
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'observation';
export type HumanFindingStatus = 'draft' | 'accepted' | 'needs_work';

export interface ReviewFinding {
  id: string;
  severity: FindingSeverity;
  location?: string;
  description: string;
  /**
   * Human review state for this finding.
   * Stored inside `documentReviews.findings` (which is v.any in Convex),
   * so we can safely evolve this shape without a schema migration.
   */
  humanStatus?: HumanFindingStatus;
  reviewedBy?: string;
  reviewedAt?: string;
}

export const VERDICT_OPTIONS: { value: ReviewVerdict; label: string }[] = [
  { value: 'pass', label: 'Pass' },
  { value: 'conditional', label: 'Conditional' },
  { value: 'fail', label: 'Fail' },
];

export const SEVERITY_OPTIONS: { value: FindingSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'observation', label: 'Observation' },
];

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  observation: 3,
};

export function sortFindingsBySeverity<T extends { severity?: string }>(findings: T[]): T[] {
  return [...findings].sort((a, b) => {
    const orderA = SEVERITY_ORDER[a.severity as FindingSeverity] ?? 99;
    const orderB = SEVERITY_ORDER[b.severity as FindingSeverity] ?? 99;
    return orderA - orderB;
  });
}

export function findingSeverityBadgeVariant(severity: string | undefined): BadgeVariant {
  switch (severity) {
    case 'critical':
      return 'destructive';
    case 'major':
      return 'warning';
    case 'minor':
      return 'default';
    case 'observation':
    default:
      return 'info';
  }
}

export function verdictBadgeVariant(verdict: string | undefined): BadgeVariant {
  const v = (verdict ?? '').toLowerCase();
  switch (v) {
    case 'pass':
      return 'success';
    case 'conditional':
      return 'warning';
    case 'fail':
      return 'destructive';
    default:
      return 'outline';
  }
}

export type EvidenceSegments = {
  requirement?: string;
  evidence?: string;
  gap?: string;
  correctiveAction?: string;
  recommendedAction?: string;
};

export function normalizeEvidenceText(input: string): string {
  return (input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*>\s*/gm, '')
    .replace(/\*\*/g, '')
    .trim();
}

export function parseEvidenceSegments(description: string): EvidenceSegments {
  const text = normalizeEvidenceText(description);
  if (!text) return {};

  const labels = [
    'Requirement',
    'Evidence',
    'Gap',
    'Corrective action',
    'Recommended action',
    'Recommended corrective action',
  ];

  if (text.includes('|') && /Requirement\s*:|Evidence\s*:|Gap\s*:|Corrective action\s*:|Recommended action\s*:|Recommended corrective action\s*:/i.test(text)) {
    const parts = text
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);

    const out: EvidenceSegments = {};
    for (const part of parts) {
      const m = part.match(
        /^(Requirement|Evidence|Gap|Corrective action|Recommended action|Recommended corrective action)\s*:\s*([\s\S]*?)$/,
      );
      if (!m) continue;
      const rawLabel = String(m[1]).toLowerCase();
      const value = String(m[2] ?? '').trim();
      if (!value) continue;

      if (rawLabel === 'requirement') out.requirement = value;
      else if (rawLabel === 'evidence') out.evidence = value;
      else if (rawLabel === 'gap') out.gap = value;
      else if (rawLabel === 'corrective action') out.correctiveAction = value;
      else if (rawLabel === 'recommended action') out.recommendedAction = value;
      else if (rawLabel === 'recommended corrective action') out.recommendedAction = value;
    }
    if (out.requirement || out.evidence || out.gap || out.correctiveAction || out.recommendedAction) return out;
  }

  const extract = (label: string, next: string[]): string | undefined => {
    const nextGroup = next.length ? next.join('|') : '$';
    const re = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=(?:${nextGroup})|$)`, 'i');
    const m = text.match(re);
    const v = m?.[1]?.trim();
    return v || undefined;
  };

  return {
    requirement: extract('Requirement', ['Evidence', 'Gap', 'Corrective action', 'Recommended action', 'Recommended corrective action']),
    evidence: extract('Evidence', ['Gap', 'Corrective action', 'Recommended action', 'Recommended corrective action']),
    gap: extract('Gap', ['Corrective action', 'Recommended action', 'Recommended corrective action']),
    correctiveAction: extract('Corrective action', ['Recommended action', 'Recommended corrective action']),
    recommendedAction:
      extract('Recommended action', ['Recommended corrective action']) ??
      extract('Recommended corrective action', labels.filter((l) => l !== 'Recommended corrective action')),
  };
}

export const UNDER_REVIEW_CATEGORY_LABELS: Record<string, string> = {
  entity: 'Entity documents',
  sms: 'SMS documents',
  uploaded: 'Uploaded documents',
  regulatory: 'Regulatory documents',
};

export const REFERENCE_DOC_TYPE_LABELS: Record<string, string> = {
  'part-145-manual': 'Part 145 Repair Station Manual',
  'gmm': 'General Maintenance Manual (GMM)',
  'part-135-manual': 'Part 135 Operations Manual',
  'ops-specs': 'Operations Specifications',
  'mel': 'MEL/MMEL',
  'training-program': 'Training Program Manual',
  'qcm': 'Quality Control Manual',
  'sms-manual': 'SMS Manual',
  'ipm': 'Inspection Procedures Manual',
  'part-121-manual': 'Part 121 Operations Manual',
  'part-91-manual': 'Part 91 Operations Manual',
  'hazmat-manual': 'Hazmat Training Manual',
  'tool-calibration': 'Tool Calibration Manual',
  'isbao-standards': 'IS-BAO Standards',
  'other': 'Other Reference',
};

export type ReferenceSource = 'project' | 'shared';

export interface ReferenceEntry {
  source: ReferenceSource;
  id: string;
}

export function newFinding(): ReviewFinding {
  return {
    id: crypto.randomUUID(),
    severity: 'minor',
    description: '',
    humanStatus: 'draft',
  };
}

export function reviewToPdfItem(
  r: any,
  docIdToName: Map<string, string>,
  projectName?: string,
): PaperworkReviewForPdf {
  const projectIds = (r as any).referenceDocumentIds ?? (r.referenceDocumentId ? [r.referenceDocumentId] : []);
  const sharedIds = (r as any).sharedReferenceDocumentIds ?? (r.sharedReferenceDocumentId ? [r.sharedReferenceDocumentId] : []);
  const refNames = [...projectIds, ...sharedIds].map((id: string) => docIdToName.get(id) ?? id).join(', ');
  const rawFindings = (r.findings as any[])?.map((f: any) => ({
    severity: f.severity ?? 'observation',
    location: f.location,
    description: f.description ?? '',
  })) ?? [];
  return {
    projectName,
    reviewName: (r as any).name,
    underReviewDocumentName: docIdToName.get(r.underReviewDocumentId) ?? r.underReviewDocumentId,
    referenceDocumentNames: refNames,
    status: r.status,
    verdict: r.verdict,
    findings: sortFindingsBySeverity(rawFindings),
    reviewScope: (r as any).reviewScope,
    notes: r.notes,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  };
}

/** Where a row in the reference picker comes from. `kb` rows are copied into the project on select. */
export type ReferenceOptionSource = ReferenceSource | 'kb';

export interface ReferenceOptionDoc {
  _id: string;
  name?: string;
  agentId?: string;
  [key: string]: any;
}

export interface ReferenceOptionGroup {
  key: string;
  label: string;
  source: ReferenceOptionSource;
  docs: ReferenceOptionDoc[];
}

function matchesReferenceFilter(doc: ReferenceOptionDoc, query: string): boolean {
  return !query || (doc.name || '').toLowerCase().includes(query);
}

/**
 * Build the grouped, filtered rows for the reference picker.
 *
 * Project and shared docs that are already selected are dropped (their chip is shown above the
 * list instead). Knowledge Base docs stay in the list because selecting one creates a *copy* with
 * a new id — the caller tracks that mapping and renders the row as checked.
 */
export function buildReferenceOptionGroups({
  projectRefs,
  kbDocs,
  sharedGroups,
  entries,
  filter,
}: {
  projectRefs: ReferenceOptionDoc[];
  kbDocs: ReferenceOptionDoc[];
  sharedGroups: Array<{ typeId: string; docs: ReferenceOptionDoc[] }>;
  entries: ReferenceEntry[];
  filter: string;
}): ReferenceOptionGroup[] {
  const q = filter.trim().toLowerCase();
  const isSelected = (source: ReferenceSource, id: string) =>
    entries.some((e) => e.source === source && e.id === id);

  const groups: ReferenceOptionGroup[] = [];

  const project = projectRefs.filter(
    (d) => !isSelected('project', d._id) && matchesReferenceFilter(d, q),
  );
  if (project.length > 0) {
    groups.push({
      key: 'project',
      label: 'Project reference documents',
      source: 'project',
      docs: project,
    });
  }

  const kb = kbDocs.filter((d) => matchesReferenceFilter(d, q));
  if (kb.length > 0) {
    groups.push({ key: 'kb', label: 'Knowledge Base', source: 'kb', docs: kb });
  }

  for (const { typeId, docs } of sharedGroups) {
    const visible = docs.filter((d) => !isSelected('shared', d._id) && matchesReferenceFilter(d, q));
    if (visible.length === 0) continue;
    groups.push({
      key: `shared:${typeId}`,
      label: REFERENCE_DOC_TYPE_LABELS[typeId] || typeId,
      source: 'shared',
      docs: visible,
    });
  }

  return groups;
}

/** The `value` encoding understood by PaperworkReview's `addReference`. */
export function referenceOptionValue(source: ReferenceOptionSource, docId: string): string {
  if (source === 'kb') return `kb:${docId}`;
  if (source === 'shared') return `shared:${docId}`;
  return docId;
}
