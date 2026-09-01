# AI provider credentials (BYOK)

## Overview

Each customer company supplies its own Anthropic (and embedding) API key once,
in the app. Every member of that company inherits it, and the customer bills
their own provider account.

**Why not a key per user?** Because that is not a thing that exists. From
Anthropic's Admin API documentation: *"Can I create new API keys through the
Admin API? No. You create API keys in the Claude Console."* And: *"API keys
belong to the organization, not to individual users."* No architecture can mint
one key per signup, so the smallest workable unit is the company — which is also
the unit that has a billing relationship.

Keys live in the Convex `aiCredentials` table, never in a browser and (on
self-hosted installs) no longer in the machine's `.env`.

## Resolution order

For every AI request, in order:

1. **Company row** — the company that owns the project being worked in; failing
   that, the user's active company; failing that, their sole company if they
   belong to exactly one.
2. **Install row** — the deployment-wide default. On a single-organisation
   self-host this is usually the only row that exists.
3. **The calling runtime's environment variable** — `ANTHROPIC_API_KEY`,
   `VOYAGE_API_KEY`, `OPENAI_API_KEY`.
4. Otherwise a typed failure telling the user to add a key in Settings.

Two properties worth knowing:

- **A user in two or more companies, with no project context, resolves to
  nothing** rather than guessing. Guessing would bill an arbitrary tenant.
- **The winner is final.** If you are working in company A's project and A has no
  key, the request falls through to the install/env key — it does *not* try your
  other company's key. Billing B for A's work would be worse than falling back.

The environment rung is permanent, not a migration shim. A deployment with no
rows behaves exactly as it did before this feature existed.

## Setup — cloud (Vercel + Convex Cloud)

One shared secret lets the serverless functions ask Convex which key to use.
Generate it:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Set the **same value** in both places:

```bash
npx convex env set AI_CREDENTIAL_SERVICE_TOKEN <value> --prod
```

and in Vercel → Project → Settings → Environment Variables, alongside:

```
AI_CREDENTIAL_SERVICE_TOKEN=<same value>
CONVEX_SITE_URL=https://<deployment>.convex.site
```

> **Set these before deploying the code.** The lookup fails closed: without the
> token, AI requests return 503 rather than quietly falling back to the platform
> key and billing you for every tenant's usage. Deploying first means an outage.

Then a company admin opens **Settings → AI Keys** and pastes their key.

## Setup — self-hosted

`install.ps1` generates `AI_CREDENTIAL_SERVICE_TOKEN` into the ProgramData
`.env` before the services start, and `bootstrap.mjs` pushes the same value into
the Convex backend. Nothing to do by hand.

The installer does **not** ask for AI provider keys. After installing:

1. `node "%ProgramFiles%\AeroGap\bootstrap.mjs"`
2. Sign in, then promote yourself out of band with the `promoteToAdmin` command
   `bootstrap` prints.
3. Open **Settings → AI Keys** and fill in the **Deployment default** panel.

On a single-organisation install, prefer the deployment default over a company
row: it is scope-independent and survives any later company restructuring.

Until a key is added, sign-in and the library work; AI features report that no
key is configured.

### The two port families

`CONVEX_SITE_INTERNAL_URL` must point at the Convex backend's **loopback** port,
not the public one:

| | public (Caddy, TLS, bound to APP_DOMAIN) | internal (backend binds loopback) |
|---|---|---|
| app | 443 | 18080 |
| convex | 3210 | 13210 |
| convex HTTP actions | 3211 | **13211** |

Pointing at a public port from the same machine means trusting an internal CA
for no benefit, and historically produced a 503 that looked exactly like a bad
API key. `selfhost/__tests__/installerConfig.test.ts` pins this.

## Rotation

Replace the key in **Settings → AI Keys** and save. Changes take effect within
about a minute:

