import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const severityValidator = v.union(
  v.literal("critical"),
  v.literal("major"),
  v.literal("minor"),
  v.literal("observation")
);

const itemStatusValidator = v.union(
  v.literal("not_started"),
  v.literal("in_progress"),
  v.literal("complete"),
  v.literal("blocked")
);

const runStatusValidator = v.union(
  v.literal("draft"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("archived")
);

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

export const listRunsByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("auditChecklistRuns")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listItemsByRun = query({
  args: { checklistRunId: v.id("auditChecklistRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) throw new Error("Checklist run not found");
    await requireProjectOwner(ctx, run.projectId);
    return await ctx.db
      .query("auditChecklistItems")
      .withIndex("by_checklistRunId", (q) => q.eq("checklistRunId", args.checklistRunId))
      .collect();
  },
});

export const createRunFromTemplate = mutation({
  args: {
    projectId: v.id("projects"),
    profileId: v.optional(v.id("entityProfiles")),
    framework: v.string(),
    frameworkLabel: v.string(),
    subtypeId: v.optional(v.string()),
    subtypeLabel: v.optional(v.string()),
    generatedFromTemplateVersion: v.string(),
    notes: v.optional(v.string()),
    items: v.array(v.object({
      section: v.string(),
      title: v.string(),
      description: v.optional(v.string()),
      requirementRef: v.optional(v.string()),
      evidenceHint: v.optional(v.string()),
      severity: severityValidator,
      owner: v.optional(v.string()),
      dueDate: v.optional(v.string()),
      notes: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const runId = await ctx.db.insert("auditChecklistRuns", {
      projectId: args.projectId,
      userId,
      profileId: args.profileId,
      framework: args.framework,
      frameworkLabel: args.frameworkLabel,
      subtypeId: args.subtypeId,
      subtypeLabel: args.subtypeLabel,
      status: "active",
      generatedFromTemplateVersion: args.generatedFromTemplateVersion,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });

    for (const item of args.items) {
      await ctx.db.insert("auditChecklistItems", {
        projectId: args.projectId,
        userId,
        checklistRunId: runId,
        framework: args.framework,
        subtypeId: args.subtypeId,
        section: item.section,
        title: item.title,
        description: item.description,
        requirementRef: item.requirementRef,
        evidenceHint: item.evidenceHint,
        severity: item.severity,
        status: "not_started",
        owner: item.owner,
        dueDate: item.dueDate,
        notes: item.notes,
        createdAt: now,
        updatedAt: now,
      });
    }
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return runId;
  },
});

export const updateRun = mutation({
  args: {
    checklistRunId: v.id("auditChecklistRuns"),
    status: v.optional(runStatusValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) throw new Error("Checklist run not found");
    await requireProjectOwner(ctx, run.projectId);
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.status === "completed") patch.completedAt = new Date().toISOString();
    await ctx.db.patch(args.checklistRunId, patch);
    await ctx.db.patch(run.projectId, { updatedAt: new Date().toISOString() });
    return args.checklistRunId;
  },
});

export const updateItem = mutation({
  args: {
    checklistItemId: v.id("auditChecklistItems"),
    status: v.optional(itemStatusValidator),
    severity: v.optional(severityValidator),
    owner: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.checklistItemId);
    if (!item) throw new Error("Checklist item not found");
    await requireProjectOwner(ctx, item.projectId);
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.status !== undefined) patch.status = args.status;
    if (args.severity !== undefined) patch.severity = args.severity;
    if (args.owner !== undefined) patch.owner = args.owner;
    if (args.dueDate !== undefined) patch.dueDate = args.dueDate;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.status === "complete") {
      patch.completedAt = new Date().toISOString();
    }
    await ctx.db.patch(args.checklistItemId, patch);
    await ctx.db.patch(item.checklistRunId, { updatedAt: new Date().toISOString() });
    await ctx.db.patch(item.projectId, { updatedAt: new Date().toISOString() });
    return args.checklistItemId;
  },
});

export const addManualItem = mutation({
  args: {
    checklistRunId: v.id("auditChecklistRuns"),
    section: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    requirementRef: v.optional(v.string()),
    evidenceHint: v.optional(v.string()),
    severity: severityValidator,
    owner: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.checklistRunId);
    if (!run) throw new Error("Checklist run not found");
    const userId = await requireProjectOwner(ctx, run.projectId);
    const now = new Date().toISOString();
    const itemId = await ctx.db.insert("auditChecklistItems", {
      projectId: run.projectId,
      userId,
      checklistRunId: args.checklistRunId,
      framework: run.framework,
      subtypeId: run.subtypeId,
      section: args.section,
      title: args.title,
      description: args.description,
      requirementRef: args.requirementRef,
      evidenceHint: args.evidenceHint,
      severity: args.severity,
      status: "not_started",
      owner: args.owner,
      dueDate: args.dueDate,
      notes: args.notes,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(run._id, { updatedAt: now });
    await ctx.db.patch(run.projectId, { updatedAt: now });
    return itemId;
  },
});

export const escalateItemToIssue = mutation({
  args: {
    checklistItemId: v.id("auditChecklistItems"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.checklistItemId);
    if (!item) throw new Error("Checklist item not found");
    await requireProjectOwner(ctx, item.projectId);
    if (item.linkedIssueId) return item.linkedIssueId;

    const carNumber = await generateCarNumber(ctx, item.projectId);
    const now = new Date().toISOString();
    const issueId = await ctx.db.insert("entityIssues", {
      projectId: item.projectId,
      userId: item.userId,
      source: "manual",
      sourceId: String(item._id),
      severity: item.severity,
      title: item.title,
      description: item.description ?? item.notes ?? "Checklist item escalated to CAR/Issue",
      regulationRef: item.requirementRef,
      createdAt: now,
      status: "open",
      carNumber,
      owner: item.owner,
      dueDate: item.dueDate,
    });
    await ctx.db.patch(args.checklistItemId, {
      linkedIssueId: issueId,
      status: item.status === "complete" ? item.status : "blocked",
      updatedAt: now,
    });
    await ctx.db.patch(item.checklistRunId, { updatedAt: now });
    await ctx.db.patch(item.projectId, { updatedAt: now });
    return issueId;
  },
});
