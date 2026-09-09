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
 * to the app-wide shared credential resolved by `config/runtimeEnv` — runtime
 * injection first, build-time Vite env var second.
 */

import { getConfigValue } from '../config/runtimeEnv';

/** App-wide shared Google Drive credentials, if configured by the operator. */
export function getSharedGoogleConfig(): { clientId?: string; apiKey?: string } {
  return {
    clientId: getConfigValue('googleClientId'),
    apiKey: getConfigValue('googleApiKey'),
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
