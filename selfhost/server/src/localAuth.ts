/**
 * The local identity provider.
 *
 * WHY THIS EXISTS
 * Clerk production keys refuse a loopback origin - verified against the real
 * instance, which answered HTTP 400: "Production Keys are only allowed for
 * domain aerogaptechnologies.com". There is no allowed-origins setting that
 * lifts it, and the only documented workaround needs HTTPS on port 443 with a
 * certificate we would have to ship, private key and all, to every customer.
 *
 * So a self-hosted install issues its own tokens. Convex trusts them through a
 * `customJwt` provider - proven against the real backend, including that it
 * fetches a JWKS over plain http on 127.0.0.1 and that it REJECTS a token
 * signed by the wrong key.
 *
 * This turns out to be the better story anyway: identity now never leaves the
 * customer's network, which is what an on-prem buyer assumed they were getting.
 *
 * SCOPE
 * Key custody, token minting and password hashing. Account storage lives in
 * Convex; HTTP routes live in index.ts. Everything here is pure enough to test
 * without a server, which is the point - this is the code where a mistake is a
 * silent authentication bypass rather than a visible failure.
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * RS256, not ES256.
 *
 * Convex accepts either. RS256 is what the spike actually proved end to end
 * against the real backend, and an unverified change to the algorithm of an
 * auth system is not worth the smaller signature.
 */
const ALGORITHM = 'RS256';
const KEY_BITS = 2048;

/**
 * How long a minted token is valid.
 *
 * Short, because a token is a bearer credential and this one is not revocable
 * once issued - there is no introspection endpoint. The client re-mints from
 * its session before expiry, so the user never sees this number.
 */
export const TOKEN_TTL_SECONDS = 60 * 60;

/**
 * Audiences, and why there are two.
 *
 * `convex` is what the Convex provider is configured to accept. `session` is the
 * long-lived browser cookie. They are DIFFERENT on purpose: the session cookie
 * lives for weeks and is readable by nothing but the server, while a Convex
 * token lives an hour and is handed to the browser to use.
 *
 * If they shared an audience, a stolen session cookie would be a directly usable
 * Convex credential with weeks of life, and the short Convex TTL - the whole
 * point of minting them separately - would buy nothing. verifyToken checks the
 * audience, so neither can be replayed as the other.
 */
export const AUDIENCE = 'convex';
export const SESSION_AUDIENCE = 'session';

/**
 * How long a browser session lasts before the user must sign in again.
 *
 * Weeks, not hours. This is a maintenance shop's own machine, and a mechanic
 * signing in every morning would simply pick a shorter password.
 */
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Subject prefix.
 *
 * `users.clerkUserId` holds whatever the identity provider calls the user. A
 * distinct prefix makes it obvious at a glance which provider a row came from,
 * and guarantees a local subject can never collide with a Clerk id (`user_...`).
 *
 * FIX THIS BEFORE ANY CUSTOMER DATA EXISTS. Changing the format later re-keys
 * every user row and every audit record that references one.
 */
export const SUBJECT_PREFIX = 'local|';

/**
 * Subject prefix of a HOSTED identity (Clerk's `user_...`).
 *
 * A desktop install mints sessions for these too: after "Sign in with your
 * AeroGap account" the app server verifies the Clerk token with the tenant's
 * public key and issues its own 30-day session for the SAME subject, so the
 * person keeps working - as the same `users` row - when the connection is gone
 * and Clerk can no longer refresh their token. See localAuthRoutes.ts,
 * POST /local-auth/hosted-session.
 */
export const HOSTED_SUBJECT_PREFIX = 'user_';

/**
 * Is this a subject this install may put in a token it signs?
 *
 * Only the two shapes that exist. The check is defence in depth - the signature
 * already proves the server minted it - but it stops a bug elsewhere from
 * signing an arbitrary string that later resolves to a user row.
 */
