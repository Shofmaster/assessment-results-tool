export type PlatformRole = "admin" | "aerogap_employee" | "user" | string | undefined;
export type CompanyRole = "company_admin" | "company_manager" | "company_user";
export type MembershipStatus = "active" | "invited" | "suspended" | string | undefined;

export function isPlatformAdmin(role: PlatformRole): boolean {
  return role === "admin";
}

export function isPlatformPrivileged(role: PlatformRole): boolean {
  return role === "admin" || role === "aerogap_employee";
}

export function hasCompanyRoleAccess(
  membershipRole: string | undefined,
  membershipStatus: MembershipStatus,
  allowedRoles: CompanyRole[]
): boolean {
  if (!membershipRole || membershipStatus === "suspended") return false;
  return allowedRoles.includes(membershipRole as CompanyRole);
}

export function hasCompanyAccess(args: {
  platformRole: PlatformRole;
  membershipStatus: MembershipStatus;
  delegatedSupport: boolean;
}): boolean {
  if (isPlatformPrivileged(args.platformRole)) return true;
  if (args.membershipStatus && args.membershipStatus !== "suspended") return true;
  return args.delegatedSupport;
}
