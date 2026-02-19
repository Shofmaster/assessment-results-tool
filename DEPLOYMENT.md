# Deployment

## Why “downloaded” data doesn’t match when you deploy

**Your app’s data (projects, assessments, documents, users) is not stored on Vercel.** It is stored in **Convex**. Vercel only hosts the frontend; Convex is the database.

When you “download” from Vercel you get the **deployment** (built app files). You do **not** get the Convex database. So when you deploy again (or run locally), the app will only show the same data if it talks to the **same Convex deployment** that production uses.

### Make the deployed app use the same data

1. **Get the production Convex URL**  
   - In the [Convex dashboard](https://dashboard.convex.dev): open the **same project** that your live production app uses.  
   - Copy the deployment URL (e.g. `https://happy-animal-123.convex.cloud`). You can also find it in the Convex project **Settings** or in the production app’s env.

2. **Point your deployment at that Convex**  
   - **Vercel:** In the Vercel project → **Settings** → **Environment Variables**, set `VITE_CONVEX_URL` to that production Convex URL (for Production, and optionally Preview).  
   - **Local:** In this repo’s `.env.local`, set `VITE_CONVEX_URL` to the same URL so local runs see the same data.

3. **Redeploy**  
   - After changing `VITE_CONVEX_URL` on Vercel, trigger a new deployment (e.g. push a commit or redeploy from the dashboard). The new deploy will then use the same Convex data as the app you “downloaded” from.

If you created a **new** Convex project (e.g. by running `npx convex dev` in a new clone), that deployment is empty. To see the same data, you must use the **original production** Convex URL as above; there is no way to “upload” a Vercel download into Convex from the dashboard.

---

## Production (canonical)

**Live app (current production):**  
https://aviationassessment-he1sf2jmr-shelbys-projects-ce25364c.vercel.app

This is the deployment we work from. All config, env, and docs should match this deployment.

## Make local match the deployed project

**If the deployment’s Source shows 404** in the Vercel dashboard, the deployment was likely made from the CLI (e.g. `vercel --prod`) or from a repo that isn’t linked, so Vercel can’t show the git commit.

In that case, **this repo is the source of truth**:

- Work from **`main`** (or the branch you use to deploy). The code in this repo is what should match the app you want live.
- To avoid overwriting production by mistake, **don’t run `vercel --prod`** unless you intend to deploy your current local code as production.
- To make production point at an *existing* deployment (e.g. a preview you just tested), use **promote** instead (see below).

**If the deployment does show a Git source** (commit link works):

1. In the [Vercel dashboard](https://vercel.com): open your project → **Deployments** → click the production deployment. Copy the **Source** commit SHA (e.g. `32dc8d6`).
2. In the project root:
   ```bash
   git fetch origin
   git checkout <commit-sha>
   ```
   To move your current branch to that commit (discards local changes):  
   `git reset --hard <commit-sha>`

## Promote a deployment to production

When a preview deployment is ready to become production:

```bash
npx vercel promote https://aviationassessment-he1sf2jmr-shelbys-projects-ce25364c.vercel.app --yes
```

Or use the npm script:

```bash
npm run deploy:promote
```

(If you are promoting a *different* preview URL, replace the URL in the command with that deployment’s URL; then update this file and the script in `package.json` so the canonical URL stays in sync.)

## Align downloaded deployment files to project layout

If you downloaded a Vercel deployment (e.g. with `scripts/download-vercel-deployment.mjs`), the files land under `vercel-deployment-download/` with an **extra `src/`** in the path: project root files are in `vercel-deployment-download/src/` and app source is in `vercel-deployment-download/src/src/`. To copy them into the correct locations so the app builds as it appears in deployment, run:

```bash
node scripts/align-download-to-project.mjs
```

This copies:

- From `vercel-deployment-download/src/` → project root: `index.html`, `package.json`, configs, `public/`, and deployment `scripts/`.
- From `vercel-deployment-download/src/src/` → project `src/`: all app source (components, services, etc.).

Then run `npm install` and `npm run build`. The Convex backend in this repo has been extended to match the deployment frontend (e.g. `documentReviews`, `sharedReferenceDocuments`, extra `userSettings` and `simulationResults` fields). If you use a different Convex deployment, run `npx convex codegen` after linking so types stay in sync.

## Vercel

- Deploys are triggered by git push (or manual `vercel` / `vercel --prod`).
- `vercel.json` configures SPA rewrites and API passthrough.
- Ensure Vercel project env vars match `.env.local` (e.g. `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_CONVEX_URL`) and that Convex/Clerk are set for the production domain.
