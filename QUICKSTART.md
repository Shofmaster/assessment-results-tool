# Quick Start Guide

## Installation

### For Windows Users

1. Download the `.exe` installer from the releases page
2. Run the installer
3. Launch the application from Start Menu

### For Developers

```bash
npm install
npm run dev
```

Create `.env.local` in the project root with:

```bash
VITE_CLERK_PUBLISHABLE_KEY=pk_...
VITE_CONVEX_URL=https://your-deployment.convex.cloud
```

Also configure Clerk auth for your Convex deployment:

```bash
npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<your-clerk-domain>
# Optional: only if your Clerk JWT template uses a different audience than "convex"
npx convex env set CLERK_JWT_AUDIENCE convex
```

In the Clerk dashboard, create a JWT template named `convex` and ensure its **Issuer**
and **Audience** match `CLERK_JWT_ISSUER_DOMAIN` and `CLERK_JWT_AUDIENCE`.

If you are running a built/packaged app (serving `dist/`), you can also provide `aviation.config.json` next to `index.html` (see `public/aviation.config.example.json`).

## First Time Setup

### Step 1: Get Your Claude API Key

1. Visit https://console.anthropic.com/
2. Sign up or log in
3. Go to API Keys section
4. Create a new API key
5. Copy the key (starts with `sk-ant-api03-...`)

### Step 2: Configure the Application

1. Open the application
2. Click **Settings** (gear icon)
3. Paste your API key
4. Click **Save**

### Step 3: Import Files

**Import Regulatory Standards:**
1. Go to **Library**
2. Click **Regulatory Standards** tab
3. Select category (CFRs, IS-BAO, EASA, etc.)
4. Click **Import Files**
5. Select PDF/DOC files

**Import Entity Documents:**
1. Switch to **Entity Documents** tab
2. Click **Import Files**
3. Select your company manuals and procedures

### Step 4: Import Assessment

1. Go to **Dashboard**
2. Click **Import Assessment**
3. Select the JSON file from your assessment tool

### Step 5: Run Analysis

1. Go to **Analysis** view
2. Select an assessment
3. Click **Start Analysis**
4. Wait 30-60 seconds
5. Review findings and recommendations

### Step 6: Export Report

1. Click **Export PDF** button
2. Choose save location
3. Share the professional audit report

## Tips

- Import multiple regulatory files for comprehensive analysis
- Organize documents by category for better results
- API costs: Typical analysis costs $0.50-$2.00 depending on data size
- PDF reports are ready to share with auditors and management

## Troubleshooting

**API Key Error**: Double-check your key in Settings

**Slow Analysis**: Large assessments take 60-90 seconds

**Missing Files**: Restart app to refresh file list

## Support

Questions? Create an issue on GitHub or contact support.
