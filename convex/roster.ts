import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";
import {
  type DueDateStrategy,
  type IntervalUnit,
  type PromptFieldDef,
  type RequirementRuleSlice,
  computeAssignmentDueDate,
  dayDiff,
  listMissingPromptAnswers,
} from "./rosterDueDates";
import { resolveInitialOrgChartPosition } from "./lib/orgChartLayout";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";

const rosterDueDateStrategyValidator = v.union(
  v.literal("fixed_days"),
  v.literal("fixed_interval"),
  v.literal("calendar_month_end"),
  v.literal("ia_march_odd_year"),
);

const rosterIntervalUnitValidator = v.union(
  v.literal("days"),
  v.literal("months"),
  v.literal("years"),
);

const rosterPromptFieldArg = v.object({
  id: v.string(),
  label: v.string(),
  fieldType: v.union(
    v.literal("date"),
    v.literal("text"),
    v.literal("textarea"),
    v.literal("number"),
    v.literal("select"),
  ),
  required: v.optional(v.boolean()),
  options: v.optional(v.array(v.string())),
  placeholder: v.optional(v.string()),
});

const LIST_PAGE_SIZE = 500;

async function assignInitialOrgChartLayout(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  personId: Id<"rosterPersonnel">,
  supervisorPersonId?: Id<"rosterPersonnel">,
) {
  const [personnel, layouts] = await Promise.all([
    ctx.db
      .query("rosterPersonnel")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect(),
    ctx.db
      .query("rosterOrgChartLayouts")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .collect(),
  ]);

  const savedByPersonId = new Map(
    layouts.map((layout) => [layout.personId as string, { x: layout.x, y: layout.y }]),
  );
  const rows = personnel.map((person) => ({
    _id: person._id as string,
    fullName: person.fullName,
    reportsToPersonId: person.reportsToPersonId as string | undefined,
  }));

  const { x, y } = resolveInitialOrgChartPosition(
    rows,
    savedByPersonId,
    personId as string,
    supervisorPersonId as string | undefined,
  );

  const now = new Date().toISOString();
  const existing = layouts.find((layout) => layout.personId === personId);
  if (existing) {
    await ctx.db.patch(existing._id, { x, y, updatedAt: now });
    return;
  }

  await ctx.db.insert("rosterOrgChartLayouts", {
    projectId,
    personId,
    x,
    y,
    updatedAt: now,
  });
}
const IA_CAPABILITY = "Inspection Authorization (IA)";

type AutoRequirementTemplate = {
  capability: string;
  requirementName: string;
  category: string;
  defaultRecurrenceDays: number;
  assignmentNotes?: string;
  dueDateStrategy: DueDateStrategy;
  defaultIntervalValue?: number;
  defaultIntervalUnit?: IntervalUnit;
  dueDateCalendarMonths?: number;
  promptSchema?: PromptFieldDef[];
};

/** Reusable evidence prompts (A–F + baseline dates for other quals). */
const PROMPTS_MAINTENANCE_EVIDENCE: PromptFieldDef[] = [
  {
    id: "lastQualifyingActivityDate",
    label: "Last qualifying activity date",
    fieldType: "date",
    required: false,
  },
  { id: "activityType", label: "Activity type", fieldType: "text", required: false },
  { id: "aircraftOrComponent", label: "Aircraft or component", fieldType: "text", required: false },
  { id: "hoursOrTaskCount", label: "Hours or task count", fieldType: "text", required: false },
  { id: "supervisorVerifier", label: "Supervisor / verifier", fieldType: "text", required: false },
  {
    id: "evidenceReference",
    label: "Evidence reference (WO / logbook / task card #)",
    fieldType: "text",
    required: false,
  },
];

const PROMPTS_IA: PromptFieldDef[] = [
  {
    id: "iaLastRenewalReferenceDate",
    label: "Last IA renewal / activity reference date (optional; helps place the March cycle)",
    fieldType: "date",
    required: false,
  },
];

const PROMPTS_FLIGHT_REVIEW: PromptFieldDef[] = [
  {
    id: "lastFlightReviewDate",
    label: "Date of last flight review (or baseline for next BFR)",
    fieldType: "date",
    required: false,
  },
  { id: "activityType", label: "Notes / aircraft class (optional)", fieldType: "textarea", required: false },
];

const PROMPTS_PASSENGER_CURRENCY: PromptFieldDef[] = [
  {
    id: "lastLandingCurrencyDate",
    label: "Date of last landing(s) meeting passenger currency",
    fieldType: "date",
    required: false,
  },
];

const PROMPTS_IFR: PromptFieldDef[] = [
  {
    id: "lastIfExperienceDate",
    label: "Date of last IFR experience (approaches / sim, as applicable)",
    fieldType: "date",
    required: false,
  },
];

const PROMPTS_CFI: PromptFieldDef[] = [
  {
    id: "lastInstructionalActivityDate",
    label: "Date of last instructional activity (baseline for 24-month window)",
    fieldType: "date",
    required: false,
  },
];

const PROMPTS_HAZMAT: PromptFieldDef[] = [
  {
    id: "lastCompletedTrainingDate",
    label: "Date recurrent hazmat training last completed",
    fieldType: "date",
    required: false,
  },
];

