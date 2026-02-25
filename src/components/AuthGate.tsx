import { useEffect } from 'react';
import { useUser, SignIn } from '@clerk/clerk-react';
import { useConvexAuth } from 'convex/react';
import { useCurrentDbUser, useUpsertUser } from '../hooks/useConvexData';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const dbUser = useCurrentDbUser();
  const upsertUser = useUpsertUser();

  // Sync Clerk user into Convex users table on sign-in
  useEffect(() => {
    if (isAuthenticated && user) {
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) {
        upsertUser({
          clerkUserId: user.id,
          email,
          name: user.fullName || user.firstName || undefined,
          picture: user.imageUrl || undefined,
        }).catch(() => {
          // User may already exist — safe to ignore
        });
      }
    }
  }, [isAuthenticated, user, upsertUser]);

  // Loading state while Clerk initializes
  if (!isLoaded) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sky/30 border-t-sky rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/70 font-inter">Loading...</p>
        </div>
      </div>
    );
  }

  // Not signed in — show Clerk SignIn
  if (!isSignedIn) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 p-4 overflow-auto">
        <a href="#clerk-sign-in" className="skip-link">
          Skip to sign-in form
        </a>
        <div className="w-full min-w-0 max-w-md px-4 sm:px-6" id="clerk-sign-in">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-sky to-sky-light rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-sky/20">
              <svg className="w-10 h-10 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-3xl font-poppins font-bold text-white mb-1">AeroGap</h1>
            <p className="text-white/70 font-inter text-sm mb-0.5">Aviation Quality Company</p>
            <p className="text-white/60 font-inter text-xs">Compliance assessment for Part 145, IS-BAO, EASA & AS9100</p>
          </div>
          <SignIn routing="hash" />
          <p className="text-center text-xs text-white/50 mt-4">
            v2.0.0 · Powered by Claude
          </p>
        </div>
      </div>
    );
  }

  // Authenticated but waiting for Convex connection or user record
  if (!isAuthenticated || dbUser === undefined) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 p-4">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sky/30 border-t-sky rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/70 font-inter">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
