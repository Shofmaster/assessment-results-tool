import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAerogapEmployee,
  requireCompanyRole,
  requireProjectAccess,
  requireProjectOwner,
} from "./_helpers";

const profileFieldArgs = {
  companyName: v.optional(v.string()),
  legalEntityName: v.optional(v.string()),
  primaryLocation: v.optional(v.string()),
  contactName: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
  repairStationType: v.optional(v.string()),
  facilitySquareFootage: v.optional(v.number()),
  employeeCount: v.optional(v.number()),
  operationsScope: v.optional(v.string()),
  certifications: v.optional(v.array(v.string())),
  aircraftCategories: v.optional(v.array(v.string())),
  servicesOffered: v.optional(v.array(v.string())),
  hasSms: v.optional(v.boolean()),
  smsMaturity: v.optional(v.string()),
} as const;

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return undefined;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseHasSms(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "true"].includes(normalized)) return true;
  if (["no", "n", "false"].includes(normalized)) return false;
  return undefined;
}

type ProfilePatchInput = {
  companyName?: string;
  legalEntityName?: string;
  primaryLocation?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  repairStationType?: string;
  facilitySquareFootage?: number;
  employeeCount?: number;
  operationsScope?: string;
  certifications?: string[];
  aircraftCategories?: string[];
  servicesOffered?: string[];
  hasSms?: boolean;
  smsMaturity?: string;
};

function buildPatch(args: ProfilePatchInput, now: string) {
  return {
    companyName: args.companyName,
    legalEntityName: args.legalEntityName,
    primaryLocation: args.primaryLocation,
    contactName: args.contactName,
    contactEmail: args.contactEmail,
    contactPhone: args.contactPhone,
    repairStationType: args.repairStationType,
    facilitySquareFootage: args.facilitySquareFootage,
    employeeCount: args.employeeCount,
    operationsScope: args.operationsScope,
    certifications: args.certifications,
    aircraftCategories: args.aircraftCategories,
    servicesOffered: args.servicesOffered,
    hasSms: args.hasSms,
    smsMaturity: args.smsMaturity,
    lastSyncedAt: now,
    updatedAt: now,
  };
}

export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (!project) return null;
    if (project.companyId) {
      return await ctx.db
        .query("entityProfiles")
        .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId!))
        .unique();
    }
    return await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .unique();
  },
});

export const getByCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin", "company_manager"]);
    return await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    projectId: v.id("projects"),
    ...profileFieldArgs,
  },
  handler: async (ctx, args) => {
    const { projectId, ...fields } = args;
    const userId = await requireProjectOwner(ctx, projectId);
    const project = await ctx.db.get(projectId);
    if (!project) throw new Error("Project not found");
    const now = new Date().toISOString();
    const patch = buildPatch(fields, now);

    if (project.companyId) {
      const existing = await ctx.db
        .query("entityProfiles")
        .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId!))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, patch);
        await ctx.db.patch(projectId, { updatedAt: now });
        return existing._id;
      }
      const profileId = await ctx.db.insert("entityProfiles", {
        companyId: project.companyId,
        userId,
        ...patch,
        createdAt: now,
      });
      await ctx.db.patch(projectId, { updatedAt: now });
      return profileId;
    }

    const existing = await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", projectId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      await ctx.db.patch(projectId, { updatedAt: now });
      return existing._id;
    }
    const profileId = await ctx.db.insert("entityProfiles", {
      projectId,
      userId,
      ...patch,
      createdAt: now,
    });
    await ctx.db.patch(projectId, { updatedAt: now });
    return profileId;
  },
});

export const upsertByCompany = mutation({
  args: {
    companyId: v.id("companies"),
    ...profileFieldArgs,
  },
  handler: async (ctx, args) => {
    const { companyId, ...fields } = args;
    const userId = await requireCompanyRole(ctx, companyId, ["company_admin", "company_manager"]);
    const now = new Date().toISOString();
    const patch = buildPatch(fields, now);
    const existing = await ctx.db
      .query("entityProfiles")
      .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return await ctx.db.insert("entityProfiles", {
      companyId,
      userId,
      ...patch,
      createdAt: now,
    });
  },
});

