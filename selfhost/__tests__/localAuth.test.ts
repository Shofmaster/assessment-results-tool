import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadOrCreateKeyPair,
  buildJwks,
  mintToken,
  verifyToken,
  newSubject,
  hashPassword,
  verifyPassword,
  validatePassword,
  issuerFor,
  jwksUrlFor,
  SUBJECT_PREFIX,
  isIssuableSubject,
  AUDIENCE,
  TOKEN_TTL_SECONDS,
  MIN_PASSWORD_LENGTH,
} from '../server/src/localAuth.js';

/**
 * This module decides who is signed in.
 *
 * A bug here is not a broken feature, it is a silent authentication bypass on a
 * system holding aviation maintenance records. So the tests are written from
 * the attacker's side wherever possible: forged signatures, swapped algorithms,
 * replayed and expired tokens, tokens from another install, poisoned password
 * records.
 */
const ISSUER = 'http://127.0.0.1:19080/local-auth';

let dataRoot: string;

beforeEach(() => {
  dataRoot = mkdtempSync(join(tmpdir(), 'aerogap-auth-'));
  mkdirSync(join(dataRoot, 'config'), { recursive: true });
});

afterEach(() => {
  rmSync(dataRoot, { recursive: true, force: true });
});

describe('signing key custody', () => {
  it('generates a key on first run and reuses it after', () => {
    const first = loadOrCreateKeyPair(dataRoot);
    const second = loadOrCreateKeyPair(dataRoot);
    expect(second.kid).toBe(first.kid);
  });

  it('NEVER regenerates the key', () => {
    // A silently rotated key invalidates every outstanding token AND the JWKS
    // the Convex backend has cached - which presents as a broken install, not
    // as a key change.
    const original = loadOrCreateKeyPair(dataRoot);
    const onDisk = readFileSync(join(dataRoot, 'config', 'local-auth-key.pem'), 'utf8');
    loadOrCreateKeyPair(dataRoot);
    expect(readFileSync(join(dataRoot, 'config', 'local-auth-key.pem'), 'utf8')).toBe(onDisk);
    expect(loadOrCreateKeyPair(dataRoot).kid).toBe(original.kid);
  });

  it('derives the key id from the key, so a restart cannot orphan live tokens', () => {
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const reloaded = loadOrCreateKeyPair(dataRoot);
    const token = mintToken(keyPair, { issuer: ISSUER, subject: newSubject() });
    // Minted before the "restart", verified after it.
    expect(verifyToken(token, reloaded, { issuer: ISSUER }).ok).toBe(true);
  });

  it('writes only the private key to disk, never the token material', () => {
    loadOrCreateKeyPair(dataRoot);
    const pem = readFileSync(join(dataRoot, 'config', 'local-auth-key.pem'), 'utf8');
    expect(pem).toMatch(/BEGIN PRIVATE KEY/);
  });

  it('publishes a JWKS Convex can consume', () => {
    const jwks = buildJwks(loadOrCreateKeyPair(dataRoot));
    expect(jwks.keys).toHaveLength(1);
    const key = jwks.keys[0] as Record<string, string>;
    expect(key.kty).toBe('RSA');
    expect(key.alg).toBe('RS256');
    expect(key.use).toBe('sig');
    expect(key.kid).toBeTruthy();
    expect(key.n).toBeTruthy();
    expect(key.e).toBe('AQAB');
  });

  it('never publishes the private half in the JWKS', () => {
    // `d` is the RSA private exponent. Exporting the private key as JWK would
    // include it, and publishing that hands over the whole identity system.
    const key = buildJwks(loadOrCreateKeyPair(dataRoot)).keys[0] as Record<string, unknown>;
    for (const secret of ['d', 'p', 'q', 'dp', 'dq', 'qi']) {
      expect(key).not.toHaveProperty(secret);
    }
  });

  it('uses an array so a key can be rotated without a flag day', () => {
    expect(Array.isArray(buildJwks(loadOrCreateKeyPair(dataRoot)).keys)).toBe(true);
  });
});

