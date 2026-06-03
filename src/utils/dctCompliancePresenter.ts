/**
 * Pure presentation + derivation helpers for the DCT Compliance view.
 *
 * Everything here is free of React and Convex so it can be unit-tested in
 * isolation and reused by the (forthcoming) per-tab components. No function in
 * this module performs I/O or triggers any LLM/API call — it only shapes data
 * that has already been fetched.
 */
import type { DctFindingSeverity } from '../services/dctDocumentCheckEngine';
import {
  buildDctHaystack,
  classifyDctApplicability,
  type ApplicabilitySettings,
  type DctApplicabilityState,
  type EntityProfileLike,
  type StructuredApplicabilityInput,
} from './dctApplicability';

// ---------------------------------------------------------------------------
// Badges / labels (pure presentation)
// ---------------------------------------------------------------------------

// NOTE: `statusBadgeClass` is also reimplemented in PaperworkReview.tsx. Step 4
// of the remediation plan (centralize shared UI helpers) should consolidate
// them; kept DCT-local for now to keep this refactor behavior-preserving.
export function statusBadgeClass(status: string): string {
  if (status === 'green') return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40';
  if (status === 'yellow') return 'bg-amber-500/20 text-amber-100 border-amber-500/40';
  if (status === 'red') return 'bg-red-500/20 text-red-200 border-red-500/40';
  return 'bg-white/10 text-white/70 border-white/20';
}

export function statusLabel(status: string): string {
  if (status === 'green') return 'Compliant';
  if (status === 'yellow') return 'Review due';
  if (status === 'red') return 'Action needed';
  return 'Not started';
}

export type DctCheckVerdict = 'pass' | 'conditional' | 'fail' | 'pending';

export function verdictFromStatus(status: string): DctCheckVerdict {
  if (status === 'green') return 'pass';
  if (status === 'yellow') return 'conditional';
  if (status === 'red') return 'fail';
  return 'pending';
}

export function findingSeverityBadgeClass(severity: DctFindingSeverity): string {
  if (severity === 'critical') return 'bg-red-500/20 text-red-200 border-red-500/40';
  if (severity === 'major') return 'bg-amber-500/20 text-amber-200 border-amber-500/40';
  if (severity === 'minor') return 'bg-sky-500/20 text-sky-200 border-sky-500/40';
  return 'bg-white/10 text-white/70 border-white/20';
}

export function sortFindingsBySeverity<T extends { severity: DctFindingSeverity }>(
  findings: T[]
): T[] {
  const order: Record<DctFindingSeverity, number> = {
    critical: 0,
    major: 1,
    minor: 2,
    observation: 3,
  };
  return [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
}

// ---------------------------------------------------------------------------
// Applicability classification of enriched comparison rows
// ---------------------------------------------------------------------------

/** Inputs needed to classify a DCT row's applicability, bundled for reuse. */
export interface DctClassifyContext {
  profile: EntityProfileLike | null | undefined;
  settings: ApplicabilitySettings | null | undefined;
  extraTokens?: string[] | null;
  structured?: StructuredApplicabilityInput | null;
}

/** Minimal shape of an enriched comparison row consumed by classification. */
export interface EnrichedRowLike {
  dctDocument: {
    _id?: unknown;
    peerGroupLabel?: string;
    mlfLabel?: string;
    specialtyLabel?: string;
    [k: string]: unknown;
  };
  question?: unknown;
  comparison: {
    _id?: unknown;
    status?: string;
    applicabilityState?: DctApplicabilityState | string | undefined;
    [k: string]: unknown;
  };
}

/**
 * Resolve a row's effective applicability: a stored value on the comparison
 * wins; otherwise fall back to the heuristic classification. Returns the
 * confidence from the heuristic pass for sorting/triage.
 *
 * This collapses the identical classify-then-fallback block that was repeated
 * across six memos in DctCompliance.
 */
export function classifyRow(
  row: EnrichedRowLike,
  ctx: DctClassifyContext
): { state: DctApplicabilityState; confidence: number } {
  const doc = row.dctDocument;
  const inferred = classifyDctApplicability(
    doc.peerGroupLabel,
    doc.mlfLabel,
    doc.specialtyLabel,
    ctx.profile,
    ctx.settings,
    ctx.extraTokens,
    ctx.structured,
    buildDctHaystack(doc as never, row.question as never)
  );
  const stored = row.comparison.applicabilityState as DctApplicabilityState | undefined;
  return {
    state: stored ?? inferred.state,
    confidence: inferred.confidence,
  };
}

// ---------------------------------------------------------------------------
// Count / breakdown derivations
// ---------------------------------------------------------------------------

export interface ApplicabilityBucketCounts {
  applicable: number;
  unsure: number;
  not_applicable: number;
}

export function countApplicabilityBuckets(
  classified: Array<{ applicability: DctApplicabilityState }>
): ApplicabilityBucketCounts {
  const out: ApplicabilityBucketCounts = { applicable: 0, unsure: 0, not_applicable: 0 };
  for (const { applicability } of classified) {
    out[applicability] += 1;
  }
  return out;
}

export interface StatusBreakdown {
  aligned: number;
  gap: number;
  mismatch: number;
  pending: number;
}

type StatusCounts = Partial<StatusBreakdown>;

/** Full-project status counts from the server summary (not the truncated enriched slice). */
export function deriveStatusBreakdown(
  summary:
    | { metrics?: { status?: StatusCounts }; comparisonStats?: { status?: StatusCounts } }
    | null
    | undefined
): StatusBreakdown {
  const fromMetrics = summary?.metrics?.status ?? summary?.comparisonStats?.status;
  return {
    aligned: fromMetrics?.aligned ?? 0,
    gap: fromMetrics?.gap ?? 0,
    mismatch: fromMetrics?.mismatch ?? 0,
    pending: fromMetrics?.pending ?? 0,
  };
}

export interface FindingSeverityCounts {
  critical: number;
  major: number;
  minor: number;
  observation: number;
}

export function countFindingSeverities(
  findings: Array<{ severity: DctFindingSeverity }>
): FindingSeverityCounts {
  return findings.reduce<FindingSeverityCounts>(
    (acc, f) => {
      acc[f.severity] += 1;
      return acc;
    },
    { critical: 0, major: 0, minor: 0, observation: 0 }
  );
}

// ---------------------------------------------------------------------------
// Evidence text parsing (document-check finding rationale)
// ---------------------------------------------------------------------------

export type EvidenceSegments = {
  requirement?: string;
  evidence?: string;
  gap?: string;
  correctiveAction?: string;
};

/**
 * Parse a pipe-delimited "Requirement: … | Evidence: … | Gap: … | Corrective
 * action: …" rationale string into structured segments. Returns {} when no
 * recognized segment is present (caller renders the raw text instead).
 */
export function parseEvidenceSegments(text: string): EvidenceSegments {
  const normalized = (text ?? '').replace(/\r\n/g, '\n').replace(/\*\*/g, '').trim();
  if (!normalized) return {};
  const out: EvidenceSegments = {};

  const parts = normalized
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean);
  for (const part of parts) {
    const m = part.match(/^(Requirement|Evidence|Gap|Corrective action)\s*:\s*([\s\S]*?)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2]?.trim();
    if (!value) continue;
    if (key === 'requirement') out.requirement = value;
    else if (key === 'evidence') out.evidence = value;
    else if (key === 'gap') out.gap = value;
    else if (key === 'corrective action') out.correctiveAction = value;
  }

  if (out.requirement || out.evidence || out.gap || out.correctiveAction) return out;
  return {};
}

