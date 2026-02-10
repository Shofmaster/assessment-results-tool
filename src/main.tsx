import React from 'react';
import ReactDOM from 'react-dom/client';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';
import App from './App';
import { clerkAppearance } from './clerkTheme';
import './index.css';

type RuntimeConfig = {
  clerkPublishableKey?: string;
  convexUrl?: string;
};

const runtimeConfig: RuntimeConfig =
  (globalThis as unknown as { __AVIATION_APP_CONFIG__?: RuntimeConfig })
    .__AVIATION_APP_CONFIG__ ?? {};

const clerkPubKey =
  runtimeConfig.clerkPublishableKey ?? import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const convexUrl = runtimeConfig.convexUrl ?? import.meta.env.VITE_CONVEX_URL;

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
        <p className="mt-4 text-white/60 text-sm font-inter">
          If you are running a packaged desktop build, you can also provide a
          runtime config object on{' '}
          <code className="text-white">globalThis.__AVIATION_APP_CONFIG__</code>{' '}
          with <code className="text-white">clerkPublishableKey</code> and{' '}
          <code className="text-white">convexUrl</code>.
        </p>
      </div>
    </div>
  );
}

const missing: string[] = [];
if (!clerkPubKey) missing.push('VITE_CLERK_PUBLISHABLE_KEY');
if (!convexUrl) missing.push('VITE_CONVEX_URL');

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root element');
}

if (missing.length > 0) {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <MissingConfig missing={missing} />
    </React.StrictMode>
  );
} else {
  const convex = new ConvexReactClient(convexUrl);
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <ClerkProvider publishableKey={clerkPubKey} appearance={clerkAppearance}>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          <App />
        </ConvexProviderWithClerk>
      </ClerkProvider>
    </React.StrictMode>
  );
}
