// Convex auth configuration for Clerk.
//
// This enables `ctx.auth.getUserIdentity()` to return a Clerk identity when the
// frontend uses `ConvexProviderWithClerk` (which fetches a Clerk JWT template
// named "convex").
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

const clerkIssuerDomain = requireEnv("CLERK_JWT_ISSUER_DOMAIN")
  .trim()
  .replace(/\/$/, "");
// Default to "convex" if CLERK_JWT_AUDIENCE is not set
const clerkAudience = "convex";

export default {
  providers: [
    {
      domain: clerkIssuerDomain,
      applicationID: clerkAudience,
    },
  ],
} satisfies AuthConfig;
