import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexProviderWithAuth, ConvexReactClient } from 'convex/react';
import { isLocalAuth } from './auth';
import { LocalAuthProvider, useAuthForConvex } from './auth/LocalAuthProvider';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { getClerkAppearance } from './clerkTheme';
import { initSentry } from './services/sentry';
import { initAnalytics } from './services/analytics';
import { getConfigValue } from './config/runtimeEnv';
import './index.css';

initSentry();
initAnalytics();

const clerkPubKey = getConfigValue('clerkPublishableKey');
const convexUrl = getConfigValue('convexUrl');

/**
 * One-time cleanup of stale Clerk DEV-instance cookies left over from the
 * dev→prod Clerk migration (2026-07-21). Every browser that signed into the old
 * dev instance still carries its cookies (suffix `_nzOJpQ5_`, including the
 * readable `__clerk_db_jwt_*` dev session token). When the new prod instance's
 * session handshake boots and finds a second instance's client cookies, it
 * intermittently fails and silently signs the user out on refresh — the "Clerk
 * randomly asks me to sign back in" report. These dev cookies are not httpOnly,
 * so we can expire them from JS. Runs BEFORE <ClerkProvider> mounts.
 *
 * Scoped strictly to the dead dev suffix: the live prod session (suffix
 * `_Xpc4L3Qm`) is never touched, so already-signed-in users stay signed in.
 * The dev suffix is derived from the single shared dev publishable key, so it is
 * identical for every affected user — this self-heals the whole user base on
 * their next page load. Safe to leave in place; it no-ops once the cookies are
 * gone. Remove after the fleet has cycled through (cookies also expire on their
 * own).
 */
const DEAD_CLERK_DEV_SUFFIX = '_nzOJpQ5_';

function purgeStaleClerkDevCookies(): void {
  try {
    // Only the production custom domain runs the prod (pk_live) instance, so the
    // `_nzOJpQ5_` dev cookies are stale ONLY there. localhost and *.vercel.app
    // previews legitimately run the dev instance (that same suffix is the LIVE
    // session) — purging there would sign developers/reviewers out every load.
    const host = window.location.hostname;
    if (!host.endsWith('aerogaptechnologies.com')) return;

    const rawCookies = document.cookie ? document.cookie.split(';') : [];
    const staleNames = rawCookies
      .map((c) => c.split('=')[0].trim())
      .filter((name) => name.length > 0 && name.includes(DEAD_CLERK_DEV_SUFFIX));
    if (staleNames.length === 0) return;

    const parts = host.split('.'); // host, e.g. www.aerogaptechnologies.com
    const registrable = parts.length > 2 ? parts.slice(-2).join('.') : host;
    // A cookie is overwritten only when name + domain + path all match how it
    // was set; we don't know the exact domain, so clear across every plausible
    // scope (host-only, host, registrable domain, and their dotted variants).
    const domainVariants = [
      undefined,
      host,
      `.${host}`,
      registrable,
      `.${registrable}`,
    ];
    const past = 'Thu, 01 Jan 1970 00:00:00 GMT';

    for (const name of staleNames) {
      for (const domain of domainVariants) {
        document.cookie =
          `${name}=; expires=${past}; path=/` +
          (domain ? `; domain=${domain}` : '');
      }
    }
    // eslint-disable-next-line no-console
    console.info(
      `[auth] cleared ${staleNames.length} stale Clerk dev-instance cookie(s) from a prior instance`,
    );
  } catch {
    /* cookie access blocked (private mode / policy) — nothing to clean up. */
  }
}

// Clerk-only concern: a self-hosted install has no Clerk cookies to clean up,
// and the function's own hostname guard would skip it anyway.
if (!isLocalAuth) purgeStaleClerkDevCookies();

