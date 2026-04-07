import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const LIST_PAGE_SIZE = 500;
const IA_CAPABILITY = "Inspection Authorization (IA)";

type AutoRequirementTemplate = {
  capability: string;
  requirementName: string;
  category: string;
  defaultRecurrenceDays: number;
  assignmentNotes?: string;
  dueDateStrategy?: "ia_march_odd_year" | "calendar_months_end";
  dueDateCalendarMonths?: number;
};

const AUTO_REQUIREMENT_TEMPLATES: AutoRequirementTemplate[] = [
  {
    capability: IA_CAPABILITY,
    requirementName: "IA Renewal",
    category: "FAA Authorization",
    defaultRecurrenceDays: 730,
    dueDateStrategy: "ia_march_odd_year",
    assignmentNotes:
      "Auto-created from IA capability. Renewal aligns to 14 CFR 65.93 (March in odd-numbered years).",
  },
  {
    capability: "A&P Mechanic",
    requirementName: "A&P Recent Experience Verification",
    category: "FAA Currency",
    defaultRecurrenceDays: 730,
    dueDateStrategy: "calendar_months_end",
    dueDateCalendarMonths: 24,
    assignmentNotes:
      "Auto-created from A&P capability. Verify 14 CFR 65.83 recent experience within preceding 24 months.",
  },
  {
    capability: "Pilot (PIC)",
    requirementName: "Flight Review (BFR)",
    category: "Pilot Currency",
    defaultRecurrenceDays: 730,
    dueDateStrategy: "calendar_months_end",
    dueDateCalendarMonths: 24,
    assignmentNotes: "Auto-created from Pilot (PIC) capability. 14 CFR 61.56 flight review cadence.",
  },
  {
    capability: "Pilot (PIC)",
    requirementName: "Passenger Carrying Currency",
    category: "Pilot Currency",
    defaultRecurrenceDays: 90,
    assignmentNotes:
      "Auto-created from Pilot (PIC) capability. 14 CFR 61.57 passenger currency (day/night operations may vary).",
  },
  {
    capability: "Instrument Rated Pilot",
    requirementName: "IFR Instrument Currency",
    category: "Pilot Currency",
    defaultRecurrenceDays: 180,
    dueDateStrategy: "calendar_months_end",
    dueDateCalendarMonths: 6,
    assignmentNotes:
      "Auto-created from Instrument Rated Pilot capability. 14 CFR 61.57(c) six-calendar-month instrument experience.",
  },
  {
    capability: "Flight Instructor (CFI)",
    requirementName: "CFI Recent Experience",
    category: "Instructor Currency",
    defaultRecurrenceDays: 730,
    dueDateStrategy: "calendar_months_end",
    dueDateCalendarMonths: 24,
    assignmentNotes:
      "Auto-created from Flight Instructor (CFI) capability. 14 CFR 61.197 recent experience period.",
  },
  {
    capability: "HazMat / Dangerous Goods",
    requirementName: "Hazmat Recurrent Training",
    category: "Hazmat",
    defaultRecurrenceDays: 1095,
    assignmentNotes:
      "Auto-created from HazMat capability. 49 CFR 172.704 requires recurrent training at least every three years.",
  },
  {
    capability: "RII",
    requirementName: "RII Recurrent Authorization",
    category: "Inspection Authorization",
    defaultRecurrenceDays: 365,
    assignmentNotes: "Auto-created from RII capability.",
  },
  {
    capability: "Inspector",
    requirementName: "Inspector Recurrent Authorization",
    category: "Inspection Authorization",
    defaultRecurrenceDays: 365,
    assignmentNotes: "Auto-created from Inspector capability.",
  },
  {
    capability: "RTS",
    requirementName: "RTS Recurrent Authorization",
    category: "Return to Service",
    defaultRecurrenceDays: 365,
    assignmentNotes: "Auto-created from RTS capability.",
  },
];

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

function nextIaRenewalDueDate(todayIso: string): string {
  const currentYear = Number(todayIso.slice(0, 4));
  let dueYear = currentYear % 2 === 1 ? currentYear : currentYear + 1;
  const dueDate = `${dueYear}-03-31`;
  if (todayIso > dueDate) {
    dueYear += 2;
  }
  return `${dueYear}-03-31`;
}

function endOfCalendarMonthAfterMonths(baseIso: string, monthsToAdd: number): string {
  const [yearStr, monthStr] = baseIso.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const date = new Date(Date.UTC(year, month - 1 + monthsToAdd + 1, 0));
  return date.toISOString().slice(0, 10);
}

async function ensureRequirementTypeForTemplate(
  ctx: any,
  projectId: any,
  userId: string,
  template: AutoRequirementTemplate,
  now: string
) {
  const requirements = await ctx.db
    .query("rosterRequirementTypes")
    .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
    .collect();
  const existing = requirements.find(
    (req: any) => req.name.trim().toLowerCase() === template.requirementName.trim().toLowerCase()
  );
  if (existing) return existing._id;

  return await ctx.db.insert("rosterRequirementTypes", {
    projectId,
    userId,
    name: template.requirementName,
    category: template.category,
    defaultRecurrenceDays: template.defaultRecurrenceDays,
    defaultGraceDays: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });
}

