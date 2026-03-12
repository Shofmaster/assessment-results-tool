import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireProjectOwner } from "./_helpers";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("manualSections")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listByProjectAndType = query({
  args: { projectId: v.id("projects"), manualType: v.string() },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("manualSections")
      .withIndex("by_projectId_manualType", (q) =>
        q.eq("projectId", args.projectId).eq("manualType", args.manualType)
      )
      .collect();
  },
});

export const listApprovedByTypeAndSection = query({
  args: {
    manualType: v.string(),
    sectionNumber: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    let rows = await ctx.db
      .query("manualSections")
      .withIndex("by_manualType_status", (q) =>
        q.eq("manualType", args.manualType).eq("status", "approved")
      )
      .collect();

    if (args.sectionNumber) {
      rows = rows.filter((r) => r.sectionNumber === args.sectionNumber);
    }

    const cap = args.limit ?? 5;
    return rows.slice(0, cap).map((r) => ({
      _id: r._id,
      sectionTitle: r.sectionTitle,
      sectionNumber: r.sectionNumber,
      generatedContent: r.generatedContent,
      activeStandards: r.activeStandards,
      updatedAt: r.updatedAt,
    }));
  },
});

export const listApprovedByProject = query({
  args: { projectId: v.id("projects"), manualType: v.string() },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const rows = await ctx.db
      .query("manualSections")
      .withIndex("by_projectId_manualType", (q) =>
        q.eq("projectId", args.projectId).eq("manualType", args.manualType)
      )
      .collect();
    return rows
      .filter((r) => r.status === "approved")
      .sort((a, b) => (a.sectionNumber || "").localeCompare(b.sectionNumber || "", undefined, { numeric: true }));
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    manualType: v.string(),
    sectionTitle: v.string(),
    sectionNumber: v.optional(v.string()),
    generatedContent: v.string(),
    cfrRefs: v.optional(v.array(v.string())),
    activeStandards: v.optional(v.array(v.string())),
    sourceDocumentId: v.optional(v.id("documents")),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    return await ctx.db.insert("manualSections", {
      projectId: args.projectId,
      userId,
      manualType: args.manualType,
      sectionTitle: args.sectionTitle,
      sectionNumber: args.sectionNumber,
      generatedContent: args.generatedContent,
      cfrRefs: args.cfrRefs,
      activeStandards: args.activeStandards,
      sourceDocumentId: args.sourceDocumentId,
      status: args.status ?? "draft",
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sectionId: v.id("manualSections"),
    generatedContent: v.optional(v.string()),
    sectionTitle: v.optional(v.string()),
    sectionNumber: v.optional(v.string()),
    cfrRefs: v.optional(v.array(v.string())),
    activeStandards: v.optional(v.array(v.string())),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.sectionId);
    if (!section) throw new Error("Section not found");
    await requireProjectOwner(ctx, section.projectId);

    const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (args.generatedContent !== undefined) patch.generatedContent = args.generatedContent;
    if (args.sectionTitle !== undefined) patch.sectionTitle = args.sectionTitle;
    if (args.sectionNumber !== undefined) patch.sectionNumber = args.sectionNumber;
    if (args.cfrRefs !== undefined) patch.cfrRefs = args.cfrRefs;
    if (args.activeStandards !== undefined) patch.activeStandards = args.activeStandards;
    if (args.status !== undefined) patch.status = args.status;

    await ctx.db.patch(args.sectionId, patch);
  },
});

export const remove = mutation({
  args: { sectionId: v.id("manualSections") },
  handler: async (ctx, args) => {
    const section = await ctx.db.get(args.sectionId);
    if (!section) throw new Error("Section not found");
    await requireProjectOwner(ctx, section.projectId);
    await ctx.db.delete(args.sectionId);
  },
});
