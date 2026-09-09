import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * The authentication façade.
 *
 * THE PROPERTY THAT MATTERS MOST HERE IS A NEGATIVE ONE: the hosted product must
 * be unaffected. Every paying user of the hosted app goes through this file now,
 * and it was written for the desktop build - so the tests below spend as much
 * effort proving Clerk mode is untouched as they do proving local mode works.
 *
 * `authMode` is read once at module load, so each mode needs its own module
 * registry. vi.resetModules() between tests is what makes that possible.
 */
const clerkUseUser = vi.fn();
const clerkUseAuth = vi.fn();

vi.mock('@clerk/clerk-react', () => ({
  useUser: clerkUseUser,
  useAuth: clerkUseAuth,
  SignIn: () => null,
  SignUp: () => null,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}));

let configuredMode: string | undefined;
let configuredValues: Record<string, string | undefined> = {};
vi.mock('../../config/runtimeEnv', () => ({
  getConfigValue: (key: string) => (key === 'authMode' ? configuredMode : configuredValues[key]),
  readRuntimeConfig: () => ({}),
  hasRuntimeConfig: () => false,
}));

async function loadFacade(mode: string | undefined, values: Record<string, string | undefined> = {}) {
  configuredMode = mode;
  configuredValues = values;
  vi.resetModules();
  return await import('../../auth');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('the hosted product is untouched', () => {
  it('defaults to clerk when no mode is configured', async () => {
    // The hosted deployment serves no authMode at all. Anything other than
    // clerk here would break every existing user.
    const auth = await loadFacade(undefined);
    expect(auth.AUTH_MODE).toBe('clerk');
    expect(auth.isLocalAuth).toBe(false);
  });

  it.each(['', 'CLERK', 'nonsense', 'locally', 'Local'])(
    'treats %o as clerk rather than guessing local',
    async (mode) => {
      const auth = await loadFacade(mode);
      expect(auth.isLocalAuth).toBe(false);
    },
  );

  it('passes Clerk’s own user object straight through', async () => {
    const auth = await loadFacade('clerk');
    clerkUseUser.mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
      user: {
        id: 'user_2abc',
        fullName: 'Jane Mechanic',
        firstName: 'Jane',
        imageUrl: 'https://img.clerk.com/x',
        primaryEmailAddress: { emailAddress: 'jane@example.com' },
      },
    });

    function Probe() {
      const { user, isSignedIn } = auth.useUser();
      return <div>{`${isSignedIn}:${user?.id}:${user?.primaryEmailAddress?.emailAddress}`}</div>;
    }

    render(<Probe />);
    expect(screen.getByText('true:user_2abc:jane@example.com')).toBeInTheDocument();
    expect(clerkUseUser).toHaveBeenCalled();
  });

  it('calls Clerk’s getToken with the template the app asks for', async () => {
    // The app requests the "convex" JWT template. Dropping that argument would
    // hand Convex a session token it does not trust, and every hosted user
    // would silently lose their database connection.
    const getToken = vi.fn().mockResolvedValue('tok');
    const auth = await loadFacade('clerk');
    clerkUseAuth.mockReturnValue({ isSignedIn: true, getToken, signOut: vi.fn() });

    function Probe() {
      const { getToken: get } = auth.useAuth();
      void get({ template: 'convex' });
      return null;
    }

    render(<Probe />);
    await waitFor(() => expect(getToken).toHaveBeenCalledWith({ template: 'convex' }));
  });

  it('never calls the local provider in clerk mode', async () => {
    // The local hook throws outside its provider. Rendering without one and not
    // crashing is the proof that clerk mode does not touch it.
    const auth = await loadFacade('clerk');
    clerkUseUser.mockReturnValue({ isLoaded: true, isSignedIn: false, user: null });

    function Probe() {
      auth.useUser();
      return <div>ok</div>;
    }
    expect(() => render(<Probe />)).not.toThrow();
  });
});

describe('the hosted product never sees self-hosted surfaces', () => {
  it('is not self-hosted with no runtime config at all', async () => {
    const auth = await loadFacade(undefined);
    expect(auth.isSelfHosted).toBe(false);
    expect(auth.canSwitchAuthProvider).toBe(false);
  });
});

