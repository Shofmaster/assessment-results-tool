/**
 * Types for backendVars.mjs.
 *
 * The module itself stays plain .mjs because bootstrap.mjs runs it directly from
 * the installed payload with no build step — there is no tsc on a customer's
 * machine. This declaration exists so the test suite and `npm run typecheck`
 * still see real types instead of `any`.
 */

/** Read one KEY=value out of raw .env text. Returns '' when absent. */
export function readEnvValue(raw: string, key: string): string;

/** 32 random bytes, base64url. */
export function generateServiceToken(): string;

/** Vars whose absence must stop the bootstrap rather than skip a feature. */
export const REQUIRED_BACKEND_VARS: readonly string[];

/**
 * Auth vars that are additionally mandatory, given the mode.
 * convex/auth.config.ts reads them at DEPLOY time and throws without them.
 */
export function requiredAuthVars(authMode: string | undefined | null): string[];

/** The environment variables pushed into the Convex deployment. */
export function buildBackendVars(
  raw: string,
  serviceToken: string,
): {
  /** Decides which provider convex/auth.config.ts builds. */
  AUTH_MODE: string;
  CLERK_JWT_ISSUER_DOMAIN: string;
  /** Only meaningful when AUTH_MODE=local. */
  LOCAL_AUTH_ISSUER: string;
  LOCAL_AUTH_JWKS_URL: string;
  AI_CREDENTIAL_SERVICE_TOKEN: string;
  EMBEDDING_PROVIDER: string;
  RESEND_API_KEY: string;
  SIGNUP_EMAIL_FROM: string;
  ADMIN_NOTIFY_EMAIL: string;
  /** Present only when the install already had one in .env. */
  ANTHROPIC_API_KEY?: string;
  DEPLOYMENT_MODE?: string;
  AI_CREDENTIAL_ENCRYPTION_KEY?: string;
};

export function localAuthIssuerFor(appOrigin: string): string;
export function localAuthJwksUrlFor(appOrigin: string): string;

export function buildDesktopBackendVars(options: {
  appOrigin: string;
  serviceToken: string;
  envFileRaw?: string;
}): ReturnType<typeof buildBackendVars>;
