/**
 * One import site for authentication, whoever is providing it.
 *
 * WHY THIS EXISTS
 * Clerk production keys refuse a loopback origin, so a desktop install cannot
 * use them and self-hosted deployments issue their own tokens instead. Rather
 * than branch on that in fifteen components, they all import `useUser` and
 * `useAuth` from here and the branch happens once.
 *
 * THE SAFETY PROPERTY THAT MATTERS
 * In `clerk` mode these are Clerk's own hooks, re-exported unchanged - not a
 * wrapper, not a copy, the same function object. The hosted product therefore
 * runs exactly the code it ran before this file existed, and a bug in the local
 * implementation cannot reach it. Anything else would put every paying user of
 * the hosted app behind an abstraction written for the desktop build.
 *
 * `authMode` is absent on the hosted deployment, and absent means clerk.
 */
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-react';
import { getConfigValue } from '../config/runtimeEnv';
import { useLocalAuth } from './LocalAuthProvider';

export type AuthMode = 'clerk' | 'local';

/**
 * Read once at module load, not per call.
 *
 * The value cannot change without a reload - it comes from /config.js, which is
 * a <script> in the document - and re-reading it inside a hook would make every
 * component's behaviour depend on when it happened to render.
 */
export const AUTH_MODE: AuthMode = getConfigValue('authMode') === 'local' ? 'local' : 'clerk';

export const isLocalAuth = AUTH_MODE === 'local';

/**
 * The subset of Clerk's user object this application actually reads.
 *
 * Deriving it from usage rather than mirroring Clerk's full type keeps the local
 * implementation honest: it has to provide exactly this and nothing more, and a
 * component reaching for a Clerk-only field fails to compile rather than
 * silently returning undefined on a self-hosted install.
 */
export interface AuthUser {
  id: string;
  fullName: string | null;
  firstName: string | null;
  imageUrl: string;
  primaryEmailAddress: { emailAddress: string } | null;
}

export interface UseUserResult {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: AuthUser | null;
}

export interface UseAuthResult {
  isSignedIn: boolean;
  getToken: (options?: { template?: string; skipCache?: boolean }) => Promise<string | null>;
  signOut: () => Promise<void>;
}

/** Local identity, shaped like the Clerk object the components already read. */
function useLocalUser(): UseUserResult {
  const { isLoaded, isSignedIn, user } = useLocalAuth();
  if (!user) return { isLoaded, isSignedIn: false, user: null };

  return {
    isLoaded,
    isSignedIn,
    user: {
      id: user.subject,
      fullName: user.name,
      // Clerk exposes both; the app shows firstName only as a greeting
      // fallback, so the first word of the name is the faithful equivalent.
      firstName: user.name ? user.name.split(' ')[0] : null,
      // No avatars on a local install. An empty string rather than null because
      // the components pass it straight to <img src>, and null would render a
      // broken-image icon where Clerk rendered a generated one.
      imageUrl: '',
      primaryEmailAddress: user.email ? { emailAddress: user.email } : null,
    },
  };
}

function useLocalAuthShim(): UseAuthResult {
  const { isSignedIn, getToken, signOut } = useLocalAuth();
  return {
    isSignedIn,
    // The `template` option is Clerk's and meaningless here - a local token is
    // already minted for the Convex audience - so it is accepted and ignored
    // rather than making every call site branch.
    getToken: (options) => getToken({ skipCache: options?.skipCache }),
    signOut,
  };
}

/**
 * Both hooks are called unconditionally and one result is chosen, because React
 * forbids calling hooks conditionally. The unused provider's hook still runs -
 * harmless, since whichever context is absent simply has no subscribers.
 *
 * The local hook throws outside its provider, so it is only called in local mode
 * and the branch is on a module constant, which is stable for the life of the
 * page.
 */
export function useUser(): UseUserResult {
  if (isLocalAuth) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- AUTH_MODE is a module constant, fixed for the page's lifetime
    return useLocalUser();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see above
  const clerk = useClerkUser();
  return {
    isLoaded: clerk.isLoaded,
    isSignedIn: Boolean(clerk.isSignedIn),
    user: (clerk.user as unknown as AuthUser) ?? null,
  };
}

export function useAuth(): UseAuthResult {
  if (isLocalAuth) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- see useUser
    return useLocalAuthShim();
  }
  // eslint-disable-next-line react-hooks/rules-of-hooks -- see useUser
  const clerk = useClerkAuth();
  return {
    isSignedIn: Boolean(clerk.isSignedIn),
    getToken: clerk.getToken as UseAuthResult['getToken'],
    signOut: clerk.signOut as unknown as UseAuthResult['signOut'],
  };
}

export { LocalAuthProvider, useLocalAuth } from './LocalAuthProvider';
export { LocalSignIn } from './LocalSignIn';
