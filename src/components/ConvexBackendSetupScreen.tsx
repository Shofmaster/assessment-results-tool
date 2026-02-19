/**
 * Full-screen setup UI when Convex backend fails due to missing CLERK_JWT_ISSUER_DOMAIN.
 * Shown when ErrorBoundary catches FUNCTION_INVOCATION_FAILED.
 */

export default function ConvexBackendSetupScreen() {
  const command =
    'npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-issuer>.clerk.accounts.dev';
  const clerkUrl = 'https://dashboard.clerk.com';
  const convexLogsUrl = 'https://dashboard.convex.dev';

  return (
    <div className="flex h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 px-6">
      <div className="w-full max-w-2xl glass rounded-2xl p-6 md:p-8">
        <h1 className="text-2xl md:text-3xl font-poppins font-bold text-white">
          Backend setup required
        </h1>
        <p className="mt-2 text-white/70 font-inter">
          Convex needs the Clerk JWT issuer to verify your login. Without it,
          backend calls fail.
        </p>
        <p className="mt-4 text-white/80 font-inter font-medium">Fix in 3 steps:</p>
        <ol className="mt-2 list-decimal list-inside space-y-2 text-white/70 font-inter text-sm">
          <li>
            Open{' '}
            <a
              href={clerkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky hover:text-sky-light underline"
            >
              Clerk Dashboard
            </a>{' '}
            → Configure → JWT Templates → convex
          </li>
          <li>Copy the <strong>Issuer</strong> URL</li>
          <li>Run this in your project root (replace the URL):</li>
        </ol>
        <pre className="mt-3 overflow-auto rounded-xl bg-black/40 p-4 text-sm text-white/90 font-mono">
          {command}
        </pre>
        <p className="mt-4 text-white/60 text-sm font-inter">
          Or run <code className="text-white/80">npm run setup</code> for an
          interactive guide. See{' '}
          <code className="text-white/80">FIX_SERVER_ERROR_STEPS.md</code> for
          detailed steps.
        </p>
        <p className="mt-3 text-white/60 text-sm font-inter">
          If you need the exact error, check{' '}
          <a
            href={convexLogsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky hover:text-sky-light underline"
          >
            Convex Dashboard → Logs
          </a>{' '}
          (search for the request ID from the error).
        </p>
      </div>
    </div>
  );
}
