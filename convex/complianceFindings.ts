import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

export const listByAircraft = query({
  args: {
    projectId: v.id("projects"),
    aircraftId: v.id("aircraftAssets"),
    statusFilter: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    if (args.statusFilter) {
      return ctx.db
        .query("complianceFindings")
        .withIndex("by_aircraftId_status", (q) =>
          q.eq("aircraftId", args.aircraftId).eq("status", args.statusFilter!)
        )
        .collect();
    }
    return ctx.db
      .query("complianceFindings")
      .withIndex("by_aircraftId", (q) => q.eq("aircraftId", args.aircraftId))
      .collect();
  },
});

export const listByProject = query({
  args: {
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return ctx.db
      .query("complianceFindings")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listByEntry = query({
  args: {
    entryId: v.id("logbookEntries"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) return [];
    await requireProjectOwner(ctx, entry.projectId);
    return ctx.db
      .query("complianceFindings")
      .withIndex("by_logbookEntryId", (q) => q.eq("logbookEntryId", args.entryId))
      .collect();
  },
});

export const addBatch = mutation({
  args: {
    projectId: v.id("projects"),
    findings: v.array(
      v.object({
        aircraftId: v.id("aircraftAssets"),
        logbookEntryId: v.optional(v.id("logbookEntries")),
        ruleId: v.string(),
        findingType: v.string(),
        severity: v.string(),
        title: v.string(),
        description: v.string(),
        citation: v.string(),
        evidenceSnippet: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const ids: string[] = [];
    for (const finding of args.findings) {
      const id = await ctx.db.insert("complianceFindings", {
        projectId: args.projectId,
        userId,
        ...finding,
        status: "open",
        createdAt: now,
        updatedAt: now,
      });
      ids.push(id);
    }
    return ids;
  },
});

export const updateStatus = mutation({
  args: {
    findingId: v.id("complianceFindings"),
    status: v.string(),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const finding = await ctx.db.get(args.findingId);
    if (!finding) throw new Error("Finding not found");
    const userId = await requireProjectOwner(ctx, finding.projectId);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: args.status,
      updatedAt: now,
    };
    if (args.status === "resolved" || args.status === "false_positive") {
      patch.resolvedAt = now;
      patch.resolvedBy = userId;
    }
    if (args.resolutionNote !== undefined) {
      patch.resolutionNote = args.resolutionNote;
    }
    await ctx.db.patch(args.findingId, patch);
    return args.findingId;
  },
});

export const convertToIssue = mutation({
  args: {
    findingId: v.id("complianceFindings"),
    issueId: v.id("entityIssues"),
  },
  handler: async (ctx, args) => {
    const finding = await ctx.db.get(args.findingId);
    if (!finding) throw new Error("Finding not found");
    await requireProjectOwner(ctx, finding.projectId);
    await ctx.db.patch(args.findingId, {
      convertedToIssueId: args.issueId,
      updatedAt: new Date().toISOString(),
    });
  },
});

export const remove = mutation({
  args: { findingId: v.id("complianceFindings") },
  handler: async (ctx, args) => {
    const finding = await ctx.db.get(args.findingId);
    if (!finding) throw new Error("Finding not found");
    await requireProjectOwner(ctx, finding.projectId);
    await ctx.db.delete(args.findingId);
  },
});
