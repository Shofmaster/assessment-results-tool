/**
 * Which identity provider this page runs, on a deployment that trusts more
 * than one.
 *
 * A desktop install accepts both its own tokens and Clerk's (AUTH_MODE=both,
 * see convex/auth.config.ts). The page still mounts ONE provider at a time -
 * Clerk's hooks and the local ones cannot coexist, and mounting Clerk at all
 * means loading its script from the internet.
 *
 * THE DEFAULT IS THE HOSTED ACCOUNT. The desktop product is "your AeroGap
 * account, on this computer": the same Clerk login as the website, with the
 * account's companies mirrored into the local database while online. Local
 * accounts remain for a machine that has no hosted account at all.
 *
 * OFFLINE IS THE SAME IDENTITY, ON THE LOCAL PROVIDER. While online, the app
 * server exchanges the Clerk token for its own 30-day session for the same
 * subject (src/auth/hostedSession.ts). When the page loads offline, or the
 * connection is lost, it reloads onto the local provider and that session
 * signs the same person in - same `users` row, same companies - without Clerk's
 * script, which could not load anyway. That switch is TRANSIENT (sessionStorage):
 * the next launch tries the hosted account again.
 *
 * Kept separate from auth/index.ts so the sign-in screens can import it without
 * a cycle through the module that re-exports them.
 */
import { getConfigValue } from '../config/runtimeEnv';

export type AuthMode = 'clerk' | 'local';

/** What the deployment trusts, as served by /config.js. */
export type ConfiguredAuthMode = 'clerk' | 'local' | 'both';

/** The user's standing choice. Absent means "the hosted account". */
const PROVIDER_PREFERENCE_KEY = 'aerogap.authProvider';
/** A one-launch override: run local now, but try the hosted account next time. */
const PROVIDER_SESSION_KEY = 'aerogap.authProvider.session';
/**
 * The hosted subject the install has issued an offline session for. Not a
 * credential (the session is an httpOnly cookie this code cannot read) - just
 * the fact that offline continuation is possible, so the fallback can be
 * automatic rather than a question.
 */
const HOSTED_SESSION_LINKED_KEY = 'aerogap.hostedSessionLinked';

function readConfiguredMode(): ConfiguredAuthMode {
  const value = getConfigValue('authMode');
  return value === 'local' || value === 'both' ? value : 'clerk';
}

function readStorage(storage: Storage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage | undefined, key: string, value: string | null): void {
  try {
    if (value === null) storage?.removeItem(key);
    else storage?.setItem(key, value);
  } catch {
    // Storage blocked - the defaults below still apply.
  }
}

function asProvider(value: string | null): AuthMode | null {
  return value === 'clerk' || value === 'local' ? value : null;
}

function readPreferredProvider(): AuthMode | null {
  return asProvider(readStorage(globalThis.localStorage, PROVIDER_PREFERENCE_KEY));
}

function readSessionProvider(): AuthMode | null {
  return asProvider(readStorage(globalThis.sessionStorage, PROVIDER_SESSION_KEY));
}

/** The hosted subject with an offline session on this install, or null. */
export function hostedSessionLinkedSubject(): string | null {
  const value = readStorage(globalThis.localStorage, HOSTED_SESSION_LINKED_KEY);
  return value && value.startsWith('user_') ? value : null;
}

export function markHostedSessionLinked(subject: string | null): void {
  writeStorage(globalThis.localStorage, HOSTED_SESSION_LINKED_KEY, subject);
}

/** Does this identity belong to the hosted account space (Clerk) rather than a local account? */
export function isHostedIdentity(userId: string | null | undefined): boolean {
  return typeof userId === 'string' && userId.startsWith('user_');
}

/** Browser says there is definitely no network. `true` is only "maybe". */
function definitelyOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Which issuers the backend accepts. Fixed for the life of the page. */
export const CONFIGURED_AUTH_MODE: ConfiguredAuthMode = readConfiguredMode();

