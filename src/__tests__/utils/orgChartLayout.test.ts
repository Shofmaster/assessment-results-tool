import { describe, expect, it } from "vitest";
import { buildOrgChartForest } from "../../utils/rosterOrganization";
import {
  buildFunctionalQuadraticPath,
  buildPolylinePath,
  buildSmoothPathThrough,
  computeGridOrgLayout,
  defaultFunctionalControlPoint,
  findInitialOrgChartSlot,
  mergeOrgLayoutWithSaved,
  normalizeRouteWaypoints,
  orgSlotOrigin,
  pointOnPolyline,
  pointOnSmoothPath,
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

  it("builds a functional supervisor curve from a draggable control point", () => {
    const from = { x: 100, y: 100 };
    const to = { x: 300, y: 220 };
    const control = defaultFunctionalControlPoint(from, to, 1);
    expect(buildFunctionalQuadraticPath(from, to, control)).toContain(`Q ${control.x} ${control.y}`);
  });

  it("draws a straight segment when a line has no interior waypoints", () => {
    const a = { x: 10, y: 20 };
    const b = { x: 200, y: 80 };
    expect(buildSmoothPathThrough([a, b])).toBe(`M ${a.x} ${a.y} L ${b.x} ${b.y}`);
  });

  it("keeps the smooth path passing through every waypoint (dots stay on the line)", () => {
    const from = { x: 0, y: 0 };
    const wp1 = { x: 100, y: 60 };
    const wp2 = { x: 220, y: 40 };
    const to = { x: 300, y: 200 };
    const points = [from, wp1, wp2, to];

    // The endpoint of each cubic segment is the next point, so the curve hits them all.
    expect(pointOnSmoothPath(points, 0, 1)).toEqual(wp1);
    expect(pointOnSmoothPath(points, 1, 1)).toEqual(wp2);
    expect(pointOnSmoothPath(points, 0, 0)).toEqual(from);

    // A segment midpoint (where the "+" add-handle sits) lies on the rendered curve.
    const mid = pointOnSmoothPath(points, 1, 0.5);
    expect(Number.isFinite(mid.x)).toBe(true);
    expect(Number.isFinite(mid.y)).toBe(true);
  });

  it("routes primary lines as straight segments through every waypoint", () => {
    const from = { x: 0, y: 0 };
    const wp1 = { x: 100, y: 60 };
    const wp2 = { x: 220, y: 40 };
    const to = { x: 300, y: 200 };
    const pts = [from, wp1, wp2, to];

    // Only straight line commands — no bezier/quadratic curves.
    const d = buildPolylinePath(pts);
    expect(d).toBe(`M 0 0 L 100 60 L 220 40 L 300 200`);
    expect(d).not.toMatch(/[CQ]/);

    // Add-handle midpoints fall on the straight chord of each segment.
    expect(pointOnPolyline(pts, 1, 0.5)).toEqual({ x: 160, y: 50 });
  });

  it("migrates a legacy single control point into a one-waypoint route", () => {
    expect(normalizeRouteWaypoints({ pathControlX: 12, pathControlY: 34 })).toEqual([{ x: 12, y: 34 }]);
    expect(normalizeRouteWaypoints({ waypoints: [{ x: 1, y: 2 }] })).toEqual([{ x: 1, y: 2 }]);
    expect(normalizeRouteWaypoints({})).toEqual([]);
  });
});
