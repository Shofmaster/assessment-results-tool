# Authentication

## Modes

| Mode | Status | Who issues tokens | When to use |
|---|---|---|---|
| `clerk` | **Implemented** | Clerk | Server installs with a real hostname; simplest if outbound identity is acceptable |
| `local` | **Implemented** | This install (`/local-auth`) | Desktop installs, air-gapped sites, or any install where identity must not leave the network |
| `oidc` | **Not implemented** | Your IdP (Entra, Okta, Keycloak) | Future — server refuses to start if you set this today |

## Desktop installs (`DEPLOYMENT_MODE=desktop`)

Desktop mode **always uses `AUTH_MODE=local`**. Clerk production keys refuse a
loopback origin (`http://127.0.0.1`), so there is no Clerk path on the desktop
product.

Flow:

1. User signs in at `/local-auth/sign-in` on the app server
2. Server sets an httpOnly session cookie and mints a short-lived Convex JWT
3. Convex validates that JWT against the JWKS published on the same origin
4. First user on a fresh install is auto-approved as administrator

No Clerk keys, no outbound identity traffic, no manual bootstrap commands.

## Server installs

### `AUTH_MODE=clerk`

Sign-in happens against Clerk over the internet. Your user directory lives at
Clerk. Every API request verifies its token against Clerk
([`api/_lib/auth.ts`](../../api/_lib/auth.ts)).

For most customers this is acceptable: regulated content (manuals, maintenance
records, audit findings) is local; identity is handled by a specialist.

### `AUTH_MODE=local`

The app server issues RS256 tokens and publishes a JWKS at
`{APP_ORIGIN}/local-auth/.well-known/jwks.json`. Convex is configured at deploy
time to trust that issuer.

Set `APP_ORIGIN` to the URL users actually open. The issuer stamped into every
token is derived from it; if those disagree, sign-in fails with nothing useful
in the logs.

First user becomes administrator; later sign-ups are pending until an admin
approves them (unless `DEPLOYMENT_MODE=desktop`, where everyone is auto-approved).

### `AUTH_MODE=oidc` (future)

Not shipped. The server refuses to boot rather than silently falling back to
Clerk. Native OIDC will require replacing the Clerk provider in
`src/auth/index.ts`, JWKS verification in `api/_lib/auth.ts`, and the Convex
auth config — the account-approval gate and `users` table are already
provider-agnostic.

## Interim options for enterprise SSO today

1. **Clerk with enterprise SSO** — Clerk federates to Entra ID, Okta, and SAML.
   Credentials are verified by your IdP; the directory still lives at Clerk.
2. **`AUTH_MODE=local`** — No SSO, but no third-party identity dependency.
3. **Wait for native OIDC** — bounded work, not in this release.

## Key files

| File | Role |
|---|---|
| `selfhost/server/src/localAuth.ts` | RSA key pair, JWT minting, issuer URLs |
| `selfhost/server/src/localAuthRoutes.ts` | Sign-in, sign-up, session, token exchange |
| `convex/auth.config.ts` | Which issuer Convex trusts (read at deploy time) |
| `convex/localAuthActions.ts` | Password verify/hash inside Convex |
| `api/_lib/auth.ts` | API bearer verification + approval gate |
| `src/auth/LocalAuthProvider.tsx` | SPA session + Convex token bridge |
