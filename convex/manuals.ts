import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { assertManualAccess, requireAuth, requireAerogapEmployee, requireProjectAccess } from "./_helpers";
import { assertDeletionStepUpForUserId, deletionStepUpArg } from "./deletionStepUpShared";

async function isAerogapPrivileged(ctx: any, userId: string): Promise<boolean> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q: any) => q.eq("clerkUserId", userId))
    .unique();
  return user?.role === "admin" || user?.role === "aerogap_employee";
}

function normalizeRevisionToken(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw
    .replace(/\b(revision|rev\.?|version|ver\.?|issue|iss\.?|amendment|amdt|chg|change)\b/gi, " ")
    .replace(/[^a-z0-9]/gi, "")
    .trim();
  return cleaned || null;
}

function compareRevisionTokens(manualRevisionNumber?: string, detectedRevision?: string) {
  const left = normalizeRevisionToken(manualRevisionNumber);
  const right = normalizeRevisionToken(detectedRevision);
  if (!left || !right) {
    return { comparisonStatus: "unknown" as const, matchConfidence: 0.25 };
  }
  if (left === right) {
    return { comparisonStatus: "match" as const, matchConfidence: 1 };
  }
  if (left.includes(right) || right.includes(left)) {
    return { comparisonStatus: "match" as const, matchConfidence: 0.7 };
  }
  return { comparisonStatus: "mismatch" as const, matchConfidence: 0.95 };
}

// List manuals for a specific project (project access per requireProjectAccess)
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectAccess(ctx, projectId);
    return await ctx.db
      .query("manuals")
      .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
      .collect();
  },
});

// List all manuals for the current user (customers see own; employees/admins see all)
export const listForCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (privileged) {
      return await ctx.db.query("manuals").collect();
    }
    return await ctx.db
      .query("manuals")
      .withIndex("by_userId", (q: any) => q.eq("userId", userId))
      .collect();
  },
});

// List all manuals for the employee dashboard — AeroGap employee/admin only
export const listAllForEmployee = query({
  args: {},
  handler: async (ctx) => {
    await requireAerogapEmployee(ctx);
    const manuals = await ctx.db.query("manuals").collect();

    // Attach user info for each unique userId
    const userIds = [...new Set(manuals.map((m: any) => m.userId))];
    const users: Record<string, any> = {};
    for (const uid of userIds) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q: any) => q.eq("clerkUserId", uid))
        .unique();
      if (user) users[uid] = user;
    }

    return manuals.map((m: any) => ({
      ...m,
      ownerName: users[m.userId]?.name || users[m.userId]?.email || m.userId,
      ownerEmail: users[m.userId]?.email || "",
      ownerPicture: users[m.userId]?.picture || null,
    }));
  },
});

// List all users with their manual counts/statuses for the employee dashboard
export const listUsersWithManualStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAerogapEmployee(ctx);
    const allUsers = await ctx.db.query("users").collect();
    const allManuals = await ctx.db.query("manuals").collect();

    return allUsers
      .filter((u: any) => u.role === "user" || u.role === "aerogap_employee")
      .map((u: any) => {
        const userManuals = allManuals.filter((m: any) => m.userId === u.clerkUserId);
        const statusCounts = {
          draft: userManuals.filter((m: any) => m.status === "draft").length,
          in_review: userManuals.filter((m: any) => m.status === "in_review").length,
          approved: userManuals.filter((m: any) => m.status === "approved").length,
          published: userManuals.filter((m: any) => m.status === "published").length,
        };
        const lastActivity = userManuals.length > 0
          ? userManuals.sort((a: any, b: any) => b.updatedAt.localeCompare(a.updatedAt))[0].updatedAt
          : null;
        return {
          ...u,
          manualCount: userManuals.length,
          statusCounts,
          lastActivity,
        };
      });
  },
});

// List revisions for a manual
export const listRevisions = query({
  args: { manualId: v.id("manuals") },
  handler: async (ctx, { manualId }) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(manualId);
    await assertManualAccess(ctx, manual, userId);
    return await ctx.db
      .query("manualRevisions")
      .withIndex("by_manualId", (q: any) => q.eq("manualId", manualId))
      .collect();
  },
});

export const listRevisionLinksByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireProjectAccess(ctx, projectId);
    return await ctx.db
      .query("manualRevisionLinks")
      .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
      .collect();
  },
});

export const listRevisionLinksByManual = query({
  args: { manualId: v.id("manuals") },
  handler: async (ctx, { manualId }) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(manualId);
    await assertManualAccess(ctx, manual, userId);
    return await ctx.db
      .query("manualRevisionLinks")
      .withIndex("by_manualId", (q: any) => q.eq("manualId", manualId))
      .collect();
  },
});

