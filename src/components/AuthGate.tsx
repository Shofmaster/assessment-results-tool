import { useEffect } from 'react';
import { useUser, SignIn } from '@clerk/clerk-react';
import { useAppStore } from '../store/appStore';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const currentUser = useAppStore(s => s.currentUser);
  const syncClerkUser = useAppStore(s => s.syncClerkUser);
  const handleSignOut = useAppStore(s => s.handleSignOut);

  // Sync Clerk user state into the Zustand store
  useEffect(() => {
    if (isLoaded && isSignedIn && user) {
      const email = user.primaryEmailAddress?.emailAddress;
      if (email) {
        syncClerkUser({
          email,
          name: user.fullName || user.firstName || null,
          picture: user.imageUrl || null,
        });
      }
    } else if (isLoaded && !isSignedIn && currentUser) {
      handleSignOut();
    }
  }, [isLoaded, isSignedIn, user, currentUser, syncClerkUser, handleSignOut]);

  // Loading state while Clerk initializes
  if (!isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sky/30 border-t-sky rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 font-inter">Loading...</p>
        </div>
      </div>
    );
  }

  // Not signed in — show Clerk SignIn
  if (!isSignedIn) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700">
        <div className="w-full max-w-md px-6">
          {/* Branding */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-sky to-sky-light rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-sky/20">
              <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-2xl font-poppins font-bold text-white mb-1">Assessment Analyzer</h1>
            <p className="text-white/50 font-inter text-sm">Aviation Quality Company</p>
          </div>

          <SignIn routing="hash" />

          <p className="text-center text-xs text-white/30 mt-4">
            v1.2.0 · Powered by Claude
          </p>
        </div>
      </div>
    );
  }

  // Signed in but store not yet synced
  if (!currentUser) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-sky/30 border-t-sky rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 font-inter">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
