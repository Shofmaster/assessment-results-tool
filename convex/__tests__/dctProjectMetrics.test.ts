import { describe, expect, it } from "vitest";
import {
  buildProjectMetricsRollup,
  countOpenFindings,
  countStatusBreakdown,
  roundCoveragePct,
} from "../lib/dctProjectMetrics";

describe("dctProjectMetrics", () => {
  it("counts status breakdown across all rows", () => {
    const status = countStatusBreakdown([
      { status: "aligned" },
      { status: "aligned" },
      { status: "gap" },
      { status: "mismatch" },
      { status: "pending" },
    ]);
    expect(status).toEqual({ aligned: 2, gap: 1, mismatch: 1, pending: 1 });
  });

  it("open findings exclude resolved and not_applicable", () => {
    const open = countOpenFindings([
      { status: "gap", resolved: false, applicability: "applicable" },
      { status: "gap", resolved: true, applicability: "applicable" },
      { status: "mismatch", resolved: false, applicability: "not_applicable" },
      { status: "aligned", resolved: false, applicability: "applicable" },
    ]);
    expect(open).toBe(1);
  });

  it("rollup coverage uses applicable over total comparisons", () => {
    const rollup = buildProjectMetricsRollup([
      { status: "aligned", applicability: "applicable" },
      { status: "pending", applicability: "applicable" },
      { status: "pending", applicability: "unsure" },
      { status: "pending", applicability: "not_applicable" },
    ]);
    expect(rollup.totalComparisons).toBe(4);
    expect(rollup.applicability).toEqual({ applicable: 2, unsure: 1, notApplicable: 1 });
    expect(rollup.applicabilityCoverage).toBe(0.5);
    expect(roundCoveragePct(rollup.applicabilityCoverage)).toBe(50);
    expect(rollup.status.aligned).toBe(1);
    expect(rollup.openFindings).toBe(0);
  });
});