/**
 * Decide the provider for a `both` deployment. Pure over its inputs; exported
 * for tests. The rule, in order:
 *   1. No Clerk key to load the script with: local, whatever anyone asked for.
 *   2. This launch's transient choice (set by the offline fallback): honoured.
 *   3. The user's standing choice of local accounts: honoured.
 *   4. Definitely offline: local - Clerk's script cannot load, and the offline
 *      session (if any) signs the same person in.
 *   5. Otherwise: the hosted account.
 */
export function chooseProviderForBoth(input: {
  hasClerkKey: boolean;
  sessionChoice: AuthMode | null;
  preference: AuthMode | null;
  offline: boolean;
}): AuthMode {
  if (!input.hasClerkKey) return 'local';
  if (input.sessionChoice) return input.sessionChoice;
  if (input.preference === 'local') return 'local';
  if (input.offline) return 'local';
  return 'clerk';
}

/**
 * The provider this page runs. Read once at module load, not per call: the
 * inputs cannot change without a reload, and re-reading inside a hook would
 * make every component's behaviour depend on when it happened to render.
 */
export const AUTH_MODE: AuthMode = (() => {
  if (CONFIGURED_AUTH_MODE === 'local') return 'local';
  if (CONFIGURED_AUTH_MODE === 'clerk') return 'clerk';
  return chooseProviderForBoth({
    hasClerkKey: Boolean(getConfigValue('clerkPublishableKey')),
    sessionChoice: readSessionProvider(),
    preference: readPreferredProvider(),
    offline: definitelyOffline(),
  });
})();

export const isLocalAuth = AUTH_MODE === 'local';

/**
 * Running the local provider only because this launch could not use the hosted
 * one (offline at load, or the connection dropped) - as opposed to the user
 * having chosen local accounts. Drives the "you are offline" affordances.
 */
export const isTransientLocalFallback: boolean =
  CONFIGURED_AUTH_MODE === 'both' && isLocalAuth && readSessionProvider() === 'local';

/**
 * A self-hosted install, whichever provider it signs in with.
 *
 * This - not `isLocalAuth` - is what hides hosted-only surfaces (billing,
 * feedback, Google Drive, migration notices). A desktop user who signed in
 * with their hosted account is still on a machine with a local database and no
 * subscription attached to it. Falls back to the auth mode for a self-hosted
 * server predating `deploymentMode` in /config.js.
 */
export const isSelfHosted: boolean = (() => {
  const mode = getConfigValue('deploymentMode');
  return mode === 'desktop' || mode === 'server' || CONFIGURED_AUTH_MODE !== 'clerk';
})();

/** Can the user pick between a local account and their hosted account here? */
export const canSwitchAuthProvider: boolean =
  CONFIGURED_AUTH_MODE === 'both' && Boolean(getConfigValue('clerkPublishableKey'));

/**
 * Switch provider and reload.
 *
 * A reload rather than a state change on purpose: the provider tree is chosen
 * in main.tsx before React mounts, and the module constants above are read
 * once. Trying to hot-swap would mean every hook in the app re-deciding which
 * context it lives in mid-render.
 *
 * `transient` records the choice for this launch only (sessionStorage). It is
 * what the offline fallback uses: the person did not choose local accounts,
 * the network did, and the next launch should try the hosted account again.
 * A non-transient switch clears any transient one so the standing choice wins.
 */
export function switchAuthProvider(provider: AuthMode, options: { transient?: boolean } = {}): void {
  if (options.transient) {
    writeStorage(globalThis.sessionStorage, PROVIDER_SESSION_KEY, provider);
  } else {
    writeStorage(globalThis.localStorage, PROVIDER_PREFERENCE_KEY, provider);
    writeStorage(globalThis.sessionStorage, PROVIDER_SESSION_KEY, null);
  }
  globalThis.location?.reload();
}
