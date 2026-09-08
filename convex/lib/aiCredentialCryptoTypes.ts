/** Shared types for stored AI credential envelopes (no Node runtime). */
export type CredentialEncryption = "none" | "aes-256-gcm-v1";

export interface SealedSecret {
  apiKey: string;
  encryption: CredentialEncryption;
}
