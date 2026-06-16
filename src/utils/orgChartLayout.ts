import type { OrgChartNode, RosterPersonRow } from "./rosterOrganization";

export const ORG_NODE_WIDTH = 176;
export const ORG_NODE_HEIGHT = 72;
export const ORG_SLOT_GAP = 16;
/** One grid cell = card size plus spacing between slots. */
export const ORG_SLOT_WIDTH = ORG_NODE_WIDTH + ORG_SLOT_GAP;
export const ORG_SLOT_HEIGHT = ORG_NODE_HEIGHT + ORG_SLOT_GAP;
export const ORG_GRID_PADDING = 32;
/** Extra empty grid rows below the lowest card so the chart scrolls vertically with room to arrange. */
export const ORG_CANVAS_EXTRA_ROWS = 4;

export type PlacedOrgNode = {
  id: string;
  x: number;
  y: number;
  depth: number;
  personId: string;
  fullName: string;
  roleTitle?: string;
  department?: string;
};

export type OrgChartEdge = {
  fromId: string;
  toId: string;
  kind: "primary" | "functional";
  label?: string;
  lineId?: string;
  pathControlX?: number;
  pathControlY?: number;
};

function snapAxisToOrgSlot(value: number, slotSize: number): number {
  const index = Math.round((value - ORG_GRID_PADDING) / slotSize);
  return ORG_GRID_PADDING + index * slotSize;
}

/** Snap a point to the nearest org-chart slot (card-sized grid cell). */
export function snapPointToOrgGrid(x: number, y: number): { x: number; y: number } {
  return {
    x: snapAxisToOrgSlot(x, ORG_SLOT_WIDTH),
    y: snapAxisToOrgSlot(y, ORG_SLOT_HEIGHT),
  };
}

export function orgSlotIndex(value: number, slotSize: number): number {
  return Math.round((value - ORG_GRID_PADDING) / slotSize);
}

export function orgSlotOrigin(column: number, row: number): { x: number; y: number } {
  return {
    x: ORG_GRID_PADDING + column * ORG_SLOT_WIDTH,
    y: ORG_GRID_PADDING + row * ORG_SLOT_HEIGHT,
  };
}

function slotKey(column: number, row: number): string {
  return `${column},${row}`;
}

/** Pick the nearest empty grid slot below a supervisor, or the first open top-row slot. */
export function findInitialOrgChartSlot(
  placedNodes: PlacedOrgNode[],
  options: {
    supervisorPersonId?: string;
    excludePersonId?: string;
  },
): { x: number; y: number } {
  const occupied = new Set<string>();
  const byPersonId = new Map<string, PlacedOrgNode>();

  for (const node of placedNodes) {
    if (options.excludePersonId && node.personId === options.excludePersonId) continue;
    const column = orgSlotIndex(node.x, ORG_SLOT_WIDTH);
    const row = orgSlotIndex(node.y, ORG_SLOT_HEIGHT);
    occupied.add(slotKey(column, row));
    byPersonId.set(node.personId, node);
  }

  let targetRow = 0;
  let preferredColumn = 0;

  if (options.supervisorPersonId) {
    const supervisor = byPersonId.get(options.supervisorPersonId);
    if (supervisor) {
      preferredColumn = orgSlotIndex(supervisor.x, ORG_SLOT_WIDTH);
      targetRow = orgSlotIndex(supervisor.y, ORG_SLOT_HEIGHT) + 1;
    }
  }

  for (let radius = 0; radius <= 64; radius++) {
    const columns =
      radius === 0 ? [preferredColumn] : [preferredColumn + radius, preferredColumn - radius];
    for (const column of columns) {
      if (column < 0) continue;
      if (!occupied.has(slotKey(column, targetRow))) {
        return orgSlotOrigin(column, targetRow);
      }
    }
  }

  for (let column = 0; column <= 128; column++) {
    if (!occupied.has(slotKey(column, targetRow))) {
      return orgSlotOrigin(column, targetRow);
    }
  }

  return orgSlotOrigin(0, targetRow);
}

export function resolveInitialOrgChartPosition(
  personnel: RosterPersonRow[],
  roots: OrgChartNode[],
  savedByPersonId: Map<string, { x: number; y: number }>,
  personId: string,
  supervisorPersonId?: string,
): { x: number; y: number } {
  const merged = mergeOrgLayoutWithSaved(computeGridOrgLayout(personnel, roots), savedByPersonId);
  return findInitialOrgChartSlot(merged, {
    supervisorPersonId,
    excludePersonId: personId,
  });
}

