import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const LIST_PAGE_SIZE = 500;

function addDays(dateIso: string, days: number): string {
  const date = new Date(dateIso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayDiff(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const to = new Date(toIso + "T00:00:00Z").getTime();
  return Math.floor((to - from) / (1000 * 60 * 60 * 24));
}

type DashboardStatus = "up_to_date" | "due_30_days" | "expired";

function computeStatus(
  dueDate: string | undefined,
  effectiveGraceDays: number | undefined,
  todayIso: string
): { status: DashboardStatus; daysUntilDue: number | null } {
  if (!dueDate) return { status: "up_to_date", daysUntilDue: null };
  const daysUntilDue = dayDiff(todayIso, dueDate);
  const graceDays = effectiveGraceDays ?? 0;
  const daysUntilGraceDeadline = daysUntilDue + graceDays;

  if (daysUntilGraceDeadline < 0) {
    return { status: "expired", daysUntilDue };
  }
  if (daysUntilDue <= 30) {
    return { status: "due_30_days", daysUntilDue };
  }
  return { status: "up_to_date", daysUntilDue };
}

export const listRequirementTypes = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("rosterRequirementTypes")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
  },
});

export const addRequirementType = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultRecurrenceDays: v.optional(v.number()),
    defaultGraceDays: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const requirementId = await ctx.db.insert("rosterRequirementTypes", {
      projectId: args.projectId,
      userId,
      name: args.name.trim(),
      category: args.category?.trim(),
      description: args.description?.trim(),
      defaultRecurrenceDays: args.defaultRecurrenceDays,
      defaultGraceDays: args.defaultGraceDays,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return requirementId;
  },
});

export const updateRequirementType = mutation({
  args: {
    requirementTypeId: v.id("rosterRequirementTypes"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultRecurrenceDays: v.optional(v.number()),
    defaultGraceDays: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.requirementTypeId);
    if (!req) throw new Error("Requirement type not found");
    await requireProjectOwner(ctx, req.projectId);

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.category !== undefined) patch.category = args.category.trim();
    if (args.description !== undefined) patch.description = args.description.trim();
    if (args.defaultRecurrenceDays !== undefined) patch.defaultRecurrenceDays = args.defaultRecurrenceDays;
    if (args.defaultGraceDays !== undefined) patch.defaultGraceDays = args.defaultGraceDays;
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.requirementTypeId, patch);
    await ctx.db.patch(req.projectId, { updatedAt: new Date().toISOString() });
    return args.requirementTypeId;
  },
});

export const removeRequirementType = mutation({
  args: { requirementTypeId: v.id("rosterRequirementTypes") },
  handler: async (ctx, args) => {
    const req = await ctx.db.get(args.requirementTypeId);
    if (!req) throw new Error("Requirement type not found");
    await requireProjectOwner(ctx, req.projectId);

    const assignments = await ctx.db
      .query("rosterAssignments")
      .withIndex("by_requirementTypeId", (q) => q.eq("requirementTypeId", args.requirementTypeId))
      .collect();
    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id);
    }
    await ctx.db.delete(args.requirementTypeId);
    await ctx.db.patch(req.projectId, { updatedAt: new Date().toISOString() });
  },
});

export const listPersonnel = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("rosterPersonnel")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
  },
});

