import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

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

export const getByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    return await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    projectId: v.id("projects"),
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
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .unique();
    const patch = {
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
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      await ctx.db.patch(args.projectId, { updatedAt: now });
      return existing._id;
    }
    const profileId = await ctx.db.insert("entityProfiles", {
      projectId: args.projectId,
      userId,
      ...patch,
      createdAt: now,
    });
    await ctx.db.patch(args.projectId, { updatedAt: now });
    return profileId;
  },
});

export const importFromAssessment = mutation({
  args: {
    projectId: v.id("projects"),
    assessmentId: v.id("assessments"),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    const assessment = await ctx.db.get(args.assessmentId);
    if (!assessment || assessment.projectId !== args.projectId) {
      throw new Error("Assessment not found for this project");
    }
    const data = (assessment.data ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    const existing = await ctx.db
      .query("entityProfiles")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .unique();

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
      certifications: Array.isArray(data.certifications) ? data.certifications.filter((x): x is string => typeof x === "string") : undefined,
      aircraftCategories: Array.isArray(data.aircraftCategories) ? data.aircraftCategories.filter((x): x is string => typeof x === "string") : undefined,
      servicesOffered: Array.isArray(data.servicesOffered) ? data.servicesOffered.filter((x): x is string => typeof x === "string") : undefined,
      hasSms: parseHasSms(data.hasSMS),
      smsMaturity: typeof data.smsMaturity === "string" ? data.smsMaturity : undefined,
      sourceAssessmentId: args.assessmentId,
      importedFromAssessmentAt: now,
      lastSyncedAt: now,
      updatedAt: now,
    };

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