/** Row/column grid layout aligned to snap grid — one row per org level. */
export function computeGridOrgLayout(personnel: RosterPersonRow[], roots: OrgChartNode[]): PlacedOrgNode[] {
  const inTree = new Set<string>();
  const depthById = new Map<string, number>();

  const walk = (node: OrgChartNode, depth: number) => {
    inTree.add(node.person._id);
    depthById.set(node.person._id, depth);
    node.children.forEach((child) => walk(child, depth + 1));
  };
  roots.forEach((root) => walk(root, 0));

  const placed: PlacedOrgNode[] = [];
  const maxDepth = Math.max(0, ...Array.from(depthById.values()));

  for (let depth = 0; depth <= maxDepth; depth++) {
    const rowPeople = personnel
      .filter((person) => depthById.get(person._id) === depth)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    rowPeople.forEach((person, column) => {
      const { x, y } = orgSlotOrigin(column, depth);
      placed.push({
        id: person._id,
        x,
        y,
        depth,
        personId: person._id,
        fullName: person.fullName,
        roleTitle: person.roleTitle,
        department: person.department,
      });
    });
  }

  const orphans = personnel
    .filter((person) => !inTree.has(person._id))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  const orphanRow = maxDepth + 1;
  orphans.forEach((person, column) => {
    const { x, y } = orgSlotOrigin(column, orphanRow);
    placed.push({
      id: person._id,
      x,
      y,
      depth: orphanRow,
      personId: person._id,
      fullName: person.fullName,
      roleTitle: person.roleTitle,
      department: person.department,
    });
  });

  return placed;
}

export function mergeOrgLayoutWithSaved(
  autoLayout: PlacedOrgNode[],
  savedByPersonId: Map<string, { x: number; y: number }>,
): PlacedOrgNode[] {
  return autoLayout.map((node) => {
    const saved = savedByPersonId.get(node.personId);
    if (!saved) return node;
    return { ...node, ...snapPointToOrgGrid(saved.x, saved.y) };
  });
}

export function buildPrimaryEdges(
  roots: OrgChartNode[],
  nodePositions: Map<string, PlacedOrgNode>,
  /** Custom routing keyed by child personId (each child has one primary manager). */
  routesByChildId?: Map<string, { x: number; y: number }>,
): OrgChartEdge[] {
  const edges: OrgChartEdge[] = [];

  const walk = (node: OrgChartNode) => {
    for (const child of node.children) {
      if (nodePositions.has(node.person._id) && nodePositions.has(child.person._id)) {
        const route = routesByChildId?.get(child.person._id);
        edges.push({
          fromId: node.person._id,
          toId: child.person._id,
          kind: "primary",
          // The child uniquely identifies its single primary edge.
          lineId: child.person._id,
          pathControlX: route?.x,
          pathControlY: route?.y,
        });
      }
      walk(child);
    }
  };

  for (const root of roots) walk(root);
  return edges;
}

export function buildFunctionalEdges(
  lines: {
    _id?: string;
    subordinatePersonId: string;
    supervisorPersonId: string;
    contextLabel: string;
    pathControlX?: number;
    pathControlY?: number;
  }[],
  nodePositions: Map<string, PlacedOrgNode>,
): OrgChartEdge[] {
  return lines
    .filter(
      (line) =>
        nodePositions.has(line.subordinatePersonId) && nodePositions.has(line.supervisorPersonId),
    )
    .map((line) => ({
      fromId: line.supervisorPersonId,
      toId: line.subordinatePersonId,
      kind: "functional" as const,
      label: line.contextLabel,
      lineId: line._id,
      pathControlX: line.pathControlX,
      pathControlY: line.pathControlY,
    }));
}

export function defaultFunctionalControlPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  lineIndex = 0,
): { x: number; y: number } {
  const lift = 28 + (lineIndex % 3) * 10;
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2 - lift,
  };
}

export function resolveFunctionalControlPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  edge: Pick<OrgChartEdge, "pathControlX" | "pathControlY">,
  lineIndex = 0,
): { x: number; y: number } {
  if (edge.pathControlX !== undefined && edge.pathControlY !== undefined) {
    return { x: edge.pathControlX, y: edge.pathControlY };
  }
  return defaultFunctionalControlPoint(from, to, lineIndex);
}

export function buildFunctionalQuadraticPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  control: { x: number; y: number },
): string {
  return `M ${from.x} ${from.y} Q ${control.x} ${control.y} ${to.x} ${to.y}`;
}

export function defaultPrimaryControlPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
}

export function resolvePrimaryControlPoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
  edge: Pick<OrgChartEdge, "pathControlX" | "pathControlY">,
): { x: number; y: number } {
  if (edge.pathControlX !== undefined && edge.pathControlY !== undefined) {
    return { x: edge.pathControlX, y: edge.pathControlY };
  }
  return defaultPrimaryControlPoint(from, to);
}

/**
 * Primary edge path. With no custom control point it keeps the classic
 * squared-off elbow; once routed, it bends through the control point.
 */