export const addPerson = mutation({
  args: {
    projectId: v.id("projects"),
    fullName: v.string(),
    roleTitle: v.optional(v.string()),
    jobDescription: v.optional(v.string()),
    employeeId: v.optional(v.string()),
    certificateNumber: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const personId = await ctx.db.insert("rosterPersonnel", {
      projectId: args.projectId,
      userId,
      fullName: args.fullName.trim(),
      roleTitle: args.roleTitle?.trim(),
      jobDescription: args.jobDescription?.trim(),
      employeeId: args.employeeId?.trim(),
      certificateNumber: args.certificateNumber?.trim(),
      capabilities: (args.capabilities ?? []).map((c) => c.trim()).filter(Boolean),
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return personId;
  },
});

export const updatePerson = mutation({
  args: {
    personId: v.id("rosterPersonnel"),
    fullName: v.optional(v.string()),
    roleTitle: v.optional(v.string()),
    jobDescription: v.optional(v.string()),
    employeeId: v.optional(v.string()),
    certificateNumber: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (!person) throw new Error("Person not found");
    await requireProjectOwner(ctx, person.projectId);

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.fullName !== undefined) patch.fullName = args.fullName.trim();
    if (args.roleTitle !== undefined) patch.roleTitle = args.roleTitle.trim();
    if (args.jobDescription !== undefined) patch.jobDescription = args.jobDescription.trim();
    if (args.employeeId !== undefined) patch.employeeId = args.employeeId.trim();
    if (args.certificateNumber !== undefined) patch.certificateNumber = args.certificateNumber.trim();
    if (args.capabilities !== undefined) {
      patch.capabilities = args.capabilities.map((c) => c.trim()).filter(Boolean);
    }
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.personId, patch);
    await ctx.db.patch(person.projectId, { updatedAt: new Date().toISOString() });
    return args.personId;
  },
});

export const removePerson = mutation({
  args: { personId: v.id("rosterPersonnel") },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (!person) throw new Error("Person not found");
    await requireProjectOwner(ctx, person.projectId);

    const assignments = await ctx.db
      .query("rosterAssignments")
      .withIndex("by_personId", (q) => q.eq("personId", args.personId))
      .collect();
    for (const assignment of assignments) {
      await ctx.db.delete(assignment._id);
    }
    await ctx.db.delete(args.personId);
    await ctx.db.patch(person.projectId, { updatedAt: new Date().toISOString() });
  },
});

export const listAssignments = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("rosterAssignments")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
  },
});

