import { describe, expect, it } from "vitest";
import {
  buildOrgChartForest,
  groupPersonnelByDepartment,
  UNASSIGNED_DEPARTMENT,
} from "../../utils/rosterOrganization";

describe("rosterOrganization", () => {
  const people = [
    { _id: "1", fullName: "Alice", department: "Quality Assurance" },
    { _id: "2", fullName: "Bob", department: "Maintenance", reportsToPersonId: "1" },
    { _id: "3", fullName: "Cara", reportsToPersonId: "2" },
  ];

  it("groups people by department with unassigned last", () => {
    const groups = groupPersonnelByDepartment(people);
    expect(groups.map((g) => g.department)).toEqual([
      "Maintenance",
      "Quality Assurance",
      UNASSIGNED_DEPARTMENT,
    ]);
    expect(groups.find((g) => g.department === "Maintenance")?.people).toHaveLength(1);
    expect(groups.find((g) => g.department === UNASSIGNED_DEPARTMENT)?.people[0].fullName).toBe("Cara");
  });

  it("builds an org chart forest from reporting lines", () => {
    const roots = buildOrgChartForest(people);
    expect(roots).toHaveLength(1);
    expect(roots[0]?.person.fullName).toBe("Alice");
    expect(roots[0]?.children[0]?.person.fullName).toBe("Bob");
    expect(roots[0]?.children[0]?.children[0]?.person.fullName).toBe("Cara");
  });
});
