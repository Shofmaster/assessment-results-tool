# Data Flow — AeroGap Self-Hosted

**Audience:** the security reviewer, privacy officer, or IT architect assessing
this deployment. This document states plainly what data stays inside your
network, what leaves it, and where the boundary is.

It is written to be verifiable. Every claim about outbound traffic can be
confirmed by inspecting egress from the `app` container, and the code paths are
named so you can read them yourself.

---

## 1. Trust boundary

```
  YOUR NETWORK                                          │  EXTERNAL
                                                        │
  ┌─────────────┐   HTTPS    ┌──────────────────┐       │
  │  End users  │ ─────────▶ │  Caddy (proxy)   │       │
  │  (browsers) │            └────────┬─────────┘       │
  └─────────────┘                     │                 │
                              ┌───────┴────────┐        │
                              │  app container │ ───────┼──▶  Anthropic API
                              │  SPA + api/    │        │     (prompts + excerpts)
                              └───────┬────────┘        │
                                      │            ─────┼──▶  Voyage AI
                        ┌─────────────┼──────────┐      │     (text to embed)
                        │             │          │      │
                  ┌─────▼─────┐  ┌────▼─────┐  ┌─▼────┐ │
                  │  Convex   │  │ Postgres │  │ your │ │
                  │  backend  │──│  volume  │  │ file │ │
                  └───────────┘  └──────────┘  │server│ │
                                               └──────┘ │
                   ▲                                    │
                   └── all customer records live here ──┘
                                                        │
                              (Clerk, only if AUTH_MODE=clerk)
                                      ─────────────────┼──▶  Clerk
                                                        │     (identity only)

                              (local auth, if AUTH_MODE=local)
                                      └── stays on this install — no outbound
                                          identity traffic
```

Everything left of the line runs on hardware you control. Optional license
check-in occurs only when `AEROGAP_ENTITLEMENT_URL` is configured. No product
telemetry is collected.

---

## 2. What stays inside your network — always

| Data | Where it lives |
|---|---|
| Uploaded documents and manuals (full text and binaries) | `postgres-data` volume |
| Document chunks and embedding vectors | `postgres-data` volume |
| Aircraft, fleet, components, modifications, logbook entries | `postgres-data` volume |
| Assessments, analyses, audit simulations, compliance findings | `postgres-data` volume |
| Roster, org chart, personnel records | `postgres-data` volume |
| Checklists, evidence, comments, revision history | `postgres-data` volume |
| Files referenced from an internal file server | Never copied; streamed on demand |
| Application and access logs | `docker compose logs` on your host |
| **Your AI provider API keys** | `postgres-data` volume, `aiCredentials` table |

**We cannot read any of it.** There is no vendor access path into a self-hosted
install — no remote support tunnel, no callback, no shared credential.

**A note on the API keys.** They are entered in the app (Settings → AI Keys) and
stored in your database rather than in a file on the server, so they can be
scoped per company and rotated without an elevated shell. They are encrypted at
rest when `AI_CREDENTIAL_ENCRYPTION_KEY` is set on the Convex deployment (the
installer or desktop supervisor generates one automatically). Only the last
four characters are returned to a browser for display.
Treat a database backup as containing live provider credentials. See
[ai-credentials.md](../../docs/ai-credentials.md).

---

## 3. What leaves your network

### 3.1 Anthropic API — required

**Endpoint:** `https://api.anthropic.com`
**Triggered by:** a user running an analysis, audit simulation, Ask-an-Expert
query, AD/SB check, or document OCR. Never on a schedule of ours.

**Sent:**
- The instruction prompt for the feature being used
- The user's question or the assessment text being analyzed
- Retrieved excerpts from your documents — the specific passages selected as
  relevant to that request, not whole documents
- For scanned-PDF OCR only: page images of the document being processed

**Not sent:** your document corpus in bulk, your database, your roster, user
email addresses, or any identifier tying a request to a named person.

**Retention and training:** Anthropic's commercial terms state that API inputs
and outputs are not used to train models. Confirm the current terms and request
a DPA directly from Anthropic as part of your review — we cannot make binding
representations about a third party's policy, and you should not accept ours.