export const addAssignment = mutation({
  args: {
    projectId: v.id("projects"),
    personId: v.id("rosterPersonnel"),
    requirementTypeId: v.id("rosterRequirementTypes"),
    assignedDate: v.optional(v.string()),
    lastCompletedDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    recurrenceDaysOverride: v.optional(v.number()),
    graceDaysOverride: v.optional(v.number()),
    notes: v.optional(v.string()),
    evidenceLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const person = await ctx.db.get(args.personId);
    const requirement = await ctx.db.get(args.requirementTypeId);
    if (!person || person.projectId !== args.projectId) {
      throw new Error("Person not found in project");
    }
    if (!requirement || requirement.projectId !== args.projectId) {
      throw new Error("Requirement type not found in project");
    }

    const recurrenceDays = args.recurrenceDaysOverride ?? requirement.defaultRecurrenceDays;
    const dueDate =
      args.dueDate ??
      (args.lastCompletedDate && recurrenceDays ? addDays(args.lastCompletedDate, recurrenceDays) : undefined) ??
      (args.assignedDate && recurrenceDays ? addDays(args.assignedDate, recurrenceDays) : undefined);

    const now = new Date().toISOString();
    const assignmentId = await ctx.db.insert("rosterAssignments", {
      projectId: args.projectId,
      userId,
      personId: args.personId,
      requirementTypeId: args.requirementTypeId,
      assignedDate: args.assignedDate,
      lastCompletedDate: args.lastCompletedDate,
      dueDate,
      recurrenceDaysOverride: args.recurrenceDaysOverride,
      graceDaysOverride: args.graceDaysOverride,
      notes: args.notes?.trim(),
      evidenceLink: args.evidenceLink?.trim(),
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return assignmentId;
  },
});

export const updateAssignment = mutation({
  args: {
    assignmentId: v.id("rosterAssignments"),
    assignedDate: v.optional(v.string()),
    lastCompletedDate: v.optional(v.string()),
    dueDate: v.optional(v.string()),
    recurrenceDaysOverride: v.optional(v.number()),
    graceDaysOverride: v.optional(v.number()),
    notes: v.optional(v.string()),
    evidenceLink: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    await requireProjectOwner(ctx, assignment.projectId);

    const requirement = await ctx.db.get(assignment.requirementTypeId);
    if (!requirement) throw new Error("Requirement type not found");

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.assignedDate !== undefined) patch.assignedDate = args.assignedDate;
    if (args.lastCompletedDate !== undefined) patch.lastCompletedDate = args.lastCompletedDate;
    if (args.recurrenceDaysOverride !== undefined) patch.recurrenceDaysOverride = args.recurrenceDaysOverride;
    if (args.graceDaysOverride !== undefined) patch.graceDaysOverride = args.graceDaysOverride;
    if (args.notes !== undefined) patch.notes = args.notes.trim();
    if (args.evidenceLink !== undefined) patch.evidenceLink = args.evidenceLink.trim();

    if (args.dueDate !== undefined) {
      patch.dueDate = args.dueDate;
    } else if (args.lastCompletedDate !== undefined) {
      const recurrenceDays =
        args.recurrenceDaysOverride ??
        assignment.recurrenceDaysOverride ??
        requirement.defaultRecurrenceDays;
      if (args.lastCompletedDate && recurrenceDays) {
        patch.dueDate = addDays(args.lastCompletedDate, recurrenceDays);
      }
    }

    await ctx.db.patch(args.assignmentId, patch);
    await ctx.db.patch(assignment.projectId, { updatedAt: new Date().toISOString() });
    return args.assignmentId;
  },
});

export const removeAssignment = mutation({
  args: { assignmentId: v.id("rosterAssignments") },
  handler: async (ctx, args) => {
    const assignment = await ctx.db.get(args.assignmentId);
    if (!assignment) throw new Error("Assignment not found");
    await requireProjectOwner(ctx, assignment.projectId);
    await ctx.db.delete(args.assignmentId);
    await ctx.db.patch(assignment.projectId, { updatedAt: new Date().toISOString() });
  },
});

export const getDashboard = query({
  args: {
    projectId: v.id("projects"),
    capability: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);

    const [people, requirements, assignments] = await Promise.all([
      ctx.db
        .query("rosterPersonnel")
        .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
        .collect(),
      ctx.db
        .query("rosterRequirementTypes")
        .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
        .collect(),
      ctx.db
        .query("rosterAssignments")
        .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
        .collect(),
    ]);

    const peopleById = new Map(people.map((p) => [p._id, p]));
    const reqById = new Map(requirements.map((r) => [r._id, r]));
    const todayIso = new Date().toISOString().slice(0, 10);
    const capabilityFilter = args.capability?.trim().toLowerCase();

    const rows = assignments
      .map((assignment) => {
        const person = peopleById.get(assignment.personId);
        const requirement = reqById.get(assignment.requirementTypeId);
        if (!person || !requirement) return null;
        if (!person.isActive || !requirement.isActive) return null;
        if (capabilityFilter) {
          const personCaps = person.capabilities.map((c) => c.toLowerCase());
          if (!personCaps.includes(capabilityFilter)) return null;
        }

        const effectiveGraceDays = assignment.graceDaysOverride ?? requirement.defaultGraceDays ?? 0;
        const statusResult = computeStatus(assignment.dueDate, effectiveGraceDays, todayIso);
        return {
          assignmentId: assignment._id,
          personId: person._id,
          requirementTypeId: requirement._id,
          personName: person.fullName,
          roleTitle: person.roleTitle,
          capabilities: person.capabilities,
          requirementName: requirement.name,
          dueDate: assignment.dueDate ?? null,
          graceDays: effectiveGraceDays,
          status: statusResult.status,
          daysUntilDue: statusResult.daysUntilDue,
        };
      })
      .filter(Boolean);

    const upToDate = rows.filter((r: any) => r.status === "up_to_date");
    const due30Days = rows.filter((r: any) => r.status === "due_30_days");
    const expired = rows.filter((r: any) => r.status === "expired");

    return {
      counts: {
        upToDate: upToDate.length,
        due30Days: due30Days.length,
        expired: expired.length,
      },
      rows: {
        upToDate,
        due30Days,
        expired,
      },
    };
  },
});
