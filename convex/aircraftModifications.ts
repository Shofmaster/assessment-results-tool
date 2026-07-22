import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireLogbookEnabled, requireProjectAccess } from "./_helpers";

const modTypeValidator = v.union(
  v.literal("stc"),
  v.literal("field_approval_337"),
  v.literal("der_8110_3"),
  v.literal("minor_alteration"),
  v.literal("amoc"),
  v.literal("other"),
);

const edgeKindValidator = v.union(
  v.literal("depends_on"),
  v.literal("conflicts_with"),
  v.literal("interfaces_with"),
  v.literal("shared_system"),
);

// Mutation-arg validation only (schema keeps v.string() for legacy rows). A bad
// status would silently vanish from the requirements rollup, which filters on
// status === "installed".
const modStatusValidator = v.union(
  v.literal("installed"),
  v.literal("removed"),
  v.literal("superseded"),
);

const icaRequirementValidator = v.object({
  description: v.string(),
  interval: v.optional(v.string()),
  reference: v.optional(v.string()),
});

const afmSupplementValidator = v.object({
  required: v.boolean(),
  reference: v.optional(v.string()),
  limitations: v.optional(v.array(v.string())),
});

const weightBalanceValidator = v.object({
  weightChangeLbs: v.optional(v.number()),
  arm: v.optional(v.number()),
  momentChange: v.optional(v.number()),
  notes: v.optional(v.string()),
});

const recurringInspectionValidator = v.object({
  description: v.string(),
  interval: v.optional(v.number()),
  intervalUnit: v.optional(v.string()),
  reference: v.optional(v.string()),
});

/** Field validators shared by addBatch (required subset) and update (all optional). */
const modFieldValidators = {
  modType: modTypeValidator,
  title: v.string(),
  approvalRef: v.optional(v.string()),
  holder: v.optional(v.string()),
  dateInstalled: v.optional(v.string()),
  description: v.optional(v.string()),
  ataChapters: v.optional(v.array(v.string())),
  affectedSystems: v.optional(v.array(v.string())),
  status: modStatusValidator,
  sourceDocumentIds: v.optional(v.array(v.id("documents"))),
  form337RecordId: v.optional(v.id("form337Records")),
  icaRequirements: v.optional(v.array(icaRequirementValidator)),
  afmSupplement: v.optional(afmSupplementValidator),
  weightBalance: v.optional(weightBalanceValidator),
  placards: v.optional(v.array(v.string())),
  electricalLoadNotes: v.optional(v.string()),
  recurringInspections: v.optional(v.array(recurringInspectionValidator)),
  extractionConfidence: v.optional(v.number()),
  extractionModel: v.optional(v.string()),
  userVerified: v.optional(v.boolean()),
};

async function getAircraftOrThrow(ctx: { db: any }, aircraftId: Id<"aircraftAssets">) {
  const aircraft = await ctx.db.get(aircraftId);
  if (!aircraft) throw new Error("Aircraft not found");
  return aircraft;
}

