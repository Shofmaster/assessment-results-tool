#!/usr/bin/env node
/**
 * First-boot bootstrap for a self-hosted install.
 *
 * Run AFTER `docker compose up -d`, once the convex service is healthy:
 *
 *   npm run bootstrap
 *
 * Three steps, each idempotent:
 *   1. Generate a Convex admin key (skipped if .env already carries one).
 *   2. Set the Convex-side environment variables the backend itself needs.
 *   3. Deploy the app's Convex functions and schema into the local backend.
 *
 * Step 2 MUST precede step 3. convex/auth.config.ts reads CLERK_JWT_ISSUER_DOMAIN
 * at deploy time and the push is rejected outright if it is unset — verified
 * against a real backend, where the original 2/3 ordering failed every run.
 *
 * Deliberately does NOT create the first admin user. Promotion happens through
 * the same out-of-band path as the hosted product — see the closing output —
 * because an installer that mints an admin account is a standing privilege-
 * escalation risk if the installer is ever re-run.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  REQUIRED_BACKEND_VARS,
  requiredAuthVars,
  buildBackendVars,
  generateServiceToken,
  readEnvValue,
} from './lib/backendVars.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const selfhostRoot = resolve(here, '..');
const repoRoot = resolve(selfhostRoot, '..');

function resolveEnvPath() {
  const explicit = (process.env.AEROGAP_ENV_FILE || '').trim();
  if (explicit && existsSync(explicit)) return explicit;

  const programData = process.env.ProgramData || process.env.PROGRAMDATA;
  if (programData) {
    const winEnv = resolve(programData, 'AeroGap', 'config', '.env');
    if (existsSync(winEnv)) return winEnv;
  }

  const installEnv = resolve(here, '.env');
  if (existsSync(installEnv)) return installEnv;

  return resolve(selfhostRoot, '.env');
}

const envPath = resolveEnvPath();

/**
 * Where the Convex function source lives, and which CLI deploys it.
 *
 * THIS SCRIPT USED TO ONLY WORK ON A DEVELOPER MACHINE.
 *
 * It ran `npx convex deploy` with cwd set to repoRoot - the git checkout - and
 * build-staging.ps1 never staged the convex/ directory at all. So the "run node
 * bootstrap.mjs" step printed by install.ps1 at the end of every install pointed
 * at a command with no schema and no functions to push. It appeared to work only
 * because the one real install was performed on a machine that happened to have
 * the repository.
 *
 * On a customer machine bootstrap.mjs is copied FLAT into the install directory,
 * so `here` IS the install root and repoRoot points at some unrelated parent.
 * Detect the staged layout by its own marker rather than by guessing:
 *
 *   installed  <install>/convex-src/   with the CLI under <install>/node_modules
 *   developer  <repo>/convex/         with the CLI resolved by npx
 *
 * The staged path also uses the BUNDLED CLI rather than npx, so a first run
 * needs no npm registry, no proxy configuration and no network at all.
 */
const stagedConvexSrc = resolve(here, 'convex-src');
const isStagedInstall = existsSync(resolve(stagedConvexSrc, 'convex.json'));
const deployCwd = isStagedInstall ? stagedConvexSrc : repoRoot;
const bundledCli = resolve(here, 'node_modules', 'convex', 'bin', 'main.js');

