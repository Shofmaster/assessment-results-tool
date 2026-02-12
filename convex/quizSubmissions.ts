import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin } from "./_helpers";

/**
 * Public mutation — no authentication required.
 * Called from the free quiz flow to persist a lead + quiz answers.
 */
export const submit = mutation({
  args: {
    email: v.string(),
    companyName: v.string(),
    contactName: v.string(),
    phone: v.string(),
    consentToContact: v.boolean(),
    quizAnswers: v.any(),
    flaggedAreas: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("quizSubmissions", {
      email: args.email,
      companyName: args.companyName,
      contactName: args.contactName,
      phone: args.phone,
      consentToContact: args.consentToContact,
      quizAnswers: args.quizAnswers,
      flaggedAreas: args.flaggedAreas,
      createdAt: new Date().toISOString(),
    });
  },
});

/**
 * Mark that a quiz lead requested the full review (upsell CTA).
 */
export const requestFullReview = mutation({
  args: {
    submissionId: v.id("quizSubmissions"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.submissionId, {
      requestedFullReview: true,
    });
  },
});

/**
 * Admin-only: list all quiz submissions (most recent first).
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("quizSubmissions")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
  },
});
