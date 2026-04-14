# App Navigation and Access

Primary files:
- `src/App.tsx`
- `src/components/Sidebar.tsx`
- `src/components/LogbookRouteGuard.tsx`

## What this area does

This layer controls route rendering, role-gated page visibility, redirects, mobile/desktop navigation shell, and top-level error boundaries.

## Key functions and behavior

- `App()`  
  Main router shell containing headers, sidebar, route table, and lazy page loading.
- `VIEW_TITLES`  
  Maps route paths to header title text.
- `CompanyAdminHomeRoute()`  
  Checks available company-admin scope; redirects to `/settings` when none.
- Router sync effect (`currentView` -> `navigate(path)`)  
  Allows store-triggered navigation requests from nested components.
- Role/employee conditional routes (`isAdmin`, `isAerogapEmployee`)  
  Protects `/admin`, `/companies`, `/aerogap-dashboard`.
- Redirect routes (`/`, `/projects`, `/schedule`, wildcard)  
  Preserve old links and force stable app entry behavior.

## Access model summary

- Public/signed-out routing is handled before this layer by `AuthGate`.
- Authenticated users get full route shell with feature-specific guards.
- Logbook route is additionally checked by `LogbookRouteGuard`.
- Certain pages only render for admin/staff roles.

## Common failure states

- Unauthorized route: user is redirected or route is hidden.
- Unknown route: wildcard sends user to `/splash`.
- Lazy-load error in page component: wrapped `ErrorBoundary` catches view failure.
