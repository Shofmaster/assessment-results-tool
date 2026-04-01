import { describe, expect, it } from "vitest";
import { resolveEnabledList, resolveLogbookEnabled } from "../../utils/entitlementResolution";

describe("resolveEnabledList", () => {
  it("prefers platform value over company and user", () => {
    expect(resolveEnabledList(["p1"], ["c1"], ["u1"])).toEqual(["p1"]);
  });

  it("falls back to company value when no platform value", () => {
    expect(resolveEnabledList(undefined, ["c1"], ["u1"])).toEqual(["c1"]);
  });

  it("falls back to user value when only user is set", () => {
    expect(resolveEnabledList(undefined, undefined, ["u1"])).toEqual(["u1"]);
  });

  it("returns null when nothing is configured", () => {
    expect(resolveEnabledList(undefined, undefined, undefined)).toBeNull();
  });
});

describe("resolveLogbookEnabled", () => {
  it("prefers platform override", () => {
    expect(resolveLogbookEnabled(false, true, true)).toBe(false);
  });

  it("uses company value when platform is unset", () => {
    expect(resolveLogbookEnabled(undefined, false, true)).toBe(false);
  });

  it("falls back to user setting", () => {
    expect(resolveLogbookEnabled(undefined, undefined, true)).toBe(true);
    expect(resolveLogbookEnabled(undefined, undefined, false)).toBe(false);
  });
});
