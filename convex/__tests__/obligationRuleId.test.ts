import { describe, expect, it } from "vitest";
import { buildObligationRuleId } from "../lib/obligationRuleId";

describe("buildObligationRuleId", () => {
  it("normalizes references into deterministic IDs", () => {
    expect(buildObligationRuleId("14 CFR 145.209", "Manual control")).toBe("rule:14-cfr-145-209");
  });

  it("falls back to title when reference is missing", () => {
    expect(buildObligationRuleId(undefined, "Quarterly Manual Review")).toBe(
      "rule:quarterly-manual-review",
    );
  });

  it("returns undefined when both inputs are empty", () => {
    expect(buildObligationRuleId("", "   ")).toBeUndefined();
  });
});