export function isIssuableSubject(subject: unknown): subject is string {
  return (
    typeof subject === 'string' &&
    (subject.startsWith(SUBJECT_PREFIX) || subject.startsWith(HOSTED_SUBJECT_PREFIX)) &&
    subject.length > Math.max(SUBJECT_PREFIX.length, HOSTED_SUBJECT_PREFIX.length)
  );
}

export interface LocalKeyPair {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

export interface Jwks {
  keys: Array<Record<string, unknown>>;
}

export interface TokenClaims {
  iss: string;
  aud: string;
  sub: string;
  iat: number;
  exp: number;
  email?: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// Key custody
// ---------------------------------------------------------------------------

function keyFile(dataRoot: string): string {
  return join(dataRoot, 'config', 'local-auth-key.pem');
}

/**
 * Load the signing key, generating it once on first run.
 *
 * NEVER regenerated. A new key invalidates every outstanding token, and more
 * importantly the JWKS is fetched and cached by the Convex backend - so a
 * silently rotated key produces authentication failures that look like a broken
 * install rather than a key change.
 *
 * The private key sits in config/ beside the instance secret, inside the user's
 * own profile on a desktop install and in an ACL'd directory on a server one.
 * It is exactly as sensitive as the database it protects.
 */
export function loadOrCreateKeyPair(dataRoot: string): LocalKeyPair {
  const file = keyFile(dataRoot);

  if (existsSync(file)) {
    const pem = readFileSync(file, 'utf8');
    const privateKey = createPrivateKey(pem);
    const publicKey = createPublicKey(privateKey);
    return { kid: keyId(publicKey), privateKey, publicKey };
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: KEY_BITS });
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    // 0o600 is advisory on Windows; the directory ACL is the real control.
    { encoding: 'utf8', mode: 0o600 },
  );
  return { kid: keyId(publicKey), privateKey, publicKey };
}

/**
 * Key id, derived from the key itself rather than random.
 *
 * Deriving it means the same key always produces the same `kid`, so a restart
 * cannot invalidate tokens minted before it - which a random id would do, and
 * only for users who happened to be signed in across the restart.
 */
function keyId(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' }) as { n?: string };
  return Buffer.from(String(jwk.n || ''))
    .toString('base64url')
    .slice(0, 16);
}

/**
 * The public half, in the shape Convex fetches.
 *
 * An ARRAY even though there is one key today: rotation means publishing the
 * new key alongside the old until every outstanding token has expired, and a
 * shape that cannot express two keys forces a flag-day rotation instead.
 */
