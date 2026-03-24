import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("form337Records")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.optional(v.id("aircraftAssets")),
    title: v.string(),
    status: v.optional(v.union(v.literal("draft"), v.literal("ready_for_review"))),
    formData: v.any(),
    fieldMappedOutput: v.optional(v.any()),
    narrativeDraftOutput: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    return await ctx.db.insert("form337Records", {
      projectId: args.projectId,
      userId,
      aircraftId: args.aircraftId,
      title: args.title,
      status: args.status ?? "draft",
      formData: args.formData,
      fieldMappedOutput: args.fieldMappedOutput,
      narrativeDraftOutput: args.narrativeDraftOutput,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    recordId: v.id("form337Records"),
    aircraftId: v.optional(v.id("aircraftAssets")),
    title: v.optional(v.string()),
    status: v.optional(v.union(v.literal("draft"), v.literal("ready_for_review"))),
    formData: v.optional(v.any()),
    fieldMappedOutput: v.optional(v.any()),
    narrativeDraftOutput: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Form 337 record not found");
    await requireProjectOwner(ctx, record.projectId);

    const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (args.aircraftId !== undefined) patch.aircraftId = args.aircraftId;
    if (args.title !== undefined) patch.title = args.title;
    if (args.status !== undefined) patch.status = args.status;
    if (args.formData !== undefined) patch.formData = args.formData;
    if (args.fieldMappedOutput !== undefined) patch.fieldMappedOutput = args.fieldMappedOutput;
    if (args.narrativeDraftOutput !== undefined) patch.narrativeDraftOutput = args.narrativeDraftOutput;

    await ctx.db.patch(args.recordId, patch);
  },
});

export const remove = mutation({
  args: { recordId: v.id("form337Records") },
  handler: async (ctx, args) => {
    const record = await ctx.db.get(args.recordId);
    if (!record) throw new Error("Form 337 record not found");
    await requireProjectOwner(ctx, record.projectId);
    await ctx.db.delete(args.recordId);
  },
});
