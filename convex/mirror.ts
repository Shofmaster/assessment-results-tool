/**
 * Hosted → desktop mirror: the companies of a hosted AeroGap account, copied
 * into a desktop install's own database so they are there when the connection
 * is not.
 *
 * HOW IT RUNS
 * The desktop SPA, signed in with the hosted account (Clerk), holds a token
 * that BOTH deployments trust - they share the Clerk tenant. It opens a second
 * Convex client at the hosted deployment and:
 *
 *   hosted   listMirrorable      what this user can see there
 *   hosted   exportCompany       an org bundle, per company
 *   hosted   exportProject       a project bundle, per project
 *   local    applyCompany        upsert the company by origin id, replace contents
 *   local    applyProject        upsert the project by origin id, replace contents
 *
 * The bundles are the SAME format as the manual export/import
 * (lib/orgBundleOps.ts, lib/projectBundleOps.ts); the mirror adds the origin
 * bookkeeping that makes a second run find the first run's rows.
 *
 * ONE WAY, REPLACE-STYLE. The hosted account is the source of truth; a mirrored
 * company or project on the desktop is overwritten by the next sync within the
 * bundle's scope. Work in areas outside that scope (manuals, logbooks, fleet,
 * checklists, roster of a project) is left alone. Local edits inside the scope
 * of a mirrored row do not travel back - that is what the manual bundle export
 * is for, until a two-way sync exists.
 *
 * WHICH FUNCTIONS RUN WHERE. The list/export queries run on the hosted
 * deployment and need only what the user could see anyway. The apply mutations
 * refuse to run on the hosted deployment (isSelfHostedDeployment), because on
 * it they would let any user create companies.
 */
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isSelfHostedDeployment, requireAuth, requireCompanyMembership } from "./_helpers";
import { assertOrgBundleVersion } from "./lib/orgBundle";
import { assertBundleVersion } from "./lib/projectBundle";
import { buildOrgBundle, clearOrgBundleContents, insertOrgBundleContents } from "./lib/orgBundleOps";
import { buildProjectBundle, clearProjectBundleContents, insertProjectBundleContents } from "./lib/projectBundleOps";

/** Origin id of the synthetic project that holds a mirrored company's roster. */
function rosterProjectOriginId(companyOriginId: string): string {
  return `${companyOriginId}#roster`;
}

type LocalRole = "company_admin" | "company_manager" | "company_user";

async function currentUser(ctx: QueryCtx | MutationCtx, userId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
    .first();
}

// ---------------------------------------------------------------------------
// Hosted side: what may be mirrored, and the bundles
// ---------------------------------------------------------------------------

/**
 * The companies this user belongs to (or supports), each with its projects,
 * plus the user's personal projects. Membership role travels so the desktop
 * can grant the same role locally.
 */
export const listMirrorable = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await currentUser(ctx, userId);
    const privileged = user?.role === "admin" || user?.role === "aerogap_employee";

    const roleByCompany = new Map<string, LocalRole>();
    if (privileged) {
      for (const company of await ctx.db.query("companies").collect()) {
        roleByCompany.set(company._id, "company_admin");
      }
    } else {
      const [memberships, supportAssignments] = await Promise.all([
        ctx.db.query("companyMemberships").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
        ctx.db
          .query("companySupportAssignments")
          .withIndex("by_supportUserId", (q) => q.eq("supportUserId", userId))
          .collect(),
      ]);
      for (const m of memberships) {
        if (m.status === "suspended") continue;
        const role: LocalRole =
          m.role === "company_admin" || m.role === "company_manager" ? m.role : "company_user";
        roleByCompany.set(m.companyId, role);
      }
      for (const a of supportAssignments) {
        if (a.isActive && !roleByCompany.has(a.companyId)) roleByCompany.set(a.companyId, "company_admin");
      }
    }

    const companies = [];
    for (const [companyId, role] of roleByCompany) {
      const company = await ctx.db.get(companyId as Id<"companies">);
      if (!company || !company.isActive) continue;
      const projects = await ctx.db
        .query("projects")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .collect();
      companies.push({
        id: company._id,
        name: company.name,
        slug: company.slug,
        role,
        projects: projects.map((p) => ({ id: p._id, name: p.name, updatedAt: p.updatedAt })),
      });
    }

    const personal = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    return {
      companies,
      personalProjects: personal
        .filter((p) => !p.companyId)
        .map((p) => ({ id: p._id, name: p.name, updatedAt: p.updatedAt })),
    };
  },
});