**If this is unacceptable:** set `AI_HTTPS_PROXY` to route the traffic through
your own inspection proxy, or contact us about pointing the deployment at an
Anthropic model hosted in your own cloud tenancy (AWS Bedrock or GCP Vertex),
which keeps the inference inside your commercial boundary.

> **Proxy requirement:** outbound vendor traffic is tunnelled with `CONNECT`,
> so your proxy must permit `CONNECT` to `api.anthropic.com:443` and
> `api.voyageai.com:443`. A proxy that allows ordinary HTTP but denies `CONNECT`
> causes requests to hang rather than fail cleanly. Note this also means the
> proxy sees the destination host but not request contents unless it performs
> TLS interception.

### 3.2 Voyage AI — required for document search

**Endpoint:** `https://api.voyageai.com`
**Sent:** document text chunks, at indexing time, to produce embedding vectors.
Note this is broader than the Anthropic path: indexing submits the text of
documents you index, not just excerpts.
**Alternative:** set `EMBEDDING_PROVIDER=openai` to use OpenAI instead. Both are
external. If neither is acceptable, semantic search must be left disabled —
keyword search continues to work.

### 3.3 Clerk — only if `AUTH_MODE=clerk`

**Endpoint:** `https://*.clerk.accounts.dev` or your Clerk domain
**Sent:** sign-in credentials, session tokens, user email addresses.
**Consequence:** your user directory lives at Clerk, not on your network.

If you are self-hosting specifically so that personal data stays in your
control, this partially defeats that. Set `AUTH_MODE=oidc` to authenticate
against your own Entra ID, Okta, Keycloak, or ADFS instead, and no identity data
leaves the network. See [AUTH.md](AUTH.md).

### 3.4 Optional, off by default

| Service | Sent | Enabled by |
|---|---|---|
| Sentry | Error reports, stack traces | `VITE_SENTRY_DSN` |
| PostHog | Product usage analytics | `VITE_POSTHOG_KEY` |
| Google Drive | OAuth tokens; file reads if users link Drive folders | `VITE_GOOGLE_CLIENT_ID` |
| Stripe | Billing data | `STRIPE_SECRET_KEY` |
| Resend / SMTP | Notification email content and recipients | `SMTP_HOST` |

All blank in `.env.example`. A default install sends **nothing** to any of them.
`npm run doctor` warns if telemetry is enabled, and the app prints its telemetry
posture in the startup banner so you can verify rather than trust.

---

## 4. Firewall allowlist

Minimum egress for a working install:

```
api.anthropic.com:443      AI inference (required)
api.voyageai.com:443       embeddings (required for semantic search)
```

Add only if you enabled them:

```
*.clerk.accounts.dev:443   AUTH_MODE=clerk
<your-idp>:443             AUTH_MODE=oidc
*.googleapis.com:443       Google Drive document linking
api.stripe.com:443         billing
```

No inbound connections from the internet are required. The stack can sit
entirely behind your perimeter.

---

## 5. Verifying these claims

You do not have to take this document's word for any of it.

1. **Watch egress.** Run the stack with an egress allowlist of only the two
   required endpoints. Everything except the optional features above continues
   to work.
2. **Read the choke point.** All AI traffic passes through `api/claude.ts` and
   `api/chat.ts`. There is no other outbound AI call path in the application.
3. **Read the boundary code.** `selfhost/server/src/docServerProxy.ts` is the
   only component that reaches into your internal network; it is authenticated,
   read-only, and pinned to the single configured host.
4. **Check the banner.** `docker compose logs app | head -20` reports the live
   posture at startup — auth mode, telemetry state, doc-proxy state.

---

## 6. What this deployment does *not* address

Stated plainly, because these come up in review and packaging does not solve
them:

- **FAA recordkeeping.** Records of record under 14 CFR 91.417, 43.9, and
  145.219 remain the certificate holder's responsibility. Self-hosting changes
  where a copy sits; it does not make this system your system of record.
- **Approval authority.** AeroGap produces advisory analysis. It does not make
  airworthiness determinations or compliance findings, and output must be
  reviewed by qualified personnel.
- **AI accuracy.** Regulatory citations produced by a language model can be
  wrong. Verify against the source before relying on any citation.

---

*Questions this document does not answer should go to your account contact
before deployment, not after.*
