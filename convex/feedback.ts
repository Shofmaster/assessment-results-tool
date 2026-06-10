import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requirePlatformStaff } from "./_helpers";

const VALID_KINDS = ["bug", "idea", "praise"] as const;
const VALID_STATUSES = ["new", "triaged", "resolved"] as const;
const MAX_MESSAGE_LENGTH = 4000;

/** Any signed-in user can submit feedback / report a problem. */
export const submit = mutation({
  args: {
    kind: v.string(),
    message: v.string(),
    email: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
    projectId: v.optional(v.id("projects")),
    path: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    if (!(VALID_KINDS as readonly string[]).includes(args.kind)) {
      throw new Error("Invalid feedback kind");
    }
    const message = args.message.trim();
    if (!message) {
      throw new Error("Feedback message is required");
    }

    return await ctx.db.insert("userFeedback", {
      userId,
      email: args.email,
      companyId: args.companyId,
      projectId: args.projectId,
      kind: args.kind,
      message: message.slice(0, MAX_MESSAGE_LENGTH),
      path: args.path,
      userAgent: args.userAgent,
      status: "new",
      createdAt: new Date().toISOString(),
    });
  },
});

/** Admin/staff: list submitted feedback, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);
    const all = await ctx.db.query("userFeedback").collect();
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

/** Admin/staff: triage a feedback item. */
export const setStatus = mutation({
  args: {
    feedbackId: v.id("userFeedback"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await requirePlatformStaff(ctx);
    if (!(VALID_STATUSES as readonly string[]).includes(args.status)) {
      throw new Error("Invalid feedback status");
    }
    await ctx.db.patch(args.feedbackId, { status: args.status });
  },
});
