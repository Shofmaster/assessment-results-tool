import { describe, expect, it } from "vitest";
import {
  isLocalSubject,
  isValidEmail,
  normalizeEmail,
  selectLocalOnlyMembers,
  staleMirroredMemberships,
  toSyncRole,
  verifiedTokenEmail,
  type LocalMemberCandidate,
} from "../userSync";

describe("email helpers", () => {
  it("normalizes case and whitespace", () => {
    expect(normalizeEmail("  Alice@Acme.AERO ")).toBe("alice@acme.aero");
  });

  it("accepts ordinary addresses and rejects junk", () => {
    expect(isValidEmail("alice@acme.aero")).toBe(true);
    expect(isValidEmail("alice@acme")).toBe(false);
    expect(isValidEmail("al ice@acme.aero")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("tells local subjects from hosted ones", () => {
    expect(isLocalSubject("local|0b7c")).toBe(true);
    expect(isLocalSubject("user_2abc")).toBe(false);
  });

  it("maps unknown company roles to the least privileged one", () => {
    expect(toSyncRole("company_admin")).toBe("company_admin");
    expect(toSyncRole("company_manager")).toBe("company_manager");
    expect(toSyncRole("owner")).toBe("company_user");
    expect(toSyncRole(undefined)).toBe("company_user");
  });
});

describe("verifiedTokenEmail", () => {
  it("trusts only an email the token marks verified", () => {
    expect(verifiedTokenEmail({ email: "Alice@Acme.aero", emailVerified: true })).toBe("alice@acme.aero");
    expect(verifiedTokenEmail({ email: "alice@acme.aero", emailVerified: false })).toBeNull();
    // A template without the verified claim is not good enough to claim an invite.
    expect(verifiedTokenEmail({ email: "alice@acme.aero" })).toBeNull();
    expect(verifiedTokenEmail({ emailVerified: true })).toBeNull();
    expect(verifiedTokenEmail(null)).toBeNull();
  });
});

describe("staleMirroredMemberships", () => {
  const origin = "https://hosted.example.convex.cloud";
  const rows = [
    { id: 1, mirror: { origin, subject: "user_alice" } },
    { id: 2, mirror: { origin, subject: "user_bob" } }, // bob left upstream
    { id: 3, mirror: { origin, subject: "user_bob" } }, // bob's linked local account
    { id: 4 }, // made on this computer
    { id: 5, mirror: { origin: "https://other.convex.cloud", subject: "user_bob" } },
  ];

  it("removes only this origin's directory rows for people no longer upstream", () => {
    const stale = staleMirroredMemberships(rows, origin, new Set(["user_alice"]));
    expect(stale.map((r) => r.id)).toEqual([2, 3]);
  });
});

describe("selectLocalOnlyMembers", () => {
  const base: Omit<LocalMemberCandidate, "userId" | "email"> = {
    role: "company_user",
    status: "active",
    mirrored: false,
    name: undefined,
  };
  const row = (userId: string, email: string | undefined, extra: Partial<LocalMemberCandidate> = {}) => ({
    ...base,
    userId,
    email,
    ...extra,
  });

  it("returns people made on this computer that the hosted company does not know", () => {
    const out = selectLocalOnlyMembers(
      [
        row("local|me", "me@acme.aero", { role: "company_admin" }), // the caller
        row("local|bob", "Bob@Acme.aero", { name: "Bob", role: "company_manager" }),
        row("user_alice", "alice@acme.aero", { mirrored: true }), // from the directory
        row("local|alice", "alice@acme.aero", { mirrored: true }), // linked twin
        row("local|carol", "carol@acme.aero"), // carol is already a hosted member
        row("local|dan", "dan@acme.aero", { status: "suspended" }),
        row("local|erin", undefined),
        row("local|bob2", "bob@acme.aero"), // duplicate address
      ],
      "local|me",
      new Set(["alice@acme.aero", "carol@acme.aero"]),
    );
    expect(out).toEqual([{ email: "bob@acme.aero", name: "Bob", role: "company_manager" }]);
  });
});