async function ensureAutoAssignmentsForCapabilities(
  ctx: any,
  params: {
    projectId: any;
    userId: string;
    personId: any;
    capabilities: string[];
    now: string;
  }
) {
  const { projectId, userId, personId, capabilities, now } = params;
  const normalizedCaps = new Set(capabilities.map((cap) => cap.trim().toLowerCase()).filter(Boolean));
  const templatesToApply = AUTO_REQUIREMENT_TEMPLATES.filter((template) =>
    normalizedCaps.has(template.capability.trim().toLowerCase())
  );

  if (templatesToApply.length === 0) return;

  const existingAssignments = await ctx.db
    .query("rosterAssignments")
    .withIndex("by_personId", (q: any) => q.eq("personId", personId))
    .collect();

  const todayIso = now.slice(0, 10);

  for (const template of templatesToApply) {
    const requirementTypeId = await ensureRequirementTypeForTemplate(ctx, projectId, userId, template, now);
    const hasAssignment = existingAssignments.some(
      (assignment: any) =>
        assignment.projectId === projectId &&
        assignment.personId === personId &&
        assignment.requirementTypeId === requirementTypeId
    );
    if (hasAssignment) continue;

    const dueDate =
      template.dueDateStrategy === "ia_march_odd_year"
        ? nextIaRenewalDueDate(todayIso)
        : template.dueDateStrategy === "calendar_months_end" && template.dueDateCalendarMonths
          ? endOfCalendarMonthAfterMonths(todayIso, template.dueDateCalendarMonths)
        : addDays(todayIso, template.defaultRecurrenceDays);

    await ctx.db.insert("rosterAssignments", {
      projectId,
      userId,
      personId,
      requirementTypeId,
      assignedDate: todayIso,
      dueDate,
      recurrenceDaysOverride: template.defaultRecurrenceDays,
      graceDaysOverride: 0,
      notes: template.assignmentNotes,
      createdAt: now,
      updatedAt: now,
    });
  }
}

type DashboardStatus = "up_to_date" | "due_30_days" | "expired";

function dashboardStatusPriority(status: DashboardStatus): number {
  if (status === "expired") return 3;
  if (status === "due_30_days") return 2;
  return 1;
}

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
    const capabilities = (args.capabilities ?? []).map((c) => c.trim()).filter(Boolean);
    const personId = await ctx.db.insert("rosterPersonnel", {
      projectId: args.projectId,
      userId,
      fullName: args.fullName.trim(),
      roleTitle: args.roleTitle?.trim(),
      jobDescription: args.jobDescription?.trim(),
      employeeId: args.employeeId?.trim(),
      certificateNumber: args.certificateNumber?.trim(),
      capabilities,
      isActive: args.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
    await ensureAutoAssignmentsForCapabilities(ctx, {
      projectId: args.projectId,
      userId,
      personId,
      capabilities,
      now,
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

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.fullName !== undefined) patch.fullName = args.fullName.trim();
    if (args.roleTitle !== undefined) patch.roleTitle = args.roleTitle.trim();
    if (args.jobDescription !== undefined) patch.jobDescription = args.jobDescription.trim();
    if (args.employeeId !== undefined) patch.employeeId = args.employeeId.trim();
    if (args.certificateNumber !== undefined) patch.certificateNumber = args.certificateNumber.trim();
    if (args.capabilities !== undefined) {
      const capabilities = args.capabilities.map((c) => c.trim()).filter(Boolean);
      patch.capabilities = capabilities;
      await ensureAutoAssignmentsForCapabilities(ctx, {
        projectId: person.projectId,
        userId: person.userId,
        personId: person._id,
        capabilities,
        now,
      });
    }
    if (args.isActive !== undefined) patch.isActive = args.isActive;

    await ctx.db.patch(args.personId, patch);
    await ctx.db.patch(person.projectId, { updatedAt: now });
    return args.personId;
  },
});

export const removePerson = mutation({
  args: {
    personId: v.id("rosterPersonnel"),
    adminPosition: v.string(),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (!person) throw new Error("Person not found");
    await requireProjectOwner(ctx, person.projectId);
    const adminPosition = args.adminPosition.trim();
    if (!adminPosition || !adminPosition.toLowerCase().includes("admin")) {
      throw new Error("Enter an admin position for this company before deleting personnel");
    }

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

    const assignmentRows = assignments
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

    const rowsByPersonId = new Map<string, any[]>();
    assignmentRows.forEach((row: any) => {
      const key = String(row.personId);
      const grouped = rowsByPersonId.get(key);
      if (grouped) grouped.push(row);
      else rowsByPersonId.set(key, [row]);
    });

    const personRows = Array.from(rowsByPersonId.values()).map((personAssignments: any[]) => {
      const [firstAssignment] = personAssignments;
      const summary = {
        up_to_date: 0,
        due_30_days: 0,
        expired: 0,
      };
      let worstStatus: DashboardStatus = "up_to_date";

      personAssignments.forEach((assignmentRow) => {
        summary[assignmentRow.status as DashboardStatus] += 1;
        if (dashboardStatusPriority(assignmentRow.status) > dashboardStatusPriority(worstStatus)) {
          worstStatus = assignmentRow.status;
        }
      });

      return {
        personId: firstAssignment.personId,
        personName: firstAssignment.personName,
        roleTitle: firstAssignment.roleTitle,
        capabilities: firstAssignment.capabilities,
        status: worstStatus,
        summary,
        qualifications: personAssignments
          .map((assignmentRow) => ({
            assignmentId: assignmentRow.assignmentId,
            requirementTypeId: assignmentRow.requirementTypeId,
            requirementName: assignmentRow.requirementName,
            dueDate: assignmentRow.dueDate,
            graceDays: assignmentRow.graceDays,
            status: assignmentRow.status,
            daysUntilDue: assignmentRow.daysUntilDue,
          }))
          .sort((a, b) => {
            const dueA = a.dueDate ?? "9999-12-31";
            const dueB = b.dueDate ?? "9999-12-31";
            return dueA.localeCompare(dueB);
          }),
      };
    });

    const upToDate = personRows.filter((r: any) => r.status === "up_to_date");
    const due30Days = personRows.filter((r: any) => r.status === "due_30_days");
    const expired = personRows.filter((r: any) => r.status === "expired");

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
