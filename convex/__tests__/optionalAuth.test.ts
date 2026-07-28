import { describe, expect, it } from "vitest";
import { optionalAuth, requireAuth } from "../_helpers";

/**
 * Minimal stand-in for QueryCtx: optionalAuth/requireAuth only ever touch
 * ctx.auth.getUserIdentity(), so there is nothing else to fake.
 */
function ctxWithIdentity(identity: { subject: string } | null) {
  return {
    auth: {
      getUserIdentity: async () => identity,
    },
  } as unknown as Parameters<typeof optionalAuth>[0];
}

describe("optionalAuth", () => {
  it("returns the Clerk subject when signed in", async () => {
    await expect(optionalAuth(ctxWithIdentity({ subject: "user_123" }))).resolves.toBe(
      "user_123",
    );
  });

  it("returns null instead of throwing when signed out", async () => {
    await expect(optionalAuth(ctxWithIdentity(null))).resolves.toBeNull();
  });
});

describe("requireAuth", () => {
  it("still throws when signed out", async () => {
    // The contrast is the point: requireAuth stays the default for mutations and
    // admin queries, where a missing identity really is a fault.
    await expect(requireAuth(ctxWithIdentity(null))).rejects.toThrow("Not authenticated");
  });

  it("returns the Clerk subject when signed in", async () => {
    await expect(requireAuth(ctxWithIdentity({ subject: "user_123" }))).resolves.toBe(
      "user_123",
    );
  });
});
