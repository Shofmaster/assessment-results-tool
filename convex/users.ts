import { query, mutation, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { requireAuth, requireAdmin, requireCompanyRole, requirePlatformStaff } from "./_helpers";
import type { Doc, Id } from "./_generated/dataModel";

export const getCurrent = query({
  args: {},
  handler: async (ctx) => {
    try {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) return null;
      return await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
        .first();
    } catch (error) {
      console.error("[users.getCurrent] failed; returning null for resilience", error);
      return null;
    }
  },
});

export const listAll = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);
    return await ctx.db.query("users").collect();
  },
});

/** Admin panel: users with active membership in the company (optional platform staff for role tooling). */
export const listDirectoryForCompany = query({
  args: {
    companyId: v.id("companies"),
    includePlatformStaff: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const memberships = await ctx.db
      .query("companyMemberships")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    const activeMemberships = memberships.filter(
      (m) => m.status !== "suspended",
    );
    const byId = new Map<Id<"users">, Doc<"users">>();
    for (const m of activeMemberships) {
      const u = await ctx.db
        .query("users")
        .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", m.userId))
        .first();
      if (u) byId.set(u._id, u);
    }
    if (args.includePlatformStaff) {
      const all = await ctx.db.query("users").collect();
      for (const u of all) {
        if (u.role === "admin" || u.role === "aerogap_employee") {
          byId.set(u._id, u);
        }
      }
    }
    return Array.from(byId.values());
  },
});

/** Company admins: resolve a user by email (case-insensitive) for adding members. */
export const lookupByEmailForCompanyAdmin = query({
  args: { companyId: v.id("companies"), email: v.string() },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const normalized = args.email.trim().toLowerCase();
    if (!normalized) return null;
    const indexed = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
    if (indexed) return indexed;
    const all = await ctx.db.query("users").collect();
    return all.find((u) => (u.email || "").toLowerCase() === normalized) ?? null;
  },
});

/** Tenant company admins: list platform staff for delegated support (matches assignSupport permission). */
export const listPlatformStaffForSupportPicker = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const all = await ctx.db.query("users").collect();
    return all
      .filter((u) => u.role === "admin" || u.role === "aerogap_employee")
      .map((u) => ({
        clerkUserId: u.clerkUserId,
        name: u.name,
        email: u.email,
      }));
  },
});

export const upsertFromClerk = mutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // A signed-in user may only upsert their own row — args.clerkUserId is
    // client-supplied and must match the verified Clerk identity, otherwise
    // anyone with the deployment URL could rewrite arbitrary user records.
    const callerId = await requireAuth(ctx);
    if (callerId !== args.clerkUserId) {
      throw new Error("Not authorized: cannot upsert a different user's profile");
    }

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    const now = new Date().toISOString();

    const emailNormalized = args.email.trim().toLowerCase();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: emailNormalized,
        name: args.name,
        picture: args.picture,
        lastSignInAt: now,
      });
      return existing._id;
    }

    // Every new sign-up lands as a pending non-admin. The founding admin is
    // bootstrapped once out-of-band via the `promoteToAdmin` internal mutation
    // (run with `npx convex run`). This avoids the old "first user to sign up
    // becomes admin" race — dangerous on a public sign-up URL where the first
    // stranger could have claimed admin.
    //
    // A DESKTOP install is the one place that reasoning does not apply, and
    // where it actively breaks the product. That backend is bound to 127.0.0.1
    // on one person's own machine: there is no public sign-up URL, no stranger
    // who could race for the first slot, and — critically — no second person to
    // approve anyone. Leaving the gate on would strand every fresh install on a
    // holding screen whose only exit is an elevated `npx convex run`, which is
    // exactly the console step this deployment mode exists to remove.
    const isDesktop = (process.env.DEPLOYMENT_MODE || "").trim() === "desktop";
    const isLocalAuth = (process.env.AUTH_MODE || "clerk").trim() === "local";

    // "First" means first row in the table, not first this session, so a
    // re-install against existing data does not mint a second administrator.
    const isFirstUser =
      (isDesktop || isLocalAuth) && (await ctx.db.query("users").first()) === null;

    /**
     * DESKTOP AND SERVER ARE NOT THE SAME RISK, even though both are self-hosted.
     *
     * A desktop install is bound to 127.0.0.1 on one person's own machine:
     * anyone who can reach the sign-up form is already sitting at it, so an
     * approval queue would just be a screen with nobody on the other side.
     *
     * A SERVER install is reachable across the customer's LAN. There, sign-up is
     * open to everyone on the network, and the approval gate is the only thing
     * standing between "someone found the URL" and "someone is in the
     * maintenance records". So only the FIRST account is auto-approved, to
     * bootstrap an administrator who can then admit the rest.
     */
    const autoApprove = isDesktop || isFirstUser;

    const newUserId = await ctx.db.insert("users", {
      // Holds whatever the identity provider calls this user: a Clerk id on the
      // hosted product, `local|<uuid>` on a self-hosted one. The field name is
      // historical - renaming it would re-key every row and every audit record
      // that references one.
      clerkUserId: args.clerkUserId,
      email: emailNormalized,
      name: args.name,
      picture: args.picture,
      role: isFirstUser ? "admin" : "user",
      approvalStatus: autoApprove ? "approved" : "pending",
      approvedAt: autoApprove ? now : undefined,
      createdAt: now,
      lastSignInAt: now,
    });

    // The signup email tells an operator someone is waiting for approval. On a
    // desktop install nobody is waiting and there is no operator, so sending it
    // would be noise — and it would leak the user's email to our notification
    // service from a deployment whose whole premise is that data stays local.
    // Only worth sending when somebody actually has to act on it. On a desktop
    // install nobody is waiting, and on any self-hosted install the address
    // would leak to our notification service from a deployment whose whole
    // premise is that data stays local.
    if (!isDesktop && !isLocalAuth) {
      await ctx.scheduler.runAfter(0, internal.notifications.sendSignupEmail, {
        email: emailNormalized,
        name: args.name,
      });
    }

    return newUserId;
  },
});