export function buildPrimaryRoutedPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  edge: Pick<OrgChartEdge, "pathControlX" | "pathControlY">,
): string {
  if (edge.pathControlX !== undefined && edge.pathControlY !== undefined) {
    return buildFunctionalQuadraticPath(from, to, {
      x: edge.pathControlX,
      y: edge.pathControlY,
    });
  }
  return buildBranchPath(from, to);
}

export type OrgPoint = { x: number; y: number };

/** Resolve a stored route/line row to its waypoint list, migrating the legacy single control point. */
export function normalizeRouteWaypoints(row: {
  waypoints?: { x: number; y: number }[] | null;
  pathControlX?: number;
  pathControlY?: number;
}): OrgPoint[] {
  if (row.waypoints && row.waypoints.length > 0) {
    return row.waypoints.map((p) => ({ x: p.x, y: p.y }));
  }
  if (row.pathControlX !== undefined && row.pathControlY !== undefined) {
    return [{ x: row.pathControlX, y: row.pathControlY }];
  }
  return [];
}

function catmullRomToBezierSegment(points: OrgPoint[], i: number) {
  const p0 = points[i];
  const p1 = points[i + 1];
  const prev = points[i - 1] ?? p0;
  const next = points[i + 2] ?? p1;
  return {
    p0,
    p1,
    c1: { x: p0.x + (p1.x - prev.x) / 6, y: p0.y + (p1.y - prev.y) / 6 },
    c2: { x: p1.x - (next.x - p0.x) / 6, y: p1.y - (next.y - p0.y) / 6 },
  };
}

/**
 * Smooth curve that passes exactly through every supplied point (Catmull-Rom
 * spline rendered as cubic beziers). Because the curve hits each point, any
 * handle drawn at a point sits precisely on the line.
 */
export function buildSmoothPathThrough(points: OrgPoint[]): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const { c1, c2, p1 } = catmullRomToBezierSegment(points, i);
    d += ` C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p1.x} ${p1.y}`;
  }
  return d;
}

/** Straight segments through every supplied point (no smoothing). */
export function buildPolylinePath(points: OrgPoint[]): string {
  if (points.length < 2) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i].x} ${points[i].y}`;
  }
  return d;
}

/** Point along a straight segment of a polyline (lies exactly on the rendered line). */
export function pointOnPolyline(points: OrgPoint[], segmentIndex: number, t: number): OrgPoint {
  const a = points[segmentIndex];
  const b = points[segmentIndex + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function cubicBezierPointAt(p0: OrgPoint, c1: OrgPoint, c2: OrgPoint, p1: OrgPoint, t: number): OrgPoint {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
    y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
  };
}

/** A point lying exactly on the rendered smooth path, for the given segment and parameter. */
export function pointOnSmoothPath(points: OrgPoint[], segmentIndex: number, t: number): OrgPoint {
  if (points.length === 2) {
    const a = points[0];
    const b = points[1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  const { p0, c1, c2, p1 } = catmullRomToBezierSegment(points, segmentIndex);
  return cubicBezierPointAt(p0, c1, c2, p1, t);
}

export function getOrgCanvasBounds(nodes: PlacedOrgNode[]): { width: number; height: number } {
  if (nodes.length === 0) {
    return {
      width: 640,
      height: ORG_GRID_PADDING * 2 + ORG_SLOT_HEIGHT * Math.max(ORG_CANVAS_EXTRA_ROWS, 3),
    };
  }
  const maxX = Math.max(...nodes.map((n) => n.x + ORG_NODE_WIDTH));
  const maxY = Math.max(...nodes.map((n) => n.y + ORG_NODE_HEIGHT));
  const width =
    Math.ceil((maxX + ORG_GRID_PADDING - ORG_GRID_PADDING) / ORG_SLOT_WIDTH) * ORG_SLOT_WIDTH +
    ORG_GRID_PADDING;
  const contentRows =
    Math.ceil((maxY + ORG_GRID_PADDING - ORG_GRID_PADDING) / ORG_SLOT_HEIGHT) + ORG_CANVAS_EXTRA_ROWS;
  const height = contentRows * ORG_SLOT_HEIGHT + ORG_GRID_PADDING;
  return { width: Math.max(width, 640), height: Math.max(height, 480) };
}

export function getNodeCenter(node: PlacedOrgNode): { x: number; y: number } {
  return {
    x: node.x + ORG_NODE_WIDTH / 2,
    y: node.y + ORG_NODE_HEIGHT / 2,
  };
}

export function buildBranchPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const midY = from.y + (to.y - from.y) / 2;
  return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
}

export const orgChartGridBackgroundStyle = {
  backgroundImage: `
    linear-gradient(to right, rgba(148, 163, 184, 0.14) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.14) 1px, transparent 1px)
  `,
  backgroundSize: `${ORG_SLOT_WIDTH}px ${ORG_SLOT_HEIGHT}px`,
  backgroundPosition: `${ORG_GRID_PADDING}px ${ORG_GRID_PADDING}px`,
} as const;
