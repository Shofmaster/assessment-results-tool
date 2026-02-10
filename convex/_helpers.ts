import { QueryCtx, MutationCtx } from "./_generated/server";

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject; // Clerk userId
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx): Promise<string> {
  const userId = await requireAuth(ctx);
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
    .unique();
  if (!user || user.role !== "admin") {
    throw new Error("Not authorized: admin role required");
  }
  return userId;
}

export async function requireProjectOwner(
  ctx: QueryCtx | MutationCtx,
  projectId: any
): Promise<string> {
  const userId = await requireAuth(ctx);
  const project = await ctx.db.get(projectId);
  if (!project || project.userId !== userId) {
    throw new Error("Not authorized: not the project owner");
  }
  return userId;
}