const DIM = '\x1b[2m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const BOLD = '\x1b[1m';
const OFF = '\x1b[0m';

const step = (n, msg) => console.log(`\n${BOLD}[${n}/3]${OFF} ${msg}`);
const ok = (msg) => console.log(`  ${GREEN}✓${OFF} ${msg}`);
const info = (msg) => console.log(`  ${DIM}${msg}${OFF}`);

function die(msg, detail) {
  console.error(`\n  ${RED}✗ ${msg}${OFF}`);
  if (detail) console.error(`    ${DIM}${detail}${OFF}`);
  console.error('');
  process.exit(1);
}

if (!existsSync(envPath)) {
  die('.env not found.', `Expected configuration at ${envPath}. Copy .env.example and fill it in first.`);
}

// ---------------------------------------------------------------------------
// Safety interlock: never deploy this schema to a CLOUD Convex deployment.
// ---------------------------------------------------------------------------
// `npx convex deploy` chooses its target from CONVEX_DEPLOYMENT / CONVEX_DEPLOY_KEY
// when they are present, and with CONVEX_DEPLOYMENT set it targets the project's
// PRODUCTION deployment. A developer machine that also works on the hosted
// product has those in the repo's .env.local — so running this bootstrap there
// could push a schema to live production instead of the local container.
//
// A customer install has no .env.local and never sees this check.
const repoEnvLocal = resolve(repoRoot, '.env.local');
if (existsSync(repoEnvLocal)) {
  const contents = readFileSync(repoEnvLocal, 'utf8');
  const conflicting = ['CONVEX_DEPLOYMENT', 'CONVEX_DEPLOY_KEY'].filter((key) =>
    new RegExp(`^\\s*${key}=`, 'm').test(contents),
  );
  if (conflicting.length > 0) {
    // Not fatal: every CLI call below passes --env-file, which overrides the
    // .env files when selecting a deployment (verified against convex 1.42.3,
    // including on `env set` where the flag is undocumented). The Convex CLI
    // also refuses outright if both selectors reach it, so this cannot silently
    // target the cloud. Worth saying out loud anyway.
    console.warn(
      `\n  Note: ${repoEnvLocal} sets ${conflicting.join(' and ')} (a cloud deployment).` +
        `\n  Every command below pins the target with --env-file, so this bootstrap still only writes to ${'‘'}CONVEX_PUBLIC_URL${'’'}.\n`,
    );
  }
}

function readEnvFile() {
  return readFileSync(envPath, 'utf8');
}

/** Merge build-time public config into the raw .env text for bootstrap. */
function mergeBuildConfig(raw) {
  const buildConfigPath = resolve(here, 'build-config.json');
  if (!existsSync(buildConfigPath)) return raw;
  const config = JSON.parse(readFileSync(buildConfigPath, 'utf8'));
  let merged = raw;
  for (const [key, value] of Object.entries(config)) {
    if (value && !readEnvValue(merged, key)) {
      merged = `${merged.trimEnd()}\n${key}=${value}\n`;
    }
  }
  return merged;
}

function envValue(raw, key) {
  const match = raw.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match ? match[1].trim() : '';
}

/** Rewrite one key in .env in place, preserving comments and ordering. */
function setEnvValue(key, value) {
  const raw = mergeBuildConfig(readEnvFile());
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, 'm').test(raw)
    ? raw.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${raw.trimEnd()}\n${line}\n`;
  writeFileSync(envPath, next, 'utf8');
}

function compose(args, options = {}) {
  return execFileSync('docker', ['compose', ...args], {
    cwd: selfhostRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

/**
 * Which distribution channel is this install?
 *
 *   docker — the Convex backend is a container; the admin key comes from
 *            ./generate_admin_key.sh inside it.
 *   native — the Convex backend is a Windows Service running the standalone
 *            binary, which has no shell script. The equivalent is
 *            `convex-local-backend.exe keygen admin-key`.
 *
 * Chosen by whether AEROGAP_INSTALL_DIR is configured, so an operator is never
 * asked to describe their own topology.
 */
function detectMode(raw) {
  const installDir = (process.env.AEROGAP_INSTALL_DIR || envValue(raw, 'AEROGAP_INSTALL_DIR') || '').trim();
  return installDir ? { mode: 'native', installDir } : { mode: 'docker' };
}

/** Generate an admin key from the standalone binary (native Windows install). */
function nativeAdminKey(installDir, raw) {
  const exe = resolve(installDir, 'convex-local-backend.exe');
  if (!existsSync(exe)) {
    die(
      `Convex backend binary not found at ${exe}.`,
      'Check AEROGAP_INSTALL_DIR in selfhost/.env, or re-run windows\\install.ps1.',
    );
  }

  const instanceName = envValue(raw, 'CONVEX_INSTANCE_NAME') || 'aerogap_onprem';

  // The secret lives beside the config, not in .env: install.ps1 writes it once
  // and it must survive reinstalls, because regenerating it makes the existing
  // database unreadable.
  const secretFile = resolve(installDir, '..', '..', 'ProgramData', 'AeroGap', 'config', 'instance-secret');
  const configuredSecret = envValue(raw, 'CONVEX_INSTANCE_SECRET');
  let secret = configuredSecret;
  if (!secret && existsSync(secretFile)) secret = readFileSync(secretFile, 'utf8').trim();
  if (!secret) {
    die(
      'No Convex instance secret available.',
      'Expected CONVEX_INSTANCE_SECRET in selfhost/.env or a config\\instance-secret file written by install.ps1.',
    );
  }

  try {
    return execFileSync(exe, ['keygen', 'admin-key', '--instance-name', instanceName, '--instance-secret', secret], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    die(
      'Could not generate a Convex admin key from the backend binary.',
      `Verify CONVEX_INSTANCE_NAME matches the registered service. (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

// ---------------------------------------------------------------------------
// 1. Admin key
// ---------------------------------------------------------------------------
step(1, 'Convex admin key');

let adminKey = envValue(readEnvFile(), 'CONVEX_SELF_HOSTED_ADMIN_KEY');

const deployment = detectMode(readEnvFile());

if (adminKey) {
  ok('Admin key already present in .env — reusing it.');
} else {
  let generated;
  if (deployment.mode === 'native') {
    info('Generating a key from the Convex backend binary (native install)...');
    generated = nativeAdminKey(deployment.installDir, readEnvFile());
  } else {
    info('Generating a key inside the convex container...');
    try {
      generated = compose(['exec', '-T', 'convex', './generate_admin_key.sh'], { capture: true });
    } catch (err) {
      die(
        'Could not generate a Convex admin key.',
        'Is the stack running and healthy?  docker compose ps   /   docker compose logs convex',
      );
    }
  }

  // Both paths print surrounding prose; the key itself is the instance-name
  // prefixed token. Format confirmed against the real binary:
  //   aerogap_onprem|01d3fd029fb219f2cbcc...
  const match = generated.match(/[a-zA-Z0-9_-]+\|[a-f0-9]{32,}/);
  if (!match) {
    die('Generated output did not contain a recognisable admin key.', generated.slice(0, 400));
  }
  adminKey = match[0];
  setEnvValue('CONVEX_SELF_HOSTED_ADMIN_KEY', adminKey);
  ok('Admin key generated and written to selfhost/.env');
  info('Back this up with your database backups — it is required for upgrades.');
}

// ---------------------------------------------------------------------------
// Shared deployment targeting
// ---------------------------------------------------------------------------
let raw = mergeBuildConfig(readEnvFile());
const convexPublicUrl = envValue(raw, 'CONVEX_PUBLIC_URL');
if (!convexPublicUrl) die('CONVEX_PUBLIC_URL is not set in .env.');

// Interlock on the value itself: a *.convex.cloud target means this is a hosted
// deployment, not the backend in this stack.
if (/\.convex\.cloud/i.test(convexPublicUrl)) {
  die(
    `CONVEX_PUBLIC_URL points at a hosted Convex deployment (${convexPublicUrl}).`,
    'Self-hosted bootstrap must target the Convex backend in this stack. Refusing to deploy.',
  );
}

/**
 * Child environment with the cloud deployment selectors stripped. Deleting is
 * required rather than assigning undefined — execFileSync stringifies undefined
 * into the literal "undefined", which the CLI would try to resolve as a
 * deployment name.
 */
function selfHostedEnv() {
  const next = { ...process.env };
  delete next.CONVEX_DEPLOYMENT;
  delete next.CONVEX_DEPLOY_KEY;
  next.CONVEX_SELF_HOSTED_URL = convexPublicUrl;
  next.CONVEX_SELF_HOSTED_ADMIN_KEY = adminKey;
  return next;
}

// --env-file overrides .env/.env.local when the CLI picks a deployment. It is
// documented on `deploy` and, though undocumented, also honoured by `env set`
// (verified against convex 1.42.3) — which is what lets this run on a developer
// machine whose repo .env.local points at a cloud deployment, without editing
// that file. The key material lives in a private temp dir, removed at exit.
const tempDir = mkdtempSync(join(tmpdir(), 'aerogap-bootstrap-'));
const deployEnvFile = join(tempDir, 'deploy.env');
writeFileSync(
  deployEnvFile,
  `CONVEX_SELF_HOSTED_URL=${convexPublicUrl}
CONVEX_SELF_HOSTED_ADMIN_KEY=${adminKey}
`,
  { mode: 0o600 },
);

function convexCli(args, options = {}) {
  // Bundled CLI on an installed machine (offline), npx on a developer machine.
  const [exe, prefix] = isStagedInstall && existsSync(bundledCli)
    ? [process.execPath, [bundledCli]]
    : ['npx', ['convex']];

  return execFileSync(exe, [...prefix, ...args, '--env-file', deployEnvFile], {
    cwd: deployCwd,
    stdio: options.stdio ?? 'inherit',
    env: selfHostedEnv(),
  });
}

try {
  // -------------------------------------------------------------------------
  // 2. Backend-side environment  — MUST precede the deploy
  // -------------------------------------------------------------------------
  // convex/auth.config.ts reads CLERK_JWT_ISSUER_DOMAIN at *deploy* time and
  // the push is rejected if it is unset. Setting these afterwards makes step 3
  // fail on every first run, which is exactly what happened before this order
  // was corrected.
  step(2, 'Setting Convex backend environment variables');

  // The app tier resolves each company's AI key from Convex over a
  // service-token-gated route, so BOTH sides need the same token. On Windows
  // install.ps1 has already written one into .env (it must exist before the
  // services start); this covers the Docker path and any hand-rolled install.
  let serviceToken = readEnvValue(raw, 'AI_CREDENTIAL_SERVICE_TOKEN');
  if (!serviceToken) {
    serviceToken = generateServiceToken();
    setEnvValue('AI_CREDENTIAL_SERVICE_TOKEN', serviceToken);
    ok('Generated AI_CREDENTIAL_SERVICE_TOKEN and wrote it to .env.');
  }

  let encryptionKey = readEnvValue(raw, 'AI_CREDENTIAL_ENCRYPTION_KEY');
  if (!encryptionKey) {
    encryptionKey = generateServiceToken();
    setEnvValue('AI_CREDENTIAL_ENCRYPTION_KEY', encryptionKey);
    ok('Generated AI_CREDENTIAL_ENCRYPTION_KEY and wrote it to .env.');
  }

  raw = mergeBuildConfig(readEnvFile());

  // Read by code running INSIDE Convex (auth.config.ts, actions), which cannot
  // see the app container's environment.
  const backendVars = buildBackendVars(raw, serviceToken);

  // Which auth vars are mandatory depends on who issues tokens for this install.
  const authMode = readEnvValue(raw, 'AUTH_MODE') || 'clerk';
  for (const key of [...REQUIRED_BACKEND_VARS, ...requiredAuthVars(authMode)]) {
    if (backendVars[key]) continue;
    die(
      `${key} is not set in selfhost/.env.`,
      key === 'CLERK_JWT_ISSUER_DOMAIN' || key.startsWith('LOCAL_AUTH_')
        ? 'The Convex deploy in the next step reads it from convex/auth.config.ts and will be rejected without it.'
        : 'Without it, every AI request fails: neither runtime can resolve a provider key.',
    );
  }

  for (const [key, value] of Object.entries(backendVars)) {
    if (!value) {
      info(`${key} not set — skipping (dependent features stay disabled).`);
      continue;
    }
    try {
      convexCli(['env', 'set', key, value], { stdio: ['ignore', 'ignore', 'pipe'] });
      ok(`${key} set on the Convex backend.`);
    } catch {
      die(`Failed to set ${key} on the Convex backend.`);
    }
  }

  // -------------------------------------------------------------------------
  // 3. Deploy functions and schema
  // -------------------------------------------------------------------------
  step(3, 'Deploying Convex functions and schema');
  try {
    convexCli(['deploy', '--yes']);
    ok('Functions and schema deployed to the local backend.');
  } catch {
    die(
      'Convex deploy failed.',
      'Check that CONVEX_PUBLIC_URL resolves from this machine and that the admin key is valid.',
    );
  }
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log(`
${GREEN}${BOLD}  Bootstrap complete.${OFF}
`);
console.log(`  ${BOLD}One manual step remains:${OFF} promote your first administrator.`);
console.log(`  ${DIM}Sign in to the app once so your user row is created. Then, from the`);
console.log(`  ${DIM}repository root, with both values taken from selfhost/.env:${OFF}
`);
console.log(`    CONVEX_SELF_HOSTED_URL=${convexPublicUrl}`);
console.log(`    CONVEX_SELF_HOSTED_ADMIN_KEY=<the key in selfhost/.env>`);
console.log(`    npx convex run users:promoteToAdmin '{"email":"you@yourcompany.com"}'
`);
console.log(`  ${DIM}Every later account is approved from Admin -> Pending Approvals.${OFF}
`);
