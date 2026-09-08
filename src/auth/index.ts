/**
 * One import site for authentication, whoever is providing it.
 *
 * WHY THIS EXISTS
 * Self-hosted deployments issue their own tokens; the hosted product uses
 * Clerk; a desktop install may offer either. Rather than branch on that in
 * fifteen components, they all import `useUser` and `useAuth` from here and the
 * branch happens once.
 *
 * THE SAFETY PROPERTY THAT MATTERS
 * In `clerk` mode these are Clerk's own hooks, re-exported unchanged - not a
 * wrapper, not a copy, the same function object. The hosted product therefore
 * runs exactly the code it ran before this file existed, and a bug in the local
 * implementation cannot reach it. Anything else would put every paying user of
 * the hosted app behind an abstraction written for the desktop build.
 *
 * `authMode` is absent on the hosted deployment, and absent means clerk.
 *
 * THE `both` DEPLOYMENT
 * A desktop install whose backend trusts two issuers. The page still runs ONE
 * provider at a time - Clerk's hooks and the local ones cannot both be mounted,
 * and mounting Clerk at all means loading its script from the internet. The
 * hosted account is the default; offline, the page runs the local provider on a
 * session the install issued for that same account. See providerChoice.ts.
 */
import { useAuth as useClerkAuth, useUser as useClerkUser } from '@clerk/clerk-react';
import { useLocalAuth } from './LocalAuthProvider';
import { isLocalAuth } from './providerChoice';

export {
  AUTH_MODE,
  CONFIGURED_AUTH_MODE,
  isLocalAuth,
  isSelfHosted,
  isTransientLocalFallback,
  isHostedIdentity,
  canSwitchAuthProvider,
  switchAuthProvider,
} from './providerChoice';
export { linkHostedSession, canContinueOffline } from './hostedSession';
export type { AuthMode, ConfiguredAuthMode } from './providerChoice';

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
