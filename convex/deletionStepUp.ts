import { query, mutation, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { createClerkClient } from "@clerk/backend";
import { requireAuth } from "./_helpers";
import {
  deletionStepUpArg,
  assertDeletionStepUp,
  validateNewDeletionPinFormat,
} from "./deletionStepUpShared";
import {
  DELETION_PIN_PBKDF2_ITERATIONS,
  generateDeletionPinSaltBase64,
  hashDeletionPinForStorage,
} from "./deletionPinCrypto";

export const hasDeletionPin = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { configured: false as const };
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", identity.subject))
      .first();
    return { configured: Boolean(user?.deletionPinHash) };
  },
});

export const setDeletionPin = mutation({
  args: { newPin: v.string() },
  handler: async (ctx, args) => {
    const clerkUserId = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .first();
    if (!user) throw new Error("User record not found — try signing in again.");
    if (user.deletionPinHash) {
      throw new Error("A deletion PIN is already set. Use change deletion PIN instead.");
    }
    validateNewDeletionPinFormat(args.newPin);
    const salt = generateDeletionPinSaltBase64();
    const hash = await hashDeletionPinForStorage(
      args.newPin,
      salt,
      DELETION_PIN_PBKDF2_ITERATIONS,
    );
    await ctx.db.patch(user._id, {
      deletionPinSalt: salt,
      deletionPinHash: hash,
      deletionPinIterations: DELETION_PIN_PBKDF2_ITERATIONS,
    });
  },
});

export const changeDeletionPin = mutation({
  args: {
    newPin: v.string(),
    stepUp: deletionStepUpArg,
  },
  handler: async (ctx, args) => {
    const clerkUserId = await requireAuth(ctx);
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .first();
    if (!user?.deletionPinHash || user.deletionPinSalt === undefined || user.deletionPinIterations === undefined) {
      throw new Error("Set an initial deletion PIN first.");
    }
    await assertDeletionStepUp(ctx, clerkUserId, user, args.stepUp);
    validateNewDeletionPinFormat(args.newPin);
    const salt = generateDeletionPinSaltBase64();
    const hash = await hashDeletionPinForStorage(
      args.newPin,
      salt,
      DELETION_PIN_PBKDF2_ITERATIONS,
    );
    await ctx.db.patch(user._id, {
      deletionPinSalt: salt,
      deletionPinHash: hash,
      deletionPinIterations: DELETION_PIN_PBKDF2_ITERATIONS,
    });
  },
});

export const insertTicket = internalMutation({
  args: {
    userId: v.string(),
    expiresAt: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("stepUpTickets", {
      userId: args.userId,
      expiresAt: args.expiresAt,
      createdAt: new Date().toISOString(),
    });
  },
});

/** Creates a single-use ticket after Clerk verifies the account password (OAuth-only accounts cannot use this path). */
export const createPasswordStepUpTicket = action({
  args: { password: v.string() },
  handler: async (ctx, args): Promise<Id<"stepUpTickets">> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey?.trim()) {
      throw new Error(
        "Password verification is not configured. Set CLERK_SECRET_KEY in Convex environment, or use your deletion PIN instead.",
      );
    }

    const clerk = createClerkClient({ secretKey });
    try {
      await clerk.users.verifyPassword({
        userId: identity.subject,
        password: args.password,
      });
    } catch {
      throw new Error("Incorrect password or password sign-in not available for this account.");
    }

    const expiresAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
    return await ctx.runMutation(internal.deletionStepUp.insertTicket, {
      userId: identity.subject,
      expiresAt,
    });
  },
});