export function buildJwks(keyPair: LocalKeyPair): Jwks {
  const jwk = keyPair.publicKey.export({ format: 'jwk' });
  return { keys: [{ ...jwk, kid: keyPair.kid, use: 'sig', alg: ALGORITHM }] };
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

const b64url = (input: string | Buffer): string => Buffer.from(input).toString('base64url');

/** Mint a signed token for a user. */
export function mintToken(
  keyPair: LocalKeyPair,
  options: {
    issuer: string;
    subject: string;
    email?: string;
    name?: string;
    now?: number;
    audience?: string;
    ttlSeconds?: number;
  },
): string {
  const now = Math.floor((options.now ?? Date.now()) / 1000);
  const header = { alg: ALGORITHM, typ: 'JWT', kid: keyPair.kid };
  const claims: TokenClaims = {
    iss: options.issuer,
    aud: options.audience ?? AUDIENCE,
    sub: options.subject,
    iat: now,
    exp: now + (options.ttlSeconds ?? TOKEN_TTL_SECONDS),
    ...(options.email ? { email: options.email } : {}),
    ...(options.name ? { name: options.name } : {}),
  };

  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signature = cryptoSign('RSA-SHA256', Buffer.from(signingInput), keyPair.privateKey);
  return `${signingInput}.${signature.toString('base64url')}`;
}

export type TokenVerifyResult =
  | { ok: true; claims: TokenClaims }
  | { ok: false; reason: string };

/**
 * Verify a token this install issued.
 *
 * Convex does its own verification for Convex calls; this exists for the
 * app-tier guard in api/_lib/auth.ts, which must reach the same verdict. Two
 * verifiers disagreeing is how a request gets rejected by one layer and
 * accepted by another.
 *
 * Order matters: signature FIRST, then claims. Reading claims out of an
 * unverified token and acting on them is the classic JWT mistake.
 */
export function verifyToken(
  token: string,
  keyPair: LocalKeyPair,
  options: { issuer: string; now?: number; clockSkewSeconds?: number; audience?: string },
): TokenVerifyResult {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };

  const [headerPart, claimsPart, signaturePart] = parts;

  let header: { alg?: string; kid?: string };
  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed-header' };
  }

  // Refuse "none" and any algorithm substitution outright. An attacker who can
  // choose the algorithm can often choose one we verify differently.
  if (header.alg !== ALGORITHM) return { ok: false, reason: 'wrong-algorithm' };

  let signatureValid = false;
  try {
    signatureValid = cryptoVerify(
      'RSA-SHA256',
      Buffer.from(`${headerPart}.${claimsPart}`),
      keyPair.publicKey,
      Buffer.from(signaturePart, 'base64url'),
    );
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }
  if (!signatureValid) return { ok: false, reason: 'bad-signature' };

  let claims: TokenClaims;
  try {
    claims = JSON.parse(Buffer.from(claimsPart, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'malformed-claims' };
  }

  const skew = options.clockSkewSeconds ?? 10;
  const now = Math.floor((options.now ?? Date.now()) / 1000);

  if (claims.iss !== options.issuer) return { ok: false, reason: 'wrong-issuer' };
  // Defaults to the Convex audience, so a caller that forgets to say which kind
  // of token it expects gets the STRICTER answer rather than accepting both.
  if (claims.aud !== (options.audience ?? AUDIENCE)) {
    return { ok: false, reason: 'wrong-audience' };
  }
  if (typeof claims.exp !== 'number' || claims.exp + skew < now) {
    return { ok: false, reason: 'expired' };
  }
  if (typeof claims.iat === 'number' && claims.iat - skew > now) {
    return { ok: false, reason: 'issued-in-future' };
  }
  if (!isIssuableSubject(claims.sub)) {
    return { ok: false, reason: 'wrong-subject-format' };
  }

  return { ok: true, claims };
}

/** Mint the long-lived cookie value that represents a signed-in browser. */
export function mintSessionToken(
  keyPair: LocalKeyPair,
  options: { issuer: string; subject: string; email?: string; name?: string; now?: number },
): string {
  return mintToken(keyPair, {
    ...options,
    audience: SESSION_AUDIENCE,
    ttlSeconds: SESSION_TTL_SECONDS,
  });
}

/** Verify a session cookie. */
export function verifySessionToken(
  token: string,
  keyPair: LocalKeyPair,
  options: { issuer: string; now?: number },
): TokenVerifyResult {
  return verifyToken(token, keyPair, { ...options, audience: SESSION_AUDIENCE });
}

/** A new local user id. */
export function newSubject(): string {
  return `${SUBJECT_PREFIX}${randomUUID()}`;
}

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------
//
// Re-exported, not reimplemented. The canonical implementation lives in
// convex/lib/passwordHash.ts because VERIFICATION runs inside Convex, in a
// "use node" action, so a stored hash never has to be handed to the app tier to
// be checked. The app server still hashes on sign-up, and two implementations
// of one hash format drift - producing passwords that verify on one side and
// not the other, discovered by a locked-out customer.
export {
  hashPassword,
  verifyPassword,
  validatePassword,
  normalizeEmail,
  MIN_PASSWORD_LENGTH,
} from '../../../convex/lib/passwordHash.js';

/** The issuer URL this install advertises. Must match the Convex provider config. */
export function issuerFor(appOrigin: string): string {
  return `${appOrigin.replace(/\/+$/, '')}/local-auth`;
}

/** Where Convex fetches the public keys. */
export function jwksUrlFor(appOrigin: string): string {
  return `${issuerFor(appOrigin)}/.well-known/jwks.json`;
}
