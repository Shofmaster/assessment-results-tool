#!/usr/bin/env node
/**
 * Preflight check: verify CLERK_JWT_ISSUER_DOMAIN is set in Convex.
 * Run before `npm run dev` to avoid FUNCTION_INVOCATION_FAILED errors.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const REQUIRED_VAR = 'CLERK_JWT_ISSUER_DOMAIN';

// Not hard blockers for dev, but required before taking payments / shipping AI features.
const RECOMMENDED_VARS = [
  'ANTHROPIC_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_BASIC_MONTHLY',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_ENTERPRISE_MONTHLY',
];

function warnMissingRecommended(missing) {
  if (!missing.length) return;
  console.warn(
    `\n\x1b[33mHeads up: ${missing.length} recommended Convex env var(s) not set:\x1b[0m\n` +
      missing.map((v) => `  - ${v}`).join('\n') +
      `\n\nThese are required before billing / AI features work in production.\n` +
      `Set each with: npx convex env set NAME value  (see .env.example)\n`,
  );
}

function printFixSteps() {
  console.error(`
\x1b[1mBackend setup required: CLERK_JWT_ISSUER_DOMAIN is not set in Convex.\x1b[0m

This causes all Convex calls to fail with FUNCTION_INVOCATION_FAILED.

To fix:
1. Go to https://dashboard.clerk.com → Configure → JWT Templates → convex
2. Copy the Issuer URL (e.g. https://your-app.clerk.accounts.dev)
3. Run: npx convex env set CLERK_JWT_ISSUER_DOMAIN https://your-issuer.clerk.accounts.dev
4. Then run: npm run dev

For detailed steps, see FIX_SERVER_ERROR_STEPS.md
`);
}

function main() {
  const cwd = process.cwd();
  const pkgPath = join(rootDir, 'package.json');
  const convexDir = join(rootDir, 'convex');

  if (!existsSync(pkgPath) || !existsSync(convexDir)) {
    console.error('Not in project root (missing package.json or convex/). Skipping check.');
    process.exit(0);
    return;
  }

  try {
    const out = execSync('npx convex env list', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const presentKeys = new Set(
      out
        .split('\n')
        .map((line) => line.split('=')[0]?.trim())
        .filter(Boolean),
    );

    if (!presentKeys.has(REQUIRED_VAR)) {
      printFixSteps();
      process.exit(1);
    }

    warnMissingRecommended(RECOMMENDED_VARS.filter((v) => !presentKeys.has(v)));
  } catch (err) {
    const stderr = err.stderr?.toString() || err.message || '';
    const needsSetup =
      stderr.includes('not linked') ||
      stderr.includes('No project') ||
      stderr.includes('ENOENT') ||
      err.code === 1;

    if (needsSetup || err.code !== 0) {
      console.error(`
\x1b[1mConvex project may not be linked or env list failed.\x1b[0m

Run \x1b[33mnpx convex dev\x1b[0m first to link your project, then run this check again.
Or run \x1b[33mnpm run setup\x1b[0m to guide you through full setup.
`);
      process.exit(1);
    }
    throw err;
  }
}

main();