/** An org bundle for any company the caller is a member of - not only admins. */
export const exportCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyMembership(ctx, args.companyId);
    return await buildOrgBundle(ctx, args.companyId);
  },
});

/** A project bundle for a project the caller can see: in a company they belong to, or their own. */
export const exportProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (project.companyId) {
      await requireCompanyMembership(ctx, project.companyId);
    } else if (project.userId !== userId) {
      const user = await currentUser(ctx, userId);
      if (user?.role !== "admin" && user?.role !== "aerogap_employee") {
        throw new Error("Not authorized: not the project owner");
      }
    }
    return await buildProjectBundle(ctx, args.projectId);
  },
});

// ---------------------------------------------------------------------------
// Local side: what has been mirrored, and applying a bundle
// ---------------------------------------------------------------------------

/** Every mirrored company and project on this install, with the hash last applied. */
export const status = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const [companies, projects] = await Promise.all([
      ctx.db.query("companies").collect(),
      ctx.db.query("projects").collect(),
    ]);
    const pick = (rows: Array<{ _id: string; name: string; mirror?: { origin: string; originId: string; contentHash?: string; syncedAt: string } }>) =>
      rows
        .filter((r) => r.mirror)
        .map((r) => ({
          localId: r._id,
          name: r.name,
          origin: r.mirror!.origin,
          originId: r.mirror!.originId,
          contentHash: r.mirror!.contentHash,
          syncedAt: r.mirror!.syncedAt,
        }));
    return { companies: pick(companies), projects: pick(projects) };
  },
});

function requireSelfHosted(): void {
  if (!isSelfHostedDeployment()) {
    throw new Error("The mirror can only be applied on a self-hosted install.");
  }
}

async function findMirroredCompany(ctx: MutationCtx, origin: string, originId: string) {
  const candidates = await ctx.db
    .query("companies")
    .withIndex("by_mirror_originId", (q) => q.eq("mirror.originId", originId))
    .collect();
  return candidates.find((c) => c.mirror?.origin === origin) ?? null;
}

async function findMirroredProject(ctx: MutationCtx, origin: string, originId: string) {
  const candidates = await ctx.db
    .query("projects")
    .withIndex("by_mirror_originId", (q) => q.eq("mirror.originId", originId))
    .collect();
  return candidates.find((p) => p.mirror?.origin === origin) ?? null;
}

