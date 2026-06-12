import type { OrgChartNode } from "./rosterOrganization";

export const ORG_NODE_WIDTH = 196;
export const ORG_NODE_HEIGHT = 76;
export const ORG_H_GAP = 28;
export const ORG_V_GAP = 56;
export const ORG_FOREST_GAP = 64;

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

type LayoutTreeNode = {
  id: string;
  personId: string;
  fullName: string;
  roleTitle?: string;
  department?: string;
  children: LayoutTreeNode[];
};

function toLayoutTree(node: OrgChartNode): LayoutTreeNode {
  return {
    id: node.person._id,
    personId: node.person._id,
    fullName: node.person.fullName,
    roleTitle: node.person.roleTitle,
    department: node.person.department,
    children: node.children.map(toLayoutTree),
  };
}

function layoutSubtree(
  node: LayoutTreeNode,
  depth: number,
  startLeafIndex: { value: number },
): { placed: PlacedOrgNode[]; width: number; centerX: number } {
  if (node.children.length === 0) {
    const centerX = startLeafIndex.value * (ORG_NODE_WIDTH + ORG_H_GAP) + ORG_NODE_WIDTH / 2;
    startLeafIndex.value += 1;
    return {
      placed: [
        {
          id: node.id,
          x: centerX - ORG_NODE_WIDTH / 2,
          y: depth * (ORG_NODE_HEIGHT + ORG_V_GAP),
          depth,
          personId: node.personId,
          fullName: node.fullName,
          roleTitle: node.roleTitle,
          department: node.department,
        },
      ],
      width: ORG_NODE_WIDTH + ORG_H_GAP,
      centerX,
    };
  }

  const childResults = node.children.map((child) => layoutSubtree(child, depth + 1, startLeafIndex));
  const placedChildren = childResults.flatMap((r) => r.placed);
  const minCenter = childResults[0]?.centerX ?? 0;
  const maxCenter = childResults[childResults.length - 1]?.centerX ?? minCenter;
  const centerX = (minCenter + maxCenter) / 2;

  const parentNode: PlacedOrgNode = {
    id: node.id,
    x: centerX - ORG_NODE_WIDTH / 2,
    y: depth * (ORG_NODE_HEIGHT + ORG_V_GAP),
    depth,
    personId: node.personId,
    fullName: node.fullName,
    roleTitle: node.roleTitle,
    department: node.department,
  };

  const totalWidth = childResults.reduce((sum, r) => sum + r.width, 0);

  return {
    placed: [parentNode, ...placedChildren],
    width: Math.max(totalWidth, ORG_NODE_WIDTH + ORG_H_GAP),
    centerX,
  };
}

export function computeAutoOrgLayout(roots: OrgChartNode[]): PlacedOrgNode[] {
  const leafCounter = { value: 0 };
  const placed: PlacedOrgNode[] = [];
  let offsetX = 0;

  for (const root of roots) {
    const tree = toLayoutTree(root);
    const result = layoutSubtree(tree, 0, leafCounter);
    const minX = Math.min(...result.placed.map((n) => n.x));
    const shift = offsetX - minX;
    for (const node of result.placed) {
      placed.push({ ...node, x: node.x + shift });
    }
    const maxX = Math.max(...result.placed.map((n) => n.x + ORG_NODE_WIDTH));
    offsetX = maxX + shift + ORG_FOREST_GAP;
  }

  return placed;
}

export function mergeOrgLayoutWithSaved(
  autoLayout: PlacedOrgNode[],
  savedByPersonId: Map<string, { x: number; y: number }>,
): PlacedOrgNode[] {
  return autoLayout.map((node) => {
    const saved = savedByPersonId.get(node.personId);
    if (!saved) return node;
    return { ...node, x: saved.x, y: saved.y };
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
  if (nodes.length === 0) return { width: 480, height: 240 };
  const maxX = Math.max(...nodes.map((n) => n.x + ORG_NODE_WIDTH));
  const maxY = Math.max(...nodes.map((n) => n.y + ORG_NODE_HEIGHT));
  return { width: maxX + 48, height: maxY + 48 };
}

export function getNodeCenter(node: PlacedOrgNode): { x: number; y: number } {
  return {
    x: node.x + ORG_NODE_WIDTH / 2,
    y: node.y + ORG_NODE_HEIGHT / 2,
  };
}

/** Orthogonal connector path for branch-style org charts (down from parent, across, down to child). */
export function buildBranchPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
): string {
  const midY = from.y + (to.y - from.y) / 2;
  return `M ${from.x} ${from.y} L ${from.x} ${midY} L ${to.x} ${midY} L ${to.x} ${to.y}`;
}
