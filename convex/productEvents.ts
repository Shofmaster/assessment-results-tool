import { mutation } from "./_generated/server";
import { v } from "convex/values";

export const logProductEvent = mutation({
  args: {
    eventType: v.string(),
    projectId: v.optional(v.id("projects")),
    properties: v.optional(v.string()), // JSON string
    anonymousId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = ctx.auth ? await ctx.auth.getUserIdentity() : null;
    const actorId = identity?.subject ?? args.anonymousId ?? "anonymous";
    const now = new Date().toISOString();

    // De-dupe "first_run_complete" so each user gets exactly one event.
    if (args.eventType === "first_run_complete") {
      const existing = await ctx.db
        .query("productEvents")
        .withIndex("by_actorId_eventType", (q) =>
          q.eq("actorId", actorId).eq("eventType", args.eventType)
        )
        .take(1);

      if (existing.length > 0) {
        return existing[0]?._id ?? null;
      }
    }

    const inserted = await ctx.db.insert("productEvents", {
      actorId,
      eventType: args.eventType,
      projectId: args.projectId ?? undefined,
      properties: args.properties ?? undefined,
      createdAt: now,
    });

    return inserted;
  },
});

