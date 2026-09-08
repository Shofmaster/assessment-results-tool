/**
 * Configuration compiled into the build, rather than typed at install time.
 *
 * WHY THIS EXISTS
 * The installer used to collect three Clerk values on a wizard page. They are
 * not per-customer secrets - they identify OUR Clerk tenant, are identical at
 * every site, and two of the three are public by design. Asking each customer
 * to paste them was pure friction, and it made unattended deployment need a
 * command line carrying credentials.
 *
 * So build-staging.ps1 writes them into build-config.json beside server.js and
 * this module loads them at boot.
 *
 * PRECEDENCE: a real environment variable ALWAYS wins.
 * That is the same rule envFile.ts follows, and it is what keeps the artifact
 * generic: a server-mode install that must point at a different Clerk instance
 * sets the variable and the baked value steps aside. Baking in a default is not
 * the same as hard-coding it.
 *
 * WHAT MUST NEVER GO IN THIS FILE
 * It ships to every customer and sits unencrypted in the install directory, so
 * it may hold ONLY values that are public or that identify us rather than
 * authenticate us:
 *
 *   CLERK_JWT_KEY               public verification PEM - proves a token was
 *                               signed by our tenant, cannot mint one
 *   CLERK_JWT_ISSUER_DOMAIN     a hostname
 *   VITE_CLERK_PUBLISHABLE_KEY  public by definition; already in the SPA bundle
 *
 * CLERK_SECRET_KEY is the obvious thing to want here and is exactly what must
 * not be: it can mint tokens for any user in the tenant, and a copy in every
 * customer's install directory could not be rotated without re-shipping the
 * installer to every site. The allowlist below is enforced, not advisory.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The ONLY keys a build may bake in. Anything else in the file is ignored and
 * reported, so a mistake in the build script surfaces as a log line here rather
 * than as a secret quietly shipped to every customer.
 */
export const BAKEABLE_KEYS = [
  'CLERK_JWT_KEY',
  'CLERK_JWT_ISSUER_DOMAIN',
  'VITE_CLERK_PUBLISHABLE_KEY',
  'EMBEDDING_PROVIDER',
  // Read by the desktop shell, not this server: the hosted application's
  // origin, which gives a desktop install its online workspace. Public.
  'HOSTED_APP_URL',
  // The hosted Convex deployment the SPA mirrors a hosted account's companies
  // from (served to it as hostedConvexUrl). Public: it is in the hosted bundle.
  'HOSTED_CONVEX_URL',
] as const;

/** Never bakeable, whatever a build script claims. Checked explicitly so the
 *  refusal is visible rather than an implicit consequence of the allowlist. */
const FORBIDDEN_KEYS = [
  'CLERK_SECRET_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'VOYAGE_API_KEY',
  'AI_CREDENTIAL_SERVICE_TOKEN',
  'CONVEX_INSTANCE_SECRET',
  'CONVEX_SELF_HOSTED_ADMIN_KEY',
  'STRIPE_SECRET_KEY',
];

export interface BuildConfigResult {
  loaded: boolean;
  path?: string;
  /** Keys actually applied (absent from the environment). */
  applied: string[];
  /** Keys present in the file but already set in the environment. */
  overridden: string[];
  /** Keys refused: not on the allowlist, or explicitly forbidden. */
  rejected: string[];
}

/** Where server.js sits when installed. */
function defaultPath(): string {
  try {
    return join(dirname(fileURLToPath(import.meta.url)), 'build-config.json');
  } catch {
    return join(process.cwd(), 'build-config.json');
  }
}

export function applyBuildConfig(path = process.env.AEROGAP_BUILD_CONFIG || defaultPath()): BuildConfigResult {
  const result: BuildConfigResult = { loaded: false, applied: [], overridden: [], rejected: [] };

  // Absent is normal, not an error: a development run has no baked config, and
  // so does a build that deliberately ships none.
  if (!existsSync(path)) return result;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    // Do not throw. A corrupt optional file must not stop an install from
    // booting when every value it holds may also come from the environment.
    console.warn(
      `[aerogap] build-config.json could not be read (${err instanceof Error ? err.message : String(err)}) - ignoring it.`,
    );
    return result;
  }

  result.loaded = true;
  result.path = path;

  for (const [key, rawValue] of Object.entries(parsed)) {
    if (FORBIDDEN_KEYS.includes(key) || !(BAKEABLE_KEYS as readonly string[]).includes(key)) {
      result.rejected.push(key);
      continue;
    }
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) continue;

    if (process.env[key] !== undefined && process.env[key] !== '') {
      result.overridden.push(key);
      continue;
    }
    process.env[key] = value;
    result.applied.push(key);
  }

  if (result.rejected.length > 0) {
    // Loud on purpose. The only way a forbidden key reaches this file is a bug
    // in the build script, and that bug ships a secret to every customer.
    console.error(
      `[aerogap] REFUSED to apply ${result.rejected.length} key(s) from build-config.json: ` +
        `${result.rejected.join(', ')}. Only ${BAKEABLE_KEYS.join(', ')} may be compiled into a build.`,
    );
  }

  return result;
}

/** One line for the startup banner. */
export function describeBuildConfig(result: BuildConfigResult): string | null {
  if (!result.loaded) return null;
  const parts = [`${result.applied.length} value(s) from the build`];
  if (result.overridden.length > 0) parts.push(`${result.overridden.length} overridden by the environment`);
  if (result.rejected.length > 0) parts.push(`${result.rejected.length} REFUSED`);
  return `build config     ${parts.join(', ')}`;
}