describe('both mode (desktop offering a hosted-account sign-in)', () => {
  const PK = 'pk_live_x';

  it('runs the hosted account (Clerk) by default - the desktop is that account, on this computer', async () => {
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    expect(auth.CONFIGURED_AUTH_MODE).toBe('both');
    expect(auth.AUTH_MODE).toBe('clerk');
    expect(auth.isLocalAuth).toBe(false);
    expect(auth.isTransientLocalFallback).toBe(false);
    expect(auth.canSwitchAuthProvider).toBe(true);
  });

  it('runs the local provider when the user chose local accounts', async () => {
    window.localStorage.setItem('aerogap.authProvider', 'local');
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    expect(auth.AUTH_MODE).toBe('local');
    expect(auth.isLocalAuth).toBe(true);
    // A standing choice, not the network's doing.
    expect(auth.isTransientLocalFallback).toBe(false);
  });

  it('runs the local provider when the browser is definitely offline - Clerk cannot load', async () => {
    vi.stubGlobal('navigator', { ...window.navigator, onLine: false });
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    expect(auth.AUTH_MODE).toBe('local');
    // Nothing was written: the next launch, online, tries the hosted account.
    expect(window.localStorage.getItem('aerogap.authProvider')).toBeNull();
  });

  it('honours a transient (this-launch) fallback to local, and reports it as such', async () => {
    window.sessionStorage.setItem('aerogap.authProvider.session', 'local');
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    expect(auth.AUTH_MODE).toBe('local');
    expect(auth.isTransientLocalFallback).toBe(true);
    window.sessionStorage.clear();
  });

  it('a transient switch writes sessionStorage only; a standing switch clears the transient one', async () => {
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    auth.switchAuthProvider('local', { transient: true });
    expect(window.sessionStorage.getItem('aerogap.authProvider.session')).toBe('local');
    expect(window.localStorage.getItem('aerogap.authProvider')).toBeNull();

    auth.switchAuthProvider('clerk');
    expect(window.localStorage.getItem('aerogap.authProvider')).toBe('clerk');
    expect(window.sessionStorage.getItem('aerogap.authProvider.session')).toBeNull();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('decides the provider by a fixed order of precedence', async () => {
    const { chooseProviderForBoth } = await import('../../auth/providerChoice');
    const base = { hasClerkKey: true, sessionChoice: null, preference: null, offline: false } as const;
    expect(chooseProviderForBoth(base)).toBe('clerk');
    expect(chooseProviderForBoth({ ...base, hasClerkKey: false, preference: 'clerk' })).toBe('local');
    expect(chooseProviderForBoth({ ...base, sessionChoice: 'local' })).toBe('local');
    // A this-launch choice of clerk beats a standing preference for local (the
    // user pressed "sign in with your account" on the local screen).
    expect(chooseProviderForBoth({ ...base, sessionChoice: 'clerk', preference: 'local' })).toBe('clerk');
    expect(chooseProviderForBoth({ ...base, preference: 'local' })).toBe('local');
    expect(chooseProviderForBoth({ ...base, offline: true })).toBe('local');
    expect(chooseProviderForBoth({ ...base, preference: 'clerk', offline: true })).toBe('local');
  });

  it('knows which identities are hosted', async () => {
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    expect(auth.isHostedIdentity('user_2abc')).toBe(true);
    expect(auth.isHostedIdentity('local|abc')).toBe(false);
    expect(auth.isHostedIdentity(null)).toBe(false);
  });

  it('ignores a stale Clerk preference when the build has no publishable key', async () => {
    // Otherwise the page would try to mount a provider it cannot load and stall.
    window.localStorage.setItem('aerogap.authProvider', 'clerk');
    const auth = await loadFacade('both', { deploymentMode: 'desktop' });
    expect(auth.AUTH_MODE).toBe('local');
    expect(auth.canSwitchAuthProvider).toBe(false);
  });

  it('is self-hosted whichever provider runs', async () => {
    // Billing, feedback and Drive key off THIS, not off the provider: a desktop
    // user signed in with a hosted account still has a local database.
    window.localStorage.setItem('aerogap.authProvider', 'clerk');
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    expect(auth.isLocalAuth).toBe(false);
    expect(auth.isSelfHosted).toBe(true);
  });

  it('offers the hosted account on the local sign-in screen', async () => {
    window.localStorage.setItem('aerogap.authProvider', 'local');
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    vi.stubGlobal('fetch', async (url: string) =>
      String(url).includes('/status')
        ? new Response(JSON.stringify({ hasAccounts: true }), { status: 200 })
        : new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    render(
      <auth.LocalAuthProvider>
        <auth.LocalSignIn />
      </auth.LocalAuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /AeroGap account/i })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /AeroGap account/i })).toBeEnabled();
    // Says what the hosted account brings here: its companies, mirrored.
    expect(document.body.textContent).toMatch(/mirrored to this computer/i);
  });

  it('explains, offline without a hosted session, why the hosted button cannot work yet', async () => {
    window.sessionStorage.setItem('aerogap.authProvider.session', 'local');
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    vi.stubGlobal('fetch', async (url: string) =>
      String(url).includes('/status')
        ? new Response(JSON.stringify({ hasAccounts: true }), { status: 200 })
        : new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    render(
      <auth.LocalAuthProvider>
        <auth.LocalSignIn />
      </auth.LocalAuthProvider>,
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /AeroGap account/i })).toBeDisabled());
    expect(document.body.textContent).toMatch(/No internet connection/i);
    window.sessionStorage.clear();
  });

  it('links an offline session for the hosted account and remembers the subject', async () => {
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    const calls: Array<{ url: string; body: unknown }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ user: { subject: 'user_2abc' } }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await auth.linkHostedSession(async () => 'clerk.jwt.here', fetchImpl);
    expect(result).toEqual({ ok: true, subject: 'user_2abc' });
    expect(calls[0]).toEqual({ url: '/local-auth/hosted-session', body: { token: 'clerk.jwt.here' } });
    expect(auth.canContinueOffline('user_2abc')).toBe(true);
    expect(auth.canContinueOffline(null)).toBe(true);
    // A different hosted user on the same install cannot ride that session.
    expect(auth.canContinueOffline('user_other')).toBe(false);
  });

  it('does not claim offline continuation when the install refuses or the token is missing', async () => {
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    const notFound = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;
    expect(await auth.linkHostedSession(async () => 'jwt', notFound)).toEqual({ ok: false, unsupported: true });
    expect(await auth.linkHostedSession(async () => null, notFound)).toEqual({ ok: false });
    expect(auth.canContinueOffline(null)).toBe(false);
  });

  it('does not offer it in plain local mode', async () => {
    const auth = await loadFacade('local', { clerkPublishableKey: PK });
    vi.stubGlobal('fetch', async (url: string) =>
      String(url).includes('/status')
        ? new Response(JSON.stringify({ hasAccounts: true }), { status: 200 })
        : new Response(JSON.stringify({ user: null }), { status: 200 }),
    );
    render(
      <auth.LocalAuthProvider>
        <auth.LocalSignIn />
      </auth.LocalAuthProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /online account/i })).toBeNull();
  });

  it('records the choice and reloads when switching', async () => {
    const auth = await loadFacade('both', { clerkPublishableKey: PK, deploymentMode: 'desktop' });
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    auth.switchAuthProvider('clerk');
    expect(window.localStorage.getItem('aerogap.authProvider')).toBe('clerk');
    expect(reload).toHaveBeenCalled();
  });
});

