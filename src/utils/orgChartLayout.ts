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
): OrgChartEdge[] {
  const edges: OrgChartEdge[] = [];

  const walk = (node: OrgChartNode) => {
    for (const child of node.children) {
      if (nodePositions.has(node.person._id) && nodePositions.has(child.person._id)) {
        edges.push({
          fromId: node.person._id,
          toId: child.person._id,
          kind: "primary",
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
