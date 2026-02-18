# Step-by-Step: Fix "A server error has occurred" (FUNCTION_INVOCATION_FAILED)

Follow these steps in order. The goal is to set the **Clerk JWT Issuer** in Convex so the backend can verify your login.

---

## Step 1: Open the Clerk Dashboard

1. Go to **[https://dashboard.clerk.com](https://dashboard.clerk.com)** and sign in.
2. Select your application (the one this aviation assessment app uses).

---

## Step 2: Find your JWT Issuer URL

1. In the Clerk sidebar, click **Configure** (or **Settings**).
2. Click **JWT Templates**.
3. Find the template named **convex** (or create one if it doesn’t exist):
   - If you see **convex**: click it.
   - If you don’t: click **New template** → choose **Convex** (or “Blank”) → name it `convex` and create it.
4. On the convex template page, find the **Issuer** field. It looks like:
   - `https://your-app-name.clerk.accounts.dev`
   - or `https://something-123.clerk.accounts.dev`
5. **Copy that full Issuer URL** (no trailing slash). You’ll use it in Step 4.
6. While you’re there, check **Audience**:
   - It should be set to **convex**.
   - If it’s empty or different, set it to `convex` and save.

---

## Step 3: Open a terminal in your project

1. Open PowerShell or your preferred terminal.
2. Go to your project folder:
   ```powershell
   cd "c:\Users\shelb\OneDrive\Documents\Aviation Quality Company\aviationassessment"
   ```
3. Make sure you’re in the same folder as `package.json` and the `convex` folder.

---

## Step 4: Set the Convex environment variable

1. Run this command, **replacing the URL with the Issuer you copied in Step 2**:
   ```powershell
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-actual-issuer.clerk.accounts.dev
   ```
   Example (yours will be different):
   ```powershell
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://aviation-quality.clerk.accounts.dev
   ```
2. If prompted, log in to Convex or choose the right team/deployment.
3. Wait until you see a success message (e.g. “Setting CLERK_JWT_ISSUER_DOMAIN…” and “Set successfully”).

---

## Step 5: (Optional) Set the JWT audience

Only if your Clerk template uses an audience other than `convex`:

```powershell
npx convex env set CLERK_JWT_AUDIENCE convex
```

If your template’s Audience is already `convex`, you can skip this.

---

## Step 6: Restart the app and test

1. If the dev server is running, stop it (Ctrl+C in the terminal).
2. Start it again:
   ```powershell
   npm run dev
   ```
3. In the browser, sign in and use the app. The “A server error has occurred” / FUNCTION_INVOCATION_FAILED should be gone when Convex calls run with a valid JWT.

---

## If you still see the error (or "sfo1::..." request ID)

1. **Use the request ID to see the exact error**
   - Go to **[Convex Dashboard](https://dashboard.convex.dev)** → your project → **Logs**.
   - Search for the request ID (e.g. `sfo1::xrvrr-1771446575918-03f5568f2d07`). The log will show the real error (e.g. "Missing env CLERK_JWT_ISSUER_DOMAIN").
2. **Set the env on the deployment that production uses**
   - Your **production site** (e.g. Vercel) uses the Convex URL in **Vercel** → Environment Variables → `VITE_CONVEX_URL` (e.g. `https://optimistic-shrimp-96.convex.cloud` or `https://warmhearted-hamster-274.convex.cloud`).
   - When you run `npx convex env set CLERK_JWT_ISSUER_DOMAIN ...`, Convex uses the deployment **linked to this folder**. If you have multiple deployments, run `npx convex dashboard` and ensure you're in the right project, then run the env set again.
3. **Confirm the variable is set**
   - Run: `npx convex env list`
   - You should see `CLERK_JWT_ISSUER_DOMAIN` in the list.

2. **Check Convex logs**
   - Go to **[https://dashboard.convex.dev](https://dashboard.convex.dev)**.
   - Open your project → **Logs**.
   - Search for the request ID from the error (e.g. `sfo1::nsngp-1771433412155-32987574ba92`).
   - The log will show the real error (e.g. “Missing env”, “Invalid token”, etc.).

3. **Double-check the Issuer**
   - No trailing slash: `https://xxx.clerk.accounts.dev` ✅ not `https://xxx.clerk.accounts.dev/`
   - Exactly what Clerk shows in JWT Templates → convex → Issuer.

4. **Confirm `.env.local` (for dev)**
   - In the project root you should have:
     - `VITE_CLERK_PUBLISHABLE_KEY=pk_...`
     - `VITE_CONVEX_URL=https://your-deployment.convex.cloud`
   - These are for the frontend; the Convex env var from Step 4 is for the backend.

---

---

## Page won’t load on Vercel (production)

If the production site shows a blank page or “Setup required” after changing Convex URL:

1. **VITE_CONVEX_URL must be set in Vercel** for the environment that builds the site (Production, and ideally Preview and Development too). If it’s missing or wrong, the app can’t connect and the page won’t load.

2. **Use one Convex URL consistently.** This project has two deployments:
   - **Dev:** `https://optimistic-shrimp-96.convex.cloud`
   - **Prod:** `https://warmhearted-hamster-274.convex.cloud`  
   Set **the same URL** in Vercel for Production (and Preview/Development) so the built app always has a valid URL.

3. **Fix steps (PowerShell):**
   ```powershell
   # Add VITE_CONVEX_URL for Production (paste when prompted)
   npx vercel env add VITE_CONVEX_URL production
   # Enter: https://optimistic-shrimp-96.convex.cloud

   # Also add for Preview and Development so all builds work
   npx vercel env add VITE_CONVEX_URL preview
   # Enter: https://optimistic-shrimp-96.convex.cloud
   npx vercel env add VITE_CONVEX_URL development
   # Enter: https://optimistic-shrimp-96.convex.cloud

   # Redeploy production
   npx vercel --prod
   ```
   To use the **prod** Convex deployment instead, use `https://warmhearted-hamster-274.convex.cloud` in the steps above. Both deployments have `CLERK_JWT_ISSUER_DOMAIN` set.

4. **Check all keys:** run `node scripts/check-all-keys.js` (or `npm run check:keys` if added) to verify local and Convex env. For Vercel, run `npx vercel env ls` and ensure `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY` appear for Production (and preferably Preview and Development).

---

## Quick reference

| What | Where |
|------|--------|
| Clerk Issuer URL | Clerk Dashboard → Configure → JWT Templates → convex → **Issuer** |
| Set Convex env | Terminal: `npx convex env set CLERK_JWT_ISSUER_DOMAIN <issuer-url>` |
| Convex logs | [dashboard.convex.dev](https://dashboard.convex.dev) → your project → Logs |
| Convex dev URL | `https://optimistic-shrimp-96.convex.cloud` |
| Convex prod URL | `https://warmhearted-hamster-274.convex.cloud` |
