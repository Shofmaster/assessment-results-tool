/** Org chart slot layout helpers for Convex mutations. Mirrors src/utils/orgChartLayout.ts. */

export const ORG_NODE_WIDTH = 176;
export const ORG_SLOT_GAP = 16;
export const ORG_SLOT_WIDTH = ORG_NODE_WIDTH + ORG_SLOT_GAP;
export const ORG_SLOT_HEIGHT = 72 + ORG_SLOT_GAP;
export const ORG_GRID_PADDING = 32;

type PersonRow = {
  _id: string;
  fullName: string;
  reportsToPersonId?: string;
};

type OrgChartNode = {
  person: PersonRow;
  children: OrgChartNode[];
};

type PlacedOrgNode = {
  personId: string;
  x: number;
  y: number;
};

function orgSlotIndex(value: number, slotSize: number): number {
  return Math.round((value - ORG_GRID_PADDING) / slotSize);
}

export function orgSlotOrigin(column: number, row: number): { x: number; y: number } {
  return {
    x: ORG_GRID_PADDING + column * ORG_SLOT_WIDTH,
    y: ORG_GRID_PADDING + row * ORG_SLOT_HEIGHT,
  };
}

function snapPointToOrgGrid(x: number, y: number): { x: number; y: number } {
  const snapAxis = (value: number, slotSize: number) =>
    ORG_GRID_PADDING + orgSlotIndex(value, slotSize) * slotSize;
  return { x: snapAxis(x, ORG_SLOT_WIDTH), y: snapAxis(y, ORG_SLOT_HEIGHT) };
}

function slotKey(column: number, row: number): string {
  return `${column},${row}`;
}

export function buildOrgChartForest(personnel: PersonRow[]): OrgChartNode[] {
  const byId = new Map(personnel.map((person) => [person._id, person]));
  const childrenByManager = new Map<string, PersonRow[]>();

  for (const person of personnel) {
    const managerId = person.reportsToPersonId;
    if (!managerId || !byId.has(managerId) || managerId === person._id) continue;
    const siblings = childrenByManager.get(managerId) ?? [];
    siblings.push(person);
    childrenByManager.set(managerId, siblings);
  }

  const buildNode = (person: PersonRow): OrgChartNode => ({
    person,
    children: (childrenByManager.get(person._id) ?? [])
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(buildNode),
  });

  return personnel
    .filter((person) => {
      const managerId = person.reportsToPersonId;
      return !managerId || !byId.has(managerId) || managerId === person._id;
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map(buildNode);
}

function computeGridOrgLayout(personnel: PersonRow[], roots: OrgChartNode[]): PlacedOrgNode[] {
  const inTree = new Set<string>();
  const depthById = new Map<string, number>();

  const walk = (node: OrgChartNode, depth: number) => {
    inTree.add(node.person._id);
    depthById.set(node.person._id, depth);
    for (const child of node.children) walk(child, depth + 1);
  };
  for (const root of roots) walk(root, 0);

  const placed: PlacedOrgNode[] = [];
  const maxDepth = Math.max(0, ...Array.from(depthById.values()));

  for (let depth = 0; depth <= maxDepth; depth++) {
    const rowPeople = personnel
      .filter((person) => depthById.get(person._id) === depth)
      .sort((a, b) => a.fullName.localeCompare(b.fullName));

    rowPeople.forEach((person, column) => {
      const { x, y } = orgSlotOrigin(column, depth);
      placed.push({ personId: person._id, x, y });
    });
  }

  const orphanRow = maxDepth + 1;
  for (const [column, person] of personnel
    .filter((person) => !inTree.has(person._id))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .entries()) {
    const { x, y } = orgSlotOrigin(column, orphanRow);
    placed.push({ personId: person._id, x, y });
  }

  return placed;
}

function mergeOrgLayoutWithSaved(
  autoLayout: PlacedOrgNode[],
  savedByPersonId: Map<string, { x: number; y: number }>,
): PlacedOrgNode[] {
  return autoLayout.map((node) => {
    const saved = savedByPersonId.get(node.personId);
    if (!saved) return node;
    return { ...node, ...snapPointToOrgGrid(saved.x, saved.y) };
  });
}

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
      radius === 0
        ? [preferredColumn]
        : [preferredColumn + radius, preferredColumn - radius];
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
  personnel: PersonRow[],
  savedByPersonId: Map<string, { x: number; y: number }>,
  personId: string,
  supervisorPersonId?: string,
): { x: number; y: number } {
  const roots = buildOrgChartForest(personnel);
  const merged = mergeOrgLayoutWithSaved(computeGridOrgLayout(personnel, roots), savedByPersonId);
  return findInitialOrgChartSlot(merged, {
    supervisorPersonId,
    excludePersonId: personId,
  });
}
