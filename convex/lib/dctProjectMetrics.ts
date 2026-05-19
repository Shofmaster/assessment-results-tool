import type { DctApplicabilityState } from "./dctApplicability";

export type DctComparisonStatus = "pending" | "aligned" | "gap" | "mismatch";

export type StatusBreakdown = {
  aligned: number;
  gap: number;
  mismatch: number;
  pending: number;
};

export type ApplicabilityBreakdown = {
  applicable: number;
  unsure: number;
  notApplicable: number;
};

export type ProjectMetricsRollup = {
  totalComparisons: number;
  status: StatusBreakdown;
  applicability: ApplicabilityBreakdown;
  /** applicable / totalComparisons, 0–1 */
  applicabilityCoverage: number;
  /** Unresolved gap/mismatch excluding not_applicable (matches Findings tab). */
  openFindings: number;
};

export function countStatusBreakdown(
  rows: Array<{ status: DctComparisonStatus }>,
): StatusBreakdown {
  const out: StatusBreakdown = { aligned: 0, gap: 0, mismatch: 0, pending: 0 };
  for (const row of rows) {
    if (row.status === "aligned") out.aligned++;
    else if (row.status === "gap") out.gap++;
    else if (row.status === "mismatch") out.mismatch++;
    else out.pending++;
  }
  return out;
}

export function countApplicabilityBreakdown(
  states: DctApplicabilityState[],
): ApplicabilityBreakdown {
  const out: ApplicabilityBreakdown = { applicable: 0, unsure: 0, notApplicable: 0 };
  for (const state of states) {
    if (state === "applicable") out.applicable++;
    else if (state === "unsure") out.unsure++;
    else out.notApplicable++;
  }
  return out;
}

export function countOpenFindings(
  rows: Array<{
    status: DctComparisonStatus;
    resolved?: boolean;
    applicability: DctApplicabilityState;
  }>,
): number {
  let n = 0;
  for (const row of rows) {
    if (row.resolved) continue;
    if (row.status !== "gap" && row.status !== "mismatch") continue;
    if (row.applicability === "not_applicable") continue;
    n++;
  }
  return n;
}

export function buildProjectMetricsRollup(
  rows: Array<{
    status: DctComparisonStatus;
    resolved?: boolean;
    applicability: DctApplicabilityState;
  }>,
): ProjectMetricsRollup {
  const totalComparisons = rows.length;
  const status = countStatusBreakdown(rows);
  const applicability = countApplicabilityBreakdown(rows.map((r) => r.applicability));
  const applicabilityCoverage =
    totalComparisons > 0 ? applicability.applicable / totalComparisons : 0;
  const openFindings = countOpenFindings(rows);
  return {
    totalComparisons,
    status,
    applicability,
    applicabilityCoverage,
    openFindings,
  };
}

export function roundCoveragePct(coverage: number): number {
  return Math.round(coverage * 1000) / 10;
}
