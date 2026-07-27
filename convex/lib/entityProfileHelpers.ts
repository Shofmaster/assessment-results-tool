import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export function normalizeToken(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Collect normalized tokens from free-text fields (split on commas/semicolons/slashes). */
export function collectFieldTokens(values: Array<string | undefined | null>): string[] {
  const tokens = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const normalized = normalizeToken(value);
    if (!normalized) continue;
    tokens.add(normalized);
    for (const part of normalized.split(/[,;/]/g)) {
      const token = normalizeToken(part);
      if (token) tokens.add(token);
    }
  }
  return [...tokens];
}

export async function resolveProfileForProject(ctx: Ctx, projectId: Id<"projects"> | string) {
  const project = await ctx.db.get(projectId as Id<"projects">);
  if (!project) throw new Error("Project not found");
  if (project.companyId) {
    const byCompany = await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId!))
      .first();
    if (!byCompany) throw new Error("Organization profile not found");
    return byCompany;
  }
  const byProject = await ctx.db
    .query("entityProfiles")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId as Id<"projects">))
    .first();
  if (!byProject) throw new Error("Entity profile not found");
  return byProject;
}

/** Soft lookup — returns null when no profile exists yet. */
export async function getProfileForProject(ctx: Ctx, projectId: Id<"projects"> | string) {
  const project = await ctx.db.get(projectId as Id<"projects">);
  if (!project) return null;
  if (project.companyId) {
    return await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId!))
      .first();
  }
  return await ctx.db
    .query("entityProfiles")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId as Id<"projects">))
    .first();
}

export async function ensureProfileForCompany(
  ctx: MutationCtx,
  companyId: Id<"companies"> | string,
  userId: string,
) {
  const existing = await ctx.db
    .query("entityProfiles")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId as Id<"companies">))
    .first();
  if (existing) return existing;
  const now = new Date().toISOString();
  const profileId = await ctx.db.insert("entityProfiles", {
    companyId: companyId as Id<"companies">,
    userId,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(profileId);
  if (!created) throw new Error("Failed to create organization profile");
  return created;
}

/** Ensures a profile row exists so structured ratings can be stored (e.g. before org card is saved). */
export async function ensureProfileForProject(
  ctx: MutationCtx,
  projectId: Id<"projects"> | string,
  userId: string,
) {
  const project = await ctx.db.get(projectId as Id<"projects">);
  if (!project) throw new Error("Project not found");
  const now = new Date().toISOString();
  if (project.companyId) {
    return await ensureProfileForCompany(ctx, project.companyId, userId);
  }
  const existing = await ctx.db
    .query("entityProfiles")
    .withIndex("by_projectId", (q) => q.eq("projectId", projectId as Id<"projects">))
    .first();
  if (existing) return existing;
  const profileId = await ctx.db.insert("entityProfiles", {
    projectId: projectId as Id<"projects">,
    userId,
    createdAt: now,
    updatedAt: now,
  });
  const created = await ctx.db.get(profileId);
  if (!created) throw new Error("Failed to create entity profile");
  return created;
}
