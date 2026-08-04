# App Navigation and Access

Primary files:
- `src/App.tsx`
- `src/config/navConfig.ts` (single source of truth for labels, paths, groups)
- `src/components/Sidebar.tsx`
- `src/components/GlobalSearch.tsx`
- `src/components/LogbookRouteGuard.tsx`

## What this area does

This layer controls route rendering, role-gated page visibility, redirects, mobile/desktop navigation shell, and top-level error boundaries.

## Key functions and behavior

- `App()`  
  Main router shell containing headers, sidebar, route table, and lazy page loading.
- `getViewTitle(pathname)` in `navConfig.ts`  
  Maps route paths to header title text (also drives Splash destinations and Ctrl+K jump list).
- `CompanyAdminHomeRoute()`  
  Checks tenant company-management access; renders workspace when eligible and explicit access guidance when not.
- Role/employee conditional routes (`isAdmin`, `isAerogapEmployee`)  
  Protects `/admin`, `/companies`, `/aerogap-dashboard`.
- Company admin/manager route  
  `/company-admin` is available to users with `company_admin` or `company_manager` membership for at least one company.
- Canonical schedule route  
  `/schedule` renders `InspectionSchedule`. Do not deep-link Home/search to `/logbook?tab=schedule` for nav purposes.
- Feature-gated redirects  
  Sidebar redirects disabled feature routes to `/splash` with a toast (see `FEATURE_GATED_ROUTES` in `navConfig.ts`).

## Access model summary

- Public/signed-out routing is handled before this layer by `AuthGate`.
- Authenticated users get full route shell with feature-specific guards.
- Logbook route is additionally checked by `LogbookRouteGuard`.
- Certain pages only render for admin/staff roles.
- Sidebar shows `Company Admin` when tenant access exists; otherwise direct route shows an access-required state.
- Nav groups default with **Audit** open for first visit; Tools stay collapsed.

## Common failure states

- Unauthorized route: user is redirected or route is hidden.
- Unknown route: wildcard sends user to `/splash`.
- Lazy-load error in page component: wrapped `ErrorBoundary` catches view failure.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` / `Cmd+K` | Open global search (jump to pages, records, or Ask) |
| `Escape` | Close mobile nav drawer or global search |
