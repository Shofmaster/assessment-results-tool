# How AI Works in This App

Short version so you know what to fix when “AI doesn’t work.”

---

## The path (3 steps)

1. **You use the app**  
   You run analysis, paperwork review, guided audit, document comparison, etc.

2. **The app calls your own API**  
   The frontend sends a request to **`/api/chat`** on the **same site** (e.g. `https://aviationassessment.vercel.app/api/chat`).  
   That request is handled by **Vercel** (your host), not by Convex.

3. **That API talks to Claude or OpenAI**  
   The code in the `api/` folder (e.g. `api/chat.ts`) runs on Vercel. It uses **ANTHROPIC_API_KEY** for Claude and **OPENAI_API_KEY** for OpenAI. If those aren’t set in Vercel, the request fails (500 or 503).

So:

- **Convex** = your database + auth. When that’s broken you see “A server error has occurred” / FUNCTION_INVOCATION_FAILED. Fix: set `CLERK_JWT_ISSUER_DOMAIN` in Convex (see FIX_SERVER_ERROR_STEPS.md).
- **AI** = everything above. When that’s broken you get errors on actions that use AI. Fix: set the API keys in **Vercel**, not in Convex.

---

## Quick check: is the AI API configured?

Open this in your browser (use your real URL):

- **Production:** `https://aviationassessment.vercel.app/api/ai-status`

You’ll see something like:

- `"anthropic": "set"` or `"missing"`
- `"openai": "set"` or `"missing"`
- A short **hint** telling you what to do if something is missing.

If either key is **missing**, add it in **Vercel**:

1. [Vercel Dashboard](https://vercel.com) → your **aviationassessment** project.
2. **Settings** → **Environment Variables**.
3. Add **ANTHROPIC_API_KEY** (value = your Anthropic API key), enable for **Production** (and Preview if you use it).
4. If you use OpenAI in the app, add **OPENAI_API_KEY** the same way.
5. **Redeploy** (Deployments → Redeploy, or push a new commit).

---

## Summary

| Thing that’s broken | Where it runs | What to set |
|--------------------|---------------|-------------|
| “A server error has occurred” / FUNCTION_INVOCATION_FAILED | Convex | Convex: `CLERK_JWT_ISSUER_DOMAIN` (see FIX_SERVER_ERROR_STEPS.md) |
| AI actions fail (500, “Chat request failed”, etc.) | Vercel (`/api/chat`) | Vercel: `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY` |

Check **`/api/ai-status`** anytime to see if the AI keys are set on the server.
