import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const LIST_PAGE_SIZE = 200;

const sourceValidator = v.union(
  v.literal("audit_sim"),
  v.literal("paperwork_review"),
  v.literal("analysis"),
  v.literal("manual"),
  v.literal("logbook_compliance")
);
const severityValidator = v.union(
  v.literal("critical"),
  v.literal("major"),
  v.literal("minor"),
  v.literal("observation")
);
const statusValidator = v.union(
  v.literal("open"),
  v.literal("in_progress"),
  v.literal("pending_verification"),
  v.literal("closed"),
  v.literal("voided")
);
const rootCauseCategoryValidator = v.union(
  v.literal("training"),
  v.literal("procedure"),
  v.literal("equipment"),
  v.literal("human_error"),
  v.literal("process"),
  v.literal("material"),
  v.literal("management")
);

/** Generate a CAR number in the format CAR-YYYY-NNN (sequential within the project). */
async function generateCarNumber(ctx: any, projectId: string): Promise<string> {
  const year = new Date().getFullYear();
  const existing = await ctx.db
    .query("entityIssues")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .collect();
  const yearPrefix = `CAR-${year}-`;
  const nums = existing
    .map((i: any) => i.carNumber)
    .filter((n: string | undefined) => n && n.startsWith(yearPrefix))
    .map((n: string) => parseInt(n.slice(yearPrefix.length), 10))
    .filter((n: number) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${yearPrefix}${String(next).padStart(3, "0")}`;
}

/** List entity issues for a project. Optionally filter by assessment. */
export const listByProject = query({
  args: {
    projectId: v.id("projects"),
    assessmentId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    if (args.assessmentId) {
      return await ctx.db
        .query("entityIssues")
        .withIndex("by_projectId_assessment", (q) =>
          q.eq("projectId", args.projectId).eq("assessmentId", args.assessmentId!)
        )
        .take(LIST_PAGE_SIZE);
    }
    return await ctx.db
      .query("entityIssues")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
  },
});

/** List entity issues for a project filtered by CAR status. */
export const listByStatus = query({
  args: {
    projectId: v.id("projects"),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("entityIssues")
      .withIndex("by_projectId_status", (q) =>
        q.eq("projectId", args.projectId).eq("status", args.status)
      )
      .take(LIST_PAGE_SIZE);
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    assessmentId: v.optional(v.string()),
    source: sourceValidator,
    sourceId: v.optional(v.string()),
    severity: severityValidator,
    title: v.string(),
    description: v.string(),
    regulationRef: v.optional(v.string()),
    location: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const carNumber = await generateCarNumber(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
    return await ctx.db.insert("entityIssues", {
      projectId: args.projectId,
      userId,
      assessmentId: args.assessmentId,
      source: args.source,
      sourceId: args.sourceId,
      severity: args.severity,
      title: args.title,
      description: args.description,
      regulationRef: args.regulationRef,
      location: args.location,
      createdAt: new Date().toISOString(),
      status: "open",
      carNumber,
    });
  },
});

export const update = mutation({
  args: {
    issueId: v.id("entityIssues"),
    // Core fields
    severity: v.optional(severityValidator),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    regulationRef: v.optional(v.string()),
    location: v.optional(v.string()),
    // CAR lifecycle fields
    status: v.optional(statusValidator),
    owner: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    rootCauseCategory: v.optional(rootCauseCategoryValidator),
    rootCause: v.optional(v.string()),
    correctiveAction: v.optional(v.string()),
    preventiveAction: v.optional(v.string()),
    evidenceOfClosure: v.optional(v.string()),
    closedAt: v.optional(v.string()),
    verifiedBy: v.optional(v.string()),
    aiRootCauseAnalysis: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Entity issue not found");
    await requireProjectOwner(ctx, issue.projectId);
    const { issueId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    const fields: (keyof typeof updates)[] = [
      "severity", "title", "description", "regulationRef", "location",
      "status", "owner", "dueDate", "rootCauseCategory", "rootCause",
      "correctiveAction", "preventiveAction", "evidenceOfClosure",
      "closedAt", "verifiedBy", "aiRootCauseAnalysis",
    ];
    for (const field of fields) {
      if (updates[field] !== undefined) patch[field] = updates[field];
    }
    // Auto-set closedAt when transitioning to closed
    if (updates.status === "closed" && !issue.closedAt && !updates.closedAt) {
      patch.closedAt = new Date().toISOString();
    }
    if (Object.keys(patch).length === 0) return issueId;
    await ctx.db.patch(issueId, patch);
    await ctx.db.patch(issue.projectId, { updatedAt: new Date().toISOString() });
    return issueId;
  },
});

/** Internal-only: fetch all entity issues across all projects for pattern synthesis. No auth check — never exposed to the client. */
export const listAllInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("entityIssues").collect();
  },
});

export const remove = mutation({
  args: { issueId: v.id("entityIssues") },
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new Error("Entity issue not found");
    await requireProjectOwner(ctx, issue.projectId);
    await ctx.db.delete(args.issueId);
    await ctx.db.patch(issue.projectId, { updatedAt: new Date().toISOString() });
  },
});
