# Authentication

## Modes

| Mode | Status | Who issues tokens | When to use |
|---|---|---|---|
| `clerk` | **Implemented** | Clerk | Server installs with a real hostname; simplest if outbound identity is acceptable |
| `local` | **Implemented** | This install (`/local-auth`) | Desktop installs, air-gapped sites, or any install where identity must not leave the network |
| `both` | **Implemented** | This install *and* Clerk | Desktop installs built with Clerk values: local accounts plus "Sign in with your AeroGap online account" |
| `oidc` | **Not implemented** | Your IdP (Entra, Okta, Keycloak) | Future — server refuses to start if you set this today |

## Desktop installs (`DEPLOYMENT_MODE=desktop`)

Desktop installs **always have local accounts**. They work with no internet and
identity stays on the machine. Local flow:

1. User signs in at `/local-auth/sign-in` on the app server
2. Server sets an httpOnly session cookie and mints a short-lived Convex JWT
3. Convex validates that JWT against the JWKS published on the same origin
4. First user on a fresh install is auto-approved as administrator

No manual bootstrap commands.

### Signing in with a hosted AeroGap account (`AUTH_MODE=both`)

A desktop build that carries the three **public** Clerk values
(`CLERK_JWT_ISSUER_DOMAIN`, `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_JWT_KEY` in
`build-config.json`) runs as `AUTH_MODE=both`: the local sign-in screen gains a
**Sign in with your AeroGap online account** button. The shell, the app server
and first-run setup all take that decision from `selfhost/desktop/desktopAuth.cjs`,
so the server and Convex cannot disagree about which issuers are trusted.

What it is and is not:

- The **hosted account is the default sign-in** on such a build; local accounts
  remain for sites without one. The page runs one provider at a time. A
  standing choice is stored in the browser profile (`localStorage` key
  `aerogap.authProvider`) and switching reloads; the order of precedence is in
  `src/auth/providerChoice.ts`.
- **The same identity works offline.** Signing in with the hosted account needs
  internet the first time. Once Clerk has answered, the page posts the Clerk
  token to `POST /local-auth/hosted-session`; the app server verifies it offline
  against the baked public key (`CLERK_JWT_KEY`, `selfhost/server/src/hostedIdentity.ts`)
  and sets the same 30-day local session cookie a local account would get, with
  the Clerk `user_...` subject. From then on, when the computer is offline at
  launch or the connection drops mid-session, the page switches to the local
  provider **for this launch only** (`sessionStorage` key
  `aerogap.authProvider.session`) and continues as the same user, with a
  "Working offline" notice. Back online, the next launch is Clerk again. A
  hosted account that has never signed in here while online cannot sign in
  offline; the sign-in screen says so and offers local accounts.
- **Data follows the login** on a build that also carries `HOSTED_CONVEX_URL`
  (`-HostedConvexUrl` at build time): the companies and projects of the hosted
  account are **mirrored** to the local database while online. See the next
  section. Without it, the login is shared but the database is not; use
  bundles (below) to move work.
- The first account of either kind on a fresh database becomes administrator
  (`convex/users.ts` treats `both` as self-hosted).
- **Opt out:** add `AUTH_MODE=local` to `%LOCALAPPDATA%\AeroGap\config\.env`.
  First-run setup notices the change and re-pushes the Convex environment.
- The Clerk secret key is never shipped. Token verification at the API tier
  uses the public JWT key; see `selfhost/scripts/clerk-jwks-to-pem.mjs`.

Clerk-side prerequisite (done once per instance, requires the secret key):
the desktop origin must be in the instance's `allowed_origins`, otherwise the
Frontend API answers `400 Production Keys are only allowed for domain ...`.

```
curl -X PATCH https://api.clerk.com/v1/instance \
  -H "Authorization: Bearer sk_live_..." -H "Content-Type: application/json" \
  -d '{"allowed_origins":["http://127.0.0.1:19080"]}'
```

This is why the desktop app port is pinned to 19080 rather than chosen at
launch. The Electron shell also strips its `Electron/` user-agent token (Google
refuses OAuth in an embedded browser otherwise) and lets the window follow the
Clerk → Google → Clerk → app redirect chain instead of bouncing it to the
system browser.

### Mirroring the hosted account (`HOSTED_CONVEX_URL`)

The desktop product is the local workspace; the hosted account reaches it
through sign-in (above) and this one-way copy. A build made with
`-HostedConvexUrl https://<deployment>.convex.cloud` (the hosted SPA's
`VITE_CONVEX_URL`, public) mirrors **while signed in with the hosted account
and online**:

- shortly after sign-in, every 15 minutes while the window is open, when the
  browser comes back online, and on **Settings → Workspace → Sync now**;
