/**
 * Account records for a self-hosted install that issues its own identities.
 *
 * EVERY EXPORT HERE IS INTERNAL. None of it is callable from a browser, and
 * that is the point: these functions read and write password hashes, and a
 * public query one refactor away from returning a row would hand the whole
 * credential database to anyone with a session.
 *
 * The only way in is `convex/localAuthActions.ts`, a "use node" action reached
 * through a service-token-gated HTTP route. It verifies a password INSIDE
 * Convex and returns an identity, never a hash - so a leaked service token
 * yields the ability to attempt a sign-in, which is what a login form already
 * offers, rather than the hashes themselves.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * How many consecutive failures before an account is briefly locked.
 *
 * Deliberately generous, and deliberately not permanent. This is a maintenance
 * shop, not a bank: the realistic threat is someone guessing down a list of
 * common passwords, not a determined attacker who already has loopback access
 * to the machine. A permanent lock would turn a mistyped password into a
 * support call on a system with no password-reset email.
 */
export const MAX_FAILED_ATTEMPTS = 10;
export const LOCKOUT_MS = 15 * 60 * 1000;

export const _byEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("localAuthAccounts")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first(),
});

export const _bySubject = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("localAuthAccounts")
      .withIndex("by_subject", (q) => q.eq("subject", args.subject))
      .first(),
});

/** Whether ANY account exists. Decides if a sign-up is the first-run owner. */
export const _isEmpty = internalQuery({
  args: {},
  handler: async (ctx) => (await ctx.db.query("localAuthAccounts").first()) === null,
});

/**
 * The role recorded for a subject in the `users` table.
 *
 * Reads `users`, not `localAuthAccounts`: credentials and authority are
 * different things, and roles live where the rest of the application already
 * looks for them. Returns null when there is no row, so an unknown subject can
 * never be treated as an administrator.
 */
export const _callerRole = internalQuery({
  args: { subject: v.string() },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", args.subject))
      .first();
    return user?.role ?? null;
  },
});

export const _create = internalMutation({
  args: {
    subject: v.string(),
    email: v.string(),
    passwordHash: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    // Checked here rather than trusted from the caller: two sign-ups racing on
    // the same address would otherwise both succeed, and the second would
    // silently shadow the first at every by_email lookup.
    const existing = await ctx.db
      .query("localAuthAccounts")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existing) throw new Error("An account with that email address already exists.");

    return await ctx.db.insert("localAuthAccounts", {
      subject: args.subject,
      email,
      passwordHash: args.passwordHash,
      name: args.name,
      createdAt: new Date().toISOString(),
      failedAttempts: 0,
    });
  },
});

/** Record a successful sign-in and clear the failure counter. */
export const _recordSuccess = internalMutation({
  args: { subject: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("localAuthAccounts")
      .withIndex("by_subject", (q) => q.eq("subject", args.subject))
      .first();
    if (!account) return;
    await ctx.db.patch(account._id, {
      lastSignInAt: new Date().toISOString(),
      failedAttempts: 0,
      lockedUntil: undefined,
    });
  },
});

/** Record a failure, locking the account once the budget is spent. */
export const _recordFailure = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("localAuthAccounts")
      .withIndex("by_email", (q) => q.eq("email", args.email.trim().toLowerCase()))
      .first();
    // A failure against an address with no account is not recorded anywhere.
    // Creating a row would turn this table into a list of every address anyone
    // has ever tried, and give an attacker a way to grow the database.
    if (!account) return;

    const failed = (account.failedAttempts ?? 0) + 1;
    await ctx.db.patch(account._id, {
      failedAttempts: failed,
      lockedUntil: failed >= MAX_FAILED_ATTEMPTS ? Date.now() + LOCKOUT_MS : account.lockedUntil,
    });
  },
});

/** Change a password. Also clears any lockout - the user has proved themselves. */
export const _setPassword = internalMutation({
  args: { subject: v.string(), passwordHash: v.string() },
  handler: async (ctx, args) => {
    const account = await ctx.db
      .query("localAuthAccounts")
      .withIndex("by_subject", (q) => q.eq("subject", args.subject))
      .first();
    if (!account) throw new Error("No such account.");
    await ctx.db.patch(account._id, {
      passwordHash: args.passwordHash,
      failedAttempts: 0,
      lockedUntil: undefined,
    });
  },
});