describe('local mode', () => {
  it('is selected only by the exact string "local"', async () => {
    const auth = await loadFacade('local');
    expect(auth.AUTH_MODE).toBe('local');
    expect(auth.isLocalAuth).toBe(true);
  });

  it('shapes a local identity like the Clerk object components already read', async () => {
    const auth = await loadFacade('local');
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/session')) {
        return new Response(
          JSON.stringify({ user: { subject: 'local|abc', email: 'owner@shop.local', name: 'Pat Owner' } }),
          { status: 200 },
        );
      }
      return new Response('{}', { status: 200 });
    });

    function Probe() {
      const { user, isSignedIn } = auth.useUser();
      if (!isSignedIn || !user) return <div>signed-out</div>;
      return (
        <div>
          {`${user.id}|${user.primaryEmailAddress?.emailAddress}|${user.fullName}|${user.firstName}`}
        </div>
      );
    }

    render(
      <auth.LocalAuthProvider>
        <Probe />
      </auth.LocalAuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('local|abc|owner@shop.local|Pat Owner|Pat')).toBeInTheDocument(),
    );
  });

  it('reports signed-out without error when there is no session', async () => {
    const auth = await loadFacade('local');
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ user: null }), { status: 200 }));

    function Probe() {
      const { isLoaded, isSignedIn } = auth.useUser();
      return <div>{`${isLoaded}:${isSignedIn}`}</div>;
    }

    render(
      <auth.LocalAuthProvider>
        <Probe />
      </auth.LocalAuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('true:false')).toBeInTheDocument());
  });

  it('survives the session endpoint being unreachable', async () => {
    // The app server restarting mid-load must not leave the UI stuck on a
    // spinner forever.
    const auth = await loadFacade('local');
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED');
    });

    function Probe() {
      const { isLoaded, isSignedIn } = auth.useUser();
      return <div>{`${isLoaded}:${isSignedIn}`}</div>;
    }

    render(
      <auth.LocalAuthProvider>
        <Probe />
      </auth.LocalAuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('true:false')).toBeInTheDocument());
  });
});

