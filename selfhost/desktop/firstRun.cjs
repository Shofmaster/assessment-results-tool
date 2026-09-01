/**
 * First-run setup for a desktop install.
 *
 * WHAT IT REPLACES
 * Server mode finishes an install by printing two commands for an operator to
 * run by hand:
 *
 *     node bootstrap.mjs
 *     npx convex run users:promoteToAdmin '{"email":"..."}'
 *
 * Neither is acceptable in a desktop product, and the first one never actually
 * worked away from a developer machine: bootstrap.mjs runs the Convex CLI with
 * its cwd set to the git checkout, and the function source was never staged. So
 * this does the same three steps, from the staged payload, with no console and
 * no network:
 *
 *   1. mint an admin key from the backend binary
 *   2. push the backend environment variables
 *   3. deploy the schema and functions
 *
 * Step 2 MUST precede step 3: convex/auth.config.ts reads AUTH_MODE and the
 * auth provider variables at DEPLOY time and the push is rejected without them.
 *
 * Idempotent. A marker file records the version that was deployed, so a normal
 * launch does nothing and an upgrade re-deploys to pick up schema changes.
 */
const { execFile } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

/** How long the schema deploy may take before we call it hung. */
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Run a command and capture its output.
 *
 * Never inherits stdio: this process has no console in a packaged app, and a
 * child writing to a non-existent handle is a class of hang that is very hard
 * to diagnose after the fact.
 */
function run(exe, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(
      exe,
      args,
      {
        cwd: options.cwd,
        env: options.env || process.env,
        timeout: options.timeoutMs || 120_000,
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          err.stdout = stdout;
          err.stderr = stderr;
          return reject(err);
        }
        resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
  });
}

/** Parse KEY=value lines. Mirrors the subset selfhost/server/src/envFile.ts accepts. */
function parseEnv(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key) out[key] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

class FirstRun {
  /**
   * @param {object} options
   * @param {string} options.installDir Staged payload (convex-local-backend.exe, node_modules\, convex-src\)
   * @param {string} options.dataRoot   Per-user data root
   * @param {{convex: number, convexSite: number, app: number}} options.ports
   * @param {string} options.instanceName
   * @param {(text: string) => void} [options.onStatus]
   */
  constructor({ installDir, dataRoot, ports, instanceName, onStatus }) {
    this.installDir = installDir;
    this.dataRoot = dataRoot;
    this.ports = ports;
    this.instanceName = instanceName;
    this.onStatus = onStatus || (() => {});

    this.configDir = path.join(dataRoot, 'config');
    this.convexSrc = path.join(installDir, 'convex-src');
    this.markerFile = path.join(this.configDir, 'deployed.json');
  }

  appOrigin() {
    return 'http://127.0.0.1:' + this.ports.app;
  }

  /** Version stamp for the marker, so an upgrade triggers a re-deploy. */
  appVersion() {
    try {
      return require(path.join(this.installDir, 'desktop', 'resources', 'app.asar', 'package.json')).version;
    } catch {
      try {
        return require('./package.json').version;
      } catch {
        return '0.0.0';
      }
    }
  }

  /**
   * True when the schema for THIS version has already been deployed.
   *
   * Keyed on version rather than a bare "done" flag: an upgrade that adds a
   * table must re-deploy, and a marker that cannot express that would leave the
   * new build running against the old schema - failing at the first query
   * instead of at setup, where it can be explained.
   */
  alreadyDeployed() {
    try {
      const marker = JSON.parse(fs.readFileSync(this.markerFile, 'utf8'));
      const portsMatch =
        marker.ports?.app === this.ports.app &&
        marker.ports?.convex === this.ports.convex &&
        marker.ports?.convexSite === this.ports.convexSite;
      return (
        marker.version === this.appVersion() &&
        marker.instanceName === this.instanceName &&
        portsMatch &&
        marker.appOrigin === this.appOrigin()
      );
    } catch {
      return false;
    }
  }