/**
 * Re-key an existing user row onto a locally-issued identity.
 *
 * MIGRATION ONLY, and the one that matters when a server-mode install moves off
 * Clerk. Those rows are keyed by a Clerk id; after the switch the same person
 * signs in with a `local|<uuid>` subject and would otherwise get a brand new,
 * empty user row - leaving every project, analysis and audit record they own
 * attached to an identity nobody can sign in as any more.
 *
 * Matched on EMAIL, which is the only thing the two identities share. Internal,
 * so it is reachable exactly once, deliberately, by an operator:
 *
 *     npx convex run users:relinkToLocalIdentity '{"email":"...","subject":"local|..."}'
 *
 * Refuses to overwrite a row that has already been re-keyed, so running it twice
 * cannot silently point a person's history at whichever subject came last.
 */
export const relinkToLocalIdentity = internalMutation({
  args: { email: v.string(), subject: v.string() },
  handler: async (ctx, args) => {
    if (!args.subject.startsWith("local|")) {
      throw new Error('subject must be a locally-issued identity (starts with "local|")');
    }

    const email = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!user) throw new Error(`No user with email ${email}`);

    if (user.clerkUserId.startsWith("local|")) {
      if (user.clerkUserId === args.subject) return { alreadyLinked: true };
      throw new Error(
        `${email} is already linked to ${user.clerkUserId}. Refusing to re-point it at a different identity.`,
      );
    }

    await ctx.db.patch(user._id, {
      clerkUserId: args.subject,
      // A migrated user keeps whatever role and approval they had. Re-approving
      // here would silently admit an account an admin had rejected.
    });
    return { previous: user.clerkUserId, subject: args.subject, role: user.role };
  },
});

/** Admin panel: users awaiting manual approval (newest first). */
export const listPending = query({
  args: {},
  handler: async (ctx) => {
    await requirePlatformStaff(ctx);
    const pending = await ctx.db
      .query("users")
      .withIndex("by_approvalStatus", (q) => q.eq("approvalStatus", "pending"))
      .collect();
    return pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

/** Admin action: approve or reject a pending sign-up. */
export const setApprovalStatus = mutation({
  args: {
    targetUserId: v.id("users"),
    status: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.status !== "approved" && args.status !== "rejected") {
      throw new Error("Invalid approval status");
    }
    await ctx.db.patch(args.targetUserId, {
      approvalStatus: args.status,
      approvedAt: new Date().toISOString(),
    });
  },
});

export const setRole = mutation({
  args: {
    targetUserId: v.id("users"),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.role !== "user" && args.role !== "admin" && args.role !== "aerogap_employee") {
      throw new Error("Invalid role");
    }
    await ctx.db.patch(args.targetUserId, { role: args.role });
  },
});

/**
 * Internal helper for actions (which cannot touch ctx.db directly): throws
 * unless the given Clerk user id belongs to platform staff (admin or
 * aerogap_employee). Used to gate privileged actions like KB synthesis.
 */
export const internalAssertPlatformStaff = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.userId))
      .first();
    if (!user || (user.role !== "admin" && user.role !== "aerogap_employee")) {
      throw new Error("Not authorized: AeroGap employee or admin role required");
    }
  },
});

// Internal mutation for Clerk webhook
export const upsertFromWebhook = internalMutation({
  args: {
    clerkUserId: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    picture: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.clerkUserId))
      .first();

    const now = new Date().toISOString();

    const emailNormalized = args.email.trim().toLowerCase();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: emailNormalized,
        name: args.name,
        picture: args.picture,
        lastSignInAt: now,
      });
      return;
    }

    // Same policy as upsertFromClerk: new accounts are always pending
    // non-admins; the founder is promoted out-of-band via promoteToAdmin.
    await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      email: emailNormalized,
      name: args.name,
      picture: args.picture,
      role: "user",
      approvalStatus: "pending",
      approvedAt: undefined,
      createdAt: now,
      lastSignInAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.notifications.sendSignupEmail, {
      email: emailNormalized,
      name: args.name,
    });
  },
});

/**
 * One-off bootstrap: promote a user to an approved admin by email. Intended to
 * be run from the CLI on a fresh deployment to create the founding admin, since
 * sign-ups no longer auto-admin:
 *   npx convex run users:promoteToAdmin '{"email":"founder@example.com"}'
 * Kept as an internalMutation so it is not callable from the client.
 */
export const promoteToAdmin = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const normalized = args.email.trim().toLowerCase();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalized))
      .first();
    if (!user) {
      throw new Error(`No user found with email ${normalized}. Sign in once first, then re-run.`);
    }
    await ctx.db.patch(user._id, {
      role: "admin",
      approvalStatus: "approved",
      approvedAt: new Date().toISOString(),
    });
    return { promoted: user._id, email: normalized };
  },
});
