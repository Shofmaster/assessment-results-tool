import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { verifyDeletionPinConstantTime } from "./deletionPinCrypto";

/** Convex validator for destructive mutations. */
export const deletionStepUpArg = v.union(
  v.object({ kind: v.literal("pin"), pin: v.string() }),
  v.object({ kind: v.literal("passwordTicket"), ticketId: v.id("stepUpTickets") }),
);

export type DeletionStepUp =
  | { kind: "pin"; pin: string }
  | { kind: "passwordTicket"; ticketId: Id<"stepUpTickets"> };

const MIN_PIN_LEN = 6;
const MAX_PIN_LEN = 32;

export function validateNewDeletionPinFormat(pin: string): void {
  const t = pin.trim();
  if (t.length < MIN_PIN_LEN || t.length > MAX_PIN_LEN) {
    throw new Error(`Deletion PIN must be between ${MIN_PIN_LEN} and ${MAX_PIN_LEN} characters.`);
  }
}

/** Throws if PIN is not configured or step-up fails. Consumes password tickets (marks usedAt). */
export async function assertDeletionStepUp(
  ctx: MutationCtx,
  clerkUserId: string,
  user: Doc<"users"> | null | undefined,
  stepUp: DeletionStepUp,
): Promise<void> {
  if (!user?.deletionPinHash || !user.deletionPinSalt || user.deletionPinIterations === undefined) {
    throw new Error("Set a deletion PIN in Settings before deleting data.");
  }

  if (stepUp.kind === "pin") {
    const ok = await verifyDeletionPinConstantTime(
      stepUp.pin,
      user.deletionPinSalt,
      user.deletionPinHash,
      user.deletionPinIterations,
    );
    if (!ok) throw new Error("Incorrect deletion PIN.");
    return;
  }

  const ticket = await ctx.db.get(stepUp.ticketId);
  if (!ticket || ticket.userId !== clerkUserId) {
    throw new Error("Invalid or expired verification.");
  }
  if (ticket.usedAt) throw new Error("This verification was already used.");
  if (new Date(ticket.expiresAt).getTime() < Date.now()) {
    throw new Error("Password verification expired. Try again.");
  }
  await ctx.db.patch(stepUp.ticketId, { usedAt: new Date().toISOString() });
}

/** Load `users` row and run `assertDeletionStepUp` (after you already have `clerkUserId` from `requireAuth`). */
export async function assertDeletionStepUpForUserId(
  ctx: MutationCtx,
  clerkUserId: string,
  stepUp: DeletionStepUp,
): Promise<void> {
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
    .first();
  await assertDeletionStepUp(ctx, clerkUserId, user, stepUp);
}
