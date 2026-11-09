/**
 * Users, in both places: the people of a hosted company remembered on a
 * desktop install, and the people who exist only on a desktop install invited
 * to the hosted company.
 *
 * Rides on the hosted -> desktop mirror (convex/mirror.ts,
 * src/services/hostedMirror.ts). After a company is mirrored, the same run:
 *
 *   hosted   exportCompanyMembers   the company's members (and, for admins, pending invites)
 *   local    applyCompanyMembers    remember them: user rows + memberships, linked by email
 *   local    localOnlyMembers       members of mirrored companies the hosted side does not know
 *   hosted   inviteFromDesktop      add them (existing account) or invite them by email
 *
 * and on the hosted side, an invite is accepted the first time somebody signs
 * in with that VERIFIED email address (users.upsertFromClerk ->
 * acceptPendingInvites).
 *
 * WHY EMAIL. A desktop local account (`local|<uuid>`) and a hosted account
 * (`user_...`) are different identities with nothing in common but the email
 * address. On a desktop install the same person can hold both; they are linked
 * by giving each the other's company memberships (linkSameEmailIdentities), so
 * whichever way they sign in they see the same companies. On the hosted side,
 * an email address is only trusted when Clerk says it is verified.
 *
 * WHAT IS NOT SYNCED. Passwords never leave the desktop and the Clerk secret
 * key is never shipped, so a desktop account does not become a hosted account
 * by itself: the person accepts the invite by signing up / in on the website
 * with the invited address. Platform roles (admin / aerogap_employee) do not
 * travel in either direction; company roles do.
 */
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  isSelfHostedDeployment,
  isUserApproved,
  requireAuth,
  requireCompanyMembership,
  requireCompanyRole,
} from "./_helpers";
import { isPlatformPrivileged } from "./accessControl";

export type SyncRole = "company_admin" | "company_manager" | "company_user";

const roleValidator = v.union(
  v.literal("company_admin"),
  v.literal("company_manager"),
  v.literal("company_user"),
);

/** Upper bounds so one call cannot be used to flood a table or an inbox. */
export const MAX_MEMBERS_PER_SYNC = 1000;
export const MAX_INVITES_PER_CALL = 50;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in convex/__tests__/userSync.test.ts)
// ---------------------------------------------------------------------------

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Deliberately loose: one @, something on each side, a dot in the domain, no spaces. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isLocalSubject(subject: string): boolean {
  return subject.startsWith("local|");
}

export function toSyncRole(role: string | undefined): SyncRole {
  return role === "company_admin" || role === "company_manager" ? role : "company_user";
}

/**
 * May this identity claim invitations sent to its email address?
 *
 * Only when the token itself carries the address AND marks it verified. The
 * email passed to upsertFromClerk is client-supplied and proves nothing; the
 * token's claims are signed by Clerk.
 */
export function verifiedTokenEmail(
  identity: { email?: string; emailVerified?: boolean } | null | undefined,
): string | null {
  if (!identity?.email || identity.emailVerified !== true) return null;
  const email = normalizeEmail(identity.email);
  return isValidEmail(email) ? email : null;
}

/** Mirrored memberships of `origin` whose hosted member is no longer in the company. */
export function staleMirroredMemberships<
  M extends { mirror?: { origin: string; subject: string } },
>(memberships: M[], origin: string, currentSubjects: Set<string>): M[] {
  return memberships.filter(
    (m) => m.mirror?.origin === origin && !currentSubjects.has(m.mirror.subject),
  );
}

export interface DirectoryMember {
  subject: string;
  email: string;
  name?: string;
  picture?: string;
  role: SyncRole;
}

export interface LocalMemberCandidate {
  userId: string;
  role: string | undefined;
  status: string | undefined;
  mirrored: boolean;
  email: string | undefined;
  name: string | undefined;
}

/**
 * Of a mirrored company's local memberships, the people the hosted company
 * does not know: made on this install (not by a sync), active, not the caller,
 * with a usable email that no hosted member already has.
 */