- the account's companies (profile, certificates, ratings, roster, audit
  settings) and every project the account can open (assessments, documents
  metadata, analyses, simulations, findings) — the same content as the
  organisation and project bundles, and nothing more. Manuals, logbooks, fleet,
  checklists, uploaded files and search indexes are **not** mirrored; rebuild
  or link those locally.

How: the page opens a second Convex client at `HOSTED_CONVEX_URL` with the same
Clerk token (both deployments trust the same issuer), reads
`mirror.listMirrorable` / `exportCompany` / `exportProject` there, and applies
each bundle to the local deployment with `mirror.applyCompany` /
`mirror.applyProject` (`convex/mirror.ts`, client in
`src/services/hostedMirror.ts`). Mirrored rows carry
`mirror: { origin, originId, contentHash, syncedAt }`; a bundle whose content
hash has not changed is skipped, so an unchanged account costs one read per
item. The apply is replace-style: the hosted copy wins, and local edits to a
mirrored company or project are overwritten on the next sync. Personal projects
without a company mirror as personal projects of the same user. The apply
mutations refuse to run on the hosted deployment itself.

The Clerk token also has to be accepted by the **hosted** deployment, which is
the same requirement as signing in on the website; nothing extra to configure.
A build without `-HostedConvexUrl` shares the login only (Settings says so).

### Online and offline workspaces (`HOSTED_APP_URL`)

A desktop build made with `-HostedAppUrl https://www.aerogaptechnologies.com` has
two **workspaces**, chosen from the shell's Workspace menu:

| Workspace | What the window shows | Data lives | Needs internet |
|---|---|---|---|
| **Offline** (default) | The local stack (everything above), with the hosted account mirrored in | This computer | No |
| **Online** | The hosted application itself, loaded from `HOSTED_APP_URL` | Hosted deployment | Yes |

AeroGap **starts offline** — the desktop *is* the local workspace. The online
workspace shows the website itself, live, for the things that only exist there
(billing, for instance); nothing local runs while it is open, and the local
backend is started only when the offline workspace is.

Convex has no offline store, so the online workspace cannot be read without a
connection. Choosing *Start online when available* (Workspace menu; stored in
`%LOCALAPPDATA%\AeroGap\config\workspace.json`) makes the shell probe
`HOSTED_APP_URL` at launch: reachable → online; not reachable → a dialog offers
*Work offline / Retry / Quit*. It never falls back silently, and if the
connection drops mid-session in the online workspace the same dialog appears.
Rules and reasoning: `selfhost/desktop/desktopWorkspace.cjs`.

- **Opt out of the online workspace** (a site that must not reach out): add
  `HOSTED_APP_URL=` (empty) to `%LOCALAPPDATA%\AeroGap\config\.env`. A
  non-empty value there points the online workspace at a different hosted
  tenant. Only `https://` is accepted.
- A build without `-HostedAppUrl` behaves exactly as before: offline only, and
  no Workspace menu.

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

## Moving project work between installations

Hosted AeroGap and desktop AeroGap use **separate accounts and databases**.
They do not sync automatically. To move audit project work:

1. On the source installation, open **Settings → Company projects** (or
   **Settings → Move project work**) and click **Export bundle** on a project.
2. Copy the downloaded `.aqp.json` file to the other machine (USB, email to
   yourself, shared drive — your choice).
3. On the destination installation, click **Import bundle** and select the file.

**Included:** assessments, uploaded documents, analyses, audit simulations,
revision tracking, agent knowledge docs, and findings.

**Excluded by design:** manuals, logbooks, fleet, roster, checklists, and
company-wide libraries — so copyrighted or operational data stays where it belongs.

Accounts are not migrated; import creates a new project under whoever is signed
in on the destination machine.

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
| `convex/auth.config.ts` | Which issuer(s) Convex trusts (read at deploy time) |
| `selfhost/desktop/desktopAuth.cjs` | Desktop: local-only or local+hosted, from build-config.json and the user's .env |
| `src/auth/providerChoice.ts` | SPA: which provider this page runs; `isSelfHosted`; switching (standing or this-launch) |
| `selfhost/server/src/hostedIdentity.ts` | Offline verification of a Clerk token against the baked public key |
| `src/auth/hostedSession.ts` | SPA: exchanges the Clerk token for the local session cookie (`/local-auth/hosted-session`) |
| `convex/mirror.ts` | Hosted side: what an account may mirror + bundle export; local side: replace-style apply |
| `src/services/hostedMirror.ts`, `src/components/HostedMirrorRunner.tsx` | SPA: runs the hosted → desktop mirror on a schedule; status in Settings → Workspace |
| `convex/localAuthActions.ts` | Password verify/hash inside Convex |
| `api/_lib/auth.ts` | API bearer verification + approval gate |
| `src/auth/LocalAuthProvider.tsx` | SPA session + Convex token bridge |
