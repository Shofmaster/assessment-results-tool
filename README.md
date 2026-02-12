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

## Technology Stack

- Frontend: React + TypeScript + Tailwind CSS
- Desktop: Electron
- AI: Claude Sonnet 4.5
- PDF: pdf-lib

## File Storage

Files are stored in AppData/Roaming/aviation-assessment-analyzer/

## License

MIT License
