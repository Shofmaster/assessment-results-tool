# Auth and Public Pages

Primary components:
- `src/components/AuthGate.tsx`
- `src/components/landing/LandingPage.tsx`
- `src/components/public/PublicSeoPage.tsx`
- `src/seo/seoContent.ts`

## What this area does

This flow decides what users see before entering the authenticated app shell: public landing, SEO content pages, sign-in, or loading/setup states.

## Route behavior (signed out)

- `/` -> `LandingPage`
- SEO paths in `SEO_PAGE_BY_PATH` -> `PublicSeoPage`
- Any other path -> Clerk `SignIn`

## Key functions and behavior

- `AuthGate(...)`  
  Global gate wrapping the app and enforcing public vs authenticated rendering.
- `upsertUser(...)` flow in `useEffect`  
  Syncs Clerk identity into Convex user records after sign-in.
- Login redirect effect (`navigate('/splash')`)  
  Sends newly signed-in users to app home.
- DB user setup fallback (`proceedWithoutDbUser`)  
  Prevents indefinite block if user row sync is delayed.
- `SEO_PAGE_BY_PATH` (from `seoContent.ts`)  
  Defines the public SEO pages and metadata payload used by `PublicSeoPage`.

## Common failure states

- Clerk still loading: spinner state appears until auth initialization completes.
- Missing Convex user row after login: setup spinner, then timed fallback.
- Unknown public path: SignIn page is shown by default.
