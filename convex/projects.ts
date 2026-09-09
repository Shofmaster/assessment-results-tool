import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAuth, requireCompanyRole, requireProjectOwner } from "./_helpers";
import { assertBundleVersion } from "./lib/projectBundle";
import { buildProjectBundle, insertProjectBundleContents } from "./lib/projectBundleOps";

/**
 * Portable project bundle. The format and the read/insert logic live in
 * lib/projectBundleOps.ts, shared with the hosted -> desktop mirror (mirror.ts).
 */
export const exportBundle = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await buildProjectBundle(ctx, args.projectId);
  },
});

/**
 * Import a portable project bundle exported from another AeroGap installation.
 *
 * Creates a new project under the signed-in user. Manuals, logbooks, and other
 * excluded scopes are never read from the bundle even if present.
 */
export const importBundle = mutation({
  args: {
    bundle: v.any(),
    companyId: v.optional(v.id("companies")),
    nameOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const bundle = args.bundle as Record<string, unknown>;
    assertBundleVersion(bundle.version);

    const projectMeta = bundle.project as { name?: string; description?: string } | undefined;
    const name = (args.nameOverride || projectMeta?.name || "Imported project").trim();
    if (!name) throw new Error("Project name is required.");

    const userId = await requireAuth(ctx);
    if (args.companyId) {
      await requireCompanyRole(ctx, args.companyId, ["company_admin", "company_manager"]);
    }

    const now = new Date().toISOString();
    const projectId = await ctx.db.insert("projects", {
      userId,
      companyId: args.companyId,
      name,
      description: projectMeta?.description,
      createdAt: now,
      updatedAt: now,
    });

    const counts = await insertProjectBundleContents(ctx, { projectId, userId, bundle, now });
    return { projectId, counts };
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", userId))
      .first();

    if (user?.role === "admin" || user?.role === "aerogap_employee") {
      return await ctx.db.query("projects").collect();
    }

    const personal = await ctx.db
      .query("projects")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const [memberships, supportAssignments] = await Promise.all([
      ctx.db.query("companyMemberships").withIndex("by_userId", (q) => q.eq("userId", userId)).collect(),
      ctx.db
        .query("companySupportAssignments")
        .withIndex("by_supportUserId", (q) => q.eq("supportUserId", userId))
        .collect(),
    ]);

    const companyIds = new Set<string>();
    memberships
      .filter((m) => m.status !== "suspended")
      .forEach((m) => companyIds.add(m.companyId));
    supportAssignments
      .filter((a) => a.isActive)
      .forEach((a) => companyIds.add(a.companyId));

    const companyProjectsNested = await Promise.all(
      Array.from(companyIds).map((companyId) =>
        ctx.db
          .query("projects")
          .withIndex("by_companyId", (q) => q.eq("companyId", companyId as any))
          .collect()
      )
    );

    const merged = [...personal, ...companyProjectsNested.flat()];
    const uniqueById = new Map(merged.map((project) => [project._id, project]));
    return Array.from(uniqueById.values());
  },
});

/** Projects for one tenant; caller must be company admin/manager or platform staff. */
export const listForCompanyManagement = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    try {
      await requireCompanyRole(ctx, args.companyId, ["company_admin", "company_manager"]);
    } catch {
      return { forbidden: true as const };
    }
    const company = await ctx.db.get(args.companyId);
    if (!company) return { forbidden: true as const };
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return { forbidden: false as const, company, projects };
  },
});

export const get = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db.get(args.projectId);
  },
});

export const getInternal = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    if (args.companyId) {
      await requireCompanyRole(ctx, args.companyId, ["company_admin", "company_manager"]);
    }
    const now = new Date().toISOString();
    return await ctx.db.insert("projects", {
      userId,
      companyId: args.companyId,
      name: args.name,
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const updates: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    await ctx.db.patch(args.projectId, updates);
  },
});

export const remove = mutation({
  args: { projectId: v.id("projects"), confirmName: v.string() },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    if (project.name.trim() !== args.confirmName.trim()) {
      throw new Error("Project name does not match — deletion cancelled");
    }

    // Cascade delete all child records
    const tables = [
      "assessments",
      "documents",
      "analyses",
      "simulationResults",
      "documentRevisions",
      "projectAgentDocuments",
      "entityIssues",
      "entityProfiles",
      "checklistOccurrences",
      "auditChecklistItems",
      "auditChecklistRuns",
      "checklistSeries",
      "checklistCustomTemplates",
      "manualSections",
      "manuals",
      "inspectionScheduleItems",
      "aircraftAssets",
      "logbookDraftEntries",
      "logbookEntries",
      "form337Records",
      "complianceFindings",
      "rosterRequirementTypes",
      "rosterPersonnel",
      "rosterAssignments",
    ] as const;

    for (const table of tables) {
      switch (table) {
        case "projectAgentDocuments": {
          const records = await ctx.db
            .query("projectAgentDocuments")
            .withIndex("by_projectId_agentId", (q) =>
              q.eq("projectId", args.projectId)
            )
            .collect();
          for (const record of records) {
            if (record.storageId) {
              await ctx.storage.delete(record.storageId);
            }
            await ctx.db.delete(record._id);
          }
          break;
        }
        default: {
          const records = await ctx.db
            .query(table)
            .withIndex("by_projectId", (q) =>
              q.eq("projectId", args.projectId)
            )
            .collect();
          for (const record of records) {
            if ("storageId" in record && record.storageId) {
              await ctx.storage.delete(record.storageId as any);
            }
            if ("extractedTextStorageId" in record && (record as { extractedTextStorageId?: Id<"_storage"> }).extractedTextStorageId) {
              await ctx.storage.delete((record as { extractedTextStorageId: Id<"_storage"> }).extractedTextStorageId);
            }
            await ctx.db.delete(record._id);
          }
        }
      }
    }

    await ctx.db.delete(args.projectId);
  },
});
