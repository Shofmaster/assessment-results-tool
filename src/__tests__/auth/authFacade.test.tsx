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
vi.mock('../../config/runtimeEnv', () => ({
  getConfigValue: (key: string) => (key === 'authMode' ? configuredMode : undefined),
  readRuntimeConfig: () => ({}),
  hasRuntimeConfig: () => false,
}));

async function loadFacade(mode: string | undefined) {
  configuredMode = mode;
  vi.resetModules();
  return await import('../../auth');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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
