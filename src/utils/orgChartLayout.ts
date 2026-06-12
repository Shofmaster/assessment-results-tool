import type { OrgChartNode, RosterPersonRow } from "./rosterOrganization";

export const ORG_NODE_WIDTH = 176;
export const ORG_NODE_HEIGHT = 72;
export const ORG_GRID_SIZE = 32;
export const ORG_GRID_PADDING = 32;
export const ORG_CELL_GAP = 16;

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
};

export function snapToOrgGrid(value: number): number {
  return Math.round(value / ORG_GRID_SIZE) * ORG_GRID_SIZE;
}

export function snapPointToOrgGrid(x: number, y: number): { x: number; y: number } {
  return { x: snapToOrgGrid(x), y: snapToOrgGrid(y) };
}

function cellWidth(): number {
  return ORG_NODE_WIDTH + ORG_CELL_GAP;
}

function cellHeight(): number {
  return ORG_NODE_HEIGHT + ORG_CELL_GAP;
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
      const { x, y } = snapPointToOrgGrid(
        ORG_GRID_PADDING + column * cellWidth(),
        ORG_GRID_PADDING + depth * cellHeight(),
      );
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
    const { x, y } = snapPointToOrgGrid(
      ORG_GRID_PADDING + column * cellWidth(),
      ORG_GRID_PADDING + orphanRow * cellHeight(),
    );
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
  lines: { subordinatePersonId: string; supervisorPersonId: string; contextLabel: string }[],
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
    }));
}

export function getOrgCanvasBounds(nodes: PlacedOrgNode[]): { width: number; height: number } {
  if (nodes.length === 0) return { width: 640, height: 320 };
  const maxX = Math.max(...nodes.map((n) => n.x + ORG_NODE_WIDTH));
  const maxY = Math.max(...nodes.map((n) => n.y + ORG_NODE_HEIGHT));
  const width = Math.ceil((maxX + ORG_GRID_PADDING) / ORG_GRID_SIZE) * ORG_GRID_SIZE;
  const height = Math.ceil((maxY + ORG_GRID_PADDING) / ORG_GRID_SIZE) * ORG_GRID_SIZE;
  return { width: Math.max(width, 640), height: Math.max(height, 320) };
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
    linear-gradient(to right, rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.08) 1px, transparent 1px)
  `,
  backgroundSize: `${ORG_GRID_SIZE}px ${ORG_GRID_SIZE}px`,
  backgroundPosition: "0 0",
} as const;