- Resolved keys are cached in-process for 60 seconds (15 seconds for "no key
  configured", so a first key takes effect quickly).
- If a provider rejects a key with 401/403, the cached copy is dropped and the
  request is retried **once**. A revoked key therefore self-heals on the next
  attempt rather than failing for the whole cache window.
- Self-hosted installs run one long-lived process with no natural recycling, so
  that 60-second TTL is the only bound. Do not raise it.

`selfhost/windows/set-config.ps1` can still edit the `.env`, but it cannot reach
Convex — setting `ANTHROPIC_API_KEY` there changes only the deployment-wide
*fallback*.

## Security properties

- The stored key is **never returned by any public Convex function**. Reads go
  through `aiCredentials._resolveCredential` (an `internalQuery`) or the
  service-token-gated HTTP route in `convex/http.ts`.
- The only fragment that reaches a browser is the last four characters, for the
  `••••1234` display.
- The credential route requires **both** the service token *and* the caller's
  Clerk identity. `identity.subject` is authoritative and any userId in the
  request body is ignored, so a leaked service token alone cannot mint a key for
  an arbitrary tenant — it can only act as a user who already had a session.
- The `X-AeroGap-Project-Id` header is a **hint**. Convex re-authorizes it
  against live memberships and silently drops it if the caller has no access, so
  a forged or stale value degrades rather than leaking.
- Two regression guards exist because this class of bug has shipped here before:
  `aiCredentialPublicSurface.test.ts` asserts no public function returns
  `apiKey` and that the table is queried from exactly one module.

**Not encrypted at rest.** Keys are stored as plaintext in Convex, the same as
`googleDriveTokens`. App-layer encryption would need its key in a Convex
environment variable — the same place, behind the same credential, as the data
it protects — so it buys protection against a table-only leak (an accidentally
public query, a backup snapshot, a log line) and not much else. The write path
is already an action and `_resolveCredential` returns a sealed record, so
`convex/lib/aiCredentialCrypto.ts` can be filled in later without touching a
single call site. On a self-hosted install the database is on the customer's own
disk; on cloud, this is AeroGap holding customer keys, and customers should be
told so.

## Troubleshooting

| Symptom | Cause |
|---|---|
| *"AI credential lookup is not configured: AI_CREDENTIAL_SERVICE_TOKEN is not set"* | The token is missing in the api/ runtime. Deliberately does **not** fall back to the env key. |
| *"AI credential lookup is not configured: no Convex site URL"* | Set `CONVEX_SITE_URL` (cloud) or `CONVEX_SITE_INTERNAL_URL` (self-host). |
| 503 on every AI request, self-host | Usually the loopback-vs-public port confusion above. Check `CONVEX_URL` and `CONVEX_SITE_INTERNAL_URL` in `%ProgramData%\AeroGap\config\.env`. |
| *"No anthropic API key is configured"* | No row at any scope and no env fallback. Add one in Settings → AI Keys. |
| *"Your Anthropic key was rejected"* | Surfaced only after the automatic retry, so the key really is bad or revoked. |
| `INDEXING_UNAVAILABLE` | No embedding key resolves. Same fix, same screen. |
| Service refuses to start after upgrade | `requireConfig()` now requires `AI_CREDENTIAL_SERVICE_TOKEN`. Re-run `install.ps1`, which generates one. |

## Deliberate limits

- **Provider and model are deployment-wide; only the key is per-company.**
  `EMBEDDING_DIMENSIONS` is baked into the vector index, so letting companies
  pick their own embedding provider would mix different embedding spaces in one
  index — cosine similarity would silently return nonsense with no error.
- **Cross-tenant work stays on the deployment key.**
  `auditIntelligenceActions` synthesises findings from every customer into a
  shared document; billing one customer for that would be a cost-allocation bug.
- **DCT batch runs pin their company.** A Message Batch can only be retrieved or
  cancelled with the account key that created it, so `dctTraceabilityRuns`
  records `credentialCompanyId` at submit time and later steps resolve from that
  rather than re-deriving it.
- `deploymentFallbackConfigured` in the status query reflects the **Convex**
  environment only. In cloud the api/ tier is configured separately, so it can
  report a fallback that `/api/claude` does not have.
