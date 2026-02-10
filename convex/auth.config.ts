// Convex auth configuration for Clerk.
//
// This enables `ctx.auth.getUserIdentity()` to return a Clerk identity when the
// frontend uses `ConvexProviderWithClerk` (which fetches a Clerk JWT template
// named "convex").
import { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
