"use node";

/**
 * Password hashing, in ONE place.
 *
 * WHY IT LIVES UNDER convex/lib RATHER THAN IN THE APP SERVER
 * Verification happens inside Convex, in a `"use node"` action, so that a
 * stored hash never has to be handed to the app tier to be checked. If the
 * server asked Convex for the hash and compared it itself, a leaked service
 * token would yield the whole password database; this way it yields only the
 * ability to attempt a sign-in, which is what a login form already offers.
 *
 * The app server still imports this module - for the sign-up path, where it
 * hashes before storing. Two implementations of a hash format drift, and the
 * failure mode is passwords that verify on one side and not the other, found by
 * a locked-out customer.
 *
 * scrypt is used rather than bcrypt or argon2: it is memory-hard, and it is
 * built into Node, so there is no native module to compile on a customer's
 * machine or to keep patched.
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * Cost parameters.
 *
 * Stored INSIDE each encoded hash rather than read from here at verification
 * time. That is what allows them to be raised later without invalidating
 * existing passwords: an old hash stays verifiable with its own parameters and
 * can be re-hashed on the next successful sign-in.
 */
const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

/** True when a stored hash should be upgraded to the current cost parameters. */
export function passwordNeedsRehash(encoded: string): boolean {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  return N !== SCRYPT_N || r !== SCRYPT_R || p !== SCRYPT_P;
}

/** Bound on what an attacker-supplied record may ask us to compute. */
const MAX_N = 1 << 20;
const MAX_R = 32;
const MAX_P = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(password.normalize("NFKC"), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    // Node's default maxmem is too small for N=32768; without this it throws.
    maxmem: 128 * 1024 * 1024,
  });
  return [
    "scrypt",
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString("base64url"),
    derived.toString("base64url"),
  ].join("$");
}

/**
 * Check a password against an encoded hash.
 *
 * Returns false rather than throwing on a malformed record: a corrupt row must
 * deny access, never crash the sign-in path in a way that could be probed for
 * information about which accounts exist.
 */
export function verifyPassword(password: string, encoded: string): boolean {
  const parts = String(encoded || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // A poisoned row claiming N=2^30 would otherwise let the database stall the
  // sign-in route for every user.
  if (N > MAX_N || r > MAX_R || p > MAX_P || N < 2 || r < 1 || p < 1) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "base64url");
    expected = Buffer.from(parts[5], "base64url");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  let derived: Buffer;
  try {
    derived = scryptSync(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: 256 * 1024 * 1024,
    });
  } catch {
    return false;
  }

  // Constant time: a plain comparison leaks how much of the hash matched.
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * Minimum password policy.
 *
 * Length only, deliberately. Composition rules (a number, a symbol, a capital)
 * measurably push people toward "Password1!" and away from length, which is the
 * property that actually resists guessing. NIST dropped them for that reason.
 */
export const MIN_PASSWORD_LENGTH = 12;

export function validatePassword(password: string): { ok: boolean; message?: string } {
  const value = String(password || "");
  if (value.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters. A short phrase you can remember is stronger than a short complicated word.`,
    };
  }
  if (value.length > 1024) {
    // Not a security limit - a bound on the work scrypt is asked to do.
    return { ok: false, message: "That password is too long." };
  }
  return { ok: true };
}

/** Normalise an email for storage and lookup. */
export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}
