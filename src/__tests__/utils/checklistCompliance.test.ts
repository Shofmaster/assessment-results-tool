import { describe, expect, it } from "vitest";

/**
 * Inline copy of computeComplianceScore from Checklists.tsx — tested here
 * independently so we don't need to import a React component.
 */
function computeComplianceScore(items: any[]): { score: number; earned: number; max: number; hasScoring: boolean } {
  let earned = 0;
  let max = 0;
  let hasScoring = false;
  for (const item of items) {
    const pv = item.pointValue ?? 1;
    if (item.responseType === "pass_fail_na") {
      hasScoring = true;
      if (item.passFail === "na") continue;
      max += pv;
      if (item.passFail === "pass") earned += pv;
    } else {
      if (item.pointValue != null) {
        hasScoring = true;
        max += pv;
        if (item.status === "complete") earned += pv;
      }
    }
  }
  const score = max > 0 ? Math.round((earned / max) * 100) : 0;
  return { score, earned, max, hasScoring };
}

describe("computeComplianceScore", () => {
  it("returns hasScoring=false and score=0 when no items have responseType or pointValue", () => {
    const items = [
      { status: "complete" },
      { status: "not_started" },
    ];
    expect(computeComplianceScore(items)).toEqual({ score: 0, earned: 0, max: 0, hasScoring: false });
  });

  it("scores all-pass as 100%", () => {
    const items = [
      { responseType: "pass_fail_na", passFail: "pass", pointValue: 1 },
      { responseType: "pass_fail_na", passFail: "pass", pointValue: 2 },
    ];
    expect(computeComplianceScore(items)).toEqual({ score: 100, earned: 3, max: 3, hasScoring: true });
  });

  it("scores all-fail as 0%", () => {
    const items = [
      { responseType: "pass_fail_na", passFail: "fail", pointValue: 1 },
      { responseType: "pass_fail_na", passFail: "fail", pointValue: 3 },
    ];
    expect(computeComplianceScore(items)).toEqual({ score: 0, earned: 0, max: 4, hasScoring: true });
  });

  it("excludes N/A items from the denominator", () => {
    const items = [
      { responseType: "pass_fail_na", passFail: "pass", pointValue: 1 },
      { responseType: "pass_fail_na", passFail: "na", pointValue: 5 },
      { responseType: "pass_fail_na", passFail: "fail", pointValue: 1 },
    ];
    // max = 2 (na excluded), earned = 1
    expect(computeComplianceScore(items)).toEqual({ score: 50, earned: 1, max: 2, hasScoring: true });
  });

  it("defaults pointValue to 1 when not set on pass_fail_na items", () => {
    const items = [
      { responseType: "pass_fail_na", passFail: "pass" },
      { responseType: "pass_fail_na", passFail: "fail" },
    ];
    expect(computeComplianceScore(items)).toEqual({ score: 50, earned: 1, max: 2, hasScoring: true });
  });

  it("scores weighted items correctly (mixed pass_fail_na)", () => {
    const items = [
      { responseType: "pass_fail_na", passFail: "pass", pointValue: 3 },
      { responseType: "pass_fail_na", passFail: "fail", pointValue: 1 },
      { responseType: "pass_fail_na", passFail: "na", pointValue: 10 },
    ];
    // max = 4, earned = 3 → 75%
    expect(computeComplianceScore(items)).toEqual({ score: 75, earned: 3, max: 4, hasScoring: true });
  });

  it("counts status-mode items with explicit pointValue", () => {
    const items = [
      { status: "complete", pointValue: 2 },
      { status: "blocked", pointValue: 1 },
      { status: "not_started" }, // no pointValue → not counted
    ];
    // max = 3, earned = 2 → 67%
    const result = computeComplianceScore(items);
    expect(result.hasScoring).toBe(true);
    expect(result.max).toBe(3);
    expect(result.earned).toBe(2);
    expect(result.score).toBe(67);
  });

  it("handles empty item list", () => {
    expect(computeComplianceScore([])).toEqual({ score: 0, earned: 0, max: 0, hasScoring: false });
  });

  it("returns 0 when all items are N/A (no denominator)", () => {
    const items = [
      { responseType: "pass_fail_na", passFail: "na", pointValue: 5 },
      { responseType: "pass_fail_na", passFail: "na", pointValue: 3 },
    ];
    expect(computeComplianceScore(items)).toEqual({ score: 0, earned: 0, max: 0, hasScoring: true });
  });
});