const PROMPTS_SHOP_AUTH: PromptFieldDef[] = [
  {
    id: "lastAuthorizationReviewDate",
    label: "Date of last authorization / recurrent review",
    fieldType: "date",
    required: false,
  },
  { id: "evidenceReference", label: "Evidence reference (optional)", fieldType: "text", required: false },
];

const AUTO_REQUIREMENT_TEMPLATES: AutoRequirementTemplate[] = [
  {
    capability: IA_CAPABILITY,
    requirementName: "IA Renewal",
    category: "FAA Authorization",
    defaultRecurrenceDays: 730,
    dueDateStrategy: "ia_march_odd_year",
    defaultIntervalValue: 2,
    defaultIntervalUnit: "years",
    promptSchema: PROMPTS_IA,
    assignmentNotes:
      "Auto-created from IA capability. Renewal aligns to 14 CFR 65.93 (March 31 in odd-numbered years).",
  },
  {
    capability: "A&P Mechanic",
    requirementName: "A&P Recent Experience Verification",
    category: "FAA Currency",
    defaultRecurrenceDays: 730,
    dueDateStrategy: "calendar_month_end",
    defaultIntervalValue: 24,
    defaultIntervalUnit: "months",
    dueDateCalendarMonths: 24,
    promptSchema: PROMPTS_MAINTENANCE_EVIDENCE,
    assignmentNotes:
      "Auto-created from A&P capability. Verify 14 CFR 65.83 recent experience within preceding 24 months.",
  },
  {
    capability: "Pilot (PIC)",
    requirementName: "Flight Review (BFR)",
    category: "Pilot Currency",
    defaultRecurrenceDays: 730,
    dueDateStrategy: "calendar_month_end",
    defaultIntervalValue: 24,
    defaultIntervalUnit: "months",
    dueDateCalendarMonths: 24,
    promptSchema: PROMPTS_FLIGHT_REVIEW,
    assignmentNotes: "Auto-created from Pilot (PIC) capability. 14 CFR 61.56 flight review cadence.",
  },
  {
    capability: "Pilot (PIC)",
    requirementName: "Passenger Carrying Currency",
    category: "Pilot Currency",
    defaultRecurrenceDays: 90,
    dueDateStrategy: "fixed_days",
    defaultIntervalValue: 90,
    defaultIntervalUnit: "days",
    promptSchema: PROMPTS_PASSENGER_CURRENCY,
    assignmentNotes:
      "Auto-created from Pilot (PIC) capability. 14 CFR 61.57 passenger currency (day/night operations may vary).",
  },
  {
    capability: "Instrument Rated Pilot",
    requirementName: "IFR Instrument Currency",
    category: "Pilot Currency",
    defaultRecurrenceDays: 180,
    dueDateStrategy: "calendar_month_end",
    defaultIntervalValue: 6,
    defaultIntervalUnit: "months",
    dueDateCalendarMonths: 6,
    promptSchema: PROMPTS_IFR,
    assignmentNotes:
      "Auto-created from Instrument Rated Pilot capability. 14 CFR 61.57(c) six-calendar-month instrument experience.",
  },
  {
    capability: "Flight Instructor (CFI)",
    requirementName: "CFI Recent Experience",
    category: "Instructor Currency",
    defaultRecurrenceDays: 730,
    dueDateStrategy: "calendar_month_end",
    defaultIntervalValue: 24,
    defaultIntervalUnit: "months",
    dueDateCalendarMonths: 24,
    promptSchema: PROMPTS_CFI,
    assignmentNotes:
      "Auto-created from Flight Instructor (CFI) capability. 14 CFR 61.197 recent experience period.",
  },
  {
    capability: "HazMat / Dangerous Goods",
    requirementName: "Hazmat Recurrent Training",
    category: "Hazmat",
    defaultRecurrenceDays: 1095,
    dueDateStrategy: "fixed_interval",
    defaultIntervalValue: 3,
    defaultIntervalUnit: "years",
    promptSchema: PROMPTS_HAZMAT,
    assignmentNotes:
      "Auto-created from HazMat capability. 49 CFR 172.704 requires recurrent training at least every three years.",
  },
  {
    capability: "RII",
    requirementName: "RII Recurrent Authorization",
    category: "Inspection Authorization",
    defaultRecurrenceDays: 365,
    dueDateStrategy: "fixed_interval",
    defaultIntervalValue: 1,
    defaultIntervalUnit: "years",
    promptSchema: PROMPTS_SHOP_AUTH,
    assignmentNotes: "Auto-created from RII capability.",
  },
  {
    capability: "Inspector",
    requirementName: "Inspector Recurrent Authorization",
    category: "Inspection Authorization",
    defaultRecurrenceDays: 365,
    dueDateStrategy: "fixed_interval",
    defaultIntervalValue: 1,
    defaultIntervalUnit: "years",
    promptSchema: PROMPTS_SHOP_AUTH,
    assignmentNotes: "Auto-created from Inspector capability.",
  },
  {
    capability: "RTS",
    requirementName: "RTS Recurrent Authorization",
    category: "Return to Service",
    defaultRecurrenceDays: 365,
    dueDateStrategy: "fixed_interval",
    defaultIntervalValue: 1,
    defaultIntervalUnit: "years",
    promptSchema: PROMPTS_SHOP_AUTH,
    assignmentNotes: "Auto-created from RTS capability.",
  },
];