describe('minting and verifying', () => {
  it('round-trips a token', () => {
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const subject = newSubject();
    const token = mintToken(keyPair, {
      issuer: ISSUER,
      subject,
      email: 'chief@example.internal',
      name: 'Chief Inspector',
    });

    const result = verifyToken(token, keyPair, { issuer: ISSUER });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.sub).toBe(subject);
    expect(result.claims.aud).toBe(AUDIENCE);
    expect(result.claims.email).toBe('chief@example.internal');
  });

  it('sets an expiry matching the declared TTL', () => {
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const now = 1_700_000_000_000;
    const token = mintToken(keyPair, { issuer: ISSUER, subject: newSubject(), now });
    const result = verifyToken(token, keyPair, { issuer: ISSUER, now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.exp - result.claims.iat).toBe(TOKEN_TTL_SECONDS);
  });

  it('issues subjects that cannot collide with a Clerk id', () => {
    // users.clerkUserId holds both kinds. Clerk ids look like `user_2ab...`.
    const subject = newSubject();
    expect(subject.startsWith(SUBJECT_PREFIX)).toBe(true);
    expect(subject.startsWith('user_')).toBe(false);
  });
});

describe('tokens that must be refused', () => {
  it('refuses a token signed by a DIFFERENT key', () => {
    // The core forgery. Someone with their own keypair must not be able to mint
    // an identity for this install.
    const ours = loadOrCreateKeyPair(dataRoot);
    const theirsRaw = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const theirs = {
      kid: ours.kid, // even claiming OUR key id
      privateKey: theirsRaw.privateKey,
      publicKey: createPublicKey(theirsRaw.privateKey),
    };

    const forged = mintToken(theirs, { issuer: ISSUER, subject: newSubject() });
    expect(verifyToken(forged, ours, { issuer: ISSUER })).toMatchObject({
      ok: false,
      reason: 'bad-signature',
    });
  });

  it('refuses a token whose claims were edited after signing', () => {
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const token = mintToken(keyPair, { issuer: ISSUER, subject: `${SUBJECT_PREFIX}alice` });
    const [header, claims, signature] = token.split('.');

    const tampered = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8'));
    tampered.sub = `${SUBJECT_PREFIX}admin`;
    const forged = [
      header,
      Buffer.from(JSON.stringify(tampered)).toString('base64url'),
      signature,
    ].join('.');

    expect(verifyToken(forged, keyPair, { issuer: ISSUER }).ok).toBe(false);
  });

  it('refuses alg:none', () => {
    // The oldest JWT attack there is. A verifier that honours the header's
    // algorithm choice can be told not to verify at all.
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({
        iss: ISSUER,
        aud: AUDIENCE,
        sub: `${SUBJECT_PREFIX}admin`,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString('base64url');

    expect(verifyToken(`${header}.${claims}.`, keyPair, { issuer: ISSUER })).toMatchObject({
      ok: false,
      reason: 'wrong-algorithm',
    });
  });

  it('refuses an algorithm swap to HS256', () => {
    // If a verifier accepted HS256, the RSA PUBLIC key becomes the HMAC secret -
    // and the public key is, by definition, published.
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const claims = Buffer.from(
      JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: `${SUBJECT_PREFIX}x`, exp: 9_999_999_999 }),
    ).toString('base64url');
    expect(verifyToken(`${header}.${claims}.zzz`, keyPair, { issuer: ISSUER }).ok).toBe(false);
  });

  it('refuses an expired token', () => {
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const issuedAt = 1_700_000_000_000;
    const token = mintToken(keyPair, { issuer: ISSUER, subject: newSubject(), now: issuedAt });
    const wellAfter = issuedAt + (TOKEN_TTL_SECONDS + 3600) * 1000;
    expect(verifyToken(token, keyPair, { issuer: ISSUER, now: wellAfter })).toMatchObject({
      ok: false,
      reason: 'expired',
    });
  });

  it('refuses a token issued by ANOTHER install', () => {
    // Two customers each run their own issuer. A token from one must be
    // meaningless at the other, even though both are "http://127.0.0.1:...".
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const token = mintToken(keyPair, {
      issuer: 'http://127.0.0.1:29999/local-auth',
      subject: newSubject(),
    });
    expect(verifyToken(token, keyPair, { issuer: ISSUER })).toMatchObject({
      ok: false,
      reason: 'wrong-issuer',
    });
  });

  it('accepts a hosted (Clerk-shaped) subject - the install mints those for offline sessions', () => {
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const token = mintToken(keyPair, { issuer: ISSUER, subject: 'user_2abcdef' });
    expect(verifyToken(token, keyPair, { issuer: ISSUER })).toMatchObject({
      ok: true,
      claims: { sub: 'user_2abcdef' },
    });
    expect(isIssuableSubject('user_2abcdef')).toBe(true);
    expect(isIssuableSubject(`${SUBJECT_PREFIX}abc`)).toBe(true);
  });

  it('refuses a subject of any other shape', () => {
    // Defence in depth: only the two identity shapes that exist may be signed,
    // so a bug elsewhere cannot mint a token that resolves to an arbitrary row.
    const keyPair = loadOrCreateKeyPair(dataRoot);
    for (const subject of ['admin', 'user_', 'local|', 'clerk:user_1', 'USER_2abc']) {
      const token = mintToken(keyPair, { issuer: ISSUER, subject });
      expect(verifyToken(token, keyPair, { issuer: ISSUER })).toMatchObject({
        ok: false,
        reason: 'wrong-subject-format',
      });
      expect(isIssuableSubject(subject)).toBe(false);
    }
  });

  it.each([
    ['empty', ''],
    ['not a JWT', 'hello'],
    ['two segments', 'aaa.bbb'],
    ['four segments', 'a.b.c.d'],
    ['garbage segments', '!!!.???.***'],
  ])('refuses a %s token without throwing', (_label, token) => {
    const keyPair = loadOrCreateKeyPair(dataRoot);
    expect(() => verifyToken(token, keyPair, { issuer: ISSUER })).not.toThrow();
    expect(verifyToken(token, keyPair, { issuer: ISSUER }).ok).toBe(false);
  });
});

