import { describe, expect, it } from "vitest";
import { buildOrgChartForest } from "../../utils/rosterOrganization";
import {
  computeGridOrgLayout,
  mergeOrgLayoutWithSaved,
  snapPointToOrgGrid,
  ORG_GRID_SIZE,
} from "../../utils/orgChartLayout";

describe("orgChartLayout", () => {
  it("places nodes on a snapped grid by org level", () => {
    const personnel = [
      { _id: "1", fullName: "Manager" },
      { _id: "2", fullName: "Tech", reportsToPersonId: "1" },
    ];
    const roots = buildOrgChartForest(personnel);
    const placed = computeGridOrgLayout(personnel, roots);
    expect(placed).toHaveLength(2);
    for (const node of placed) {
      expect(node.x % ORG_GRID_SIZE).toBe(0);
      expect(node.y % ORG_GRID_SIZE).toBe(0);
    }
    const manager = placed.find((n) => n.personId === "1");
    const tech = placed.find((n) => n.personId === "2");
    expect(manager?.y).toBeLessThan(tech?.y ?? 0);
  });

  it("snaps saved drag positions to the grid", () => {
    const personnel = [{ _id: "1", fullName: "Solo" }];
    const roots = buildOrgChartForest(personnel);
    const auto = computeGridOrgLayout(personnel, roots);
    const merged = mergeOrgLayoutWithSaved(auto, new Map([["1", { x: 125, y: 83 }]]));
    expect(merged[0]).toEqual(expect.objectContaining(snapPointToOrgGrid(125, 83)));
  });
});