function requirementRowToSlice(req: {
  dueDateStrategy?: DueDateStrategy;
  defaultRecurrenceDays?: number;
  defaultIntervalValue?: number;
  defaultIntervalUnit?: IntervalUnit;
  defaultCalendarMonths?: number;
  promptSchema?: PromptFieldDef[];
}): RequirementRuleSlice {
  return {
    dueDateStrategy: req.dueDateStrategy,
    defaultRecurrenceDays: req.defaultRecurrenceDays,
    defaultIntervalValue: req.defaultIntervalValue,
    defaultIntervalUnit: req.defaultIntervalUnit,
    defaultCalendarMonths: req.defaultCalendarMonths,
    promptSchema: req.promptSchema,
  };
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
  if (existing) {
    const patch: Record<string, unknown> = {};
    if (existing.dueDateStrategy === undefined && template.dueDateStrategy !== undefined) {
      patch.dueDateStrategy = template.dueDateStrategy;
    }
    if (existing.defaultIntervalValue === undefined && template.defaultIntervalValue !== undefined) {
      patch.defaultIntervalValue = template.defaultIntervalValue;
    }
    if (existing.defaultIntervalUnit === undefined && template.defaultIntervalUnit !== undefined) {
      patch.defaultIntervalUnit = template.defaultIntervalUnit;
    }
    if (existing.defaultCalendarMonths === undefined && template.dueDateCalendarMonths !== undefined) {
      patch.defaultCalendarMonths = template.dueDateCalendarMonths;
    }
    if (
      (!existing.promptSchema || existing.promptSchema.length === 0) &&
      template.promptSchema &&
      template.promptSchema.length > 0
    ) {
      patch.promptSchema = template.promptSchema;
    }
    if (Object.keys(patch).length > 0) {
      patch.updatedAt = now;
      await ctx.db.patch(existing._id, patch);
    }
    return existing._id;
  }

  return await ctx.db.insert("rosterRequirementTypes", {
    projectId,
    userId,
    name: template.requirementName,
    category: template.category,
    defaultRecurrenceDays: template.defaultRecurrenceDays,
    defaultGraceDays: 0,
    dueDateStrategy: template.dueDateStrategy,
    defaultIntervalValue: template.defaultIntervalValue,
    defaultIntervalUnit: template.defaultIntervalUnit,
    defaultCalendarMonths: template.dueDateCalendarMonths,
    promptSchema: template.promptSchema,
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

    const reqRow = await ctx.db.get(requirementTypeId);
    if (!reqRow) continue;

    const slice = requirementRowToSlice(reqRow);
    const { dueDate, warnings } = computeAssignmentDueDate({
      requirement: slice,
      assignedDate: todayIso,
      lastCompletedDate: undefined,
      evidence: {},
      todayIso,
    });
    const missing = listMissingPromptAnswers(reqRow.promptSchema, {});
    const needsReview = missing.length > 0 || warnings.length > 0;

    await ctx.db.insert("rosterAssignments", {
      projectId,
      userId,
      personId,
      requirementTypeId,
      assignedDate: todayIso,
      dueDate,
      recurrenceDaysOverride:
        template.dueDateStrategy === "fixed_days" ? template.defaultRecurrenceDays : undefined,
      recurrenceIntervalValueOverride:
        template.dueDateStrategy === "fixed_interval" ? template.defaultIntervalValue : undefined,
      recurrenceIntervalUnitOverride:
        template.dueDateStrategy === "fixed_interval" ? template.defaultIntervalUnit : undefined,
      graceDaysOverride: 0,
      notes: template.assignmentNotes,
      needsRuleMigrationReview: needsReview || undefined,
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
    dueDateStrategy: v.optional(rosterDueDateStrategyValidator),
    defaultIntervalValue: v.optional(v.number()),
    defaultIntervalUnit: v.optional(rosterIntervalUnitValidator),
    defaultCalendarMonths: v.optional(v.number()),
    promptSchema: v.optional(v.array(rosterPromptFieldArg)),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    let dueDateStrategy = args.dueDateStrategy;
    let defaultIntervalValue = args.defaultIntervalValue;
    let defaultIntervalUnit = args.defaultIntervalUnit;
    if (!dueDateStrategy && args.defaultRecurrenceDays && args.defaultRecurrenceDays > 0) {
      dueDateStrategy = "fixed_days";
    }
    if (!dueDateStrategy) {
      dueDateStrategy = "fixed_days";
    }
    if (
      dueDateStrategy === "fixed_days" &&
      defaultIntervalValue == null &&
      args.defaultRecurrenceDays != null &&
      args.defaultRecurrenceDays > 0
    ) {
      defaultIntervalValue = args.defaultRecurrenceDays;
      defaultIntervalUnit = "days";
    }
    const requirementId = await ctx.db.insert("rosterRequirementTypes", {
      projectId: args.projectId,
      userId,
      name: args.name.trim(),
      category: args.category?.trim(),
      description: args.description?.trim(),
      defaultRecurrenceDays: args.defaultRecurrenceDays,
      defaultGraceDays: args.defaultGraceDays,
      dueDateStrategy,
      defaultIntervalValue,
      defaultIntervalUnit,
      defaultCalendarMonths: args.defaultCalendarMonths,
      promptSchema: args.promptSchema,
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
    dueDateStrategy: v.optional(rosterDueDateStrategyValidator),
    defaultIntervalValue: v.optional(v.number()),
    defaultIntervalUnit: v.optional(rosterIntervalUnitValidator),
    defaultCalendarMonths: v.optional(v.number()),
    promptSchema: v.optional(v.array(rosterPromptFieldArg)),
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
    if (args.dueDateStrategy !== undefined) patch.dueDateStrategy = args.dueDateStrategy;
    if (args.defaultIntervalValue !== undefined) patch.defaultIntervalValue = args.defaultIntervalValue;
    if (args.defaultIntervalUnit !== undefined) patch.defaultIntervalUnit = args.defaultIntervalUnit;
    if (args.defaultCalendarMonths !== undefined) patch.defaultCalendarMonths = args.defaultCalendarMonths;
    if (args.promptSchema !== undefined) patch.promptSchema = args.promptSchema;
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

async function assertValidReportsTo(
  ctx: any,
  projectId: any,
  personId: any,
  reportsToPersonId: any | undefined,
) {
  if (!reportsToPersonId) return;
  if (reportsToPersonId === personId) {
    throw new Error("A person cannot report to themselves");
  }
  const manager = await ctx.db.get(reportsToPersonId);
  if (!manager || manager.projectId !== projectId) {
    throw new Error("Manager not found in this project");
  }
  let current: any | undefined = manager;
  const visited = new Set<string>();
  while (current) {
    if (current._id === personId) {
      throw new Error("This reporting line would create a cycle in the org chart");
    }
    const key = String(current._id);
    if (visited.has(key)) break;
    visited.add(key);
    if (!current.reportsToPersonId) break;
    current = await ctx.db.get(current.reportsToPersonId);
  }
}

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
    department: v.optional(v.string()),
    managementLevel: v.optional(v.string()),
    cardColor: v.optional(v.string()),
    reportsToPersonId: v.optional(v.id("rosterPersonnel")),
    employeeId: v.optional(v.string()),
    certificateNumber: v.optional(v.string()),
    capabilities: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const capabilities = (args.capabilities ?? []).map((c) => c.trim()).filter(Boolean);
    const department = args.department?.trim() || undefined;
    const managementLevel = args.managementLevel?.trim() || undefined;
    const cardColor = args.cardColor?.trim() ? assertValidCardColor(args.cardColor) : undefined;
    if (args.reportsToPersonId) {
      await assertValidReportsTo(ctx, args.projectId, null, args.reportsToPersonId);
    }
    const personId = await ctx.db.insert("rosterPersonnel", {
      projectId: args.projectId,
      userId,
      fullName: args.fullName.trim(),
      roleTitle: args.roleTitle?.trim(),
      jobDescription: args.jobDescription?.trim(),
      department,
      managementLevel,
      cardColor,
      reportsToPersonId: args.reportsToPersonId,
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
    await assignInitialOrgChartLayout(ctx, args.projectId, personId, args.reportsToPersonId);
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
    department: v.optional(v.string()),
    managementLevel: v.optional(v.string()),
    cardColor: v.optional(v.union(v.string(), v.null())),
    reportsToPersonId: v.optional(v.union(v.id("rosterPersonnel"), v.null())),
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
    let nextManagerId: Id<"rosterPersonnel"> | undefined;
    if (args.fullName !== undefined) patch.fullName = args.fullName.trim();
    if (args.roleTitle !== undefined) patch.roleTitle = args.roleTitle.trim();
    if (args.jobDescription !== undefined) patch.jobDescription = args.jobDescription.trim();
    if (args.department !== undefined) patch.department = args.department.trim() || undefined;
    if (args.managementLevel !== undefined) patch.managementLevel = args.managementLevel.trim() || undefined;
    if (args.cardColor !== undefined) {
      patch.cardColor = args.cardColor === null ? undefined : assertValidCardColor(args.cardColor);
    }
    if (args.reportsToPersonId !== undefined) {
      nextManagerId = args.reportsToPersonId === null ? undefined : args.reportsToPersonId;
      await assertValidReportsTo(ctx, person.projectId, person._id, nextManagerId);
      patch.reportsToPersonId = nextManagerId;
    }
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
    if (args.reportsToPersonId !== undefined) {
      await assignInitialOrgChartLayout(ctx, person.projectId, person._id, nextManagerId);
    }
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

    const directReports = await ctx.db
      .query("rosterPersonnel")
      .withIndex("by_reportsToPersonId", (q) => q.eq("reportsToPersonId", args.personId))
      .collect();
    const removedAt = new Date().toISOString();
    for (const report of directReports) {
      await ctx.db.patch(report._id, { reportsToPersonId: undefined, updatedAt: removedAt });
    }

    const reportingLines = await ctx.db
      .query("rosterReportingLines")
      .withIndex("by_projectId", (q) => q.eq("projectId", person.projectId))
      .collect();
    for (const line of reportingLines) {
      if (line.subordinatePersonId === args.personId || line.supervisorPersonId === args.personId) {
        await ctx.db.delete(line._id);
      }
    }

    const layouts = await ctx.db
      .query("rosterOrgChartLayouts")
      .withIndex("by_projectId", (q) => q.eq("projectId", person.projectId))
      .collect();
    for (const layout of layouts) {
      if (layout.personId === args.personId) {
        await ctx.db.delete(layout._id);
      }
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
    recurrenceIntervalValueOverride: v.optional(v.number()),
    recurrenceIntervalUnitOverride: v.optional(rosterIntervalUnitValidator),
    graceDaysOverride: v.optional(v.number()),
    notes: v.optional(v.string()),
    evidenceLink: v.optional(v.string()),
    evidence: v.optional(v.record(v.string(), v.string())),
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

    const todayIso = new Date().toISOString().slice(0, 10);
    const computed = computeAssignmentDueDate({
      requirement: requirementRowToSlice(requirement),
      assignedDate: args.assignedDate,
      lastCompletedDate: args.lastCompletedDate,
      evidence: args.evidence,
      recurrenceDaysOverride: args.recurrenceDaysOverride,
      recurrenceIntervalValueOverride: args.recurrenceIntervalValueOverride,
      recurrenceIntervalUnitOverride: args.recurrenceIntervalUnitOverride,
      todayIso,
    });
    const dueDate = args.dueDate ?? computed.dueDate;
    const missing = listMissingPromptAnswers(requirement.promptSchema, args.evidence);
    const needsReview = missing.length > 0 || computed.warnings.length > 0;

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
      recurrenceIntervalValueOverride: args.recurrenceIntervalValueOverride,
      recurrenceIntervalUnitOverride: args.recurrenceIntervalUnitOverride,
      graceDaysOverride: args.graceDaysOverride,
      notes: args.notes?.trim(),
      evidenceLink: args.evidenceLink?.trim(),
      evidence: args.evidence,
      needsRuleMigrationReview: needsReview || undefined,
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
    recurrenceIntervalValueOverride: v.optional(v.number()),
    recurrenceIntervalUnitOverride: v.optional(rosterIntervalUnitValidator),
    graceDaysOverride: v.optional(v.number()),
    notes: v.optional(v.string()),
    evidenceLink: v.optional(v.string()),
    evidence: v.optional(v.record(v.string(), v.string())),
    clearRecurrenceOverrides: v.optional(v.boolean()),
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
    if (args.clearRecurrenceOverrides) {
      patch.recurrenceDaysOverride = undefined;
      patch.recurrenceIntervalValueOverride = undefined;
      patch.recurrenceIntervalUnitOverride = undefined;
    } else {
      if (args.recurrenceDaysOverride !== undefined) patch.recurrenceDaysOverride = args.recurrenceDaysOverride;
      if (args.recurrenceIntervalValueOverride !== undefined) {
        patch.recurrenceIntervalValueOverride = args.recurrenceIntervalValueOverride;
      }
      if (args.recurrenceIntervalUnitOverride !== undefined) {
        patch.recurrenceIntervalUnitOverride = args.recurrenceIntervalUnitOverride;
      }
    }
    if (args.graceDaysOverride !== undefined) patch.graceDaysOverride = args.graceDaysOverride;
    if (args.notes !== undefined) patch.notes = args.notes.trim();
    if (args.evidenceLink !== undefined) patch.evidenceLink = args.evidenceLink.trim();
    if (args.evidence !== undefined) patch.evidence = args.evidence;

    const mergedAssigned =
      args.assignedDate !== undefined ? args.assignedDate : assignment.assignedDate;
    const mergedLast =
      args.lastCompletedDate !== undefined ? args.lastCompletedDate : assignment.lastCompletedDate;
    const mergedEvidence =
      args.evidence !== undefined ? args.evidence : assignment.evidence;
    const mergedRecurrenceDays =
      args.clearRecurrenceOverrides === true
        ? undefined
        : args.recurrenceDaysOverride !== undefined
          ? args.recurrenceDaysOverride
          : assignment.recurrenceDaysOverride;
    const mergedIntervalValue =
      args.clearRecurrenceOverrides === true
        ? undefined
        : args.recurrenceIntervalValueOverride !== undefined
          ? args.recurrenceIntervalValueOverride
          : assignment.recurrenceIntervalValueOverride;
    const mergedIntervalUnit =
      args.clearRecurrenceOverrides === true
        ? undefined
        : args.recurrenceIntervalUnitOverride !== undefined
          ? args.recurrenceIntervalUnitOverride
          : assignment.recurrenceIntervalUnitOverride;

    if (args.dueDate !== undefined) {
      patch.dueDate = args.dueDate;
    } else if (
      args.lastCompletedDate !== undefined ||
      args.assignedDate !== undefined ||
      args.evidence !== undefined ||
      args.recurrenceDaysOverride !== undefined ||
      args.recurrenceIntervalValueOverride !== undefined ||
      args.recurrenceIntervalUnitOverride !== undefined ||
      args.clearRecurrenceOverrides === true
    ) {
      const todayIso = new Date().toISOString().slice(0, 10);
      const { dueDate: computed, warnings } = computeAssignmentDueDate({
        requirement: requirementRowToSlice(requirement),
        assignedDate: mergedAssigned,
        lastCompletedDate: mergedLast,
        evidence: mergedEvidence ?? undefined,
        recurrenceDaysOverride: mergedRecurrenceDays ?? undefined,
        recurrenceIntervalValueOverride: mergedIntervalValue ?? undefined,
        recurrenceIntervalUnitOverride: mergedIntervalUnit ?? undefined,
        todayIso,
      });
      if (computed !== undefined) patch.dueDate = computed;
      const missing = listMissingPromptAnswers(requirement.promptSchema, mergedEvidence ?? undefined);
      patch.needsRuleMigrationReview =
        missing.length > 0 || warnings.length > 0 ? true : undefined;
    }

    await ctx.db.patch(args.assignmentId, patch);
    await ctx.db.patch(assignment.projectId, { updatedAt: new Date().toISOString() });
    return args.assignmentId;
  },
});

export const migrateRosterQualificationRulesForProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const todayIso = now.slice(0, 10);
    let requirementsUpdated = 0;

    const reqs = await ctx.db
      .query("rosterRequirementTypes")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const r of reqs) {
      const patch: Record<string, unknown> = {};
      if (!r.dueDateStrategy) {
        patch.dueDateStrategy =
          r.defaultRecurrenceDays && r.defaultRecurrenceDays > 0 ? "fixed_days" : "fixed_days";
        if (
          r.defaultIntervalValue == null &&
          r.defaultRecurrenceDays != null &&
          r.defaultRecurrenceDays > 0
        ) {
          patch.defaultIntervalValue = r.defaultRecurrenceDays;
          patch.defaultIntervalUnit = "days";
        }
      }
      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await ctx.db.patch(r._id, patch);
        requirementsUpdated++;
      }
    }

    const reqsFresh = await ctx.db
      .query("rosterRequirementTypes")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const reqById = new Map(reqsFresh.map((x) => [x._id, x]));

    const assigns = await ctx.db
      .query("rosterAssignments")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();

    let assignmentsUpdated = 0;
    for (const a of assigns) {
      const req = reqById.get(a.requirementTypeId);
      if (!req) continue;
      const { dueDate, warnings } = computeAssignmentDueDate({
        requirement: requirementRowToSlice(req),
        assignedDate: a.assignedDate,
        lastCompletedDate: a.lastCompletedDate,
        evidence: a.evidence,
        recurrenceDaysOverride: a.recurrenceDaysOverride,
        recurrenceIntervalValueOverride: a.recurrenceIntervalValueOverride,
        recurrenceIntervalUnitOverride: a.recurrenceIntervalUnitOverride,
        todayIso,
      });
      const missing = listMissingPromptAnswers(req.promptSchema, a.evidence);
      const patch: Record<string, unknown> = { updatedAt: now };
      if (dueDate !== undefined) patch.dueDate = dueDate;
      patch.needsRuleMigrationReview =
        missing.length > 0 || warnings.length > 0 ? true : undefined;
      await ctx.db.patch(a._id, patch);
      assignmentsUpdated++;
    }

    return { requirementsUpdated, assignmentsUpdated };
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

export const listDepartments = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const rows = await ctx.db
      .query("rosterDepartments")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const addDepartment = mutation({
  args: {
    projectId: v.id("projects"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const name = args.name.trim();
    if (!name) throw new Error("Department name is required");

    const existing = await ctx.db
      .query("rosterDepartments")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const duplicate = existing.find((row) => row.name.trim().toLowerCase() === name.toLowerCase());
    if (duplicate) throw new Error("This department already exists");

    const now = new Date().toISOString();
    const departmentId = await ctx.db.insert("rosterDepartments", {
      projectId: args.projectId,
      userId,
      name,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return departmentId;
  },
});

export const removeDepartment = mutation({
  args: { departmentId: v.id("rosterDepartments") },
  handler: async (ctx, args) => {
    const department = await ctx.db.get(args.departmentId);
    if (!department) throw new Error("Department not found");
    await requireProjectOwner(ctx, department.projectId);

    const personnel = await ctx.db
      .query("rosterPersonnel")
      .withIndex("by_projectId", (q) => q.eq("projectId", department.projectId))
      .collect();
    const inUse = personnel.some(
      (person) => person.department?.trim().toLowerCase() === department.name.trim().toLowerCase(),
    );
    if (inUse) {
      throw new Error("Reassign or clear team members in this department before deleting it");
    }

    await ctx.db.delete(args.departmentId);
    await ctx.db.patch(department.projectId, { updatedAt: new Date().toISOString() });
  },
});

export const listReportingLines = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("rosterReportingLines")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
  },
});

export const listOrgChartLayouts = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("rosterOrgChartLayouts")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
  },
});

export const listOrgPrimaryRoutes = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("rosterOrgPrimaryRoutes")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
  },
});

