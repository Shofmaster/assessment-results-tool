/**
 * Pure helpers for DCT traceability runs that use the Anthropic Message
 * Batches API. Kept free of Convex/SDK imports so they can be unit-tested
 * directly (see src/__tests__/convex/traceabilityBatch.test.ts).
 */

export const SLICE_CUSTOM_ID_PREFIX = "slice-";

/** custom_id for the batch request covering comparisons[startIndex..startIndex+batchSize). */
export function sliceCustomId(startIndex: number): string {
  return `${SLICE_CUSTOM_ID_PREFIX}${startIndex}`;
}

export function parseSliceCustomId(customId: string): number | null {
  if (!customId.startsWith(SLICE_CUSTOM_ID_PREFIX)) return null;
  const raw = customId.slice(SLICE_CUSTOM_ID_PREFIX.length);
  if (!/^\d+$/.test(raw)) return null;
  return Number(raw);
}

export type SlicePlan = { startIndex: number; count: number };

/**
 * Plan the comparison slices to submit in one Anthropic Message Batch:
 * contiguous strides of `batchSize` starting at `processed`, capped at
 * `maxSlices` so a single submit action (and the later result drain) stays
 * bounded. Remaining work is submitted as a follow-up batch once this one
 * completes.
 */
export function planSlices(
  total: number,
  processed: number,
  batchSize: number,
  maxSlices: number,
): SlicePlan[] {
  const out: SlicePlan[] = [];
  const size = Math.max(1, batchSize);
  for (
    let start = processed;
    start < total && out.length < maxSlices;
    start += size
  ) {
    out.push({ startIndex: start, count: Math.min(size, total - start) });
  }
  return out;
}

/** Find the first JSON array in free-form model output. */
export function extractJsonArray(text: string): unknown[] | null {
  for (const opener of ["[{", "["]) {
    const start = text.indexOf(opener);
    const end = text.lastIndexOf("]");
    if (start === -1 || end === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try next opener
    }
  }
  return null;
}

export type ParsedPersistRow = {
  comparisonId: string;
  status: "pending" | "aligned" | "gap" | "mismatch";
  underReviewDocumentId?: string;
  evidenceSnippet?: string;
  rationale?: string;
  lowConfidenceApplicability?: boolean;
  applicabilityState?: "applicable" | "unsure" | "not_applicable";
  applicabilitySource?: string;
};

/**
 * Validate raw model-output rows into persistable results. Shared by the
 * synchronous path and the Batches-API result drain so both apply identical
 * validation.
 */
export function buildPersistRows(
  arr: unknown[],
  opts: {
    docIdSet: Set<string>;
    applicabilityMap: Record<string, "applicable" | "unsure" | "not_applicable">;
    lowConfidenceMap: Record<string, boolean>;
  },
): ParsedPersistRow[] {
  const out: ParsedPersistRow[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const comparisonId = typeof r.comparisonId === "string" ? r.comparisonId : "";
    const status = typeof r.status === "string" ? r.status : "";
    if (!comparisonId || !["pending", "aligned", "gap", "mismatch"].includes(status)) {
      continue;
    }
    const rawDocId =
      typeof r.underReviewDocumentId === "string" ? r.underReviewDocumentId.trim() : "";
    const underReviewDocumentId =
      rawDocId && opts.docIdSet.has(rawDocId) ? rawDocId : undefined;
    const eff = opts.applicabilityMap[comparisonId];
    out.push({
      comparisonId,
      status: status as ParsedPersistRow["status"],
      underReviewDocumentId,
      evidenceSnippet: typeof r.evidenceSnippet === "string" ? r.evidenceSnippet : undefined,
      rationale: typeof r.rationale === "string" ? r.rationale : undefined,
      lowConfidenceApplicability: opts.lowConfidenceMap[comparisonId] === true,
      applicabilityState: eff,
      applicabilitySource: eff ? "auto" : undefined,
    });
  }
  return out;
}
