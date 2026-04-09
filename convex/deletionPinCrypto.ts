/** PBKDF2-SHA256 for deletion PINs (Web Crypto — Convex mutation runtime). */

export const DELETION_PIN_PBKDF2_ITERATIONS = 210_000;
export const DELETION_PIN_DERIVED_BITS = 256;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function generateDeletionPinSaltBase64(): string {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return bytesToBase64(salt);
}

export async function deriveDeletionPinHash(
  pin: string,
  saltBase64: string,
  iterations: number,
): Promise<ArrayBuffer> {
  const salt = base64ToBytes(saltBase64);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  return crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    DELETION_PIN_DERIVED_BITS,
  );
}

export async function hashDeletionPinForStorage(
  pin: string,
  saltBase64: string,
  iterations: number,
): Promise<string> {
  const bits = await deriveDeletionPinHash(pin, saltBase64, iterations);
  return bytesToBase64(new Uint8Array(bits));
}

export async function verifyDeletionPinConstantTime(
  pin: string,
  saltBase64: string,
  expectedHashBase64: string,
  iterations: number,
): Promise<boolean> {
  const derived = await deriveDeletionPinHash(pin, saltBase64, iterations);
  const expected = base64ToBytes(expectedHashBase64);
  const a = new Uint8Array(derived);
  if (a.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ expected[i]!;
  return diff === 0;
}
