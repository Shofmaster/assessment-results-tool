import { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { hasCompanyAccess, hasCompanyRoleAccess, isPlatformPrivileged } from "./accessControl";

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject; // Clerk userId
}

const MISSING_USER_PROFILE =
  "Not authorized: user profile missing in database for this sign-in. Try signing out and back in, or contact support.";

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await requireAuth(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
    .first();
  if (!user) {
    throw new Error(MISSING_USER_PROFILE);
  }
  if (user.role !== "admin") {
    throw new Error("Not authorized: admin role required");
  }
  return userId;
}

export async function requirePlatformAdmin(ctx: QueryCtx | MutationCtx): Promise<string> {
  return requireAdmin(ctx);
}

export async function requireAerogapEmployee(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await requireAuth(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
    .first();
  if (!user) {
    throw new Error(MISSING_USER_PROFILE);
  }
  if (user.role !== "admin" && user.role !== "aerogap_employee") {
    throw new Error("Not authorized: AeroGap employee or admin role required");
  }
  return userId;
}

/** Platform support staff (admin or AeroGap employee). Alias for requireAerogapEmployee. */
export async function requirePlatformStaff(ctx: QueryCtx | MutationCtx): Promise<string> {
  return requireAerogapEmployee(ctx);
}

type CompanyRole = "company_admin" | "company_manager" | "company_user";

async function getCurrentUserRecord(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
    .first();
}

async function getCompanyMembership(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
  userId: string
) {
  return await ctx.db
    .query("companyMemberships")
    .withIndex("by_companyId_userId", (q) => q.eq("companyId", companyId).eq("userId", userId))
    .first();
}

async function hasActiveSupportAssignment(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
  userId: string
) {
  const assignment = await ctx.db
    .query("companySupportAssignments")
    .withIndex("by_companyId_supportUserId", (q) =>
      q.eq("companyId", companyId).eq("supportUserId", userId)
    )
    .first();
  return assignment?.isActive === true;
}

export async function requireCompanyMembership(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">
): Promise<string> {
  const userId = await requireAuth(ctx);
  const user = await getCurrentUserRecord(ctx, userId);
  if (isPlatformPrivileged(user?.role)) {
    return userId;
  }
  if (!user) {
    throw new Error(MISSING_USER_PROFILE);
  }

  const membership = await getCompanyMembership(ctx, companyId, userId);
  if (!membership || membership.status === "suspended") {
    throw new Error("Not authorized: company membership required");
  }
  return userId;
}

export async function requireCompanyRole(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
  allowedRoles: CompanyRole[]
): Promise<string> {
  const userId = await requireAuth(ctx);
  const user = await getCurrentUserRecord(ctx, userId);
  if (isPlatformPrivileged(user?.role)) {
    return userId;
  }
  if (!user) {
    throw new Error(MISSING_USER_PROFILE);
  }

  const membership = await getCompanyMembership(ctx, companyId, userId);
  if (
    !membership ||
    !hasCompanyRoleAccess(membership.role, membership.status, allowedRoles)
  ) {
    throw new Error("Not authorized: required company role for this action.");
  }
  return userId;
}

export async function requireCompanyOrDelegatedSupportAccess(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">
): Promise<string> {
  const userId = await requireAuth(ctx);
  const user = await getCurrentUserRecord(ctx, userId);
  if (isPlatformPrivileged(user?.role)) {
    return userId;
  }

  const membership = await getCompanyMembership(ctx, companyId, userId);
  const assigned = await hasActiveSupportAssignment(ctx, companyId, userId);
  if (!hasCompanyAccess({
    platformRole: user?.role,
    membershipStatus: membership?.status,
    delegatedSupport: assigned,
  })) {
    if (!user && !assigned) {
      throw new Error(MISSING_USER_PROFILE);
    }
    throw new Error("Not authorized: company access required");
  }
  return userId;
}

export async function requireProjectOwner(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">
): Promise<string> {
  const userId = await requireAuth(ctx);
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  if (project.companyId) {
    return await requireCompanyRole(ctx, project.companyId, ["company_admin", "company_manager"]);
  }

  // Personal / legacy project (no company): owner is project.userId.
  // Also allow platform-privileged users (admin / aerogap_employee) so support staff
  // can manage customer workspaces — same rule as requireProjectAccess.
  if (project.userId === userId) {
    return userId;
  }

  const user = await getCurrentUserRecord(ctx, userId);
  if (!isPlatformPrivileged(user?.role)) {
    throw new Error("Not authorized: not the project owner");
  }
  return userId;
}

/**
 * Allows access to project data for:
 * - the owning customer user
 * - AeroGap privileged users (admin / aerogap_employee)
 */
export async function requireProjectAccess(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">
): Promise<string> {
  const userId = await requireAuth(ctx);
  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found");
  }
  if (project.companyId) {
    return await requireCompanyOrDelegatedSupportAccess(ctx, project.companyId);
  }

  if (project.userId === userId) {
    return userId;
  }

  const user = await getCurrentUserRecord(ctx, userId);
  if (!isPlatformPrivileged(user?.role)) {
    throw new Error("Not authorized: not the project owner");
  }
  return userId;
}

/**
 * Requires that the signed-in user's Logbook entitlement is enabled.
 * Missing settings (or missing flag) are treated as disabled.
 */
export async function requireLogbookEnabled(ctx: QueryCtx | MutationCtx): Promise<void> {
  const userId = await requireAuth(ctx);
  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();

  let companyPolicyEnabled: boolean | undefined;
  if (settings?.activeProjectId) {
    const project = await ctx.db.get(settings.activeProjectId);
    if (project?.companyId) {
      const policy = await ctx.db
        .query("companyFeaturePolicies")
        .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId!))
        .unique();
      companyPolicyEnabled = policy?.logbookEnabled;
    }
  }

  const effectiveLogbookEnabled =
    companyPolicyEnabled !== undefined ? companyPolicyEnabled : settings?.logbookEnabled === true;

  if (effectiveLogbookEnabled !== true) {
    throw new Error("Logbook module disabled");
  }
}
