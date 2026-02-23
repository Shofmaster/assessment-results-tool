# Convex Deploy Walkthrough

This guide walks you through getting Convex linked and deploying your backend (including the latest schema and functions like `entityIssues`).

---

## Part 1: First-time setup (link project + dev)

You only need this once per machine (or if you cloned the repo on a new machine / cleared Convex config).

### 1.1 Open the project in a terminal

```bash
cd "c:\Users\shelb\OneDrive\Documents\Aviation Quality Company\aviationassessment"
```

(Or your actual project path.)

### 1.2 Log in to Convex (if needed)

```bash
npx convex login
```

- If you’re already logged in, it will say so.
- If not, it opens a browser to log in with your Convex account.

### 1.3 Link this repo to a Convex project

**Option A – You already have a Convex project (e.g. production)**

1. Go to [Convex Dashboard](https://dashboard.convex.dev) and open the **project** your production app uses.
2. In the project, go to **Settings** and copy the **Deployment URL** (e.g. `https://happy-animal-123.convex.cloud`) or the **deployment name**.
3. In the project root, create or edit `.env.local` and set:
   - For **development**, Convex will set this when you run `convex dev` (see below).  
   - To point at an **existing** deployment (e.g. prod) for local dev, set:
     ```bash
     VITE_CONVEX_URL=https://your-existing-deployment.convex.cloud
     ```
     (Use the URL from the dashboard. Don’t set `CONVEX_DEPLOYMENT` manually for this; let `convex dev` manage it if you want a dev deployment.)

**Option B – Let Convex create/link a project**

1. In the project root, run:
   ```bash
   npx convex dev
   ```
2. If this is the first time:
   - You’ll be asked to log in (if not already).
   - You can **create a new Convex project** or **choose an existing one**.
3. When it finishes, it will:
   - Create or update `.env.local` with `CONVEX_DEPLOYMENT=<your-dev-deployment-name>`.
   - Push your `convex/` code to that **development** deployment.
   - Regenerate `convex/_generated/` (types and API).
4. Leave `npx convex dev` running so it keeps syncing as you change `convex/` files, or stop it and run again whenever you change the backend.

After this, **Part 2** is what you use to push that same code to **production**.

---

## Part 2: Deploy to production (`npx convex deploy`)

Deploying pushes your local `convex/` code (functions, schema, indexes) to the **production** deployment of the same Convex **project** that your dev deployment belongs to.

### 2.1 Make sure the project is linked

You must have run `npx convex dev` at least once so that:

- `.env.local` exists and contains `CONVEX_DEPLOYMENT=<dev-deployment-name>`.

If `.env.local` doesn’t have `CONVEX_DEPLOYMENT`, run `npx convex dev` again and complete the link (Part 1).

### 2.2 Deploy from your machine

In the project root:

```bash
npx convex deploy
```

- The CLI uses `CONVEX_DEPLOYMENT` from `.env.local` to know which **project** you’re in; it then pushes to that project’s **production** deployment.
- It will:
  - Push functions, schema, and indexes to production.
  - Regenerate `convex/_generated/` (so your types stay in sync).
  - Typecheck Convex code.

If it succeeds, your production Convex backend is updated. Your frontend (e.g. on Vercel) must use the **production** Convex URL (see 2.4).

### 2.3 If `npx convex deploy` fails

**“No CONVEX_DEPLOYMENT set” / “not linked”**

- Run `npx convex dev` once and complete the link (Part 1). Then run `npx convex deploy` again.

**“Not logged in” / auth errors**

- Run:
  ```bash
  npx convex login
  ```
  Then run `npx convex deploy` again.

**Network / timeout errors**

- Check internet; try again. If you’re behind a strict firewall, you may need to allow Convex’s endpoints.

**Type or build errors**

- Fix the reported errors in your `convex/` files (and any generated types they depend on), then run `npx convex deploy` again.

### 2.4 Point your production frontend at production Convex

Your **production** app (e.g. Vercel) must use the **production** Convex URL:

1. In [Convex Dashboard](https://dashboard.convex.dev), open the **same project**.
2. In the dashboard, switch to the **Production** deployment (not the dev one).
3. Copy the deployment URL (e.g. `https://your-prod-name.convex.cloud`).
4. In your host (e.g. Vercel) set the env var:
   - **Name:** `VITE_CONVEX_URL`
   - **Value:** that production URL (for Production and optionally Preview).
5. Redeploy the frontend so it picks up the env var.

After that, the live app uses the production Convex backend you just deployed.

---

## Part 3: Deploy from CI (e.g. Vercel) with a deploy key

For automated deploys (e.g. on every push), use a **Production Deploy Key** so the build doesn’t rely on your local `.env.local`.

### 3.1 Create a Production Deploy Key

1. Go to [Convex Dashboard](https://dashboard.convex.dev) → your **project**.
2. Open **Settings** → **Deploy Keys** (or **Keys**).
3. Create a **Production** deploy key and copy it (you won’t see it again).

### 3.2 Set the key in your CI/host

In your CI or host (e.g. Vercel):

- **Name:** `CONVEX_DEPLOY_KEY`
- **Value:** the production deploy key you copied.
- Scope it to the environment that should deploy to production (e.g. Production only).

### 3.3 Run deploy in the build

When `CONVEX_DEPLOY_KEY` is set, the CLI uses it instead of `CONVEX_DEPLOYMENT` to decide where to deploy.

**Vercel**

- In the Vercel project, set **Build Command** to:
  ```bash
  npx convex deploy --cmd 'npm run build'
  ```
  So Convex deploys first, then the frontend builds. The build will have the correct Convex URL available for the frontend.

**Other CI**

- In the same job that builds your app, run:
  ```bash
  npx convex deploy
  ```
  or, if you need to build the frontend with the Convex URL:
  ```bash
  npx convex deploy --cmd "npm run build"
  ```
  Ensure `CONVEX_DEPLOY_KEY` is in that job’s environment.

---

## Quick reference

| Goal                         | Command / step |
|-----------------------------|----------------|
| Log in                      | `npx convex login` |
| Link project + push to dev | `npx convex dev` (once, then optional keep running) |
| Deploy to production       | `npx convex deploy` (requires linked project or `CONVEX_DEPLOY_KEY`) |
| Regenerate types only      | `npx convex codegen` (needs linked project) |
| Open dashboard             | `npx convex dashboard` |
| List env vars              | `npx convex env list` |

---

## Data: dev vs production

- **Development** and **production** Convex deployments have **separate data**. Deploying with `npx convex deploy` does **not** copy dev data to production.
- To use production data locally, set `VITE_CONVEX_URL` in `.env.local` to the **production** Convex URL (and avoid writing test data in prod).
- To use dev data, keep `VITE_CONVEX_URL` pointing at your dev deployment URL (the one created when you run `npx convex dev`).

If something still doesn’t work, note the **exact** error message and where you are (first-time link, `convex dev`, or `convex deploy`); that will narrow it down.
