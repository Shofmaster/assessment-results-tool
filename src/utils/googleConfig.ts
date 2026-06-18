/**
 * Resolves the Google Drive credentials (OAuth Client ID + Picker API Key) used
 * for Drive import.
 *
 * The Client ID and API Key are *public* app identifiers, not secrets: they are
 * exposed in the browser during the OAuth/Picker flow and are protected by the
 * "Authorized JavaScript origins" restriction on the OAuth client, not by
 * keeping them hidden. Each end user still signs in with their *own* Google
 * account and can only pick files from their own Drive, so a single app-wide
 * credential is safe to share across all companies/users — it does not grant
 * cross-tenant access.
 *
 * Precedence: a per-user override (set in Settings) wins; otherwise we fall back
 * to the app-wide shared credential supplied via runtime config
 * (`__AVIATION_APP_CONFIG__`) or Vite env vars (`VITE_GOOGLE_CLIENT_ID` /
 * `VITE_GOOGLE_API_KEY`). This mirrors the Clerk/Convex config pattern in
 * `main.tsx`.
 */

type RuntimeConfig = {
  googleClientId?: string;
  googleApiKey?: string;
};

function getRuntimeConfig(): RuntimeConfig {
  return (
    (globalThis as unknown as { __AVIATION_APP_CONFIG__?: RuntimeConfig })
      .__AVIATION_APP_CONFIG__ ?? {}
  );
}

/** App-wide shared Google Drive credentials, if configured by the operator. */
export function getSharedGoogleConfig(): { clientId?: string; apiKey?: string } {
  const runtime = getRuntimeConfig();
  const clientId = (
    runtime.googleClientId ?? import.meta.env.VITE_GOOGLE_CLIENT_ID
  )?.trim();
  const apiKey = (
    runtime.googleApiKey ?? import.meta.env.VITE_GOOGLE_API_KEY
  )?.trim();
  return {
    clientId: clientId || undefined,
    apiKey: apiKey || undefined,
  };
}

/**
 * Resolves effective Drive credentials: per-user override (from Convex settings)
 * if present, otherwise the app-wide shared credential. Returns empty strings
 * when nothing is configured so callers can do `!!clientId && !!apiKey` checks.
 */
export function resolveGoogleConfig(userSettings?: {
  googleClientId?: string;
  googleApiKey?: string;
} | null): { clientId: string; apiKey: string } {
  const shared = getSharedGoogleConfig();
  return {
    clientId: userSettings?.googleClientId?.trim() || shared.clientId || '',
    apiKey: userSettings?.googleApiKey?.trim() || shared.apiKey || '',
  };
}
