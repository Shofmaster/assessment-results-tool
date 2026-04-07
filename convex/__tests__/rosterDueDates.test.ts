import { describe, expect, it } from "vitest";
import {
  addDays,
  computeAssignmentDueDate,
  endOfCalendarMonthAfterMonths,
  listMissingPromptAnswers,
  nextIaRenewalDueDateFromReference,
} from "../rosterDueDates";

describe("nextIaRenewalDueDateFromReference", () => {
  it("returns next odd-year March 31 after reference date", () => {
    expect(nextIaRenewalDueDateFromReference("2025-01-01")).toBe("2025-03-31");
    expect(nextIaRenewalDueDateFromReference("2025-04-01")).toBe("2027-03-31");
    expect(nextIaRenewalDueDateFromReference("2026-01-01")).toBe("2027-03-31");
  });
});

describe("endOfCalendarMonthAfterMonths", () => {
  it("lands on last day of calendar month", () => {
    expect(endOfCalendarMonthAfterMonths("2024-01-15", 24)).toBe("2026-01-31");
    expect(endOfCalendarMonthAfterMonths("2024-03-10", 6)).toBe("2024-09-30");
  });
});

describe("computeAssignmentDueDate", () => {
  it("uses calendar_month_end from requirement defaultCalendarMonths", () => {
    const { dueDate, warnings } = computeAssignmentDueDate({
      requirement: {
        dueDateStrategy: "calendar_month_end",
        defaultCalendarMonths: 24,
      },
      assignedDate: "2024-06-10",
      todayIso: "2026-01-01",
    });
    expect(warnings).toEqual([]);
    expect(dueDate).toBe("2026-06-30");
  });

  it("uses fixed_days from recurrence override", () => {
    const { dueDate } = computeAssignmentDueDate({
      requirement: { dueDateStrategy: "fixed_days", defaultRecurrenceDays: 365 },
      assignedDate: "2024-01-01",
      recurrenceDaysOverride: 90,
      todayIso: "2024-01-01",
    });
    expect(dueDate).toBe(addDays("2024-01-01", 90));
  });

  it("uses IA strategy from last completed baseline", () => {
    const { dueDate } = computeAssignmentDueDate({
      requirement: { dueDateStrategy: "ia_march_odd_year" },
      lastCompletedDate: "2025-03-31",
      todayIso: "2025-04-01",
    });
    expect(dueDate).toBe("2027-03-31");
  });

  it("warns when calendar rule lacks months", () => {
    const { dueDate, warnings } = computeAssignmentDueDate({
      requirement: { dueDateStrategy: "calendar_month_end" },
      assignedDate: "2024-01-01",
      todayIso: "2024-01-01",
    });
    expect(dueDate).toBeUndefined();
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("listMissingPromptAnswers", () => {
  it("lists labels for required empty fields", () => {
    const missing = listMissingPromptAnswers(
      [
        { id: "a", label: "Field A", fieldType: "text", required: true },
        { id: "b", label: "Field B", fieldType: "text", required: false },
      ],
      { b: "ok" },
    );
    expect(missing).toEqual(["Field A"]);
  });
});