export const addFunctionalReportingLine = mutation({
  args: {
    projectId: v.id("projects"),
    subordinatePersonId: v.id("rosterPersonnel"),
    supervisorPersonId: v.id("rosterPersonnel"),
    contextLabel: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);

    if (args.subordinatePersonId === args.supervisorPersonId) {
      throw new Error("A person cannot report to themselves");
    }

    const [subordinate, supervisor] = await Promise.all([
      ctx.db.get(args.subordinatePersonId),
      ctx.db.get(args.supervisorPersonId),
    ]);
    if (!subordinate || subordinate.projectId !== args.projectId) {
      throw new Error("Team member not found in this project");
    }
    if (!supervisor || supervisor.projectId !== args.projectId) {
      throw new Error("Supervisor not found in this project");
    }
    if (subordinate.reportsToPersonId === args.supervisorPersonId) {
      throw new Error("This person is already set as the primary manager");
    }

    const contextLabel =
      args.contextLabel?.trim() ||
      supervisor.roleTitle?.trim() ||
      supervisor.fullName ||
      "Additional supervisor";

    const existing = await ctx.db
      .query("rosterReportingLines")
      .withIndex("by_subordinatePersonId", (q) => q.eq("subordinatePersonId", args.subordinatePersonId))
      .collect();
    const duplicate = existing.find(
      (line) =>
        line.projectId === args.projectId && line.supervisorPersonId === args.supervisorPersonId,
    );
    if (duplicate) {
      throw new Error("This person already reports to that supervisor");
    }

    const now = new Date().toISOString();
    const lineId = await ctx.db.insert("rosterReportingLines", {
      projectId: args.projectId,
      userId,
      subordinatePersonId: args.subordinatePersonId,
      supervisorPersonId: args.supervisorPersonId,
      lineKind: "functional",
      contextLabel,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return lineId;
  },
});

export const removeReportingLine = mutation({
  args: { reportingLineId: v.id("rosterReportingLines") },
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.reportingLineId);
    if (!line) throw new Error("Reporting line not found");
    await requireProjectOwner(ctx, line.projectId);
    await ctx.db.delete(args.reportingLineId);
    await ctx.db.patch(line.projectId, { updatedAt: new Date().toISOString() });
  },
});

