import { useCallback, useEffect, useState } from 'react';
import { FiLock, FiMail, FiUser } from 'react-icons/fi';
import { useLocalAuth } from './LocalAuthProvider';

/**
 * Sign-in and first-run setup for a self-hosted install.
 *
 * WHAT MAKES THIS DIFFERENT FROM A HOSTED SIGN-IN
 * There is no "forgot password" link, because there is nowhere to send the mail
 * on a machine that may never touch the internet - and an unauthenticated reset
 * endpoint would be an easier way in than the password. Recovery is an
 * administrator resetting it from inside the app, and the copy says so rather
 * than leaving someone clicking a link that is not there.
 *
 * FIRST RUN IS NOT A SIGN-UP PAGE
 * On a fresh install there are no accounts, and the person in front of the
 * machine is the owner. They are shown "Create your account" directly rather
 * than a sign-in form that can only fail, and told they are becoming the
 * administrator - which is a fact about the machine they should not discover
 * later.
 */

type Mode = 'signIn' | 'signUp';

export function LocalSignIn() {
  const { signIn, signUp } = useLocalAuth();

  const [mode, setMode] = useState<Mode>('signIn');
  const [hasAccounts, setHasAccounts] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Is this a fresh install?
   *
   * Answered by the server, which knows whether any account exists. Asked once
   * on mount; a wrong answer only affects which form is shown first, so a
   * failure falls back to sign-in rather than blocking the screen.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/local-auth/status', { credentials: 'same-origin' });
        const body = await response.json();
        if (cancelled) return;
        const empty = body?.hasAccounts === false;
        setHasAccounts(!empty);
        if (empty) setMode('signUp');
      } catch {
        if (!cancelled) setHasAccounts(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const result =
        mode === 'signUp'
          ? await signUp({ email, password, name: name.trim() || undefined })
          : await signIn(email, password);
      if (!result.ok) setError(result.error ?? 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }, [mode, email, password, name, signIn, signUp]);

  const isFirstRun = hasAccounts === false;
  const heading = mode === 'signUp' ? (isFirstRun ? 'Create your account' : 'Add an account') : 'Sign in';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 px-6">
      <div className="glass w-full max-w-md rounded-2xl p-8">
        <h1 className="font-poppins text-2xl font-bold text-white">{heading}</h1>

        {isFirstRun && mode === 'signUp' ? (
          <p className="mt-2 font-inter text-sm text-white/70">
            This is a new AeroGap installation. The first account becomes the administrator for this
            machine.
          </p>
        ) : (
          <p className="mt-2 font-inter text-sm text-white/70">
            Your account is stored on this machine. Nothing about it leaves your network.
          </p>
        )}

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void submit();
          }}
        >
          {mode === 'signUp' && (
            <label className="block">
              <span className="mb-1 block font-inter text-sm text-white/80">Your name</span>
              <div className="relative">
                <FiUser className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-10 pr-3 text-white placeholder:text-white/25 focus:border-sky-400/50 focus:outline-none"
                  placeholder="Jane Mechanic"
                />
              </div>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block font-inter text-sm text-white/80">Email</span>
            <div className="relative">
              <FiMail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="username"
                className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-10 pr-3 text-white placeholder:text-white/25 focus:border-sky-400/50 focus:outline-none"
                placeholder="you@yourcompany.com"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block font-inter text-sm text-white/80">Password</span>
            <div className="relative">
              <FiLock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                // Tells a password manager which flow this is, so it offers to
                // save on sign-up and to fill on sign-in.
                autoComplete={mode === 'signUp' ? 'new-password' : 'current-password'}
                className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-10 pr-3 text-white placeholder:text-white/25 focus:border-sky-400/50 focus:outline-none"
                placeholder={mode === 'signUp' ? 'At least 12 characters' : ''}
              />
            </div>
            {mode === 'signUp' && (
              <span className="mt-1 block font-inter text-xs text-white/45">
                At least 12 characters. A short phrase you can remember is stronger than a short
                complicated word.
              </span>
            )}
          </label>

          {error && (
            <p role="alert" className="font-inter text-sm text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-sky-500 py-2.5 font-inter font-medium text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Please wait…' : mode === 'signUp' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {/* Not offered on a fresh install: there is nothing to sign in to yet. */}
        {!isFirstRun && (
          <p className="mt-6 text-center font-inter text-sm text-white/60">
            {mode === 'signIn' ? (
              <>
                Need an account on this machine?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signUp');
                    setError(null);
                  }}
                  className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode('signIn');
                    setError(null);
                  }}
                  className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        )}

        {mode === 'signIn' && (
          // Said plainly rather than offering a link that cannot work. Someone
          // who has forgotten their password needs to know who to ask, not to
          // discover after three clicks that there is no reset email.
          <p className="mt-4 text-center font-inter text-xs text-white/40">
            Forgotten your password? An administrator on this installation can reset it for you —
            there is no reset email, because your accounts never leave this machine.
          </p>
        )}
      </div>
    </div>
  );
}