function MissingConfig({ missing }: { missing: string[] }) {
  const envTemplate = [
    '# Required for authentication (Clerk)',
    'VITE_CLERK_PUBLISHABLE_KEY=',
    '',
    '# Required for database (Convex)',
    'VITE_CONVEX_URL=',
  ].join('\n');

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 px-6">
      <div className="w-full max-w-2xl glass rounded-2xl p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-poppins font-bold text-white">
          Setup required
        </h1>
        <p className="mt-2 text-white/70 font-inter">
          The app can&apos;t start because required configuration is missing:
        </p>
        <ul className="mt-3 list-disc pl-6 text-white/80 font-inter">
          {missing.map((key) => (
            <li key={key}>
              <code className="text-white">{key}</code>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-white/70 font-inter">
          Create (or update) <code className="text-white">.env.local</code> in
          the project root, then restart the app:
        </p>
        <pre className="mt-3 overflow-auto rounded-xl bg-black/40 p-4 text-sm text-white/90">
          {envTemplate}
        </pre>
        <p className="mt-4 text-white/70 text-sm font-inter">
          {isLocalAuth
            ? 'Self-hosted and desktop installs receive configuration from /config.js at runtime. If this screen appears in a packaged build, the application server is not running or did not start correctly.'
            : (
              <>
                If you are running a packaged desktop build, you can also provide a
                runtime config object on{' '}
                <code className="text-white">globalThis.__AVIATION_APP_CONFIG__</code>{' '}
                with <code className="text-white">clerkPublishableKey</code> and{' '}
                <code className="text-white">convexUrl</code>.
              </>
            )}
        </p>
      </div>
    </div>
  );
}

const missing: string[] = [];
// A local-auth deployment issues its own identities and has no Clerk instance,
// so demanding a publishable key there would block every self-hosted install on
// a value that has no meaning for it.
if (!clerkPubKey && !isLocalAuth) missing.push('VITE_CLERK_PUBLISHABLE_KEY');
if (!convexUrl) missing.push('VITE_CONVEX_URL');

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element');
}

function ThemedApp({
  convex,
  publishableKey,
}: {
  convex: ConvexReactClient;
  // Passed in rather than read from module scope: the caller has already proved
  // it is present, and taking it as a required prop lets the type system carry
  // that guarantee instead of relying on the value being `any`.
  publishableKey: string;
}) {
  const { theme } = useTheme();
  const clerkAppearance = getClerkAppearance(theme);

  return (
    <BrowserRouter>
      <ClerkProvider publishableKey={publishableKey} appearance={clerkAppearance}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </BrowserRouter>
  );
}

/**
 * The self-hosted tree.
 *
 * Clerk is not merely unused here - it is not mounted at all, so a self-hosted
 * install makes no request to clerk.com and carries no dependency on it being
 * reachable. That is the difference between "we do not send your identity
 * anywhere" as a claim and as a fact.
 */
function LocalThemedApp({ convex }: { convex: ConvexReactClient }) {
  return (
    <BrowserRouter>
      <LocalAuthProvider>
        <ConvexProviderWithAuth client={convex} useAuth={useAuthForConvex}>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ConvexProviderWithAuth>
      </LocalAuthProvider>
    </BrowserRouter>
  );
}

// The explicit truthiness checks are what narrow these to `string` for the
// branch below; `missing.length` alone tells the compiler nothing about them.
if (missing.length > 0 || !convexUrl) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <MissingConfig missing={missing} />
    </React.StrictMode>
  );
} else if (isLocalAuth) {
  const convex = new ConvexReactClient(convexUrl);
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ThemeProvider>
        <LocalThemedApp convex={convex} />
      </ThemeProvider>
    </React.StrictMode>
  );
} else if (!clerkPubKey) {
  // Unreachable given the `missing` check above, but it is what narrows
  // clerkPubKey to `string` for the branch below - and the compiler carrying
  // that guarantee is the reason the key is passed as a required prop.
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <MissingConfig missing={['VITE_CLERK_PUBLISHABLE_KEY']} />
    </React.StrictMode>
  );
} else {
  const convex = new ConvexReactClient(convexUrl);
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ThemeProvider>
        <ThemedApp convex={convex} publishableKey={clerkPubKey} />
      </ThemeProvider>
    </React.StrictMode>
  );
}
