import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireProjectOwner } from "./_helpers";

const LIST_PAGE_SIZE = 100;

/** List simulation runs without heavy fields (messages, faaConfig) to reduce bandwidth. Use get(id) when viewing a run. */
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const rows = await ctx.db
      .query("simulationResults")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);
    return rows.map(({ messages, faaConfig, ...rest }) => ({
      ...rest,
      messageCount: Array.isArray(messages) ? messages.length : 0,
    }));
  },
});

/** Search simulation runs by metadata and transcript content. */
export const searchByProject = query({
  args: {
    projectId: v.id("projects"),
    searchText: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireProjectOwner(ctx, args.projectId);
    const rows = await ctx.db
      .query("simulationResults")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .take(LIST_PAGE_SIZE);

    const queryText = (args.searchText ?? "").trim().toLowerCase();
    const limit = Math.max(1, Math.min(args.limit ?? LIST_PAGE_SIZE, LIST_PAGE_SIZE));

    const mapped = rows.map(({ messages, faaConfig, ...rest }) => {
      const safeMessages = Array.isArray(messages) ? messages : [];
      const messageCount = safeMessages.length;

      if (!queryText) {
        return {
          ...rest,
          messageCount,
          matchedInHistory: false,
          historySnippet: undefined as string | undefined,
        };
      }

      const nameMatch = (rest.name ?? "").toLowerCase().includes(queryText);
      const assessmentMatch = (rest.assessmentName ?? "").toLowerCase().includes(queryText);
      const agentMatch = (Array.isArray(rest.agentIds) ? rest.agentIds : []).some((id) =>
        String(id ?? "").toLowerCase().includes(queryText)
      );

      let matchedInHistory = false;
      let historySnippet: string | undefined;
      for (const msg of safeMessages) {
        const content = String((msg as any)?.content ?? "");
        if (!content) continue;
        const lower = content.toLowerCase();
        const idx = lower.indexOf(queryText);
        if (idx >= 0) {
          matchedInHistory = true;
          const start = Math.max(0, idx - 55);
          const end = Math.min(content.length, idx + queryText.length + 85);
          const prefix = start > 0 ? "..." : "";
          const suffix = end < content.length ? "..." : "";
          historySnippet = `${prefix}${content.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
          break;
        }
      }

      if (!nameMatch && !assessmentMatch && !agentMatch && !matchedInHistory) {
        return null;
      }

      return {
        ...rest,
        messageCount,
        matchedInHistory,
        historySnippet,
      };
    });

    return mapped.filter((row) => row !== null).slice(0, limit);
  },
});

/** Full simulation result including messages. Use when viewing or comparing a run. */
export const get = query({
  args: { simulationId: v.id("simulationResults") },
  handler: async (ctx, args) => {
    const sim = await ctx.db.get(args.simulationId);
    if (!sim) return null;
    await requireProjectOwner(ctx, sim.projectId);
    return sim;
  },
});

export const add = mutation({
  args: {
    projectId: v.id("projects"),
    originalId: v.string(),
    name: v.string(),
    assessmentId: v.string(),
    assessmentName: v.string(),
    agentIds: v.array(v.string()),
    totalRounds: v.number(),
    messages: v.any(),
    createdAt: v.string(),
    thinkingEnabled: v.boolean(),
    selfReviewMode: v.string(),
    faaConfig: v.optional(v.any()),
    isbaoStage: v.optional(v.number()),
    isPaused: v.optional(v.boolean()),
    currentRound: v.optional(v.number()),
    discrepancies: v.optional(v.any()),
    dataSummary: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const userId = await requireProjectOwner(ctx, args.projectId);
    await ctx.db.patch(args.projectId, { updatedAt: new Date().toISOString() });
    return await ctx.db.insert("simulationResults", {
      projectId: args.projectId,
      userId,
      originalId: args.originalId,
      name: args.name,
      assessmentId: args.assessmentId,
      assessmentName: args.assessmentName,
      agentIds: args.agentIds,
      totalRounds: args.totalRounds,
      messages: args.messages,
      createdAt: args.createdAt,
      thinkingEnabled: args.thinkingEnabled,
      selfReviewMode: args.selfReviewMode,
      faaConfig: args.faaConfig,
      isbaoStage: args.isbaoStage,
      isPaused: args.isPaused,
      currentRound: args.currentRound,
      discrepancies: args.discrepancies,
      dataSummary: args.dataSummary,
    });
  },
});

export const remove = mutation({
  args: { simulationId: v.id("simulationResults") },
  handler: async (ctx, args) => {
    const sim = await ctx.db.get(args.simulationId);
    if (!sim) throw new Error("Simulation not found");
    await requireProjectOwner(ctx, sim.projectId);
    await ctx.db.delete(args.simulationId);
    await ctx.db.patch(sim.projectId, { updatedAt: new Date().toISOString() });
  },
});
