import { describe, expect, it } from "vitest";
import {
  hasCompanyAccess,
  hasCompanyRoleAccess,
  isPlatformAdmin,
  isPlatformPrivileged,
} from "../../../convex/accessControl";

describe("company access control helpers", () => {
  it("recognizes platform roles", () => {
    expect(isPlatformAdmin("admin")).toBe(true);
    expect(isPlatformPrivileged("aerogap_employee")).toBe(true);
    expect(isPlatformPrivileged("user")).toBe(false);
  });

  it("enforces company role status checks", () => {
    expect(hasCompanyRoleAccess("company_admin", "active", ["company_admin"])).toBe(true);
    expect(hasCompanyRoleAccess("company_admin", "suspended", ["company_admin"])).toBe(false);
  });

  it("supports delegated support access", () => {
    expect(
      hasCompanyAccess({
        platformRole: "user",
        membershipStatus: undefined,
        delegatedSupport: true,
      })
    ).toBe(true);
    expect(
      hasCompanyAccess({
        platformRole: "user",
        membershipStatus: undefined,
        delegatedSupport: false,
      })
    ).toBe(false);
  });
});
