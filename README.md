# Aviation Assessment Analyzer

A Windows desktop application for comprehensive aviation quality assessment analysis powered by Claude AI.

## Features

- Assessment Import: Import JSON assessment data
- Document Library: Organize regulatory standards and entity documents
- AI-Powered Analysis: Claude AI compliance analysis
- Professional Reports: Generate PDF audit reports
- Modern Interface: Sleek UI with file management
- Secure & Local: All data stored locally

## Quick Start

1. Install dependencies: `npm install`
2. Run development: `npm run dev`
3. Build for production: `npm run build`

## Setup

- Create `.env.local` with:
  - `VITE_CLERK_PUBLISHABLE_KEY` (required)
  - `VITE_CONVEX_URL` (required)
- Clerk + Convex auth:
  - In Clerk, create a JWT template named `convex` and set its **Issuer** and **Audience** to match your Convex auth config.
  - In Convex, set `CLERK_JWT_ISSUER_DOMAIN` (and optionally `CLERK_JWT_AUDIENCE` if you customized the JWT template audience): `npx convex env set ...`
- Set `ANTHROPIC_API_KEY` in your server environment (Claude calls are server-side)
- Import regulatory files (CFRs, IS-BAO, EASA)
- Import entity documents (manuals, procedures)
- Import assessment JSON files
- Run analysis and export PDF reports

## Runtime config (built/packaged apps)

When running a built app (serving `dist/`), Vite env vars are baked in at build time. You can also provide a runtime config file named `aviation.config.json` next to `index.html` (see `public/aviation.config.example.json`).

## Testing

- **Unit (Vitest):** `npm run test:unit`
- **E2E (Playwright):** `npm run test:e2e` (or `npx playwright test`). The dev server is started automatically unless already running.
  - By default the **chromium** project runs only specs that don’t require login (e.g. design-audit, noauth-smoke). No auth file is needed.
  - For **in-depth authenticated tests** (guided audit, projects, document library, settings, etc.), save a signed-in session once, then use the **chromium-with-auth** project.

**Saving a signed-in session (one-time):**

1. **Option A – credentials from env:**  
   `PLAYWRIGHT_AUTH_EMAIL=you@example.com PLAYWRIGHT_AUTH_PASSWORD=yourpassword npm run test:auth:save`  
   (On Windows PowerShell: set env vars first, then run `npm run test:auth:save` in the same session.)

2. **Option B – credentials from file (recommended):**  
   Create `.env.playwright` in the project root (or `playwright/.env`) with:
   ```env
   PLAYWRIGHT_AUTH_EMAIL=you@example.com
   PLAYWRIGHT_AUTH_PASSWORD=yourpassword
   ```
   Then run: `npm run test:auth:save`.  
   The test will sign in via Clerk (email → password), wait for the main app, and save state to `playwright/.auth/user.json`. Use an account that already exists in your Clerk application.

3. **Option C – manual sign-in:**  
   Run `npm run test:auth:save` without setting credentials. A browser opens; sign in yourself. The test waits for the main nav then saves the session.

**Running authenticated specs:**

- After saving auth: `npx playwright test --project=chromium-with-auth` (or run specific specs, e.g. `npx playwright test tests/guided-audit.spec.ts --project=chromium-with-auth`).
- Menu audit: `npm run test:menu-audit` (uses saved auth and writes `test-results/menu-structure.json`).

## Technology Stack

- Frontend: React + TypeScript + Tailwind CSS
- Desktop: Electron
- AI: Claude Sonnet 4.5
- PDF: pdf-lib

## File Storage

Files are stored in AppData/Roaming/aviation-assessment-analyzer/

## License

MIT License