export const updateFunctionalReportingLinePath = mutation({
  args: {
    reportingLineId: v.id("rosterReportingLines"),
    waypoints: v.array(v.object({ x: v.number(), y: v.number() })),
  },
  handler: async (ctx, args) => {
    const line = await ctx.db.get(args.reportingLineId);
    if (!line) throw new Error("Reporting line not found");
    await requireProjectOwner(ctx, line.projectId);

    const now = new Date().toISOString();
    await ctx.db.patch(args.reportingLineId, {
      waypoints: args.waypoints.length > 0 ? args.waypoints : undefined,
      // Drop the legacy single control point once multi-point routing is set.
      pathControlX: undefined,
      pathControlY: undefined,
      updatedAt: now,
    });
    await ctx.db.patch(line.projectId, { updatedAt: now });
  },
});

export const upsertOrgChartLayout = mutation({
  args: {
    projectId: v.id("projects"),
    personId: v.id("rosterPersonnel"),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const person = await ctx.db.get(args.personId);
    if (!person || person.projectId !== args.projectId) {
      throw new Error("Team member not found in this project");
    }

    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("rosterOrgChartLayouts")
      .withIndex("by_projectId_personId", (q) =>
        q.eq("projectId", args.projectId).eq("personId", args.personId),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { x: args.x, y: args.y, updatedAt: now });
      return existing._id;
    }

    return await ctx.db.insert("rosterOrgChartLayouts", {
      projectId: args.projectId,
      personId: args.personId,
      x: args.x,
      y: args.y,
      updatedAt: now,
    });
  },
});

