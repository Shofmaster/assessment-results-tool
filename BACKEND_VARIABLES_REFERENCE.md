# Backend & Config Variables Reference

This document lists **all** environment and config variables used by the app, where they are set, and what to do when you see backend errors.

---

## 1. Frontend (`.env.local` in project root)

Used by Vite at **build time** and when running `npm run dev`. Create `.env.local` in the project root (same folder as `package.json`).

| Variable | Required | Where it's used | What happens if missing |
|----------|----------|-----------------|--------------------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | `src/main.tsx` – Clerk auth | App shows "Setup required" and won't start; lists missing keys. |
| `VITE_CONVEX_URL` | Yes | `src/main.tsx` – Convex client | Same as above; app won't connect to Convex. |

**How to fix**

- Add to `.env.local`:
  ```env
  VITE_CLERK_PUBLISHABLE_KEY=pk_...
  VITE_CONVEX_URL=https://your-deployment.convex.cloud
  ```
- Get `VITE_CLERK_PUBLISHABLE_KEY`: [Clerk Dashboard](https://dashboard.clerk.com) → API Keys → Publishable key.
- Get `VITE_CONVEX_URL`: [Convex Dashboard](https://dashboard.convex.dev) or run `npx convex dev` and copy the URL.
- Restart the dev server after changing `.env.local`.

---

## 2. Convex backend (Convex env – **not** `.env.local`)

Used by **Convex server** (your backend). Set with:

```powershell
npx convex env set <NAME> <VALUE>
```

List current Convex env:

```powershell
npx convex env list
```

| Variable | Required | Where it's used | What happens if missing |
|----------|----------|-----------------|--------------------------|
| `CLERK_JWT_ISSUER_DOMAIN` | **Yes** | `convex/auth.config.ts` | **500 / FUNCTION_INVOCATION_FAILED** on Convex calls. Auth fails; error says "Missing env CLERK_JWT_ISSUER_DOMAIN". |
| `CLERK_JWT_AUDIENCE` | No (defaults to `convex`) | `convex/auth.config.ts` | Only set if your Clerk JWT template uses an audience other than `convex`. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Only for webhooks | `convex/http.ts` | Clerk user sync webhook returns 503 "Webhook signing secret not configured". Sign-in still works if Convex auth is set. |

**How to fix "A server error has occurred" / FUNCTION_INVOCATION_FAILED**

1. **Get the Clerk JWT Issuer URL**
   - [Clerk Dashboard](https://dashboard.clerk.com) → **Configure** → **JWT Templates**.
   - Open (or create) the template named **convex**.
   - Copy the **Issuer** value (e.g. `https://your-app.clerk.accounts.dev`) — **no trailing slash**.
   - Ensure **Audience** is `convex` (or set `CLERK_JWT_AUDIENCE` in Convex to match).

2. **Set it in Convex**
   ```powershell
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-actual-issuer.clerk.accounts.dev
   ```

3. **Confirm**
   ```powershell
   npx convex env list
   ```
   You should see `CLERK_JWT_ISSUER_DOMAIN=...`.

4. Restart the app and try again. No need to redeploy; Convex reads env at runtime.

**Optional: Clerk webhook (user sync)**

- Clerk Dashboard → **Webhooks** → Add endpoint: `https://your-deployment.convex.site/clerk-webhook`.
- Copy the **Signing secret**.
- Set in Convex:
  ```powershell
  npx convex env set CLERK_WEBHOOK_SIGNING_SECRET whsec_...
  ```

---

## 3. API server (Node/backend that serves `/api/*`)

Used by the **API routes** under `api/` (e.g. `api/claude.ts`, `api/chat.ts`, `api/lib/dispatch.ts`, `api/openai-models.ts`, `api/claude-models.ts`). These run in whatever host you use for the API (e.g. Vercel, Netlify, or a Node server). Set in that host’s **environment** (e.g. Vercel project env vars, or a `.env` file for local API dev).

| Variable | Required | Where it's used | What happens if missing |
|----------|----------|-----------------|--------------------------|
| `ANTHROPIC_API_KEY` | If you use Claude API | `api/claude.ts`, `api/claude-models.ts`, `api/lib/dispatch.ts` | 500 "Server is missing ANTHROPIC_API_KEY" when calling Claude. |
| `OPENAI_API_KEY` | If you use OpenAI | `api/openai-models.ts`, `api/lib/dispatch.ts` | 500 "Server is missing OPENAI_API_KEY" when listing/calling OpenAI models. |

**How to fix**

- **Claude:** Get an API key from [Anthropic](https://console.anthropic.com/). Set `ANTHROPIC_API_KEY` in your API server’s environment.
- **OpenAI:** Get an API key from [OpenAI](https://platform.openai.com/api-keys). Set `OPENAI_API_KEY` in your API server’s environment.
- If you use Vercel/Netlify, add these in the project’s Environment Variables.
- Do **not** put these in `.env.local` if that file is only used by Vite; the API runs in a different process and needs its own env.

**Local development with AI:** When you run `npm run dev`, only the Vite app runs — there is no `/api` backend, so AI calls will fail (404). To use AI locally, run **`npm run dev:full`** instead (uses `vercel dev` so the API routes run too). Put `ANTHROPIC_API_KEY` and optionally `OPENAI_API_KEY` in a **`.env`** file in the project root; `vercel dev` loads `.env` for the API. You can use `.env.local` for Vite-only vars; for the API, `.env` is used by Vercel dev.

---

## 4. Vercel (production / preview)

For **Vercel** deployments, set these in the project’s Environment Variables ([Vercel Dashboard](https://vercel.com) → Project → Settings → Environment Variables):

| Variable | Required | Environments | Notes |
|----------|----------|---------------|--------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Production, Preview, Development | Same as Section 1 (e.g. `pk_test_...` or `pk_live_...`). |
| `VITE_CONVEX_URL` | Yes | Production, Preview, Development | **Must be set for the environment that builds the app.** Use one URL for all: either `https://optimistic-shrimp-96.convex.cloud` (dev) or `https://warmhearted-hamster-274.convex.cloud` (prod). |
| `ANTHROPIC_API_KEY` | If using Claude | Production, Preview, Development | Section 3. |
| `OPENAI_API_KEY` | If using OpenAI (GPT) | Production, Preview, Development | Section 3. |

If `VITE_CONVEX_URL` is missing or wrong for Production, the production site may show a blank page or “Setup required”. Add it (and optionally for Preview and Development) then redeploy: `npx vercel --prod`. See [FIX_SERVER_ERROR_STEPS.md](FIX_SERVER_ERROR_STEPS.md#page-wont-load-on-vercel-production) for step-by-step commands.

---

## "Failed to load resource: 500" — find which request failed

1. Open **DevTools** (F12) → **Console** tab. When you use the app locally (`npm run dev`), any request that returns 500 is logged like: `[500] 500 Internal Server Error: https://.../api/chat`.
2. Or use **Network** tab → reproduce the issue → click the red (failed) request and check **Request URL**.

| If the failing URL is… | Likely cause | Action |
|------------------------|--------------|--------|
| Your Convex deployment (e.g. `*.convex.cloud` or `*.convex.site`) | Convex auth or function error | Set `CLERK_JWT_ISSUER_DOMAIN` in Convex (Section 2). Check [Convex Dashboard](https://dashboard.convex.dev) → Logs for the exact error. |
| `/api/chat` (e.g. `https://aviationassessment.vercel.app/api/chat`) | AI API key missing or provider/SDK error | **Vercel:** Project → Settings → Environment Variables. Add `ANTHROPIC_API_KEY` (for Claude) and/or `OPENAI_API_KEY` (for OpenAI). Enable for **Production**. Redeploy. See Section 3. If still 500, check Vercel → Deployments → your deployment → **Functions** or **Logs** for the real error. |
| `/api/claude-models` or `/api/openai-models` | Same as above | Set `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` on the server. |

---

## Quick checklist for backend errors

| Symptom | Likely cause | Action |
|--------|----------------|--------|
| "A server error has occurred" / FUNCTION_INVOCATION_FAILED when using the app | Convex auth: missing or wrong `CLERK_JWT_ISSUER_DOMAIN` | Set Convex env (Section 2). See [FIX_SERVER_ERROR_STEPS.md](FIX_SERVER_ERROR_STEPS.md). |
| "Setup required" or page won’t load on Vercel | Frontend: missing or wrong `VITE_CONVEX_URL` / `VITE_CLERK_PUBLISHABLE_KEY` in Vercel | Add in Vercel → Settings → Environment Variables for Production (and Preview/Development). Use `https://optimistic-shrimp-96.convex.cloud` or `https://warmhearted-hamster-274.convex.cloud`. Redeploy. See [FIX_SERVER_ERROR_STEPS.md](FIX_SERVER_ERROR_STEPS.md#page-wont-load-on-vercel-production). |
| "Setup required" with missing keys (local) | Frontend: missing `VITE_CLERK_PUBLISHABLE_KEY` or `VITE_CONVEX_URL` | Add to `.env.local` (Section 1), restart dev server. |
| 500 "Server is missing ANTHROPIC_API_KEY" | API server: `ANTHROPIC_API_KEY` not set | Set in API host env (Section 3). |
| 500 "Server is missing OPENAI_API_KEY" | API server: `OPENAI_API_KEY` not set | Set in API host env (Section 3). |
| 503 "AI (Claude/OpenAI) is not configured" or "API is not available" (404) | API key missing for selected provider, or local dev without API | Add the key in Vercel (or in `.env` for `npm run dev:full`). For local AI use `npm run dev:full`. |
| 503 "Webhook signing secret not configured" | Convex: `CLERK_WEBHOOK_SIGNING_SECRET` not set | Set in Convex if you use Clerk webhooks (Section 2). |

---

## Where each variable lives (summary)

| Variable | Set in | Command or file |
|----------|--------|------------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | `.env.local` (project root) | Edit file |
| `VITE_CONVEX_URL` | `.env.local` (project root) | Edit file |
| `CLERK_JWT_ISSUER_DOMAIN` | Convex | `npx convex env set CLERK_JWT_ISSUER_DOMAIN <url>` |
| `CLERK_JWT_AUDIENCE` | Convex | `npx convex env set CLERK_JWT_AUDIENCE convex` (optional) |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Convex | `npx convex env set CLERK_WEBHOOK_SIGNING_SECRET <secret>` (optional) |
| `ANTHROPIC_API_KEY` | API server environment | Vercel/Netlify env or server `.env` |
| `OPENAI_API_KEY` | API server environment | Vercel/Netlify env or server `.env` |

Running `npm run setup` helps with `.env.local` and prompts for `CLERK_JWT_ISSUER_DOMAIN`; it does not set API keys for the `/api/*` server.