export function selectLocalOnlyMembers(
  members: LocalMemberCandidate[],
  callerId: string,
  hostedEmails: Set<string>,
): Array<{ email: string; name?: string; role: SyncRole }> {
  const seen = new Set<string>();
  const out: Array<{ email: string; name?: string; role: SyncRole }> = [];
  for (const m of members) {
    if (m.mirrored || m.userId === callerId) continue;
    if (m.status === "suspended") continue;
    if (!m.email) continue;
    const email = normalizeEmail(m.email);
    if (!isValidEmail(email) || hostedEmails.has(email) || seen.has(email)) continue;
    seen.add(email);
    out.push({ email, name: m.name, role: toSyncRole(m.role) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shared DB helpers
// ---------------------------------------------------------------------------

async function userBySubject(ctx: QueryCtx | MutationCtx, subject: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", subject))
    .first();
}

async function usersByEmail(ctx: QueryCtx | MutationCtx, email: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", normalizeEmail(email)))
    .collect();
}

async function membershipOf(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
  userId: string,
) {
  return await ctx.db
    .query("companyMemberships")
    .withIndex("by_companyId_userId", (q) => q.eq("companyId", companyId).eq("userId", userId))
    .first();
}

function isDesktopDeployment(): boolean {
  return (process.env.DEPLOYMENT_MODE || "").trim() === "desktop";
}

// ---------------------------------------------------------------------------
// Local side: linking identities that share an email
// ---------------------------------------------------------------------------

/**
 * Give `subject` every company membership held by another identity with the
 * same email on this install, so a person with both a local account and a
 * hosted account sees the same companies whichever way they sign in.
 *
 * Self-hosted only, and only for approved users: on a server install a fresh
 * local sign-up is pending until an administrator admits it, and claiming an
 * address must not hand over that address's companies before then.
 *
 * Copies keep the source's mirror marker, so a membership that came from the
 * hosted directory still disappears when the hosted member leaves. An existing
 * membership of `subject` is never changed.
 */
export async function linkSameEmailIdentities(
  ctx: MutationCtx,
  subject: string,
  email: string,
): Promise<number> {
  if (!isSelfHostedDeployment()) return 0;
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) return 0;
  const self = await userBySubject(ctx, subject);
  if (!self || !isUserApproved(self)) return 0;

  const twins = (await usersByEmail(ctx, normalized)).filter(
    (u) => u.clerkUserId !== subject && isUserApproved(u),
  );
  const now = new Date().toISOString();
  let linked = 0;
  for (const twin of twins) {
    const memberships = await ctx.db
      .query("companyMemberships")
      .withIndex("by_userId", (q) => q.eq("userId", twin.clerkUserId))
      .collect();
    for (const m of memberships) {
      if (m.status === "suspended") continue;
      if (await membershipOf(ctx, m.companyId, subject)) continue;
      await ctx.db.insert("companyMemberships", {
        companyId: m.companyId,
        userId: subject,
        role: m.role,
        status: "active",
        addedBy: twin.clerkUserId,
        createdAt: now,
        updatedAt: now,
        mirror: m.mirror,
      });
      linked += 1;
    }
  }
  return linked;
}

// ---------------------------------------------------------------------------
// Hosted side: accepting invitations
// ---------------------------------------------------------------------------

/**
 * Turn every pending invite for the caller's verified email into a membership.
 * Called from users.upsertFromClerk on the hosted deployment.
 *
 * A membership an admin suspended stays suspended: an old invite must not
 * undo a later decision.
 */
export async function acceptPendingInvites(
  ctx: MutationCtx,
  subject: string,
  identity: { email?: string; emailVerified?: boolean } | null,
): Promise<number> {
  const email = verifiedTokenEmail(identity);
  if (!email) return 0;
  const invites = await ctx.db
    .query("companyInvites")
    .withIndex("by_email", (q) => q.eq("email", email))
    .collect();
  const now = new Date().toISOString();
  let accepted = 0;
  for (const invite of invites) {
    if (invite.status !== "pending") continue;
    const company = await ctx.db.get(invite.companyId);
    if (company?.isActive) {
      const existing = await membershipOf(ctx, invite.companyId, subject);
      if (!existing) {
        await ctx.db.insert("companyMemberships", {
          companyId: invite.companyId,
          userId: subject,
          role: toSyncRole(invite.role),
          status: "active",
          addedBy: invite.invitedBy,
          createdAt: now,
          updatedAt: now,
        });
      }
      accepted += 1;
    }
    await ctx.db.patch(invite._id, {
      status: company?.isActive ? "accepted" : "revoked",
      acceptedBy: company?.isActive ? subject : undefined,
      acceptedAt: company?.isActive ? now : undefined,
      updatedAt: now,
    });
  }
  return accepted;
}

// ---------------------------------------------------------------------------
// Hosted side: the directory and invitations
// ---------------------------------------------------------------------------

/**
 * The members of a company, for a desktop install to remember. Any member may
 * read it (they can already see who their colleagues are); pending invites
 * are included only for company admins.
 */
export const exportCompanyMembers = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const callerId = await requireCompanyMembership(ctx, args.companyId);
    const memberships = await ctx.db
      .query("companyMemberships")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();

    const members: DirectoryMember[] = [];
    for (const m of memberships) {
      if (m.status === "suspended") continue;
      const user = await userBySubject(ctx, m.userId);
      if (!user?.email) continue;
      members.push({
        subject: m.userId,
        email: normalizeEmail(user.email),
        name: user.name,
        picture: user.picture,
        role: toSyncRole(m.role),
      });
    }

    const caller = await userBySubject(ctx, callerId);
    const callerMembership = await membershipOf(ctx, args.companyId, callerId);
    const isAdmin =
      isPlatformPrivileged(caller?.role) || callerMembership?.role === "company_admin";
    const invites = isAdmin
      ? (
          await ctx.db
            .query("companyInvites")
            .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
            .collect()
        )
          .filter((i) => i.status === "pending")
          .map((i) => ({ email: i.email, name: i.name, role: toSyncRole(i.role) }))
      : [];

    return { members, invites };
  },
});

