import { describe, expect, it } from "vitest";
import { intersectEnabledLists, resolveLogbookEnabled } from "../../utils/entitlementResolution";

describe("intersectEnabledLists", () => {
  it("returns null when neither layer restricts", () => {
    expect(intersectEnabledLists(undefined, undefined)).toBeNull();
    expect(intersectEnabledLists(null, null)).toBeNull();
    expect(intersectEnabledLists(null, undefined)).toBeNull();
  });

  it("uses the user list when only the user restricts", () => {
    expect(intersectEnabledLists(undefined, ["u1"])).toEqual(["u1"]);
    expect(intersectEnabledLists(null, ["u1"])).toEqual(["u1"]);
  });

  it("uses the company list when only the company restricts", () => {
    expect(intersectEnabledLists(["c1"], undefined)).toEqual(["c1"]);
    expect(intersectEnabledLists(["c1"], null)).toEqual(["c1"]);
  });

  it("intersects when both layers restrict (company is the ceiling)", () => {
    expect(intersectEnabledLists(["a", "b"], ["b", "c"])).toEqual(["b"]);
  });

  it("user toggles cannot grant beyond the company ceiling", () => {
    expect(intersectEnabledLists(["a"], ["a", "b", "c"])).toEqual(["a"]);
  });

  it("empty company list disables everything regardless of user toggles", () => {
    expect(intersectEnabledLists([], ["a", "b"])).toEqual([]);
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