export const upsertOrgPrimaryRoute = mutation({
  args: {
    projectId: v.id("projects"),
    childPersonId: v.id("rosterPersonnel"),
    waypoints: v.array(v.object({ x: v.number(), y: v.number() })),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const child = await ctx.db.get(args.childPersonId);
    if (!child || child.projectId !== args.projectId) {
      throw new Error("Team member not found in this project");
    }

    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("rosterOrgPrimaryRoutes")
      .withIndex("by_projectId_childPersonId", (q) =>
        q.eq("projectId", args.projectId).eq("childPersonId", args.childPersonId),
      )
      .unique();

    // No waypoints means "back to default routing" — drop any saved row.
    if (args.waypoints.length === 0) {
      if (existing) await ctx.db.delete(existing._id);
      await ctx.db.patch(args.projectId, { updatedAt: now });
      return existing?._id ?? null;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        waypoints: args.waypoints,
        pathControlX: undefined,
        pathControlY: undefined,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("rosterOrgPrimaryRoutes", {
      projectId: args.projectId,
      childPersonId: args.childPersonId,
      waypoints: args.waypoints,
      updatedAt: now,
    });
  },
});

export const resetOrgChartLayouts = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const layouts = await ctx.db
      .query("rosterOrgChartLayouts")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const layout of layouts) {
      await ctx.db.delete(layout._id);
    }
    const reportingLines = await ctx.db
      .query("rosterReportingLines")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const now = new Date().toISOString();
    for (const line of reportingLines) {
      if (
        line.pathControlX === undefined &&
        line.pathControlY === undefined &&
        line.waypoints === undefined
      ) {
        continue;
      }
      await ctx.db.patch(line._id, {
        pathControlX: undefined,
        pathControlY: undefined,
        waypoints: undefined,
        updatedAt: now,
      });
    }
    const primaryRoutes = await ctx.db
      .query("rosterOrgPrimaryRoutes")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    for (const route of primaryRoutes) {
      await ctx.db.delete(route._id);
    }
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return { removed: layouts.length };
  },
});

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

