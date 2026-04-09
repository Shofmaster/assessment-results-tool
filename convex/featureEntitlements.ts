import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireAuth } from "./_helpers";
import { isPlatformPrivileged } from "./accessControl";

/** Mirrors `src/utils/entitlementResolution.ts` — Convex must not import from `src`. */
function resolveEnabledList(
  platformValue: string[] | null | undefined,
  companyValue: string[] | null | undefined,
  userValue: string[] | null | undefined,
): string[] | null {
  if (platformValue !== undefined) return platformValue;
  if (companyValue !== undefined) return companyValue;
  if (userValue !== undefined) return userValue;
  return null;
}

async function getUserByClerkId(ctx: QueryCtx | MutationCtx, clerkUserId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
}

/**
 * Enforce per-project feature allowlists for tenant users.
 * Platform-privileged users (admin / AeroGap employee) bypass for support operations.
 */
export async function assertProjectFeatureEnabled(
  ctx: QueryCtx | MutationCtx,
  projectId: Id<"projects">,
  featureKey: string,
): Promise<void> {
  const clerkUserId = await requireAuth(ctx);
  const user = await getUserByClerkId(ctx, clerkUserId);
  if (isPlatformPrivileged(user?.role)) {
    return;
  }

  const settings = await ctx.db
    .query("userSettings")
    .withIndex("by_userId", (q) => q.eq("userId", clerkUserId))
    .unique();

  const project = await ctx.db.get(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  let companyFeatures: string[] | null | undefined = undefined;
  if (project.companyId) {
    const policy = await ctx.db
      .query("companyFeaturePolicies")
      .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId!))
      .unique();
    companyFeatures = policy?.enabledFeatures;
  }

  const resolved = resolveEnabledList(undefined, companyFeatures, settings?.enabledFeatures);
  if (resolved === null) {
    return;
  }

  if (!new Set(resolved).has(featureKey)) {
    throw new Error(`Feature not enabled for this workspace: ${featureKey}`);
  }
}
