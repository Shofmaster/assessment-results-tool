import { describe, expect, it } from "vitest";
import {
  resolveRosterCardColor,
  type RosterCardColorRule,
} from "../../utils/rosterCardColors";

describe("rosterCardColors", () => {
  const person = {
    _id: "1",
    fullName: "Alex",
    roleTitle: "Director of Maintenance",
    managementLevel: "Director",
  };

  const rules: RosterCardColorRule[] = [
    { matchKind: "roleTitle", matchValue: "Technician", matchMode: "contains", color: "#22c55e" },
    { matchKind: "roleTitle", matchValue: "Director of Maintenance", color: "#3b82f6" },
    { matchKind: "managementLevel", matchValue: "Director", color: "#a855f7" },
    { matchKind: "orgDepth", matchValue: "1", color: "#f59e0b" },
  ];

  it("prefers a person's direct card color over rules", () => {
    expect(
      resolveRosterCardColor({ ...person, cardColor: "#ef4444" }, rules, 1),
    ).toBe("#ef4444");
  });

  it("prefers job title rules over management level and org depth", () => {
    expect(resolveRosterCardColor(person, rules, 1)).toBe("#3b82f6");
  });

  it("falls back to management level when no title rule matches", () => {
    const noTitle = { ...person, roleTitle: "Staff" };
    expect(resolveRosterCardColor(noTitle, rules, 1)).toBe("#a855f7");
  });

  it("falls back to org depth when title and level do not match", () => {
    const staff = { ...person, roleTitle: "Staff", managementLevel: undefined };
    expect(resolveRosterCardColor(staff, rules, 1)).toBe("#f59e0b");
  });
});
