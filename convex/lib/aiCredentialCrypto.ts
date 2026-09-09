"use node";

/**
 * Envelope around a stored AI provider key.
 *
 * v1 stores AES-256-GCM ciphertext when AI_CREDENTIAL_ENCRYPTION_KEY is set on
 * the Convex deployment. Plaintext rows (`encryption: "none"`) remain readable
 * and are re-sealed on the next write.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import type { SealedSecret } from "./aiCredentialCryptoTypes";

const ENCRYPTION_KEY_ENV = "AI_CREDENTIAL_ENCRYPTION_KEY";

function deriveKey(raw: string): Buffer {
  return createHash("sha256").update(raw).digest();
}

function encryptionKey(): Buffer | null {
  const raw = (process.env[ENCRYPTION_KEY_ENV] || "").trim();
  if (!raw) return null;
  return deriveKey(raw);
}

function sealAes256Gcm(plaintext: string, key: Buffer): SealedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    apiKey: [iv, ciphertext, tag].map((part) => part.toString("base64url")).join("."),
    encryption: "aes-256-gcm-v1",
  };
}

function openAes256Gcm(payload: string, key: Buffer): string {
  const parts = payload.split(".");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted credential envelope.");
  }
  const iv = Buffer.from(parts[0], "base64url");
  const ciphertext = Buffer.from(parts[1], "base64url");
  const tag = Buffer.from(parts[2], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

/** Write path. Called only from actions. */
export async function sealSecret(plaintext: string): Promise<SealedSecret> {
  const key = encryptionKey();
  if (!key) return { apiKey: plaintext, encryption: "none" };
  return sealAes256Gcm(plaintext, key);
}

/** Read path. Called only from actions / httpActions, never from a query. */
export async function openSecret(sealed: SealedSecret): Promise<string> {
  if (sealed.encryption === "none") return sealed.apiKey;
  if (sealed.encryption === "aes-256-gcm-v1") {
    const key = encryptionKey();
    if (!key) {
      throw new Error(
        `${ENCRYPTION_KEY_ENV} is not set on this deployment but a stored credential is encrypted.`,
      );
    }
    return openAes256Gcm(sealed.apiKey, key);
  }
  throw new Error(
    `Unsupported credential encryption envelope: ${sealed.encryption}. ` +
      `This deployment's code is older than the stored row.`,
  );
}
