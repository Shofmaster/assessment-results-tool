import { useEffect, useRef, useState } from 'react';
import { useUser, SignIn, SignUp } from '@clerk/clerk-react';
import { useConvexAuth } from 'convex/react';
import { useCurrentDbUser, useUpsertUser } from '../hooks/useConvexData';
import { useLocation, useNavigate } from 'react-router-dom';
import { Link } from 'react-router-dom';
import LandingPage from './landing/LandingPage';
import PublicSeoPage from './public/PublicSeoPage';
import LegalPage from './public/LegalPage';
import { SEO_PAGE_BY_PATH } from '../seo/seoContent';
import { LEGAL_DOC_BY_PATH } from '../legal/legalContent';
import {
  PRODUCT_INTENT_COMPANY_NAME,
  PRODUCT_INTENT_ASSISTIVE_SHORT,
} from '../config/productIntent';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { isAuthenticated } = useConvexAuth();
  const dbUser = useCurrentDbUser();
  const upsertUser = useUpsertUser();
  const location = useLocation();
  const navigate = useNavigate();
  const wasSignedIn = useRef(false);
  /** Convex can temporarily return `null`/`undefined` while auth or user sync settles; avoid an indefinite spinner. */
  const [proceedWithoutDbUser, setProceedWithoutDbUser] = useState(false);
  const [authMode, setAuthMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  useEffect(() => {
    if (!isSignedIn) setProceedWithoutDbUser(false);
  }, [isSignedIn]);

  useEffect(() => {
    if (!isSignedIn) {
      setProceedWithoutDbUser(false);
      return;
    }
    if (dbUser !== null && dbUser !== undefined && isAuthenticated) {
      setProceedWithoutDbUser(false);
      return;
    }
    const id = window.setTimeout(() => {
      console.warn(
        '[AuthGate] Convex auth/user lookup timed out; continuing to avoid a stuck loading screen.',
      );
      setProceedWithoutDbUser(true);
    }, 12000);
    return () => clearTimeout(id);
  }, [dbUser, isAuthenticated, isSignedIn]);

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

  // Always send users to splash on successful login.
  useEffect(() => {
    const signedIn = Boolean(isSignedIn);
    if (signedIn && !wasSignedIn.current) {
      navigate('/splash', { replace: true });
    }
    wasSignedIn.current = signedIn;
  }, [isSignedIn, navigate]);

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
    // Public landing page: marketing-style entry for unauthenticated visitors.
    if (location.pathname === '/') {
      return <LandingPage />;
    }
    const seoPage = SEO_PAGE_BY_PATH.get(location.pathname);
    if (seoPage) {
      return <PublicSeoPage page={seoPage} />;
    }

    const legalDoc = LEGAL_DOC_BY_PATH.get(location.pathname);
    if (legalDoc) {
      return <LegalPage doc={legalDoc} />;
    }

    return (
      <div className="flex min-h-dvh items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 p-4 overflow-auto">
        <a href="#clerk-sign-in" className="skip-link">
          Skip to sign-in form
        </a>
        <div className="w-full min-w-0 max-w-md px-4 sm:px-6" id="clerk-sign-in">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-sky to-sky-light rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-sky/20">
              <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <h1 className="text-2xl font-poppins font-bold text-white mb-1">AeroGap</h1>
            <p className="text-white/50 font-inter text-[11px] font-medium tracking-wide uppercase mb-1">{PRODUCT_INTENT_COMPANY_NAME}</p>
            <p className="text-white/55 font-inter text-xs">{PRODUCT_INTENT_ASSISTIVE_SHORT}</p>
          </div>
          {authMode === 'sign-in' ? (
            <SignIn
              routing="hash"
              appearance={{
                // Use the in-app toggle below instead of Clerk's footer link so
                // sign-in and sign-up stay on this single mounted surface.
                elements: { footerAction: 'hidden', footerActionLink: 'hidden' },
              }}
            />
          ) : (
            <SignUp
              routing="hash"
              appearance={{
                elements: { footerAction: 'hidden', footerActionLink: 'hidden' },
              }}
            />
          )}
          <div className="mt-4 text-center text-sm text-white/55">
            {authMode === 'sign-in' ? (
              <>
                New to AeroGap?{' '}
                <button
                  type="button"
                  onClick={() => setAuthMode('sign-up')}
                  className="font-medium text-sky-light hover:text-white transition-colors"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => setAuthMode('sign-in')}
                  className="font-medium text-sky-light hover:text-white transition-colors"
                >
                  Sign in
                </button>
              </>
            )}
          </div>
          <p className="text-center text-xs text-white/45 mt-4">v2.0.0 · Assistive models; human approval on every output</p>
          <div className="mt-3 flex items-center justify-center gap-3 text-xs text-white/40">
            <Link to="/privacy" className="hover:text-white/70 transition-colors">Privacy</Link>
            <span aria-hidden="true">·</span>
            <Link to="/terms" className="hover:text-white/70 transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    );
  }

  // Authenticated but waiting for Convex connection or user record
  if (((!isAuthenticated || dbUser === undefined) || dbUser === null) && !proceedWithoutDbUser) {
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
