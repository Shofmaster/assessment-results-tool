export type RosterPersonRow = {
  _id: string;
  fullName: string;
  roleTitle?: string;
  jobDescription?: string;
  department?: string;
  managementLevel?: string;
  cardColor?: string;
  reportsToPersonId?: string;
  capabilities?: string[];
};

export const SUGGESTED_DEPARTMENTS = [
  "Administration",
  "Avionics",
  "Flight Operations",
  "Maintenance",
  "Planning / Production Control",
  "Quality Assurance",
  "Safety",
  "Stores / Parts",
  "Training",
] as const;

export const UNASSIGNED_DEPARTMENT = "Unassigned";

export function collectDepartmentNames(
  personnel: RosterPersonRow[],
  projectDepartments: string[] = [],
): string[] {
  const fromPeople = personnel
    .map((p) => p.department?.trim())
    .filter((d): d is string => Boolean(d));
  const merged = new Set<string>([...projectDepartments, ...fromPeople]);
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

export function groupPersonnelByDepartment(personnel: RosterPersonRow[]): { department: string; people: RosterPersonRow[] }[] {
  const buckets = new Map<string, RosterPersonRow[]>();
  for (const person of personnel) {
    const department = person.department?.trim() || UNASSIGNED_DEPARTMENT;
    const list = buckets.get(department) ?? [];
    list.push(person);
    buckets.set(department, list);
  }

  return Array.from(buckets.entries())
    .map(([department, people]) => ({
      department,
      people: people.sort((a, b) => a.fullName.localeCompare(b.fullName)),
    }))
    .sort((a, b) => {
      if (a.department === UNASSIGNED_DEPARTMENT) return 1;
      if (b.department === UNASSIGNED_DEPARTMENT) return -1;
      return a.department.localeCompare(b.department);
    });
}

export type OrgChartNode = {
  person: RosterPersonRow;
  children: OrgChartNode[];
};

export function buildOrgChartForest(personnel: RosterPersonRow[]): OrgChartNode[] {
  const byId = new Map(personnel.map((p) => [p._id, p]));
  const childrenByManager = new Map<string, RosterPersonRow[]>();

  for (const person of personnel) {
    const managerId = person.reportsToPersonId;
    if (!managerId || !byId.has(managerId) || managerId === person._id) {
      continue;
    }
    const siblings = childrenByManager.get(managerId) ?? [];
    siblings.push(person);
    childrenByManager.set(managerId, siblings);
  }

  const buildNode = (person: RosterPersonRow): OrgChartNode => {
    const children = (childrenByManager.get(person._id) ?? [])
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .map(buildNode);
    return { person, children };
  };

  const roots = personnel
    .filter((person) => {
      const managerId = person.reportsToPersonId;
      return !managerId || !byId.has(managerId) || managerId === person._id;
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return roots.map(buildNode);
}

export function countOrgChartRoots(personnel: RosterPersonRow[]): number {
  return buildOrgChartForest(personnel).length;
}

/** Depth in the primary org chart (0 = top level). Omits people not reachable from a root. */
export function computeOrgDepthByPersonId(personnel: RosterPersonRow[]): Map<string, number> {
  const depths = new Map<string, number>();
  const walk = (node: OrgChartNode, depth: number) => {
    depths.set(node.person._id, depth);
    for (const child of node.children) {
      walk(child, depth + 1);
    }
  };
  for (const root of buildOrgChartForest(personnel)) {
    walk(root, 0);
  }
  return depths;
}