/** Graph payload for the Modifications tab: all mods + edges for one aircraft. */
export const listByAircraft = query({
  args: { aircraftId: v.id("aircraftAssets") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const aircraft = await ctx.db.get(args.aircraftId);
    if (!aircraft) return { mods: [], edges: [] };
    try {
      await requireProjectAccess(ctx, aircraft.projectId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      // Avoid hard-crashing the Fleet page when a previously selected project
      // was deleted or the user no longer has access (owner or company-level).
      if (message === "Project not found" || message.startsWith("Not authorized")) {
        return { mods: [], edges: [] };
      }
      throw error;
    }
    const mods = await ctx.db
      .query("aircraftModifications")
      .withIndex("by_aircraftId", (q: any) => q.eq("aircraftId", args.aircraftId))
      .collect();
    const edges = await ctx.db
      .query("aircraftModificationEdges")
      .withIndex("by_aircraftId", (q: any) => q.eq("aircraftId", args.aircraftId))
      .collect();
    return { mods, edges };
  },
});

/**
 * Insert a batch of modifications plus edges in one transaction.
 * Edge endpoints reference either an index into this batch (fromIndex/toIndex)
 * or an existing mod id (fromModId/toModId). Single save path for the
 * extraction review modal, manual add (batch of one), and 337 import.
 */
export const addBatch = mutation({
  args: {
    aircraftId: v.id("aircraftAssets"),
    modifications: v.array(v.object(modFieldValidators)),
    edges: v.optional(
      v.array(
        v.object({
          fromIndex: v.optional(v.number()),
          fromModId: v.optional(v.id("aircraftModifications")),
          toIndex: v.optional(v.number()),
          toModId: v.optional(v.id("aircraftModifications")),
          kind: edgeKindValidator,
          ataChapter: v.optional(v.string()),
          note: v.optional(v.string()),
          source: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const aircraft = await getAircraftOrThrow(ctx, args.aircraftId);
    const userId = await requireProjectAccess(ctx, aircraft.projectId);
    const now = new Date().toISOString();

    const newIds: Id<"aircraftModifications">[] = [];
    for (const mod of args.modifications) {
      const id = await ctx.db.insert("aircraftModifications", {
        ...mod,
        projectId: aircraft.projectId,
        userId,
        aircraftId: args.aircraftId,
        createdAt: now,
        updatedAt: now,
      });
      newIds.push(id);
    }

    const resolveRef = (
      index: number | undefined,
      modId: Id<"aircraftModifications"> | undefined,
    ): Id<"aircraftModifications"> | null => {
      if (modId !== undefined) return modId;
      if (index !== undefined && index >= 0 && index < newIds.length) return newIds[index];
      return null;
    };

    // Duplicate check mirrors addEdge: same (from, to, kind) triple. Seeded with
    // the aircraft's existing edges so a re-extraction / re-import can't insert
    // the same relationship twice.
    const existingEdges = await ctx.db
      .query("aircraftModificationEdges")
      .withIndex("by_aircraftId", (q: any) => q.eq("aircraftId", args.aircraftId))
      .collect();
    const edgeKeys = new Set(
      existingEdges.map((e: any) => `${e.fromModId}|${e.toModId}|${e.kind}`),
    );

    let edgesInserted = 0;
    let edgesSkipped = 0;
    for (const edge of args.edges ?? []) {
      const fromId = resolveRef(edge.fromIndex, edge.fromModId);
      const toId = resolveRef(edge.toIndex, edge.toModId);
      const skip = async (): Promise<boolean> => {
        if (!fromId || !toId || fromId === toId) return true;
        // Existing-mod endpoints must belong to this aircraft.
        if (edge.fromModId) {
          const row = await ctx.db.get(edge.fromModId);
          if (!row || row.aircraftId !== args.aircraftId) return true;
        }
        if (edge.toModId) {
          const row = await ctx.db.get(edge.toModId);
          if (!row || row.aircraftId !== args.aircraftId) return true;
        }
        return edgeKeys.has(`${fromId}|${toId}|${edge.kind}`);
      };
      if (await skip()) {
        edgesSkipped += 1;
        continue;
      }
      await ctx.db.insert("aircraftModificationEdges", {
        projectId: aircraft.projectId,
        userId,
        aircraftId: args.aircraftId,
        fromModId: fromId!,
        toModId: toId!,
        kind: edge.kind,
        ataChapter: edge.ataChapter,
        note: edge.note,
        source: edge.source,
        createdAt: now,
        updatedAt: now,
      });
      edgeKeys.add(`${fromId}|${toId}|${edge.kind}`);
      edgesInserted += 1;
    }

    await ctx.db.patch(aircraft.projectId, { updatedAt: now });
    return { modIds: newIds, edgesInserted, edgesSkipped };
  },
});

export const update = mutation({
  args: {
    modId: v.id("aircraftModifications"),
    modType: v.optional(modTypeValidator),
    title: v.optional(v.string()),
    approvalRef: v.optional(v.union(v.string(), v.null())),
    holder: v.optional(v.union(v.string(), v.null())),
    dateInstalled: v.optional(v.union(v.string(), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    ataChapters: v.optional(v.array(v.string())),
    affectedSystems: v.optional(v.array(v.string())),
    status: v.optional(modStatusValidator),
    supersededByModId: v.optional(v.union(v.id("aircraftModifications"), v.null())),
    sourceDocumentIds: v.optional(v.array(v.id("documents"))),
    form337RecordId: v.optional(v.union(v.id("form337Records"), v.null())),
    icaRequirements: v.optional(v.array(icaRequirementValidator)),
    afmSupplement: v.optional(v.union(afmSupplementValidator, v.null())),
    weightBalance: v.optional(v.union(weightBalanceValidator, v.null())),
    placards: v.optional(v.array(v.string())),
    electricalLoadNotes: v.optional(v.union(v.string(), v.null())),
    recurringInspections: v.optional(v.array(recurringInspectionValidator)),
    userVerified: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const mod = await ctx.db.get(args.modId);
    if (!mod) throw new Error("Modification not found");
    await requireProjectAccess(ctx, mod.projectId);
    if (args.supersededByModId) {
      const target = await ctx.db.get(args.supersededByModId);
      if (!target || target.aircraftId !== mod.aircraftId) {
        throw new Error("Superseding modification must belong to the same aircraft");
      }
    }
    const { modId, ...updates } = args;
    const patch: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(updates)) {
      if (val === undefined) continue;
      // null clears an optional field
      patch[key] = val === null ? undefined : val;
    }
    if (Object.keys(patch).length === 0) return modId;
    const now = new Date().toISOString();
    patch.updatedAt = now;
    await ctx.db.patch(modId, patch);
    await ctx.db.patch(mod.projectId, { updatedAt: now });
    return modId;
  },
});

export const remove = mutation({
  args: { modId: v.id("aircraftModifications") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const mod = await ctx.db.get(args.modId);
    if (!mod) throw new Error("Modification not found");
    await requireProjectAccess(ctx, mod.projectId);
    const now = new Date().toISOString();
    // Cascade: delete edges touching this mod (indexed by endpoint — no full
    // per-aircraft scan).
    const outbound = await ctx.db
      .query("aircraftModificationEdges")
      .withIndex("by_fromModId", (q: any) => q.eq("fromModId", args.modId))
      .collect();
    const inbound = await ctx.db
      .query("aircraftModificationEdges")
      .withIndex("by_toModId", (q: any) => q.eq("toModId", args.modId))
      .collect();
    for (const edge of [...outbound, ...inbound]) {
      await ctx.db.delete(edge._id);
    }
    // Clear supersededByModId back-references.
    const superseded = await ctx.db
      .query("aircraftModifications")
      .withIndex("by_supersededByModId", (q: any) => q.eq("supersededByModId", args.modId))
      .collect();
    for (const sibling of superseded) {
      await ctx.db.patch(sibling._id, { supersededByModId: undefined, updatedAt: now });
    }
    await ctx.db.delete(args.modId);
    await ctx.db.patch(mod.projectId, { updatedAt: now });
  },
});

async function requireEdgeEndpoints(
  ctx: { db: any },
  fromModId: Id<"aircraftModifications">,
  toModId: Id<"aircraftModifications">,
) {
  if (fromModId === toModId) throw new Error("A modification cannot relate to itself");
  const fromMod = await ctx.db.get(fromModId);
  const toMod = await ctx.db.get(toModId);
  if (!fromMod || !toMod) throw new Error("Modification not found");
  if (fromMod.aircraftId !== toMod.aircraftId) {
    throw new Error("Both modifications must belong to the same aircraft");
  }
  return fromMod;
}

export const addEdge = mutation({
  args: {
    fromModId: v.id("aircraftModifications"),
    toModId: v.id("aircraftModifications"),
    kind: edgeKindValidator,
    ataChapter: v.optional(v.string()),
    note: v.optional(v.string()),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const fromMod = await requireEdgeEndpoints(ctx, args.fromModId, args.toModId);
    const userId = await requireProjectAccess(ctx, fromMod.projectId);
    const existing = await ctx.db
      .query("aircraftModificationEdges")
      .withIndex("by_fromModId", (q: any) => q.eq("fromModId", args.fromModId))
      .collect();
    const duplicate = existing.some(
      (e: any) => e.toModId === args.toModId && e.kind === args.kind,
    );
    if (duplicate) throw new Error("This relationship already exists");
    const now = new Date().toISOString();
    const id = await ctx.db.insert("aircraftModificationEdges", {
      projectId: fromMod.projectId,
      userId,
      aircraftId: fromMod.aircraftId,
      fromModId: args.fromModId,
      toModId: args.toModId,
      kind: args.kind,
      ataChapter: args.ataChapter,
      note: args.note,
      source: args.source ?? "manual",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(fromMod.projectId, { updatedAt: now });
    return id;
  },
});

export const updateEdge = mutation({
  args: {
    edgeId: v.id("aircraftModificationEdges"),
    kind: v.optional(edgeKindValidator),
    ataChapter: v.optional(v.union(v.string(), v.null())),
    note: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const edge = await ctx.db.get(args.edgeId);
    if (!edge) throw new Error("Relationship not found");
    await requireProjectAccess(ctx, edge.projectId);
    const patch: Record<string, unknown> = {};
    if (args.kind !== undefined) patch.kind = args.kind;
    if (args.ataChapter !== undefined) patch.ataChapter = args.ataChapter === null ? undefined : args.ataChapter;
    if (args.note !== undefined) patch.note = args.note === null ? undefined : args.note;
    if (Object.keys(patch).length === 0) return args.edgeId;
    const now = new Date().toISOString();
    patch.updatedAt = now;
    await ctx.db.patch(args.edgeId, patch);
    await ctx.db.patch(edge.projectId, { updatedAt: now });
    return args.edgeId;
  },
});

export const removeEdge = mutation({
  args: { edgeId: v.id("aircraftModificationEdges") },
  handler: async (ctx, args) => {
    await requireLogbookEnabled(ctx);
    const edge = await ctx.db.get(args.edgeId);
    if (!edge) throw new Error("Relationship not found");
    await requireProjectAccess(ctx, edge.projectId);
    await ctx.db.delete(args.edgeId);
    await ctx.db.patch(edge.projectId, { updatedAt: new Date().toISOString() });
  },
});