/** Make sure the caller holds `role` in the mirrored company, matching their hosted role. */
async function ensureMembership(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  userId: string,
  role: LocalRole,
  now: string,
) {
  const existing = await ctx.db
    .query("companyMemberships")
    .withIndex("by_companyId_userId", (q) => q.eq("companyId", companyId).eq("userId", userId))
    .first();
  if (!existing) {
    await ctx.db.insert("companyMemberships", {
      companyId,
      userId,
      role,
      status: "active",
      addedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  if (existing.role !== role || existing.status !== "active") {
    await ctx.db.patch(existing._id, { role, status: "active", updatedAt: now });
  }
}

const roleValidator = v.union(v.literal("company_admin"), v.literal("company_manager"), v.literal("company_user"));

/**
 * Upsert a mirrored company and replace its org-bundle contents.
 *
 * Idempotent on (origin, originId). Unchanged content (same hash) is a no-op so
 * an every-launch sync costs one read per company.
 */
export const applyCompany = mutation({
  args: {
    origin: v.string(),
    originId: v.string(),
    role: roleValidator,
    bundle: v.any(),
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    requireSelfHosted();
    const userId = await requireAuth(ctx);
    const bundle = args.bundle as Record<string, unknown>;
    assertOrgBundleVersion(bundle.version);
    const bundleCompany = bundle.company as { name?: string; slug?: string } | undefined;
    const name = bundleCompany?.name?.trim();
    if (!name) throw new Error("The bundle is missing a company name.");

    const now = new Date().toISOString();
    const existing = await findMirroredCompany(ctx, args.origin, args.originId);

    let companyId: Id<"companies">;
    if (existing) {
      companyId = existing._id;
      await ensureMembership(ctx, companyId, userId, args.role, now);
      if (existing.mirror?.contentHash === args.contentHash) {
        return { companyId, skipped: true as const };
      }
      await ctx.db.patch(companyId, {
        name,
        slug: bundleCompany?.slug ?? existing.slug,
        isActive: true,
        updatedAt: now,
        mirror: { origin: args.origin, originId: args.originId, contentHash: args.contentHash, syncedAt: now },
      });
    } else {
      companyId = await ctx.db.insert("companies", {
        name,
        slug: bundleCompany?.slug,
        isActive: true,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
        mirror: { origin: args.origin, originId: args.originId, contentHash: args.contentHash, syncedAt: now },
      });
      await ensureMembership(ctx, companyId, userId, args.role, now);
    }

    // Roster lives in one synthetic project per mirrored company, reused across syncs.
    const rosterOriginId = rosterProjectOriginId(args.originId);
    const rosterProject = await findMirroredProject(ctx, args.origin, rosterOriginId);

    await clearOrgBundleContents(ctx, companyId, rosterProject?._id ?? null);

    const result = await insertOrgBundleContents(ctx, {
      companyId,
      userId,
      bundle,
      now,
      rosterProject: async () => {
        if (rosterProject) {
          await ctx.db.patch(rosterProject._id, {
            updatedAt: now,
            mirror: { origin: args.origin, originId: rosterOriginId, syncedAt: now },
          });
          return rosterProject._id;
        }
        return await ctx.db.insert("projects", {
          userId,
          companyId,
          name: `${name} - Roster`,
          description: "Holds the roster mirrored from your AeroGap account.",
          createdAt: now,
          updatedAt: now,
          mirror: { origin: args.origin, originId: rosterOriginId, syncedAt: now },
        });
      },
    });

    return { companyId, skipped: false as const, created: !existing, ...result };
  },
});

/**
 * Upsert a mirrored project and replace its bundle contents.
 *
 * `companyOriginId` names the mirrored company it belongs to (already applied
 * by applyCompany in the same run); absent means a personal project.
 */
export const applyProject = mutation({
  args: {
    origin: v.string(),
    originId: v.string(),
    companyOriginId: v.optional(v.string()),
    bundle: v.any(),
    contentHash: v.string(),
  },
  handler: async (ctx, args) => {
    requireSelfHosted();
    const userId = await requireAuth(ctx);
    const bundle = args.bundle as Record<string, unknown>;
    assertBundleVersion(bundle.version);
    const meta = bundle.project as { name?: string; description?: string } | undefined;
    const name = (meta?.name || "Mirrored project").trim();

    let companyId: Id<"companies"> | undefined;
    if (args.companyOriginId) {
      const company = await findMirroredCompany(ctx, args.origin, args.companyOriginId);
      if (!company) throw new Error("The project's company has not been mirrored yet.");
      await requireCompanyMembership(ctx, company._id);
      companyId = company._id;
    }

    const now = new Date().toISOString();
    const existing = await findMirroredProject(ctx, args.origin, args.originId);
    let projectId: Id<"projects">;
    if (existing) {
      if (existing.mirror?.contentHash === args.contentHash) {
        return { projectId: existing._id, skipped: true as const };
      }
      projectId = existing._id;
      await ctx.db.patch(projectId, {
        name,
        description: meta?.description,
        companyId,
        updatedAt: now,
        mirror: { origin: args.origin, originId: args.originId, contentHash: args.contentHash, syncedAt: now },
      });
      await clearProjectBundleContents(ctx, projectId);
    } else {
      projectId = await ctx.db.insert("projects", {
        userId,
        companyId,
        name,
        description: meta?.description,
        createdAt: now,
        updatedAt: now,
        mirror: { origin: args.origin, originId: args.originId, contentHash: args.contentHash, syncedAt: now },
      });
    }

    const counts = await insertProjectBundleContents(ctx, { projectId, userId, bundle, now });
    // Documents changed under the project: any search index built for it is stale.
    await ctx.db.patch(projectId, { searchIndexVersion: (existing?.searchIndexVersion ?? 0) + 1 });
    return { projectId, skipped: false as const, created: !existing, counts };
  },
});
