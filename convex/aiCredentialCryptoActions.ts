"use node";

/**
 * Node-runtime crypto for stored AI keys.
 *
 * Isolated from http.ts and aiCredentials.ts so Convex can bundle queries and
 * httpActions without pulling node:crypto into the default runtime.
 */
import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { openSecret, sealSecret } from "./lib/aiCredentialCrypto";

const encryptionValidator = v.union(v.literal("none"), v.literal("aes-256-gcm-v1"));

export const openSealedSecret = internalAction({
  args: {
    apiKey: v.string(),
    encryption: encryptionValidator,
  },
  handler: async (_ctx, args) => openSecret(args),
});

export const sealPlainSecret = internalAction({
  args: { plaintext: v.string() },
  handler: async (_ctx, args) => sealSecret(args.plaintext),
});
