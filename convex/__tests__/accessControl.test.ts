import { describe, expect, it } from "vitest";
import {
  hasCompanyAccess,
  hasCompanyRoleAccess,
  isPlatformAdmin,
  isPlatformPrivileged,
} from "../accessControl";

describe("platform roles", () => {
  it("identifies platform admin and privileged users", () => {
    expect(isPlatformAdmin("admin")).toBe(true);
    expect(isPlatformAdmin("aerogap_employee")).toBe(false);
    expect(isPlatformPrivileged("admin")).toBe(true);
    expect(isPlatformPrivileged("aerogap_employee")).toBe(true);
    expect(isPlatformPrivileged("user")).toBe(false);
  });
});

describe("company role checks", () => {
  it("allows active company admin", () => {
    expect(hasCompanyRoleAccess("company_admin", "active", ["company_admin"])).toBe(true);
  });

  it("rejects suspended users and missing roles", () => {
    expect(hasCompanyRoleAccess("company_admin", "suspended", ["company_admin"])).toBe(false);
    expect(hasCompanyRoleAccess(undefined, "active", ["company_admin"])).toBe(false);
  });
});

describe("company access resolution", () => {
  it("gives platform admin global access", () => {
    expect(
      hasCompanyAccess({
        platformRole: "admin",
        membershipStatus: undefined,
        delegatedSupport: false,
      })
    ).toBe(true);
  });

  it("gives company members scoped access", () => {
    expect(
      hasCompanyAccess({
        platformRole: "user",
        membershipStatus: "active",
        delegatedSupport: false,
      })
    ).toBe(true);
  });

  it("gives delegated support access", () => {
    expect(
      hasCompanyAccess({
        platformRole: "user",
        membershipStatus: undefined,
        delegatedSupport: true,
      })
    ).toBe(true);
  });

  it("denies unassigned company users", () => {
    expect(
      hasCompanyAccess({
        platformRole: "user",
        membershipStatus: undefined,
        delegatedSupport: false,
      })
    ).toBe(false);
  });
});
