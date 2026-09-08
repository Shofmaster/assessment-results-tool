#!/usr/bin/env node
/**
 * Fetch a Clerk instance's JWKS and write its signing key as a PEM.
 *
 * WHY
 * The desktop build verifies hosted-account tokens networklessly with the
 * instance's PUBLIC key (CLERK_JWT_KEY), never with the secret key - a secret
 * in every customer's install directory would be a single-file compromise of
 * the whole tenant. Clerk shows that PEM in the dashboard, but the same key is
 * published at the issuer's well-known JWKS URL, and fetching it is both
 * scriptable and impossible to mistype.
 *
 * USAGE
 *   node selfhost/scripts/clerk-jwks-to-pem.mjs https://clerk.example.com C:\path\clerk-jwt-key.pem
 *
 * Then pass the file to the build:
 *   .\build-staging.ps1 -Mode desktop -ClerkIssuerDomain https://clerk.example.com `
 *       -ClerkJwtKeyFile C:\path\clerk-jwt-key.pem -ClerkPublishableKey pk_live_...
 *
 * Refuses a JWKS with more than one key: @clerk/backend's `jwtKey` option takes
 * exactly one PEM, and picking silently would risk shipping a key that verifies
 * nothing.
 */
import { createPublicKey } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const [issuer, outFile] = process.argv.slice(2);
if (!issuer || !outFile) {
  console.error('usage: clerk-jwks-to-pem.mjs <issuer-url> <out.pem>');
  process.exit(2);
}

const base = issuer.includes('://') ? issuer : `https://${issuer}`;
const jwksUrl = `${base.replace(/\/+$/, '')}/.well-known/jwks.json`;

const response = await fetch(jwksUrl);
if (!response.ok) {
  console.error(`JWKS fetch failed: ${response.status} ${response.statusText} (${jwksUrl})`);
  process.exit(1);
}
const { keys } = await response.json();
if (!Array.isArray(keys) || keys.length === 0) {
  console.error(`No keys published at ${jwksUrl}`);
  process.exit(1);
}
if (keys.length > 1) {
  console.error(`${keys.length} keys published at ${jwksUrl}; expected exactly one. Kids: ${keys.map((k) => k.kid).join(', ')}`);
  process.exit(1);
}

const pem = createPublicKey({ key: keys[0], format: 'jwk' }).export({ type: 'spki', format: 'pem' });
writeFileSync(outFile, pem, 'utf8');
console.log(`Wrote ${outFile} (kid ${keys[0].kid}, ${keys[0].alg || 'RS256'}) from ${jwksUrl}`);
