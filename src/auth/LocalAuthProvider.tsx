import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Client half of the local identity provider.
 *
 * WHAT IT HOLDS, AND WHAT IT DOES NOT
 * The long-lived credential is an httpOnly cookie the server set; this code
 * cannot read it and never tries. What lives here is a SHORT-LIVED Convex token
 * kept in a ref - deliberately not in state, and never in localStorage or
 * sessionStorage, both of which any injected script can read at leisure.
 *
 * Keeping it in a ref rather than state also stops a token refresh from
 * re-rendering the whole application every hour for a value nothing displays.
 *
 * WHY THE TOKEN IS FETCHED RATHER THAN RETURNED AT SIGN-IN
 * So the browser never has to store anything for weeks. The cookie is the part
 * that persists, and it is the part JavaScript cannot touch.
 */

export interface LocalUser {
  subject: string;
  email: string | null;
  name: string | null;
}

interface LocalAuthValue {
  isLoaded: boolean;
  isSignedIn: boolean;
  user: LocalUser | null;
  /** Mirrors Clerk's getToken(): a Convex JWT, or null when signed out. */
  getToken: (options?: { skipCache?: boolean }) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  signUp: (input: {
    email: string;
    password: string;
    name?: string;
  }) => Promise<{ ok: boolean; error?: string; isFirstAccount?: boolean }>;
  signOut: () => Promise<void>;
}

const LocalAuthContext = createContext<LocalAuthValue | null>(null);

/**
 * Re-mint this long before the hour is up.
 *
 * A token that expires mid-request produces a failure the user sees as the app
 * randomly logging them out. Refreshing at 45 minutes leaves a wide margin for
 * a slow machine, a suspended laptop, or a clock that drifted.
 */
const TOKEN_REFRESH_MS = 45 * 60 * 1000;

async function postJson(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // The session cookie is the whole point of these calls.
    credentials: 'same-origin',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    // A non-JSON body (a proxy error page, a restarting server) is not a crash:
    // the status alone is enough for the caller to report something useful.
  }
  return { ok: response.ok, status: response.status, body: parsed as Record<string, any> | null };
}

export function LocalAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<LocalUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const tokenRef = useRef<string | null>(null);
  const tokenFetchedAt = useRef(0);
  /** De-duplicates concurrent refreshes: several components ask at once on load. */
  const inFlight = useRef<Promise<string | null> | null>(null);

  const clearToken = useCallback(() => {
    tokenRef.current = null;
    tokenFetchedAt.current = 0;
  }, []);

  const getToken = useCallback(
    async (options?: { skipCache?: boolean }): Promise<string | null> => {
      const fresh = Date.now() - tokenFetchedAt.current < TOKEN_REFRESH_MS;
      if (!options?.skipCache && tokenRef.current && fresh) return tokenRef.current;

      if (inFlight.current) return inFlight.current;

      inFlight.current = (async () => {
        try {
          const result = await postJson('/local-auth/token');
          if (!result.ok || typeof result.body?.token !== 'string') {
            clearToken();
            return null;
          }
          tokenRef.current = result.body.token;
          tokenFetchedAt.current = Date.now();
          return tokenRef.current;
        } catch {
          // Offline, or the server is restarting. Returning null lets Convex
          // treat this as signed-out and retry, rather than throwing into a
          // render.
          clearToken();
          return null;
        } finally {
          inFlight.current = null;
        }
      })();

      return inFlight.current;
    },
    [clearToken],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await postJson('/local-auth/sign-in', { email, password });
    if (!result.ok) {
      return { ok: false, error: result.body?.error || 'Sign-in failed.' };
    }
    setUser((result.body?.user as LocalUser) ?? null);
    // Drop any token minted for a previous session before the new one is asked
    // for, so a fast re-render cannot pick up the old identity.
    clearToken();
    return { ok: true };
  }, [clearToken]);

  const signUp = useCallback(
    async (input: { email: string; password: string; name?: string }) => {
      const result = await postJson('/local-auth/sign-up', input);
      if (!result.ok) {
        return { ok: false, error: result.body?.error || 'The account could not be created.' };
      }
      setUser((result.body?.user as LocalUser) ?? null);
      clearToken();
      return { ok: true, isFirstAccount: Boolean(result.body?.isFirstAccount) };
    },
    [clearToken],
  );

  const signOut = useCallback(async () => {
    try {
      await postJson('/local-auth/sign-out');
    } finally {
      // Cleared even if the request failed: the user asked to be signed out,
      // and leaving them apparently signed in is the wrong way to fail.
      clearToken();
      setUser(null);
    }
  }, [clearToken]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/local-auth/session', { credentials: 'same-origin' });
        const body = await response.json();
        if (!cancelled) setUser((body?.user as LocalUser) ?? null);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<LocalAuthValue>(
    () => ({
      isLoaded,
      isSignedIn: user !== null,
      user,
      getToken,
      signIn,
      signUp,
      signOut,
    }),
    [isLoaded, user, getToken, signIn, signUp, signOut],
  );

  return <LocalAuthContext.Provider value={value}>{children}</LocalAuthContext.Provider>;
}

export function useLocalAuth(): LocalAuthValue {
  const value = useContext(LocalAuthContext);
  if (!value) {
    throw new Error('useLocalAuth must be used inside <LocalAuthProvider>');
  }
  return value;
}

/**
 * The shape `ConvexProviderWithAuth` expects.
 *
 * Convex calls this on every auth state change and expects a STABLE function
 * identity; returning a new fetchAccessToken each render makes it re-subscribe
 * in a loop, which presents as the websocket reconnecting forever.
 */
export function useAuthForConvex() {
  const { isLoaded, isSignedIn, getToken } = useLocalAuth();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
      getToken({ skipCache: forceRefreshToken }),
    [getToken],
  );

  return useMemo(
    () => ({ isLoading: !isLoaded, isAuthenticated: isSignedIn, fetchAccessToken }),
    [isLoaded, isSignedIn, fetchAccessToken],
  );
}
