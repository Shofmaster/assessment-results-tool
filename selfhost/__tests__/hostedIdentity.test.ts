import { describe, it, expect } from 'vitest';
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto';
import { createHostedIdentity } from '../server/src/hostedIdentity.js';

/**
 * Offline verification of a Clerk-shaped token against a PEM public key.
 *
 * Clerk's own tokens are RS256 with the tenant's key; we stand in for the
 * tenant with a key pair generated here, which is exactly what CLERK_JWT_KEY
 * is: the public half, and nothing else.
 */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');

function clerkToken(claims: Record<string, unknown>, key = privateKey): string {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: 'https://clerk.example.com',
    sub: 'user_2abcdef',
    aud: 'convex',
    iat: now,
    nbf: now - 5,
    exp: now + 60,
    ...claims,
  };
  const input = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64(body)}`;
  const sig = cryptoSign('RSA-SHA256', Buffer.from(input), key).toString('base64url');
  return `${input}.${sig}`;
}

describe('createHostedIdentity().verify', () => {
  const identity = createHostedIdentity({ jwtKey: PEM, convexUrl: '' });

  it('accepts a token signed by the tenant key and returns its subject', async () => {
    const claims = await identity.verify(clerkToken({ email: 'jane@example.com', name: 'Jane' }));
    expect(claims).toEqual({ subject: 'user_2abcdef', email: 'jane@example.com', name: 'Jane' });
  });

  it('rejects a token signed by any other key', async () => {
    // Note: @clerk/backend caches the first local jwtKey for the life of the
    // process, so this file uses ONE verifier key throughout. In production
    // there is exactly one tenant key, so the cache is harmless there.
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(await identity.verify(clerkToken({}, other))).toBeNull();
  });

  it('rejects an expired token', async () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(await identity.verify(clerkToken({ iat: past - 60, exp: past }))).toBeNull();
  });

  it('rejects a subject that is not a Clerk user id', async () => {
    // A locally-issued subject signed with the tenant key cannot happen, but the
    // shape check keeps the two identity spaces from ever crossing.
    expect(await identity.verify(clerkToken({ sub: 'local|abc' }))).toBeNull();
  });

  it('rejects garbage without throwing', async () => {
    for (const token of ['', 'a', 'a.b', 'a.b.c', 'a.b.c.d']) {
      expect(await identity.verify(token)).toBeNull();
    }
  });

  it('is inert without a key', async () => {
    expect(await createHostedIdentity({ jwtKey: '   ', convexUrl: '' }).verify(clerkToken({}))).toBeNull();
  });
});

describe('createHostedIdentity().profile', () => {
  it('is null when there is no local Convex to ask', async () => {
    expect(await createHostedIdentity({ jwtKey: PEM, convexUrl: '' }).profile('x.y.z')).toBeNull();
  });
});
