import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireAdmin } from "./_helpers";

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    return ctx.db.query("complianceRules").collect();
  },
});

export const listByPack = query({
  args: { regulatoryPack: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return ctx.db
      .query("complianceRules")
      .withIndex("by_regulatoryPack", (q) => q.eq("regulatoryPack", args.regulatoryPack))
      .collect();
  },
});

export const getByRuleId = query({
  args: { ruleId: v.string() },
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    return ctx.db
      .query("complianceRules")
      .withIndex("by_ruleId", (q) => q.eq("ruleId", args.ruleId))
      .unique();
  },
});

export const upsert = mutation({
  args: {
    ruleId: v.string(),
    cfrPart: v.string(),
    cfrSection: v.string(),
    title: v.string(),
    description: v.string(),
    requiredFields: v.array(v.string()),
    checkType: v.string(),
    severity: v.string(),
    citation: v.string(),
    effectiveDate: v.optional(v.string()),
    supersededDate: v.optional(v.string()),
    regulatoryPack: v.string(),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const existing = await ctx.db
      .query("complianceRules")
      .withIndex("by_ruleId", (q) => q.eq("ruleId", args.ruleId))
      .unique();

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.replace(existing._id, { ...args, createdAt: existing.createdAt });
      return existing._id;
    }
    return ctx.db.insert("complianceRules", { ...args, createdAt: now });
  },
});

export const seedRulePack = mutation({
  args: {
    rules: v.array(
      v.object({
        ruleId: v.string(),
        cfrPart: v.string(),
        cfrSection: v.string(),
        title: v.string(),
        description: v.string(),
        requiredFields: v.array(v.string()),
        checkType: v.string(),
        severity: v.string(),
        citation: v.string(),
        effectiveDate: v.optional(v.string()),
        regulatoryPack: v.string(),
        version: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = new Date().toISOString();
    let seeded = 0;
    for (const rule of args.rules) {
      const existing = await ctx.db
        .query("complianceRules")
        .withIndex("by_ruleId", (q) => q.eq("ruleId", rule.ruleId))
        .unique();
      if (!existing) {
        await ctx.db.insert("complianceRules", { ...rule, createdAt: now });
        seeded++;
      }
    }
    return { seeded, total: args.rules.length };
  },
});

export const seedPart43And91 = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = new Date().toISOString();

    const rules = [
      {
        ruleId: "43.9-a-work-description",
        cfrPart: "43",
        cfrSection: "43.9",
        title: "Work Description Required",
        description: "Each maintenance record entry must contain a description of work performed or reference to acceptable data.",
        requiredFields: ["workPerformed"],
        checkType: "required_field",
        severity: "critical",
        citation: "14 CFR §43.9(a)(1)",
        regulatoryPack: "part43",
        version: 1,
      },
      {
        ruleId: "43.9-a-completion-date",
        cfrPart: "43",
        cfrSection: "43.9",
        title: "Completion Date Required",
        description: "Each maintenance record entry must contain the date of completion of the work performed.",
        requiredFields: ["entryDate"],
        checkType: "required_field",
        severity: "critical",
        citation: "14 CFR §43.9(a)(2)",
        regulatoryPack: "part43",
        version: 1,
      },
      {
        ruleId: "43.9-a-signer-name",
        cfrPart: "43",
        cfrSection: "43.9",
        title: "Person Performing Work Identified",
        description: "The name of the person performing the work must be recorded if other than the person approving return to service.",
        requiredFields: ["signerName"],
        checkType: "required_field",
        severity: "major",
        citation: "14 CFR §43.9(a)(3)",
        regulatoryPack: "part43",
        version: 1,
      },
      {
        ruleId: "43.9-a-rts-signature",
        cfrPart: "43",
        cfrSection: "43.9",
        title: "Return to Service Approval",
        description: "Entry must include the signature, certificate number, and kind of certificate held by the person approving the work for return to service.",
        requiredFields: ["hasReturnToService", "signerCertNumber", "signerCertType"],
        checkType: "signoff_completeness",
        severity: "critical",
        citation: "14 CFR §43.9(a)(4)",
        regulatoryPack: "part43",
        version: 1,
      },
      {
        ruleId: "43.11-a-inspection-record",
        cfrPart: "43",
        cfrSection: "43.11",
        title: "Inspection Record Content",
        description: "Each person performing an inspection required by Part 91 must enter the type, date, aircraft total time, and signer info.",
        requiredFields: ["entryType", "entryDate", "totalTimeAtEntry", "signerName", "signerCertNumber"],
        checkType: "signoff_completeness",
        severity: "critical",
        citation: "14 CFR §43.11(a)",
        regulatoryPack: "part43",
        version: 1,
      },
      {
        ruleId: "91.417-a-work-description",
        cfrPart: "91",
        cfrSection: "91.417",
        title: "Owner/Operator Record: Work Description",
        description: "Maintenance records kept by owner/operator must include a description of work performed.",
        requiredFields: ["workPerformed"],
        checkType: "required_field",
        severity: "critical",
        citation: "14 CFR §91.417(a)(1)(i)",
        regulatoryPack: "part91",
        version: 1,
      },
      {
        ruleId: "91.417-a-completion-date",
        cfrPart: "91",
        cfrSection: "91.417",
        title: "Owner/Operator Record: Completion Date",
        description: "Maintenance records must include the date of completion of the work performed.",
        requiredFields: ["entryDate"],
        checkType: "required_field",
        severity: "critical",
        citation: "14 CFR §91.417(a)(1)(ii)",
        regulatoryPack: "part91",
        version: 1,
      },
      {
        ruleId: "91.417-a-rts-signature",
        cfrPart: "91",
        cfrSection: "91.417",
        title: "Owner/Operator Record: RTS Signature",
        description: "Records must include the signature and certificate number of the person approving the aircraft for return to service.",
        requiredFields: ["hasReturnToService", "signerCertNumber"],
        checkType: "signoff_completeness",
        severity: "critical",
        citation: "14 CFR §91.417(a)(1)(iii)",
        regulatoryPack: "part91",
        version: 1,
      },
      {
        ruleId: "91.417-a2-total-time",
        cfrPart: "91",
        cfrSection: "91.417",
        title: "Total Time in Service",
        description: "Records must include total time in service for the airframe, each engine, and each propeller.",
        requiredFields: ["totalTimeAtEntry"],
        checkType: "record_content",
        severity: "major",
        citation: "14 CFR §91.417(a)(2)(i)",
        regulatoryPack: "part91",
        version: 1,
      },
      {
        ruleId: "91.417-a2-ad-status",
        cfrPart: "91",
        cfrSection: "91.417",
        title: "AD Compliance Status",
        description: "Records must include current status of applicable ADs including method of compliance, AD number, and revision date.",
        requiredFields: ["adSbReferences"],
        checkType: "record_content",
        severity: "critical",
        citation: "14 CFR §91.417(a)(2)(v)",
        regulatoryPack: "part91",
        version: 1,
      },
    ];

    let seeded = 0;
    for (const rule of rules) {
      const existing = await ctx.db
        .query("complianceRules")
        .withIndex("by_ruleId", (q) => q.eq("ruleId", rule.ruleId))
        .unique();
      if (!existing) {
        await ctx.db.insert("complianceRules", { ...rule, createdAt: now });
        seeded++;
      }
    }
    return { seeded, total: rules.length };
  },
});