function assertValidCardColor(color: string): string {
  const trimmed = color.trim();
  if (!HEX_COLOR.test(trimmed)) {
    throw new Error("Color must be a hex value like #3b82f6");
  }
  return trimmed;
}

function normalizeMatchText(value: string): string {
  return value.trim().toLowerCase();
}

function personMatchesBulkFilter(
  person: { roleTitle?: string; managementLevel?: string },
  matchKind: "managementLevel" | "roleTitle",
  matchValue: string,
  matchMode: "exact" | "contains" = "exact",
): boolean {
  const source = matchKind === "managementLevel" ? person.managementLevel : person.roleTitle;
  const haystack = source?.trim();
  if (!haystack) return false;
  const needle = matchValue.trim();
  if (!needle) return false;
  if (matchMode === "contains") {
    return normalizeMatchText(haystack).includes(normalizeMatchText(needle));
  }
  return normalizeMatchText(haystack) === normalizeMatchText(needle);
}

export const setPersonCardColor = mutation({
  args: {
    personId: v.id("rosterPersonnel"),
    cardColor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const person = await ctx.db.get(args.personId);
    if (!person) throw new Error("Person not found");
    await requireProjectOwner(ctx, person.projectId);
    const now = new Date().toISOString();
    await ctx.db.patch(args.personId, {
      cardColor: args.cardColor === null ? undefined : assertValidCardColor(args.cardColor),
      updatedAt: now,
    });
    await ctx.db.patch(person.projectId, { updatedAt: now });
  },
});

