import { describe, expect, it } from "vitest";
import { buildOrgChartForest } from "../../utils/rosterOrganization";
import {
  computeGridOrgLayout,
  findInitialOrgChartSlot,
  mergeOrgLayoutWithSaved,
  orgSlotOrigin,
  snapPointToOrgGrid,
  ORG_GRID_PADDING,
  ORG_SLOT_HEIGHT,
  ORG_SLOT_WIDTH,
} from "../../utils/orgChartLayout";

describe("orgChartLayout", () => {
  it("places nodes on fixed org-chart slots by level", () => {
    const personnel = [
      { _id: "1", fullName: "Manager" },
      { _id: "2", fullName: "Tech", reportsToPersonId: "1" },
    ];
    const roots = buildOrgChartForest(personnel);
    const placed = computeGridOrgLayout(personnel, roots);
    expect(placed).toHaveLength(2);
    expect(placed[0]).toEqual(expect.objectContaining(orgSlotOrigin(0, 0)));
    for (const node of placed) {
      expect((node.x - ORG_GRID_PADDING) % ORG_SLOT_WIDTH).toBe(0);
      expect((node.y - ORG_GRID_PADDING) % ORG_SLOT_HEIGHT).toBe(0);
    }
    const manager = placed.find((n) => n.personId === "1");
    const tech = placed.find((n) => n.personId === "2");
    expect(manager?.y).toBeLessThan(tech?.y ?? 0);
  });

  it("snaps saved drag positions to the nearest slot", () => {
    const personnel = [{ _id: "1", fullName: "Solo" }];
    const roots = buildOrgChartForest(personnel);
    const auto = computeGridOrgLayout(personnel, roots);
    const merged = mergeOrgLayoutWithSaved(auto, new Map([["1", { x: 125, y: 83 }]]));
    expect(merged[0]).toEqual(expect.objectContaining(orgSlotOrigin(0, 1)));
    expect(merged[0]).toEqual(expect.objectContaining(snapPointToOrgGrid(125, 83)));
  });

  it("places a new report in the slot below their supervisor", () => {
    const personnel = [
      { _id: "1", fullName: "Manager" },
      { _id: "2", fullName: "Tech A", reportsToPersonId: "1" },
      { _id: "3", fullName: "Tech B", reportsToPersonId: "1" },
    ];
    const roots = buildOrgChartForest(personnel);
    const merged = mergeOrgLayoutWithSaved(computeGridOrgLayout(personnel, roots), new Map());
    const slot = findInitialOrgChartSlot(merged, { supervisorPersonId: "1", excludePersonId: "3" });
    expect(slot).toEqual(orgSlotOrigin(1, 1));
  });

  it("places a new top-level person in the first open root slot", () => {
    const personnel = [
      { _id: "1", fullName: "Alpha" },
      { _id: "2", fullName: "Beta" },
    ];
    const roots = buildOrgChartForest(personnel);
    const merged = mergeOrgLayoutWithSaved(computeGridOrgLayout(personnel, roots), new Map());
    const slot = findInitialOrgChartSlot(merged, { excludePersonId: "2" });
    expect(slot).toEqual(orgSlotOrigin(1, 0));
  });
});