export type InviteOutcome =
  | "added"
  | "invited"
  | "already_member"
  | "already_invited"
  | "suspended"
  | "revoked"
  | "invalid_email";

/**
 * Bring desktop-only people into a hosted company. An address that already
 * has a hosted account is added as a member directly (the same thing a
 * company admin can do from the admin panel); any other address gets a
 * pending invite and one email.
 *
 * Idempotent: a desktop sync calls this on every run for everyone the hosted
 * company does not know yet, and only the first call sends anything.
 * Decisions made on the hosted side win - a suspended member or a revoked
 * invite is reported back, not reversed.
 */
export const inviteFromDesktop = mutation({
  args: {
    companyId: v.id("companies"),
    invitees: v.array(
      v.object({ email: v.string(), name: v.optional(v.string()), role: roleValidator }),
    ),
  },
  handler: async (ctx, args) => {
    if (isSelfHostedDeployment()) {
      throw new Error("Invitations from a desktop install are sent to the hosted deployment.");
    }
    const actorId = await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    if (args.invitees.length > MAX_INVITES_PER_CALL) {
      throw new Error(`At most ${MAX_INVITES_PER_CALL} invitations per call.`);
    }
    const company = await ctx.db.get(args.companyId);
    if (!company?.isActive) throw new Error("Company not found");
    const actor = await userBySubject(ctx, actorId);

    const now = new Date().toISOString();
    const results: Array<{ email: string; outcome: InviteOutcome }> = [];
    for (const invitee of args.invitees) {
      const email = normalizeEmail(invitee.email);
      if (!isValidEmail(email)) {
        results.push({ email, outcome: "invalid_email" });
        continue;
      }

      const account = (await usersByEmail(ctx, email))[0];
      if (account) {
        const existing = await membershipOf(ctx, args.companyId, account.clerkUserId);
        if (existing?.status === "suspended") {
          results.push({ email, outcome: "suspended" });
        } else if (existing) {
          results.push({ email, outcome: "already_member" });
        } else {
          await ctx.db.insert("companyMemberships", {
            companyId: args.companyId,
            userId: account.clerkUserId,
            role: invitee.role,
            status: "active",
            addedBy: actorId,
            createdAt: now,
            updatedAt: now,
          });
          results.push({ email, outcome: "added" });
        }
        continue;
      }

      const invite = await ctx.db
        .query("companyInvites")
        .withIndex("by_companyId_email", (q) =>
          q.eq("companyId", args.companyId).eq("email", email),
        )
        .first();
      if (invite?.status === "revoked") {
        results.push({ email, outcome: "revoked" });
        continue;
      }
      if (invite) {
        if (invite.status === "pending" && invite.role !== invitee.role) {
          await ctx.db.patch(invite._id, { role: invitee.role, updatedAt: now });
        }
        results.push({ email, outcome: "already_invited" });
        continue;
      }

      await ctx.db.insert("companyInvites", {
        companyId: args.companyId,
        email,
        name: invitee.name?.trim() || undefined,
        role: invitee.role,
        status: "pending",
        source: "desktop",
        invitedBy: actorId,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(0, internal.notifications.sendCompanyInviteEmail, {
        email,
        name: invitee.name?.trim() || undefined,
        companyName: company.name,
        inviterName: actor?.name || actor?.email || undefined,
      });
      results.push({ email, outcome: "invited" });
    }
    return { results };
  },
});

/** Company admins: the company's invitations, newest first. */
export const listInvites = query({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    await requireCompanyRole(ctx, args.companyId, ["company_admin"]);
    const invites = await ctx.db
      .query("companyInvites")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return invites.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
});

/** Company admins: withdraw a pending invite. A later desktop sync will not re-send it. */
export const revokeInvite = mutation({
  args: { inviteId: v.id("companyInvites") },
  handler: async (ctx, args) => {
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) throw new Error("Invite not found");
    await requireCompanyRole(ctx, invite.companyId, ["company_admin"]);
    if (invite.status !== "pending") return;
    await ctx.db.patch(invite._id, { status: "revoked", updatedAt: new Date().toISOString() });
  },
});

// ---------------------------------------------------------------------------
// Local side: remembering the hosted directory, and who it is missing
// ---------------------------------------------------------------------------

function requireSelfHosted(): void {
  if (!isSelfHostedDeployment()) {
    throw new Error("The directory sync can only be applied on a self-hosted install.");
  }
}

async function findMirroredCompany(ctx: QueryCtx | MutationCtx, origin: string, originId: string) {
  const candidates = await ctx.db
    .query("companies")
    .withIndex("by_mirror_originId", (q) => q.eq("mirror.originId", originId))
    .collect();
  return candidates.find((c) => c.mirror?.origin === origin) ?? null;
}

/**
 * Grant `userId` a directory-derived membership unless it already holds one.
 * A membership made on this install (no mirror marker) is left exactly as is;
 * a mirrored one follows the hosted role.
 */
async function ensureMirroredMembership(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  userId: string,
  role: SyncRole,
  mirror: { origin: string; subject: string },
  addedBy: string,
  now: string,
): Promise<"created" | "updated" | "kept"> {
  const existing = await membershipOf(ctx, companyId, userId);
  if (!existing) {
    await ctx.db.insert("companyMemberships", {
      companyId,
      userId,
      role,
      status: "active",
      addedBy,
      createdAt: now,
      updatedAt: now,
      mirror,
    });
    return "created";
  }
  if (!existing.mirror || existing.mirror.subject !== mirror.subject) return "kept";
  if (existing.role !== role || existing.status !== "active") {
    await ctx.db.patch(existing._id, { role, status: "active", updatedAt: now });
    return "updated";
  }
  return "kept";
}

/**
 * Remember the members of a mirrored company on this install.
 *
 * - Each hosted member gets a `users` row keyed by their hosted subject (so
 *   signing in here with that hosted account finds it) and a membership with
 *   their hosted company role.
 * - Each approved local account with the same email gets the same membership,
 *   so the person is recognised whichever way they sign in.
 * - Directory-derived memberships of people who have left the hosted company
 *   are removed. Memberships made on this install are never touched.
 *
 * The caller's own membership is applyCompany's business and is not changed.
 * Platform roles are never copied: a hosted "admin" is AeroGap staff, which
 * means nothing on somebody's own computer.
 */
export const applyCompanyMembers = mutation({
  args: {
    origin: v.string(),
    companyOriginId: v.string(),
    members: v.array(
      v.object({
        subject: v.string(),
        email: v.string(),
        name: v.optional(v.string()),
        picture: v.optional(v.string()),
        role: roleValidator,
      }),
    ),
  },
  handler: async (ctx, args) => {
    requireSelfHosted();
    const callerId = await requireAuth(ctx);
    if (args.members.length > MAX_MEMBERS_PER_SYNC) {
      throw new Error(`At most ${MAX_MEMBERS_PER_SYNC} members per company.`);
    }
    const company = await findMirroredCompany(ctx, args.origin, args.companyOriginId);
    if (!company) throw new Error("The company has not been mirrored yet.");
    await requireCompanyMembership(ctx, company._id);

    const now = new Date().toISOString();
    const autoApprove = isDesktopDeployment();
    const counts = { members: 0, usersCreated: 0, memberships: 0, linked: 0, removed: 0 };
    const current = new Set<string>();

    for (const member of args.members) {
      // A hosted directory never contains a locally-issued subject; refusing
      // one keeps a crafted payload from re-keying a local account.
      if (isLocalSubject(member.subject)) continue;
      const email = normalizeEmail(member.email);
      if (!isValidEmail(email)) continue;
      current.add(member.subject);
      counts.members += 1;

      const user = await userBySubject(ctx, member.subject);
      if (!user) {
        await ctx.db.insert("users", {
          clerkUserId: member.subject,
          email,
          name: member.name,
          picture: member.picture,
          role: "user",
          // A desktop admits everyone anyway. A server install keeps its
          // approval gate: being on the hosted roster is not an admin's say-so.
          approvalStatus: autoApprove ? "approved" : "pending",
          approvedAt: autoApprove ? now : undefined,
          createdAt: now,
          lastSignInAt: now,
          mirroredFrom: args.origin,
        });
        counts.usersCreated += 1;
      } else if (user.mirroredFrom) {
        // Never signed in here: the hosted profile is the only one there is.
        await ctx.db.patch(user._id, { email, name: member.name, picture: member.picture });
      }

      if (member.subject !== callerId) {
        const r = await ensureMirroredMembership(
          ctx,
          company._id,
          member.subject,
          member.role,
          { origin: args.origin, subject: member.subject },
          callerId,
          now,
        );
        if (r !== "kept") counts.memberships += 1;
      }

      const twins = (await usersByEmail(ctx, email)).filter(
        (u) => u.clerkUserId !== member.subject && isLocalSubject(u.clerkUserId) && isUserApproved(u),
      );
      for (const twin of twins) {
        const r = await ensureMirroredMembership(
          ctx,
          company._id,
          twin.clerkUserId,
          member.role,
          { origin: args.origin, subject: member.subject },
          callerId,
          now,
        );
        if (r === "created") counts.linked += 1;
      }
    }

    const all = await ctx.db
      .query("companyMemberships")
      .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
      .collect();
    for (const stale of staleMirroredMemberships(all, args.origin, current)) {
      if (stale.userId === callerId) continue;
      await ctx.db.delete(stale._id);
      counts.removed += 1;
    }

    return counts;
  },
});

/**
 * For every company mirrored from `origin` that the caller administers here,
 * the members the hosted company does not have yet - the people a sync should
 * invite there. Hosted members are known from the directory-derived
 * memberships applyCompanyMembers wrote.
 */
export const localOnlyMembers = query({
  args: { origin: v.string() },
  handler: async (ctx, args) => {
    requireSelfHosted();
    const callerId = await requireAuth(ctx);
    const caller = await userBySubject(ctx, callerId);
    const privileged = isPlatformPrivileged(caller?.role);

    const companies = (await ctx.db.query("companies").collect()).filter(
      (c) => c.mirror?.origin === args.origin && c.isActive,
    );
    const out: Array<{
      companyOriginId: string;
      companyName: string;
      invitees: Array<{ email: string; name?: string; role: SyncRole }>;
    }> = [];

    for (const company of companies) {
      const memberships = await ctx.db
        .query("companyMemberships")
        .withIndex("by_companyId", (q) => q.eq("companyId", company._id))
        .collect();
      const mine = memberships.find((m) => m.userId === callerId);
      if (!privileged && (mine?.role !== "company_admin" || mine.status === "suspended")) continue;

      const hostedEmails = new Set<string>();
      const candidates: LocalMemberCandidate[] = [];
      const usersById = new Map<string, Doc<"users"> | null>();
      for (const m of memberships) {
        if (!usersById.has(m.userId)) usersById.set(m.userId, await userBySubject(ctx, m.userId));
        const user = usersById.get(m.userId);
        if (m.mirror && m.mirror.subject === m.userId && user?.email) {
          hostedEmails.add(normalizeEmail(user.email));
        }
        candidates.push({
          userId: m.userId,
          role: m.role,
          status: m.status,
          mirrored: Boolean(m.mirror),
          email: user?.email,
          name: user?.name,
        });
      }
      // The caller is in the hosted company by definition (that is how the
      // company got here), even though their membership carries no marker.
      if (caller?.email) hostedEmails.add(normalizeEmail(caller.email));

      const invitees = selectLocalOnlyMembers(candidates, callerId, hostedEmails);
      if (invitees.length > 0) {
        out.push({
          companyOriginId: company.mirror!.originId,
          companyName: company.name,
          invitees,
        });
      }
    }
    return out;
  },
});