export const setBulkPersonCardColors = mutation({
  args: {
    projectId: v.id("projects"),
    matchKind: v.union(v.literal("managementLevel"), v.literal("roleTitle")),
    matchValue: v.string(),
    cardColor: v.union(v.string(), v.null()),
    matchMode: v.optional(v.union(v.literal("exact"), v.literal("contains"))),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const matchValue = args.matchValue.trim();
    if (!matchValue) throw new Error("Match value is required");
    const cardColor = args.cardColor === null ? undefined : assertValidCardColor(args.cardColor);
    const matchMode = args.matchMode ?? "exact";
    const personnel = await ctx.db
      .query("rosterPersonnel")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const now = new Date().toISOString();
    let updated = 0;
    for (const person of personnel) {
      if (!personMatchesBulkFilter(person, args.matchKind, matchValue, matchMode)) continue;
      await ctx.db.patch(person._id, { cardColor, updatedAt: now });
      updated += 1;
    }
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return { updated };
  },
});

export const listCardColorRules = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const rows = await ctx.db
      .query("rosterCardColorRules")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
});

export const addCardColorRule = mutation({
  args: {
    projectId: v.id("projects"),
    matchKind: v.union(
      v.literal("roleTitle"),
      v.literal("managementLevel"),
      v.literal("orgDepth"),
    ),
    matchValue: v.string(),
    matchMode: v.optional(v.union(v.literal("exact"), v.literal("contains"))),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const matchValue = args.matchValue.trim();
    if (!matchValue) throw new Error("Match value is required");
    if (args.matchKind === "orgDepth" && !/^\d+$/.test(matchValue)) {
      throw new Error("Org chart level must be a whole number (0 = top level)");
    }
    if (args.matchKind === "orgDepth" && args.matchMode && args.matchMode !== "exact") {
      throw new Error("Org chart level rules only support exact matching");
    }

    const color = assertValidCardColor(args.color);
    const now = new Date().toISOString();
    const ruleId = await ctx.db.insert("rosterCardColorRules", {
      projectId: args.projectId,
      userId,
      matchKind: args.matchKind,
      matchValue,
      matchMode: args.matchKind === "orgDepth" ? undefined : args.matchMode ?? "exact",
      color,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return ruleId;
  },
});

export const updateCardColorRule = mutation({
  args: {
    ruleId: v.id("rosterCardColorRules"),
    matchValue: v.optional(v.string()),
    matchMode: v.optional(v.union(v.literal("exact"), v.literal("contains"))),
    color: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.ruleId);
    if (!rule) throw new Error("Color rule not found");
    await requireProjectOwner(ctx, rule.projectId);

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (args.matchValue !== undefined) {
      const matchValue = args.matchValue.trim();
      if (!matchValue) throw new Error("Match value is required");
      if (rule.matchKind === "orgDepth" && !/^\d+$/.test(matchValue)) {
        throw new Error("Org chart level must be a whole number (0 = top level)");
      }
      patch.matchValue = matchValue;
    }
    if (args.matchMode !== undefined) {
      if (rule.matchKind === "orgDepth") {
        throw new Error("Org chart level rules only support exact matching");
      }
      patch.matchMode = args.matchMode;
    }
    if (args.color !== undefined) {
      patch.color = assertValidCardColor(args.color);
    }
    await ctx.db.patch(args.ruleId, patch);
    await ctx.db.patch(rule.projectId, { updatedAt: new Date().toISOString() });
  },
});

export const removeCardColorRule = mutation({
  args: { ruleId: v.id("rosterCardColorRules") },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get(args.ruleId);
    if (!rule) throw new Error("Color rule not found");
    await requireProjectOwner(ctx, rule.projectId);
    await ctx.db.delete(args.ruleId);
    await ctx.db.patch(rule.projectId, { updatedAt: new Date().toISOString() });
  },
});

