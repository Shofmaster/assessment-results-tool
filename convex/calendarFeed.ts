import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireProjectAccess } from "./_helpers";
import { collectDueSources } from "./dueForecast";

/** 128-bit random capability token, hex-encoded. */
function generateToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Return the active feed token for a project, creating one if none exists. */
export const getOrCreateToken = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireProjectAccess(ctx, args.projectId);
    const existing = await ctx.db
      .query("calendarFeedTokens")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const active = existing.find((t) => !t.revokedAt);
    if (active) return { token: active.token, created: false };
    const token = generateToken();
    await ctx.db.insert("calendarFeedTokens", {
      projectId: args.projectId,
      token,
      createdBy: userId,
      createdAt: new Date().toISOString(),
    });
    return { token, created: true };
  },
});

/** Revoke all existing tokens for the project and issue a fresh one. */
export const regenerateToken = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    await requireProjectAccess(ctx, args.projectId);
    const existing = await ctx.db
      .query("calendarFeedTokens")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    const now = new Date().toISOString();
    for (const row of existing) {
      if (!row.revokedAt) await ctx.db.patch(row._id, { revokedAt: now });
    }
    const token = generateToken();
    await ctx.db.insert("calendarFeedTokens", {
      projectId: args.projectId,
      token,
      createdBy: userId,
      createdAt: now,
    });
    return { token };
  },
});

/**
 * Public (unauthenticated) source fetch for the iCal endpoint. Possession of
 * the random 128-bit token IS the authorization; revoked tokens return null.
 * The feed exposes titles, tails, and dates only — no document content.
 */
export const feedSourcesByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{32}$/.test(args.token)) return null;
    const row = await ctx.db
      .query("calendarFeedTokens")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!row || row.revokedAt) return null;
    return await collectDueSources(ctx, row.projectId);
  },
});