// Create a new manual
export const create = mutation({
  args: {
    projectId: v.id("projects"),
    manualType: v.string(),
    title: v.string(),
    customerUserId: v.optional(v.string()),
    writingStyle: v.optional(v.string()),
    citationsEnabled: v.optional(v.boolean()),
    formatConfig: v.optional(v.object({ font: v.string(), margins: v.string() })),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = new Date().toISOString();
    const manualId = await ctx.db.insert("manuals", {
      projectId: args.projectId,
      userId,
      customerUserId: args.customerUserId,
      manualType: args.manualType,
      title: args.title,
      currentRevision: "Rev 0",
      status: "draft",
      writingStyle: args.writingStyle,
      citationsEnabled: args.citationsEnabled,
      formatConfig: args.formatConfig,
      createdAt: now,
      updatedAt: now,
    });
    // Create initial Rev 0 revision
    await ctx.db.insert("manualRevisions", {
      manualId,
      revisionNumber: "Rev 0",
      status: "draft",
      submittedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    return manualId;
  },
});

// Update manual metadata
export const update = mutation({
  args: {
    manualId: v.id("manuals"),
    title: v.optional(v.string()),
    status: v.optional(v.string()),
    currentRevision: v.optional(v.string()),
    customerUserId: v.optional(v.string()),
    definitions: v.optional(v.array(v.object({ term: v.string(), definition: v.string() }))),
    appendixNotes: v.optional(v.string()),
    writingStyle: v.optional(v.string()),
    citationsEnabled: v.optional(v.boolean()),
    formatConfig: v.optional(v.object({ font: v.string(), margins: v.string() })),
  },
  handler: async (ctx, { manualId, ...fields }) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(manualId);
    await assertManualAccess(ctx, manual, userId);
    const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (fields.title !== undefined) patch.title = fields.title;
    if (fields.status !== undefined) patch.status = fields.status;
    if (fields.currentRevision !== undefined) patch.currentRevision = fields.currentRevision;
    if (fields.customerUserId !== undefined) patch.customerUserId = fields.customerUserId;
    if (fields.definitions !== undefined) patch.definitions = fields.definitions;
    if (fields.appendixNotes !== undefined) patch.appendixNotes = fields.appendixNotes;
    if (fields.writingStyle !== undefined) patch.writingStyle = fields.writingStyle;
    if (fields.citationsEnabled !== undefined) patch.citationsEnabled = fields.citationsEnabled;
    if (fields.formatConfig !== undefined) patch.formatConfig = fields.formatConfig;
    await ctx.db.patch(manualId, patch);
  },
});

// Remove a manual and all its revisions/change logs
export const remove = mutation({
  args: { manualId: v.id("manuals"), stepUp: deletionStepUpArg },
  handler: async (ctx, { manualId, stepUp }) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(manualId);
    await assertManualAccess(ctx, manual, userId);
    await assertDeletionStepUpForUserId(ctx, userId, stepUp);
    // Delete all change logs
    const logs = await ctx.db
      .query("manualChangeLogs")
      .withIndex("by_manualId", (q: any) => q.eq("manualId", manualId))
      .collect();
    for (const log of logs) await ctx.db.delete(log._id);
    // Delete all revisions
    const revisions = await ctx.db
      .query("manualRevisions")
      .withIndex("by_manualId", (q: any) => q.eq("manualId", manualId))
      .collect();
    for (const rev of revisions) await ctx.db.delete(rev._id);
    await ctx.db.delete(manualId);
  },
});

