#!/usr/bin/env node
/**
 * Interactive setup: .env.local + Convex env (CLERK_JWT_ISSUER_DOMAIN).
 * Run: npm run setup
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const ENV_LOCAL = join(rootDir, '.env.local');
const REQUIRED_ENV_KEYS = ['VITE_CLERK_PUBLISHABLE_KEY', 'VITE_CONVEX_URL'];
const CONVEX_VAR = 'CLERK_JWT_ISSUER_DOMAIN';

function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve((answer || '').trim());
    });
  });
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  const content = readFileSync(path, 'utf8');
  const result = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) result[m[1].trim()] = m[2].trim();
  }
  return result;
}

function writeEnvFile(path, entries) {
  const lines = Object.entries(entries).map(([k, v]) => `${k}=${v}`);
  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
}

function hasConvexEnvVar() {
  try {
    const out = execSync('npx convex env list', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return out.split('\n').some((line) => line.startsWith(CONVEX_VAR + '='));
  } catch {
    return false;
  }
}

async function main() {
  console.log('\n--- Aviation Assessment Setup ---\n');

  // 1. Check .env.local
  let env = parseEnvFile(ENV_LOCAL);
  const missingKeys = REQUIRED_ENV_KEYS.filter((k) => !env[k]);

  if (missingKeys.length > 0) {
    console.log('Missing in .env.local:', missingKeys.join(', '));
    for (const key of missingKeys) {
      const hint = key.includes('CLERK') ? ' (pk_... from dashboard.clerk.com)' : ' (https://...convex.cloud from Convex dashboard)';
      const val = await ask(`${key}${hint}: `);
      if (val) env[key] = val;
    }
    writeEnvFile(ENV_LOCAL, env);
    console.log('Wrote .env.local\n');
  } else {
    console.log('.env.local: OK (VITE_CLERK_PUBLISHABLE_KEY, VITE_CONVEX_URL)\n');
  }

  // 2. Check Convex env
  if (hasConvexEnvVar()) {
    console.log(`Convex: ${CONVEX_VAR} is already set.\n`);
  } else {
    console.log(`${CONVEX_VAR} is not set in Convex.`);
    console.log('Get the Issuer URL from: Clerk Dashboard → Configure → JWT Templates → convex → Issuer');
    console.log('Example: https://your-app.clerk.accounts.dev\n');
    const issuer = await ask('Clerk JWT Issuer URL: ');
    if (issuer) {
      try {
        execSync(`npx convex env set ${CONVEX_VAR} ${issuer}`, {
          cwd: rootDir,
          stdio: 'inherit',
        });
        console.log('Set successfully.\n');
      } catch (err) {
        console.error('Failed to set. Run manually: npx convex env set', CONVEX_VAR, '<issuer-url>\n');
      }
    } else {
      console.log('Skipped. Run when ready: npx convex env set', CONVEX_VAR, 'https://<issuer>.clerk.accounts.dev\n');
    }
  }

  console.log('--- Setup complete ---');
  console.log('Next: npm run dev');
  console.log('See FIX_SERVER_ERROR_STEPS.md if you still see backend errors.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
