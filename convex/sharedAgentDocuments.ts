import { query, mutation, internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  requireAuth,
  requirePlatformStaff,
  requireCompanyRole,
  requireCompanyOrDelegatedSupportAccess,
} from "./_helpers";
import { sharedDocVisibleForCompany } from "./sharedDocVisibility";

/** Delete blob if present; never block DB row removal on storage failures (orphaned/missing blobs). */
async function deleteSharedAgentStorageBestEffort(
  ctx: MutationCtx,
  storageId: Id<"_storage"> | undefined
): Promise<void> {
  if (!storageId) return;
  try {
    await ctx.storage.delete(storageId);
  } catch (err) {
    console.error(
      "[sharedAgentDocuments] storage.delete failed; continuing with document row removal",
      storageId,
      err
    );
  }
}

async function requireRemoveSharedAgent(ctx: any, doc: Doc<"sharedAgentDocuments">) {
  if (!doc.companyId) {
    await requirePlatformStaff(ctx);
    return;
  }
  await requireCompanyRole(ctx, doc.companyId, ["company_admin", "company_manager"]);
}

export const listForCompany = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    const tenant = await ctx.db
      .query("sharedAgentDocuments")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    const all = await ctx.db.query("sharedAgentDocuments").collect();
    const platform = all.filter((d) => d.companyId === undefined);
    const seen = new Set(tenant.map((d) => d._id));
    for (const d of platform) {
      if (!seen.has(d._id)) tenant.push(d);
    }
    return tenant;
  },
});

export const listByAgent = query({
  args: { agentId: v.string(), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    const docs = await ctx.db
      .query("sharedAgentDocuments")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();
    return docs.filter((d) => sharedDocVisibleForCompany(d.companyId, args.companyId));
  },
});

export const listByAgents = query({
  args: { agentIds: v.array(v.string()), companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
    if (args.agentIds.length === 0) return [];
    const all: Doc<"sharedAgentDocuments">[] = [];
    for (const agentId of args.agentIds) {
      const docs = await ctx.db
        .query("sharedAgentDocuments")
        .withIndex("by_agentId", (q) => q.eq("agentId", agentId))
        .collect();
      all.push(...docs);
    }
    return all.filter((d) => sharedDocVisibleForCompany(d.companyId, args.companyId));
  },
});

/** @deprecated Prefer listForCompany / listByAgents with companyId. Platform-wide docs only. */
export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requireAuth(ctx);
    const all = await ctx.db.query("sharedAgentDocuments").collect();
    return all.filter((d) => d.companyId === undefined);
  },
});

export const add = mutation({
  args: {
    agentId: v.string(),
    name: v.string(),
    path: v.string(),
    source: v.string(),
    mimeType: v.optional(v.string()),
    extractedText: v.optional(v.string()),
    storageId: v.optional(v.id("_storage")),
    region: v.optional(v.string()),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const { companyId: tenantId, ...rest } = args;
    const addedBy =
      tenantId === undefined
        ? await requirePlatformStaff(ctx)
        : await requireCompanyRole(ctx, tenantId, ["company_admin", "company_manager"]);
    return await ctx.db.insert("sharedAgentDocuments", {
      agentId: rest.agentId,
      name: rest.name,
      path: rest.path,
      source: rest.source,
      mimeType: rest.mimeType,
      extractedText: rest.extractedText,
      storageId: rest.storageId,
      addedAt: new Date().toISOString(),
      addedBy,
      region: rest.region ?? "all",
      companyId: tenantId,
    });
  },
});

export const updateRegion = mutation({
  args: {
    documentId: v.id("sharedAgentDocuments"),
    region: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error(
        "Knowledge base document not found. It may have been removed already — refresh the list."
      );
    }
    await requireRemoveSharedAgent(ctx, doc);
    await ctx.db.patch(args.documentId, { region: args.region });
  },
});

export const remove = mutation({
  args: { documentId: v.id("sharedAgentDocuments") },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.documentId);
    if (!doc) {
      throw new Error(
        "Knowledge base document not found. It may have been removed already — refresh the list."
      );
    }
    await requireRemoveSharedAgent(ctx, doc);
    await deleteSharedAgentStorageBestEffort(ctx, doc.storageId);
    await ctx.db.delete(args.documentId);
  },
});

/** Internal-only: replace all generated KB docs for an agent with fresh synthesized content. */
export const upsertGenerated = internalMutation({
  args: { agentId: v.string(), content: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sharedAgentDocuments")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .filter((q) => q.eq(q.field("source"), "generated"))
      .collect();
    for (const doc of existing) await ctx.db.delete(doc._id);
    const dateLabel = new Date().toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
    await ctx.db.insert("sharedAgentDocuments", {
      agentId: args.agentId,
      name: `Cross-Audit Pattern Analysis — Auto-generated ${dateLabel}`,
      path: "generated/pattern-analysis.txt",
      source: "generated",
      extractedText: args.content,
      addedAt: new Date().toISOString(),
      addedBy: "system",
    });
  },
});

export const clearByAgent = mutation({
  args: {
    agentId: v.string(),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    const docs = await ctx.db
      .query("sharedAgentDocuments")
      .withIndex("by_agentId", (q) => q.eq("agentId", args.agentId))
      .collect();
    if (args.companyId !== undefined) {
      await requireCompanyRole(ctx, args.companyId, ["company_admin", "company_manager"]);
      const toDelete = docs.filter((d) => d.companyId === args.companyId);
      for (const doc of toDelete) {
        await deleteSharedAgentStorageBestEffort(ctx, doc.storageId);
        await ctx.db.delete(doc._id);
      }
      return;
    }
    await requirePlatformStaff(ctx);
    const toDelete = docs.filter((d) => d.companyId === undefined);
    for (const doc of toDelete) {
      await deleteSharedAgentStorageBestEffort(ctx, doc.storageId);
      await ctx.db.delete(doc._id);
    }
  },
});
