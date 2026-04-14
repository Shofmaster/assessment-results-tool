import { describe, expect, it } from "vitest";
import { computeDctComplianceStatus } from "../lib/dctStatus";

describe("computeDctComplianceStatus", () => {
  it("returns red when unresolved gaps or mismatches exist", () => {
    expect(
      computeDctComplianceStatus({
        lastCheckCompletedAt: new Date().toISOString(),
        nextDueAt: new Date(Date.now() + 86400000).toISOString(),
        unresolvedGapOrMismatch: 1,
      }),
    ).toBe("red");
  });

  it("returns yellow when overdue and no unresolved issues", () => {
    expect(
      computeDctComplianceStatus({
        lastCheckCompletedAt: new Date().toISOString(),
        nextDueAt: new Date(Date.now() - 86400000).toISOString(),
        unresolvedGapOrMismatch: 0,
      }),
    ).toBe("yellow");
  });

  it("returns green when checked on time with no issues", () => {
    expect(
      computeDctComplianceStatus({
        lastCheckCompletedAt: new Date().toISOString(),
        nextDueAt: new Date(Date.now() + 86400000).toISOString(),
        unresolvedGapOrMismatch: 0,
      }),
    ).toBe("green");
  });

  it("returns unknown without last check", () => {
    expect(
      computeDctComplianceStatus({
        nextDueAt: new Date(Date.now() + 86400000).toISOString(),
        unresolvedGapOrMismatch: 0,
      }),
    ).toBe("unknown");
  });
});
