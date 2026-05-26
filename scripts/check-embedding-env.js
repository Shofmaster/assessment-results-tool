#!/usr/bin/env node
/**
 * Preflight: verify Convex embedding env vars for document search indexing.
 * Run before deploy: `node scripts/check-embedding-env.js`
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const REQUIRED_ALWAYS = ['EMBEDDING_PROVIDER', 'EMBEDDING_DIMENSIONS'];

function parseEnvList(output) {
  const map = new Map();
  for (const line of output.split('\n')) {
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) map.set(key, value);
  }
  return map;
}

function main() {
  if (!existsSync(join(rootDir, 'convex'))) {
    console.error('Not in project root. Skipping embedding env check.');
    process.exit(0);
  }

  let envMap;
  try {
    const out = execSync('npx convex env list', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    envMap = parseEnvList(out);
  } catch (err) {
    console.error('Could not read Convex env list. Link project with `npx convex dev` first.');
    process.exit(1);
  }

  const missing = REQUIRED_ALWAYS.filter((k) => !envMap.has(k));
  if (missing.length) {
    console.error(`Missing required Convex env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  const provider = (envMap.get('EMBEDDING_PROVIDER') || 'voyage').toLowerCase();
  const dims = Number(envMap.get('EMBEDDING_DIMENSIONS'));
  if (!Number.isFinite(dims) || dims <= 0) {
    console.error(`Invalid EMBEDDING_DIMENSIONS: ${envMap.get('EMBEDDING_DIMENSIONS')}`);
    process.exit(1);
  }

  if (provider === 'openai') {
    if (!envMap.has('OPENAI_API_KEY')) {
      console.error('EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY in Convex env.');
      process.exit(1);
    }
  } else if (provider === 'voyage') {
    if (!envMap.has('VOYAGE_API_KEY')) {
      console.error('EMBEDDING_PROVIDER=voyage requires VOYAGE_API_KEY in Convex env.');
      process.exit(1);
    }
  } else {
    console.error(`Unsupported EMBEDDING_PROVIDER: ${provider} (use voyage or openai)`);
    process.exit(1);
  }

  console.log(`Embedding env OK: provider=${provider}, dimensions=${dims}`);
}

main();