  markDeployed() {
    fs.writeFileSync(
      this.markerFile,
      JSON.stringify(
        {
          version: this.appVersion(),
          instanceName: this.instanceName,
          appOrigin: this.appOrigin(),
          ports: { ...this.ports },
          deployedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  /**
   * Admin key for the local backend.
   *
   * Derived from instance name + secret, so it is deterministic and does not
   * need storing. The Docker path in bootstrap.mjs calls generate_admin_key.sh;
   * the standalone binary has no shell script and uses `keygen` instead.
   */
  async adminKey() {
    const exe = path.join(this.installDir, 'convex-local-backend.exe');
    const secret = fs.readFileSync(path.join(this.configDir, 'instance-secret'), 'utf8').trim();
    const { stdout } = await run(exe, [
      'keygen',
      'admin-key',
      '--instance-name', this.instanceName,
      '--instance-secret', secret,
    ]);
    // The binary prints the key with surrounding whitespace/newlines.
    const key = stdout.trim().split(/\s+/).pop();
    if (!key) throw new Error('convex-local-backend keygen produced no admin key');
    return key;
  }

  /**
   * Invoke the bundled Convex CLI.
   *
   * `node_modules/convex/bin/main.js` is a two-line shim into a local bundle, so
   * this runs entirely offline - unlike `npx convex`, which resolves against the
   * npm registry and would make first launch depend on a customer's proxy and
   * firewall rules.
   */
  cli(args, adminKey, timeoutMs) {
    const nodeExe = path.join(this.installDir, 'node.exe');
    const cliMain = path.join(this.installDir, 'node_modules', 'convex', 'bin', 'main.js');

    return run(nodeExe, [cliMain, ...args], {
      cwd: this.convexSrc,
      timeoutMs,
      env: {
        ...process.env,
        CONVEX_SELF_HOSTED_URL: `http://127.0.0.1:${this.ports.convex}`,
        CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
        // The CLI REFUSES to run when a cloud deployment selector is also set,
        // which is a deliberate fail-closed guard against deploying a customer's
        // schema to our production Convex. Clearing them here means an install
        // on a developer machine targets the local backend, as intended.
        CONVEX_DEPLOYMENT: undefined,
        CONVEX_DEPLOY_KEY: undefined,
      },
    });
  }

  /** Load buildBackendVars helpers from the staged install payload. */
  async loadBackendVarsModule() {
    const staged = path.join(this.installDir, 'lib', 'backendVars.mjs');
    const dev = path.join(__dirname, '..', 'scripts', 'lib', 'backendVars.mjs');
    const target = fs.existsSync(staged) ? staged : dev;
    return import(pathToFileURL(target).href);
  }

  /** Environment variables that must exist INSIDE the Convex deployment. */
  async backendVars() {
    const envFile = path.join(this.configDir, '.env');
    const fileVars = fs.existsSync(envFile) ? parseEnv(fs.readFileSync(envFile, 'utf8')) : {};
    const pick = (key) => (process.env[key] || fileVars[key] || '').trim();

    const serviceToken = pick('AI_CREDENTIAL_SERVICE_TOKEN');
    if (!serviceToken) {
      throw new Error(
        'AI_CREDENTIAL_SERVICE_TOKEN is not configured. The desktop supervisor should have created one in config/.env.',
      );
    }

    const { buildDesktopBackendVars } = await this.loadBackendVarsModule();
    const envFileRaw = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    return buildDesktopBackendVars({
      appOrigin: this.appOrigin(),
      serviceToken,
      envFileRaw,
    });
  }

  /**
   * Run setup if it has not already been done for this version.
   * @returns {Promise<{ran: boolean}>}
   */
  async ensure() {
    if (this.alreadyDeployed()) return { ran: false };

    if (!fs.existsSync(path.join(this.convexSrc, 'convex.json'))) {
      throw new Error(
        `Convex function source is missing from this install (expected ${this.convexSrc}). ` +
          'The build that produced it was incomplete.',
      );
    }

    this.onStatus('Preparing the database (one time only)');
    const adminKey = await this.adminKey();

    const vars = await this.backendVars();

    this.onStatus('Applying configuration');
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined || value === null || value === '') continue;
      await this.cli(['env', 'set', key, String(value)], adminKey);
    }

    // Typecheck is disabled deliberately: the sources were typechecked on the
    // build machine, and re-running tsc here would need the app's full dev
    // dependencies - which are not shipped - so it could only ever fail.
    this.onStatus('Installing application components (this can take a few minutes)');
    await this.cli(['deploy', '--yes', '--typecheck', 'disable'], adminKey, DEPLOY_TIMEOUT_MS);

    this.markDeployed();
    this.onStatus('Setup complete');
    return { ran: true };
  }
}

module.exports = { FirstRun, parseEnv };
