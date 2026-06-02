import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectAccess } from "./_helpers";

const AUTH_TYPES = ["none", "bearer", "basic", "apiKey"] as const;

function assertAuthType(authType: string) {
  if (!(AUTH_TYPES as readonly string[]).includes(authType)) {
    throw new Error(`Invalid auth type: ${authType}`);
  }
}

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectAccess(ctx, args.projectId);
    return await ctx.db
      .query("documentSources")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const getById = query({
  args: { sourceId: v.id("documentSources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return null;
    await requireProjectAccess(ctx, source.projectId);
    return source;
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    label: v.string(),
    baseUrl: v.string(),
    authType: v.string(),
    headerName: v.optional(v.string()),
    basicUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectAccess(ctx, args.projectId);
    assertAuthType(args.authType);
    const baseUrl = args.baseUrl.trim();
    if (!/^https?:\/\//i.test(baseUrl)) {
      throw new Error("Server URL must start with http:// or https://");
    }
    return await ctx.db.insert("documentSources", {
      projectId: args.projectId,
      userId,
      label: args.label.trim() || baseUrl,
      baseUrl,
      authType: args.authType,
      headerName: args.headerName?.trim() || undefined,
      basicUsername: args.basicUsername?.trim() || undefined,
      createdAt: new Date().toISOString(),
    });
  },
});

export const update = mutation({
  args: {
    sourceId: v.id("documentSources"),
    label: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    authType: v.optional(v.string()),
    headerName: v.optional(v.union(v.string(), v.null())),
    basicUsername: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) throw new Error("Document source not found");
    await requireProjectAccess(ctx, source.projectId);
    const patch: Record<string, unknown> = {};
    if (args.label !== undefined) patch.label = args.label.trim() || source.baseUrl;
    if (args.baseUrl !== undefined) {
      const baseUrl = args.baseUrl.trim();
      if (!/^https?:\/\//i.test(baseUrl)) throw new Error("Server URL must start with http:// or https://");
      patch.baseUrl = baseUrl;
    }
    if (args.authType !== undefined) {
      assertAuthType(args.authType);
      patch.authType = args.authType;
    }
    if (args.headerName !== undefined) patch.headerName = args.headerName?.trim() || undefined;
    if (args.basicUsername !== undefined) patch.basicUsername = args.basicUsername?.trim() || undefined;
    await ctx.db.patch(args.sourceId, patch);
    return args.sourceId;
  },
});

export const remove = mutation({
  args: { sourceId: v.id("documentSources") },
  handler: async (ctx, args) => {
    const source = await ctx.db.get(args.sourceId);
    if (!source) return;
    await requireProjectAccess(ctx, source.projectId);
    await ctx.db.delete(args.sourceId);
  },
});