describe('the local sign-in screen', () => {
  it('offers account creation on a fresh install', async () => {
    const auth = await loadFacade('local');
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/status')) {
        return new Response(JSON.stringify({ hasAccounts: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ user: null }), { status: 200 });
    });

    render(
      <auth.LocalAuthProvider>
        <auth.LocalSignIn />
      </auth.LocalAuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('Create your account')).toBeInTheDocument());
    // The person at the machine should learn they are becoming the admin now,
    // not discover it later.
    expect(document.body.textContent).toMatch(/first account becomes the administrator/i);
  });

  it('shows sign-in when accounts already exist', async () => {
    const auth = await loadFacade('local');
    vi.stubGlobal('fetch', async (url: string) => {
      if (String(url).includes('/status')) {
        return new Response(JSON.stringify({ hasAccounts: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ user: null }), { status: 200 });
    });

    render(
      <auth.LocalAuthProvider>
        <auth.LocalSignIn />
      </auth.LocalAuthProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument(),
    );
  });

  it('explains that there is no reset email rather than offering a dead link', async () => {
    const auth = await loadFacade('local');
    vi.stubGlobal('fetch', async (url: string) =>
      String(url).includes('/status')
        ? new Response(JSON.stringify({ hasAccounts: true }), { status: 200 })
        : new Response(JSON.stringify({ user: null }), { status: 200 }),
    );

    render(
      <auth.LocalAuthProvider>
        <auth.LocalSignIn />
      </auth.LocalAuthProvider>,
    );

    await waitFor(() => expect(document.body.textContent).toMatch(/no reset email/i));
    expect(screen.queryByText(/forgot password\?/i)).toBeNull();
  });

  it('surfaces the server’s reason for a failed sign-in', async () => {
    const auth = await loadFacade('local');
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.includes('/status')) {
        return new Response(JSON.stringify({ hasAccounts: true }), { status: 200 });
      }
      if (target.includes('/sign-in') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({ error: 'That email address and password do not match an account.' }),
          { status: 401 },
        );
      }
      return new Response(JSON.stringify({ user: null }), { status: 200 });
    });

    render(
      <auth.LocalAuthProvider>
        <auth.LocalSignIn />
      </auth.LocalAuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument(),
    );
    await userEvent.type(screen.getByPlaceholderText('you@yourcompany.com'), 'a@b.c');
    const password = document.querySelector('input[type="password"]') as HTMLInputElement;
    await userEvent.type(password, 'wrongpassword1');
    await userEvent.click(screen.getByRole('button', { name: /^Sign in$/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/do not match an account/i),
    );
  });
});