// ---------------------------------------------------------------------------
// Document-check result shaping (pure)
// ---------------------------------------------------------------------------

export type DctComparisonStatus = 'pending' | 'aligned' | 'gap' | 'mismatch';

/** One AI result row returned by `runDctDocumentCheckBatch`. */
export interface DocumentCheckResultRow {
  comparisonId: string;
  status: DctComparisonStatus;
  severity: DctFindingSeverity;
  evidenceSnippet?: string;
  rationale?: string;
  underReviewDocumentId?: string;
}

/** Minimal shape of the enriched rows that were submitted for checking. */
export interface DocumentCheckSelectedRow {
  comparison: { _id: unknown };
  question: { text?: string };
  dctDocument: { fileName?: string };
}

export interface DocumentCheckFinding {
  comparisonId: string;
  questionText: string;
  dctFileName?: string;
  status: DctComparisonStatus;
  severity: DctFindingSeverity;
  evidenceSnippet?: string;
  rationale?: string;
  underReviewDocumentId?: string;
  humanStatus?: 'draft' | 'accepted' | 'needs_work';
}

export interface DocumentCheckSeverityTotals {
  critical: number;
  major: number;
  minor: number;
  observation: number;
}

export interface DocumentCheckStatusTotals {
  aligned: number;
  gap: number;
  mismatch: number;
  pending: number;
}

export interface DocumentCheckSummary {
  findings: DocumentCheckFinding[];
  severityTotals: DocumentCheckSeverityTotals;
  statusTotals: DocumentCheckStatusTotals;
  verdict: DctCheckVerdict;
}

/**
 * Join the AI result rows back onto the submitted DCT rows, sort the resulting
 * findings by severity, tally severity/status totals, and derive the overall
 * verdict. Pure: no I/O, no LLM calls — this only shapes data the document-check
 * batch already returned. Rows with no matching AI result are dropped (same as
 * the original inline logic).
 */
export function summarizeDocumentCheckResults(
  selectedRows: DocumentCheckSelectedRow[],
  resultRows: DocumentCheckResultRow[]
): DocumentCheckSummary {
  const byComparisonId = new Map(resultRows.map((r) => [r.comparisonId, r]));
  const findings = sortFindingsBySeverity(
    selectedRows
      .map((row): DocumentCheckFinding | null => {
        const ai = byComparisonId.get(String(row.comparison._id));
        if (!ai) return null;
        return {
          comparisonId: String(row.comparison._id),
          questionText: row.question.text ?? '',
          dctFileName: row.dctDocument.fileName,
          status: ai.status,
          severity: ai.severity,
          evidenceSnippet: ai.evidenceSnippet,
          rationale: ai.rationale,
          underReviewDocumentId: ai.underReviewDocumentId,
          humanStatus: 'draft' as const,
        };
      })
      .filter((f): f is DocumentCheckFinding => f != null)
  );

  const severityTotals = findings.reduce<DocumentCheckSeverityTotals>(
    (acc, row) => {
      acc[row.severity] += 1;
      return acc;
    },
    { critical: 0, major: 0, minor: 0, observation: 0 }
  );
  const statusTotals = findings.reduce<DocumentCheckStatusTotals>(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { aligned: 0, gap: 0, mismatch: 0, pending: 0 }
  );
  const verdict: DctCheckVerdict =
    severityTotals.critical > 0
      ? 'fail'
      : statusTotals.gap + statusTotals.mismatch > 0
        ? 'conditional'
        : 'pass';

  return { findings, severityTotals, statusTotals, verdict };
}
