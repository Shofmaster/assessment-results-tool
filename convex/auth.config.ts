// Which identity provider this deployment trusts.
//
// TWO MODES, DECIDED AT DEPLOY TIME
//
//   clerk  The hosted product. `ConvexProviderWithClerk` fetches a Clerk JWT
//          from the "convex" template and Convex validates it against Clerk's
//          published keys.
//
//   local  Every self-hosted install. The app server issues its own RS256
//          tokens and publishes a JWKS on the same origin; Convex validates
//          against that.
//
// WHY `local` EXISTS
// Clerk production keys refuse a loopback origin. Verified against the real
// instance, which answered HTTP 400: "Production Keys are only allowed for
// domain aerogaptechnologies.com... The Request HTTP Origin header must be
// equal to or a subdomain of the requesting URL." There is no allowed-origins
// setting that lifts this, and Clerk's own documented workaround needs HTTPS on
// port 443 with a certificate - which for a distributed desktop app would mean
// shipping a publicly-trusted private key inside every installer.
//
// Self-hosting therefore issues its own identities, which is also the honest
// version of the on-prem promise: customer identity never reaches our vendor.
//
// This file is read at DEPLOY time, not at request time. A missing variable
// rejects the push rather than producing an install that authenticates nobody.
//
// ============================================================================
// BEFORE THE NEXT DEPLOY OF ANY EXISTING DEPLOYMENT, SET ALL FOUR VARIABLES.
// ============================================================================
// Convex requires EVERY environment variable referenced in this file to exist
// on the deployment, whether or not the branch that reads it is taken. So a
// deployment that only uses Clerk still needs the two LOCAL_AUTH_* names
// present, and one that only uses local auth still needs CLERK_JWT_ISSUER_DOMAIN.
// Otherwise the push is rejected with "used in auth config file but its value
// was not set" - which will look like an unrelated breakage.
//
//   npx convex env set AUTH_MODE clerk --prod
//   npx convex env set LOCAL_AUTH_ISSUER unused --prod
//   npx convex env set LOCAL_AUTH_JWKS_URL unused --prod
//   (CLERK_JWT_ISSUER_DOMAIN is already set on the hosted deployments)
//
// Repeat without --prod for the dev deployment. Self-hosted installs get all
// four pushed automatically by bootstrap.mjs / first-run setup.
import { AuthConfig } from "convex/server";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Set it with: npx convex env set ${name} <value>`,
    );
  }
  return value;
}

const authMode = (process.env.AUTH_MODE || "clerk").trim();

// Tokens must carry this in `aud`. Shared by both modes so the app tier has one
// audience to check regardless of who issued the token.
const applicationID = "convex";

function localProvider() {
  // Both are pushed by the deploy step from the app server's own configuration,
  // so they cannot drift from the URLs it actually serves.
  const issuer = requireEnv("LOCAL_AUTH_ISSUER").trim().replace(/\/$/, "");
  const jwks = requireEnv("LOCAL_AUTH_JWKS_URL").trim();

  return {
    type: "customJwt" as const,
    issuer,
    jwks,
    applicationID,
    // RS256 rather than ES256: Convex accepts either, and RS256 is what was
    // verified end to end against a real self-hosted backend, including that a
    // token signed by the wrong key is rejected.
    algorithm: "RS256" as const,
  };
}

function clerkProvider() {
  return {
    domain: requireEnv("CLERK_JWT_ISSUER_DOMAIN").trim().replace(/\/$/, ""),
    applicationID,
  };
}

export default {
  providers: [authMode === "local" ? localProvider() : clerkProvider()],
} satisfies AuthConfig;
