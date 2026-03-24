import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, requireAerogapEmployee } from "./_helpers";

async function isAerogapPrivileged(ctx: any, userId: string): Promise<boolean> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q: any) => q.eq("clerkUserId", userId))
    .unique();
  return user?.role === "admin" || user?.role === "aerogap_employee";
}

// List manuals for a specific project (owner or AeroGap employee/admin)
export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    const userId = await requireAuth(ctx);
    const project = await ctx.db.get(projectId);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!project || (!privileged && project.userId !== userId)) {
      throw new Error("Not authorized");
    }
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
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!manual || (!privileged && manual.userId !== userId)) {
      throw new Error("Not authorized");
    }
    return await ctx.db
      .query("manualRevisions")
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
    enabledCapabilities: v.optional(v.array(v.string())),
  },
  handler: async (ctx, { manualId, ...fields }) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(manualId);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!manual || (!privileged && manual.userId !== userId)) {
      throw new Error("Not authorized");
    }
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
    if (fields.enabledCapabilities !== undefined) patch.enabledCapabilities = fields.enabledCapabilities;
    await ctx.db.patch(manualId, patch);
  },
});

// Get or create a manual record for a project+type combo (used by Manual Writer for capabilities persistence)
export const getOrCreateForProjectType = mutation({
  args: {
    projectId: v.id("projects"),
    manualType: v.string(),
    title: v.string(),
  },
  handler: async (ctx, { projectId, manualType, title }) => {
    const userId = await requireAuth(ctx);
    // Check if one already exists
    const existing = await ctx.db
      .query("manuals")
      .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
      .collect();
    const match = existing.find((m: any) => m.manualType === manualType);
    if (match) return match._id;
    // Create a new one
    const now = new Date().toISOString();
    const manualId = await ctx.db.insert("manuals", {
      projectId,
      userId,
      manualType,
      title,
      currentRevision: "Rev 0",
      status: "draft",
      enabledCapabilities: [],
      createdAt: now,
      updatedAt: now,
    });
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

// Get the manual record for a specific project+type (returns null if none)
export const getForProjectType = query({
  args: {
    projectId: v.id("projects"),
    manualType: v.string(),
  },
  handler: async (ctx, { projectId, manualType }) => {
    const userId = await requireAuth(ctx);
    const privileged = await isAerogapPrivileged(ctx, userId);
    const project = await ctx.db.get(projectId);
    if (!project || (!privileged && project.userId !== userId)) {
      throw new Error("Not authorized");
    }
    const all = await ctx.db
      .query("manuals")
      .withIndex("by_projectId", (q: any) => q.eq("projectId", projectId))
      .collect();
    return all.find((m: any) => m.manualType === manualType) ?? null;
  },
});

// Remove a manual and all its revisions/change logs
export const remove = mutation({
  args: { manualId: v.id("manuals") },
  handler: async (ctx, { manualId }) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(manualId);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!manual || (!privileged && manual.userId !== userId)) {
      throw new Error("Not authorized");
    }
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
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { manualId, revisionNumber, notes }) => {
    const userId = await requireAuth(ctx);
    const manual = await ctx.db.get(manualId);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!manual || (!privileged && manual.userId !== userId)) {
      throw new Error("Not authorized");
    }
    const now = new Date().toISOString();
    const revId = await ctx.db.insert("manualRevisions", {
      manualId,
      revisionNumber,
      status: "draft",
      notes,
      submittedBy: userId,
      createdAt: now,
      updatedAt: now,
    });
    // Update manual's currentRevision
    await ctx.db.patch(manualId, { currentRevision: revisionNumber, updatedAt: now });
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
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!manual || (!privileged && manual.userId !== userId)) {
      throw new Error("Not authorized");
    }
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
    status: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { revisionId, status, notes }) => {
    const userId = await requireAuth(ctx);
    const revision = await ctx.db.get(revisionId);
    if (!revision) throw new Error("Revision not found");
    const manual = await ctx.db.get(revision.manualId);
    const privileged = await isAerogapPrivileged(ctx, userId);
    if (!manual || (!privileged && manual.userId !== userId)) {
      throw new Error("Not authorized");
    }
    const patch: Record<string, any> = { updatedAt: new Date().toISOString() };
    if (status !== undefined) patch.status = status;
    if (notes !== undefined) patch.notes = notes;
    await ctx.db.patch(revisionId, patch);
  },
});
