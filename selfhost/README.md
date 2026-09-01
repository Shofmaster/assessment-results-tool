# AeroGap — Self-Hosted Deployment

Runs AeroGap entirely inside your own network. Your documents, maintenance
records, roster, and audit history live on infrastructure you control and never
transit our servers.

**One dependency leaves your network:** the AI provider API. What is sent, and
what is not, is documented precisely in [docs/DATA-FLOW.md](docs/DATA-FLOW.md) —
that document is written to be handed to a security reviewer.

---

## Is this the right deployment for you?

| | Hosted (SaaS) | Self-hosted (this) |
|---|---|---|
| Your documents and records | Our infrastructure | **Your infrastructure** |
| Identity / user directory | Clerk | Clerk, or **your own IdP** |
| Prompts + retrieved excerpts | Anthropic API | Anthropic API (unchanged) |
| Internal file servers as a manual source | Blocked by browser CORS, mixed-content, and Private Network Access rules | **Works** — see below |
| Error + usage telemetry | On | **Off** |
| Upgrades | Automatic | You choose when |
| Who operates it | We do | You do |

If your objection to SaaS is data custody, this addresses it. If it is that no
data whatsoever may leave the network, read
[docs/DATA-FLOW.md](docs/DATA-FLOW.md) first — the AI call is not removable, and
we would rather you learn that now than during a security review.

### The internal file-server capability

This is the one feature self-hosting *adds* rather than relocates.

In the hosted product, pointing AeroGap at a manual server on your LAN is
throttled by three browser rules you cannot always fix: CORS (your DMS must
whitelist our public domain), mixed content (an HTTPS app cannot fetch a
plain-HTTP internal server), and Private Network Access (browsers increasingly
block public origins from reaching private IP space).

Serving the app from inside your network removes all three at once. Set
`DOC_SERVER_UPSTREAM` and your manual server is reverse-proxied under the app's
own origin — same-origin HTTPS to the browser, with the plain-HTTP hop happening
server-side. No changes required on the file server itself.

---

## Requirements

- A Linux host with Docker Engine 24+ and the Compose plugin
- 4 vCPU / 8 GB RAM / 100 GB disk to start (disk grows with your document corpus)
- Three internal DNS names resolving to that host — app, Convex, and Convex-site
- A TLS certificate for those names (or accept Caddy's internal CA for a pilot)
- Outbound HTTPS to `api.anthropic.com` (and `api.voyageai.com` for search
  indexing), directly or through your egress proxy

---

## Install

```bash
git clone <repo> && cd aviationassessment/selfhost
```

```bash
cp .env.example .env
```

Fill in `.env`. It is commented inline; every required value says what breaks if
it is missing. Then validate before starting anything:

```bash
npm install && npm run doctor
```

`doctor` checks configuration, then probes Anthropic egress and the Convex
backend. It exits non-zero and prints an actionable fix for each problem. Run it
any time you change `.env`.

Bring the stack up:

```bash
docker compose up -d
```

Then bootstrap the backend — this generates the Convex admin key, deploys the
schema and functions, and sets the backend-side environment:

```bash
npm run bootstrap
```

Sign in to the app once so your user record is created, then promote yourself to
administrator using the command `bootstrap` prints. Every subsequent account is
approved in-app from **Admin → Pending Approvals**.

Finally, add your AI provider keys in **Settings → AI Keys**. They are not
collected by the installer and are not stored in `.env`: they live in the
database, so they can be scoped per company and rotated from the app without an
elevated shell on the server. On a single-organisation install, set them in the
**Deployment default** panel — that is the key everyone inherits.

Until a key is added, sign-in and the library work but every AI feature reports
that no key is configured.

See [docs/ai-credentials.md](../docs/ai-credentials.md) for how key resolution,
rotation timing, and the fallback to a deployment-wide key work.

---

## Operating

```bash
docker compose ps
```

```bash
docker compose logs -f app
```

The app logs a posture banner at startup — origin, auth mode, whether telemetry
is on, whether the doc-server proxy is active. Screenshot it for your change
record; it is the fastest way to confirm what an install is actually doing.

**The data you must back up** is the `postgres-data` volume plus
`CONVEX_INSTANCE_SECRET` and `CONVEX_SELF_HOSTED_ADMIN_KEY` from `.env`. The
volume without the secret is not recoverable.

---

## Layout

| Path | What it is |
|---|---|
| `.env.example` | Configuration contract. Every knob, documented inline. |
| `docker-compose.yml` | The stack: Postgres, Convex, app, Caddy. |
| `Dockerfile` | Builds the SPA and the application server. Context is the repo root. |
| `server/src/index.ts` | Express host that mounts the same `api/` handlers the hosted product runs. |
| `server/src/config.ts` | Boot-time validation. Fails closed with an operator-readable checklist. |
| `server/src/docServerProxy.ts` | Authenticated, path-pinned reverse proxy to an internal manual server. |
| `scripts/doctor.mjs` | Preflight validator. Node stdlib only — runs before `npm install`. |
| `scripts/bootstrap.mjs` | First-boot: admin key, function deploy, backend env. |
| `proxy/Caddyfile` | TLS termination and routing for the three hostnames. |

The `api/` request handlers are **not forked** for on-prem. They are imported
from the repo as-is, so hosted and self-hosted run identical request logic and a
fix to one is a fix to both.

---

## Documentation

- [docs/DATA-FLOW.md](docs/DATA-FLOW.md) — what leaves the network, what does
  not. Written for your security reviewer.
- [docs/AUTH.md](docs/AUTH.md) — Clerk vs. your own IdP, and why the choice
  matters more than it looks.

---

## Status

**Desktop path:** first-run deploy, local authentication, and BYOK AI credentials
are implemented and covered by automated tests (348 selfhost + related root
tests). A clean-machine installer smoke test should verify: install completes,
first user becomes admin, an AI key can be saved in Settings, and one Ask query
succeeds.

**Docker/server path:** the application server boots, fails closed on incomplete
config, serves the SPA and `api/` routes, and applies the correct CORS posture.
Run `npm run doctor` before `docker compose up -d`, then `npm run bootstrap`.
Full stack validation against a live Convex backend on Linux is still the
operator's responsibility before customer deployment.