// Create a new revision for a manual
export const createRevision = mutation({
  args: {
    manualId: v.id("manuals"),
    revisionNumber: v.string(),
    revisionTitle: v.optional(v.string()),
    sourceDocumentId: v.optional(v.id("documents")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { manualId, revisionNumber, revisionTitle, sourceDocumentId, notes }) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(manualId);
    await assertManualAccess(ctx, manual, userId);
    if (!manual) throw new Error("Manual not found");
    const normalizedRevision = revisionNumber.trim();
    if (!normalizedRevision) throw new Error("Revision number is required");
    const existingRevisions = await ctx.db
      .query("manualRevisions")
      .withIndex("by_manualId", (q: any) => q.eq("manualId", manualId))
      .collect();
    if (existingRevisions.some((rev: any) => rev.revisionNumber.trim().toLowerCase() === normalizedRevision.toLowerCase())) {
      throw new Error("Revision number already exists for this manual");
    }
    if (sourceDocumentId) {
      const sourceDocument = await ctx.db.get(sourceDocumentId);
      if (!sourceDocument || sourceDocument.projectId !== manual.projectId) {
        throw new Error("Selected source file does not belong to this project");
      }
    }
    const now = new Date().toISOString();
    const revId = await ctx.db.insert("manualRevisions", {
      manualId,
      revisionNumber: normalizedRevision,
      revisionTitle: revisionTitle?.trim() || undefined,
      sourceDocumentId,
      status: "draft",
      notes,
      submittedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    // Update manual's currentRevision
    await ctx.db.patch(manualId, { currentRevision: normalizedRevision, updatedAt: now });
    return revId;
  },
});

// Submit a revision to the customer (AeroGap employee/admin only)
export const submitRevision = mutation({
  args: {
    revisionId: v.id("manualRevisions"),
    manualId: v.id("manuals"),
  },
  handler: async (ctx, { revisionId, manualId }) => {
    const userId = await requireAerogapEmployee(ctx);
    const now = new Date().toISOString();
    await ctx.db.patch(revisionId, {
      status: "submitted",
      submittedBy: userId,
      submittedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(manualId, { status: "in_review", updatedAt: now });
    // Add system change log entry
    await ctx.db.insert("manualChangeLogs", {
      manualId,
      revisionId,
      section: "System",
      description: "Revision submitted to customer for review.",
      changeType: "admin_change",
      authorId: userId,
      createdAt: now,
    });
  },
});

// Resolve a revision (approve or reject) — can be done by customer or AeroGap employee
export const resolveRevision = mutation({
  args: {
    revisionId: v.id("manualRevisions"),
    manualId: v.id("manuals"),
    resolution: v.union(v.literal("customer_approved"), v.literal("customer_rejected")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { revisionId, manualId, resolution, notes }) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(manualId);
    await assertManualAccess(ctx, manual, userId);
    const now = new Date().toISOString();
    await ctx.db.patch(revisionId, {
      status: resolution,
      resolvedAt: now,
      notes: notes ?? undefined,
      updatedAt: now,
    });
    const newManualStatus = resolution === "customer_approved" ? "approved" : "draft";
    await ctx.db.patch(manualId, { status: newManualStatus, updatedAt: now });
    // Add system change log entry
    const action = resolution === "customer_approved" ? "approved" : "rejected";
    await ctx.db.insert("manualChangeLogs", {
      manualId,
      revisionId,
      section: "System",
      description: `Revision ${action} by customer${notes ? `: ${notes}` : "."}`,
      changeType: "admin_change",
      authorId: userId,
      createdAt: now,
    });
  },
});

// Update a revision (e.g. supersede)
export const updateRevision = mutation({
  args: {
    revisionId: v.id("manualRevisions"),
    revisionNumber: v.optional(v.string()),
    revisionTitle: v.optional(v.string()),
    sourceDocumentId: v.optional(v.union(v.id("documents"), v.null())),
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { revisionId, revisionNumber, revisionTitle, sourceDocumentId, status, notes }) => {
    const userId = await requireAuth(ctx);
    const revision = await ctx.db.get(revisionId);
    if (!revision) throw new Error("Revision not found");
    const manual = await ctx.db.get(revision.manualId);
    await assertManualAccess(ctx, manual, userId);
    if (!manual) throw new Error("Manual not found");
    const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (revisionNumber !== undefined) {
      const normalizedRevision = revisionNumber.trim();
      if (!normalizedRevision) throw new Error("Revision number cannot be empty");
      const allRevisions = await ctx.db
        .query("manualRevisions")
        .withIndex("by_manualId", (q: any) => q.eq("manualId", revision.manualId))
        .collect();
      const duplicate = allRevisions.some(
        (rev: any) =>
          rev._id !== revisionId &&
          rev.revisionNumber.trim().toLowerCase() === normalizedRevision.toLowerCase(),
      );
      if (duplicate) throw new Error("Revision number already exists for this manual");
      patch.revisionNumber = normalizedRevision;
      if (manual.currentRevision === revision.revisionNumber) {
        await ctx.db.patch(revision.manualId, {
          currentRevision: normalizedRevision,
          updatedAt: new Date().toISOString(),
        });
      }
    }
    if (revisionTitle !== undefined) patch.revisionTitle = revisionTitle.trim() || undefined;
    if (sourceDocumentId !== undefined) {
      if (sourceDocumentId === null) {
        patch.sourceDocumentId = undefined;
      } else {
        const sourceDocument = await ctx.db.get(sourceDocumentId);
        if (!sourceDocument || sourceDocument.projectId !== manual.projectId) {
          throw new Error("Selected source file does not belong to this project");
        }
        patch.sourceDocumentId = sourceDocumentId;
      }
    }
    if (status !== undefined) patch.status = status;
    if (notes !== undefined) patch.notes = notes.trim() || undefined;
    await ctx.db.patch(revisionId, patch);
  },
});

export const removeRevision = mutation({
  args: { revisionId: v.id("manualRevisions"), stepUp: deletionStepUpArg },
  handler: async (ctx, { revisionId, stepUp }) => {
    const userId = await requireAuth(ctx);
    const revision = await ctx.db.get(revisionId);
    if (!revision) throw new Error("Revision not found");
    const manual = await ctx.db.get(revision.manualId);
    await assertManualAccess(ctx, manual, userId);
    if (!manual) throw new Error("Manual not found");
    await assertDeletionStepUpForUserId(ctx, userId, stepUp);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!privileged && (revision.status === "submitted" || revision.status === "customer_reviewing")) {
      throw new Error("Only AeroGap staff can remove revisions in review");
    }

    const revisions = await ctx.db
      .query("manualRevisions")
      .withIndex("by_manualId", (q: any) => q.eq("manualId", revision.manualId))
      .collect();
    if (revisions.length <= 1 && !privileged) {
      throw new Error("Cannot delete the last revision");
    }

    const remainingAfterDelete = revisions
      .filter((rev: any) => rev._id !== revisionId)
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));

    const logs = await ctx.db
      .query("manualChangeLogs")
      .withIndex("by_revisionId", (q: any) => q.eq("revisionId", revisionId))
      .collect();
    for (const log of logs) await ctx.db.delete(log._id);

    // Remove revision-link rows that reference this revision to avoid stale link records.
    const revisionLinks = await ctx.db
      .query("manualRevisionLinks")
      .withIndex("by_manualRevisionId", (q: any) => q.eq("manualRevisionId", revisionId))
      .collect();
    for (const link of revisionLinks) await ctx.db.delete(link._id);

    await ctx.db.delete(revisionId);

    const now = new Date().toISOString();
    if (remainingAfterDelete.length === 0) {
      await ctx.db.patch(revision.manualId, {
        currentRevision: "",
        updatedAt: now,
      });
    } else if (manual.currentRevision === revision.revisionNumber) {
      await ctx.db.patch(revision.manualId, {
        currentRevision: remainingAfterDelete[0].revisionNumber,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(revision.manualId, { updatedAt: now });
    }
  },
});

export const upsertRevisionLinks = mutation({
  args: {
    projectId: v.id("projects"),
    scannedRevisions: v.array(v.object({
      documentRevisionId: v.optional(v.id("documentRevisions")),
      sourceDocumentId: v.optional(v.id("documents")),
      sourceDocumentIdString: v.optional(v.string()),
      documentName: v.string(),
      detectedRevision: v.string(),
    })),
  },
  handler: async (ctx, { projectId, scannedRevisions }) => {
    await requireProjectAccess(ctx, projectId);
    const now = new Date().toISOString();

    const manuals = await ctx.db
      .query("manuals")
      .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
      .collect();

    const normalizedScanned = scannedRevisions.map((row: any) => ({
      ...row,
      sourceDocumentIdString: row.sourceDocumentIdString || (row.sourceDocumentId ? String(row.sourceDocumentId) : undefined),
      normalizedName: row.documentName.trim().toLowerCase(),
    }));

    for (const manual of manuals) {
      const revisions = await ctx.db
        .query("manualRevisions")
        .withIndex("by_manualId", (q: any) => q.eq("manualId", manual._id))
        .collect();

      for (const revision of revisions) {
        const sourceId = revision.sourceDocumentId ? String(revision.sourceDocumentId) : undefined;
        const normalizedManualTitle = manual.title.trim().toLowerCase();
        const matched = normalizedScanned.find((row: any) => {
          if (sourceId && row.sourceDocumentIdString && row.sourceDocumentIdString === sourceId) return true;
          return row.normalizedName.includes(normalizedManualTitle) || normalizedManualTitle.includes(row.normalizedName);
        });
        if (!matched) continue;

        const cmp = compareRevisionTokens(revision.revisionNumber, matched.detectedRevision);
        const existing = await ctx.db
          .query("manualRevisionLinks")
          .withIndex("by_manualRevisionId", (q: any) => q.eq("manualRevisionId", revision._id))
          .unique();
        const patch = {
          projectId,
          manualId: manual._id,
          manualRevisionId: revision._id,
          sourceDocumentId: matched.sourceDocumentId,
          documentRevisionId: matched.documentRevisionId,
          documentName: matched.documentName,
          detectedRevision: matched.detectedRevision,
          manualRevisionNumber: revision.revisionNumber,
          comparisonStatus: cmp.comparisonStatus,
          matchConfidence: cmp.matchConfidence,
          lastSyncedAt: now,
          updatedAt: now,
        };
        if (existing) {
          await ctx.db.patch(existing._id, patch);
        } else {
          await ctx.db.insert("manualRevisionLinks", { ...patch, createdAt: now });
        }
      }
    }
  },
});
