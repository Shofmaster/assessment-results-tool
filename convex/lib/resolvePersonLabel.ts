import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { personLabel } from "./personLabel";

export type ResolvedPerson = {
  label: string;
  email: string;
  picture: string | null;
};

/** Queries and mutations both expose a read-only `db.query`. */
type ReaderCtx = QueryCtx | MutationCtx;

/**
 * Resolve display labels for Clerk / local subjects.
 *
 * Index lookup is the normal path. An email-shaped id (legacy rows) falls
 * back to one users-table read. Unresolved subjects become "Unknown user"
 * rather than the raw id.
 */
export async function peopleForSubjects(
  ctx: ReaderCtx,
  subjects: Array<string | null | undefined>,
): Promise<Map<string, ResolvedPerson>> {
  const unique = [...new Set(subjects.filter((s): s is string => typeof s === "string" && s.length > 0))];
  const found = new Map<string, Doc<"users">>();
  const missing: string[] = [];

  for (const id of unique) {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", id))
      .first();
    if (user) found.set(id, user);
    else missing.push(id);
  }

  const emailish = missing.filter((id) => id.includes("@"));
  if (emailish.length > 0) {
    const all = await ctx.db.query("users").collect();
    const byEmail = new Map<string, Doc<"users">>();
    for (const user of all) {
      const email = user.email.trim().toLowerCase();
      if (email && !byEmail.has(email)) byEmail.set(email, user);
    }
    for (const id of emailish) {
      const match = byEmail.get(id.trim().toLowerCase());
      if (match) found.set(id, match);
    }
  }

  const people = new Map<string, ResolvedPerson>();
  for (const id of unique) {
    const user = found.get(id);
    people.set(id, {
      label: personLabel(user, id),
      email: (user?.email || "").trim(),
      picture: user?.picture ?? null,
    });
  }
  return people;
}
