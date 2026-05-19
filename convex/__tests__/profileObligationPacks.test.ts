import { describe, expect, it } from "vitest";
import { DEFAULT_OBLIGATION_PACKS } from "../lib/profileObligationPacks";

describe("DEFAULT_OBLIGATION_PACKS", () => {
  it("includes core profile defaults", () => {
    const codes = new Set(DEFAULT_OBLIGATION_PACKS.map((p) => p.profileCode));
    expect(codes.has("faa:part145:default")).toBe(true);
    expect(codes.has("faa:part135:default")).toBe(true);
    expect(codes.has("faa:part121:default")).toBe(true);
    expect(codes.has("easa:easa145:default")).toBe(true);
    expect(codes.has("isbao:isbao:default")).toBe(true);
    expect(codes.has("as9100:as9100:default")).toBe(true);
  });

  it("has unique pack keys and rule IDs per pack", () => {
    const packKeys = new Set<string>();
    for (const pack of DEFAULT_OBLIGATION_PACKS) {
      const key = `${pack.profileCode}:${pack.version}`;
      expect(packKeys.has(key)).toBe(false);
      packKeys.add(key);

      const ruleIds = new Set<string>();
      for (const rule of pack.rules) {
        expect(ruleIds.has(rule.ruleId)).toBe(false);
        ruleIds.add(rule.ruleId);
      }
    }
  });
});