export const importFromAssessment = mutation({
  args: {
    projectId: v.id("projects"),
    assessmentId: v.id("assessments"),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const project = await ctx.db.get(args.projectId);
    if (!project) throw new Error("Project not found");
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.projectId !== args.projectId) {
      throw new Error("Assessment not found for this project");
    }
    const data = (assessment.data ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const mapped = {
      companyName: typeof data.companyName === "string" ? data.companyName : undefined,
      legalEntityName: typeof data.companyName === "string" ? data.companyName : undefined,
      primaryLocation: typeof data.location === "string" ? data.location : undefined,
      contactName: typeof data.contactName === "string" ? data.contactName : undefined,
      contactEmail: typeof data.contactEmail === "string" ? data.contactEmail : undefined,
      contactPhone: typeof data.contactPhone === "string" ? data.contactPhone : undefined,
      repairStationType: typeof data.operationsScope === "string" ? data.operationsScope : undefined,
      facilitySquareFootage: toNumber(data.facilitySquareFootage),
      employeeCount: toNumber(data.employeeCount),
      operationsScope: typeof data.operationsScope === "string" ? data.operationsScope : undefined,
      certifications: Array.isArray(data.certifications)
        ? data.certifications.filter((x): x is string => typeof x === "string")
        : undefined,
      aircraftCategories: Array.isArray(data.aircraftCategories)
        ? data.aircraftCategories.filter((x): x is string => typeof x === "string")
        : undefined,
      servicesOffered: Array.isArray(data.servicesOffered)
        ? data.servicesOffered.filter((x): x is string => typeof x === "string")
        : undefined,
      hasSms: parseHasSms(data.hasSMS),
      smsMaturity: typeof data.smsMaturity === "string" ? data.smsMaturity : undefined,
      sourceAssessmentId: args.assessmentId,
      importedFromAssessmentAt: now,
      lastSyncedAt: now,
      updatedAt: now,
    };

    if (project.companyId) {
      const existing = await ctx.db
        .query("entityProfiles")
        .withIndex("by_companyId", (q) => q.eq("companyId", project.companyId!))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, mapped);
        await ctx.db.patch(args.projectId, { updatedAt: now });
        return existing._id;
      }
      const profileId = await ctx.db.insert("entityProfiles", {
        companyId: project.companyId,
        userId,
        ...mapped,
        createdAt: now,
      });
      await ctx.db.patch(args.projectId, { updatedAt: now });
      return profileId;
    }

    const existing = await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, mapped);
      await ctx.db.patch(args.projectId, { updatedAt: now });
      return existing._id;
    }

    const profileId = await ctx.db.insert("entityProfiles", {
      projectId: args.projectId,
      userId,
      ...mapped,
      createdAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return profileId;
  },
});

/** Fill empty/missing on `target` from `source` for known profile columns only. */
function mergeEntityProfileSnapshots(target: Record<string, unknown>, source: Record<string, unknown>) {
  const strKeys = [
    "companyName",
    "legalEntityName",
    "primaryLocation",
    "contactName",
    "contactEmail",
    "contactPhone",
    "repairStationType",
    "operationsScope",
    "smsMaturity",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const k of strKeys) {
    const t = target[k];
    const s = source[k];
    if (typeof s !== "string" || s.trim() === "") continue;
    if (t === undefined || t === null || (typeof t === "string" && t.trim() === "")) {
      patch[k] = s;
    }
  }
  const numKeys = ["facilitySquareFootage", "employeeCount"] as const;
  for (const k of numKeys) {
    const t = target[k];
    const s = source[k];
    if (typeof s !== "number" || !Number.isFinite(s)) continue;
    if (t === undefined || t === null) patch[k] = s;
  }
  const arrKeys = ["certifications", "aircraftCategories", "servicesOffered"] as const;
  for (const k of arrKeys) {
    const t = target[k] as unknown[] | undefined;
    const s = source[k] as unknown[] | undefined;
    if (!Array.isArray(s) || s.length === 0) continue;
    if (!Array.isArray(t) || t.length === 0) patch[k] = s;
  }
  if (target.hasSms === undefined && source.hasSms !== undefined) patch.hasSms = source.hasSms;
  if (
    (target.sourceAssessmentId === undefined || target.sourceAssessmentId === null) &&
    source.sourceAssessmentId
  ) {
    patch.sourceAssessmentId = source.sourceAssessmentId;
  }
  if (
    (target.importedFromAssessmentAt === undefined || target.importedFromAssessmentAt === null) &&
    typeof source.importedFromAssessmentAt === "string"
  ) {
    patch.importedFromAssessmentAt = source.importedFromAssessmentAt;
  }
  return patch;
}

/**
 * One-time style migration: project-scoped rows for tenant projects become company-scoped.
 * AeroGap staff only. Safe to run multiple times.
 */
export const backfillCompanyProfilesFromProjectProfiles = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAerogapEmployee(ctx);
    const all = await ctx.db.query("entityProfiles").collect();
    let migrated = 0;
    let merged = 0;
    let skipped = 0;

    for (const row of all) {
      const projectId = row.projectId;
      if (!projectId) {
        skipped++;
        continue;
      }
      const project = await ctx.db.get(projectId);
      if (!project?.companyId) {
        skipped++;
        continue;
      }
      const companyId = project.companyId;

      const companyRow = await ctx.db
        .query("entityProfiles")
        .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
        .unique();

      if (!companyRow) {
        await ctx.db.patch(row._id, {
          projectId: undefined,
          companyId,
          updatedAt: new Date().toISOString(),
        });
        migrated++;
        continue;
      }

      const fill = mergeEntityProfileSnapshots(
        companyRow as unknown as Record<string, unknown>,
        row as unknown as Record<string, unknown>,
      );
      if (Object.keys(fill).length > 0) {
        await ctx.db.patch(companyRow._id, {
          ...fill,
          updatedAt: new Date().toISOString(),
        });
      }
      await ctx.db.delete(row._id);
      merged++;
    }

    return { migrated, merged, skipped, total: all.length };
  },
});