describe('passwords', () => {
  it('accepts the right password and rejects the wrong one', () => {
    const encoded = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', encoded)).toBe(true);
    expect(verifyPassword('correct horse battery stapl', encoded)).toBe(false);
  });

  it('never stores the password', () => {
    const encoded = hashPassword('a very secret passphrase');
    expect(encoded).not.toContain('a very secret passphrase');
    expect(encoded).not.toContain('secret');
  });

  it('salts, so identical passwords hash differently', () => {
    // Without a salt, one rainbow table breaks every account that chose the
    // same password - and in a small shop, several will.
    expect(hashPassword('same password here')).not.toBe(hashPassword('same password here'));
  });

  it('stores its cost parameters, so they can be raised later', () => {
    // An encoded hash that does not carry its own parameters cannot be verified
    // after the parameters change, which makes raising them a mass reset.
    expect(hashPassword('another passphrase')).toMatch(/^scrypt\$\d+\$\d+\$\d+\$/);
  });

  it('normalises unicode, so the same typed password works on any keyboard', () => {
    // The same accented character has two valid encodings; a macOS keyboard and
    // a Windows one can produce different bytes for identical input.
    const composed = 'contraseñasegura2026';
    const decomposed = composed.normalize('NFD');
    expect(composed).not.toBe(decomposed);
    expect(verifyPassword(decomposed, hashPassword(composed))).toBe(true);
  });

  it.each([
    ['malformed', 'not-a-hash'],
    ['wrong scheme', 'bcrypt$1$2$3$4$5'],
    ['empty', ''],
    ['truncated', 'scrypt$16384$8$1$abc'],
    ['non-numeric cost', 'scrypt$x$y$z$c2FsdA$aGFzaA'],
  ])('denies access on a %s stored record without throwing', (_label, encoded) => {
    expect(() => verifyPassword('anything', encoded)).not.toThrow();
    expect(verifyPassword('anything', encoded)).toBe(false);
  });

  it('refuses an absurd cost factor rather than hanging', () => {
    // A poisoned row claiming N=2^30 would otherwise let the database stall the
    // sign-in route.
    const started = Date.now();
    expect(verifyPassword('x', `scrypt$${1 << 30}$8$1$c2FsdA$aGFzaA`)).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('requires length rather than composition', () => {
    // Composition rules push people to "Password1!" and away from length, which
    // is the property that actually resists guessing.
    expect(validatePassword('short').ok).toBe(false);
    expect(validatePassword('a'.repeat(MIN_PASSWORD_LENGTH)).ok).toBe(true);
    expect(validatePassword('correct horse battery staple').ok).toBe(true);
    // No symbol, no digit, no capital - and that is fine.
    expect(validatePassword('thequickbrownfox').ok).toBe(true);
  });

  it('explains a rejected password in useful terms', () => {
    const result = validatePassword('abc');
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/at least 12 characters/i);
  });
});

describe('issuer URLs', () => {
  it('derives issuer and JWKS from the app origin', () => {
    expect(issuerFor('http://127.0.0.1:19080')).toBe('http://127.0.0.1:19080/local-auth');
    expect(jwksUrlFor('http://127.0.0.1:19080')).toBe(
      'http://127.0.0.1:19080/local-auth/.well-known/jwks.json',
    );
  });

  it('tolerates a trailing slash on the origin', () => {
    // APP_ORIGIN is operator-supplied in server mode; a trailing slash would
    // otherwise produce a double slash and an issuer mismatch that presents as
    // "every sign-in fails" with nothing useful in the logs.
    expect(issuerFor('https://aerogap.acme.local/')).toBe('https://aerogap.acme.local/local-auth');
  });
});

describe('session tokens versus Convex tokens', () => {
  /**
   * These are two different credentials with two different lifetimes, and the
   * separation is the reason the short Convex TTL is worth anything. A session
   * cookie lives for weeks; if it could be presented to Convex directly, the
   * hour-long token would be decoration.
   */
  it('a SESSION token is refused as a Convex token', async () => {
    const { mintSessionToken } = await import('../server/src/localAuth.js');
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const session = mintSessionToken(keyPair, { issuer: ISSUER, subject: newSubject() });

    expect(verifyToken(session, keyPair, { issuer: ISSUER })).toMatchObject({
      ok: false,
      reason: 'wrong-audience',
    });
  });

  it('a CONVEX token is refused as a session cookie', async () => {
    const { verifySessionToken } = await import('../server/src/localAuth.js');
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const convexToken = mintToken(keyPair, { issuer: ISSUER, subject: newSubject() });

    expect(verifySessionToken(convexToken, keyPair, { issuer: ISSUER })).toMatchObject({
      ok: false,
      reason: 'wrong-audience',
    });
  });

  it('a session token verifies as itself, and outlives a Convex token', async () => {
    const { mintSessionToken, verifySessionToken, SESSION_TTL_SECONDS } = await import(
      '../server/src/localAuth.js'
    );
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const now = 1_700_000_000_000;
    const session = mintSessionToken(keyPair, {
      issuer: ISSUER,
      subject: newSubject(),
      now,
    });

    const result = verifySessionToken(session, keyPair, { issuer: ISSUER, now });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims.exp - result.claims.iat).toBe(SESSION_TTL_SECONDS);
    expect(SESSION_TTL_SECONDS).toBeGreaterThan(TOKEN_TTL_SECONDS);
  });

  it('verifyToken defaults to the STRICTER audience when none is named', async () => {
    // A caller that forgets to say which kind of token it expects must get the
    // Convex answer, not "accept either".
    const { mintSessionToken } = await import('../server/src/localAuth.js');
    const keyPair = loadOrCreateKeyPair(dataRoot);
    const session = mintSessionToken(keyPair, { issuer: ISSUER, subject: newSubject() });
    expect(verifyToken(session, keyPair, { issuer: ISSUER }).ok).toBe(false);
  });
});
