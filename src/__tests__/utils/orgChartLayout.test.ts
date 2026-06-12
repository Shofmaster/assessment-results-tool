import { describe, expect, it } from "vitest";
import { buildOrgChartForest } from "../../utils/rosterOrganization";
import { computeAutoOrgLayout, mergeOrgLayoutWithSaved } from "../../utils/orgChartLayout";

describe("orgChartLayout", () => {
  it("places nodes in a top-down branch layout", () => {
    const roots = buildOrgChartForest([
      { _id: "1", fullName: "Manager" },
      { _id: "2", fullName: "Tech", reportsToPersonId: "1" },
    ]);
    const placed = computeAutoOrgLayout(roots);
    expect(placed).toHaveLength(2);
    const manager = placed.find((n) => n.personId === "1");
    const tech = placed.find((n) => n.personId === "2");
    expect(manager?.y).toBe(0);
    expect(tech?.y).toBeGreaterThan(manager?.y ?? 0);
  });

  it("applies saved drag positions over auto layout", () => {
    const roots = buildOrgChartForest([{ _id: "1", fullName: "Solo" }]);
    const auto = computeAutoOrgLayout(roots);
    const merged = mergeOrgLayoutWithSaved(auto, new Map([["1", { x: 120, y: 80 }]]));
    expect(merged[0]?.x).toBe(120);
    expect(merged[0]?.y).toBe(80);
  });
});
