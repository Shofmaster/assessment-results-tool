/**
 * Public Convex getters must never return stored credentials. These helpers
 * strip the raw field and leave a configured flag plus last-4, matching
 * aiCredentials.status. Server-side code that still needs the secret reads
 * the row through an internal query, not these.
 */

function last4(value: string | undefined): string | undefined {
  return value ? value.slice(-4) : undefined;
}

export function maskWebhookSecret<T extends { carLifecycleWebhookSecret?: string }>(
  doc: T,
): Omit<T, "carLifecycleWebhookSecret"> & {
  carLifecycleWebhookSecretConfigured: boolean;
  carLifecycleWebhookSecretLast4?: string;
};
export function maskWebhookSecret(doc: null): null;
export function maskWebhookSecret<T extends { carLifecycleWebhookSecret?: string }>(
  doc: T | null,
) {
  if (!doc) return null;
  const { carLifecycleWebhookSecret, ...rest } = doc;
  return {
    ...rest,
    carLifecycleWebhookSecretConfigured: !!carLifecycleWebhookSecret,
    carLifecycleWebhookSecretLast4: last4(carLifecycleWebhookSecret),
  };
}

type AvianisSecretField =
  | "avianisApiKey"
  | "avianisClientSecret"
  | "avianisPassword"
  | "avianisCachedToken";

export function maskAvianisSecrets<T extends Partial<Record<AvianisSecretField, string>>>(
  doc: T,
): Omit<T, AvianisSecretField> & {
  avianisApiKeyConfigured: boolean;
  avianisApiKeyLast4?: string;
  avianisClientSecretConfigured: boolean;
  avianisClientSecretLast4?: string;
  avianisPasswordConfigured: boolean;
  avianisPasswordLast4?: string;
  avianisCachedTokenConfigured: boolean;
};
export function maskAvianisSecrets(doc: null): null;
export function maskAvianisSecrets<T extends Partial<Record<AvianisSecretField, string>>>(
  doc: T | null,
) {
  if (!doc) return null;
  const { avianisApiKey, avianisClientSecret, avianisPassword, avianisCachedToken, ...rest } = doc;
  return {
    ...rest,
    avianisApiKeyConfigured: !!avianisApiKey,
    avianisApiKeyLast4: last4(avianisApiKey),
    avianisClientSecretConfigured: !!avianisClientSecret,
    avianisClientSecretLast4: last4(avianisClientSecret),
    avianisPasswordConfigured: !!avianisPassword,
    avianisPasswordLast4: last4(avianisPassword),
    avianisCachedTokenConfigured: !!avianisCachedToken,
  };
}
