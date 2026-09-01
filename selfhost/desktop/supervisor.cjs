/**
 * AeroGap desktop supervisor.
 *
 * WHAT CHANGED AND WHY
 * In server mode the Convex backend and the application server are Windows
 * Services: installed elevated, started by the SCM, running whether or not
 * anyone has opened the app. That is correct for a shared box and wrong for a
 * desktop program - it needs UAC to install, keeps running after the window is
 * closed, and drags in a reverse proxy, a certificate and firewall rules purely
 * so a browser on another machine could reach it.
 *
 * In desktop mode this module owns both processes instead. They are children of
 * the Electron process: they start when the app starts, they die when it quits,
 * and nothing needs administrator rights because everything lives in the user's
 * own profile and listens only on loopback.
 *
 * WHY THERE IS NO TLS HERE
 * http://127.0.0.1 is a secure context by definition in every current browser,
 * so the File System Access API and secure cookies work without a certificate.
 * The whole Caddy/internal-CA layer exists in server mode only because the
 * Convex backend has no native TLS and a remote browser must reach it over the
 * network.
 */
const { spawn, execFile } = require('node:child_process');
const { createServer } = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

/**
 * Preferred ports. Deliberately NOT the server-mode ones (13210/13211/18080):
 * a single machine may legitimately have both a server install and this desktop
 * build, and colliding would make whichever started second fail to bind.
 *
 * These are only a starting point - findFreePort scans upward - but keeping the
 * common case on fixed numbers matters. Convex is told its own public origin at
 * startup (--convex-origin), and the SPA is handed the same value through
 * /config.js, so a port that changes between launches is a value that changes
 * underneath anything holding a cached URL.
 */
const PREFERRED = { convex: 14210, convexSite: 14211, app: 19080 };

/**
 * Instance name for the desktop database.
 *
 * Distinct from server mode's 'aerogap_onprem' so that a machine carrying both
 * installs cannot have one's admin key validate against the other's database.
 */
const INSTANCE_NAME = 'aerogap_desktop';

/** How many consecutive ports to try before giving up on a range. */
const PORT_SCAN_LIMIT = 40;

/**
 * Restart policy. A backend that dies once is worth restarting; one that dies
 * five times in a row is misconfigured, and restarting forever would hide the
 * reason behind an endlessly reopening splash screen.
 */
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 60_000;
const RESTART_DELAY_MS = 1_500;

/** True when nothing is listening on `port` and we can bind it ourselves. */
function isPortFree(port) {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    // Bind the same interface the children will. A port free on 0.0.0.0 can
    // still be taken on 127.0.0.1 and vice versa.
    probe.listen(port, '127.0.0.1');
  });
}

/**
 * First free port at or after `start`.
 *
 * There is an unavoidable race here: the port is released before the child
 * binds it. Scanning from a fixed preferred port rather than asking the OS for
 * an ephemeral one (listen(0)) makes the window smaller in practice, because
 * the OS hands out ephemeral ports from a range other software is actively
 * churning through.
 */
async function findFreePort(start) {
  for (let port = start; port < start + PORT_SCAN_LIMIT; port += 1) {
    if (await isPortFree(port)) return port;
  }
  throw new Error(
    'No free TCP port found in ' + start + '-' + (start + PORT_SCAN_LIMIT - 1) +
      '. Something on this machine is occupying the whole range.',
  );
}

/**
 * Kill a Windows process tree.
 *
 * child.kill() signals only the process itself. The Convex backend and Node
 * both spawn helpers, and orphaned children keep the SQLite file and the TCP
 * port locked - so the next launch fails to bind and reports that AeroGap is
 * already running when it is not. taskkill /T covers the tree.
 */
function killTree(pid) {
  return new Promise((resolve) => {
    if (!pid) return resolve();
    if (process.platform !== 'win32') {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        /* already gone */
      }
      return resolve();
    }
    execFile('taskkill', ['/pid', String(pid), '/T', '/F'], () => resolve());
  });
}

class Supervisor {
  /**
   * @param {object} options
   * @param {string} options.installDir Directory holding convex-local-backend.exe, node.exe, server.js, www\
   * @param {string} options.dataRoot   Per-user data root (%LOCALAPPDATA%\AeroGap)
   * @param {(stage: string, detail?: string) => void} [options.onStatus]
   */
  constructor({ installDir, dataRoot, onStatus }) {
    this.installDir = installDir;
    this.dataRoot = dataRoot;
    this.onStatus = onStatus || (() => {});

    this.configDir = path.join(dataRoot, 'config');
    this.dataDir = path.join(dataRoot, 'data');
    this.storageDir = path.join(dataRoot, 'storage');
    this.logDir = path.join(dataRoot, 'logs');

    this.children = { convex: null, app: null };
    this.ports = null;
    /** Set once quit begins, so an exiting child is not treated as a crash. */
    this.shuttingDown = false;
    this.restarts = { convex: [], app: [] };
    /** Reported to the UI when a child dies for good. */
    this.lastFailure = null;
  }

  /** Public origin of the application server, once ports are allocated. */
  get appUrl() {
    return this.ports ? 'http://127.0.0.1:' + this.ports.app : null;
  }

  ensureLayout() {
    for (const dir of [this.dataRoot, this.configDir, this.dataDir, this.storageDir, this.logDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Instance secret, generated once and then never regenerated.
   *
   * Regenerating this against an existing database makes the data unreadable,
   * so it is created on first run and thereafter treated as part of the backup
   * set - the same contract install.ps1 has in server mode.
   */
  instanceSecret() {
    const file = path.join(this.configDir, 'instance-secret');
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (existing) return existing;
    }
    fs.mkdirSync(this.configDir, { recursive: true });
    const secret = crypto.randomBytes(32).toString('hex');
    // 0o600 is advisory on Windows, but the path is already inside the user's
    // own profile, which other standard users cannot read.
    fs.writeFileSync(file, secret, { encoding: 'ascii', mode: 0o600 });
    return secret;
  }

  /**
   * Ensure config\.env exists and carries a credential service token.
   *
   * TWO REASONS THIS IS NOT OPTIONAL.
   *
   * 1. envFile.ts THROWS when AEROGAP_ENV_FILE points at a file that does not
   *    exist - deliberately, so a wrong path in a service definition is not
   *    mistaken for missing configuration. The app server is always given that
   *    path, so on a fresh desktop install the file has to be there before the
   *    first launch or the server dies at boot.
   *
   * 2. requireConfig() treats a missing AI_CREDENTIAL_SERVICE_TOKEN as fatal,
   *    because without it nothing can resolve an AI key at any scope and every
   *    AI request 503s. In server mode install.ps1 generates it; in desktop mode
   *    there is no installer step, so it is generated here.
   *
   * The value must persist: the same token has to exist on both sides, and
   * first-run setup pushes this one into the Convex deployment. Regenerating it
   * on every launch would silently break every AI request after a restart.
   */
  ensureEnvFile() {
    const file = path.join(this.configDir, '.env');
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      // Does not exist yet - first run.
    }

    if (/^\s*AI_CREDENTIAL_SERVICE_TOKEN\s*=\s*\S/m.test(text)) {
      if (!/^\s*AI_CREDENTIAL_ENCRYPTION_KEY\s*=\s*\S/m.test(text)) {
        const encKey = crypto.randomBytes(32).toString('base64url');
        if (!text.endsWith('\n')) text += '\n';
        text += 'AI_CREDENTIAL_ENCRYPTION_KEY=' + encKey + '\n';
        fs.writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
      }
      return file;
    }

    // base64url: no '+', '/' or '=' to be mangled by .env parsing or a shell.
    const token = crypto.randomBytes(32).toString('base64url');
    const encKey = crypto.randomBytes(32).toString('base64url');

    if (!text) {
      text =
        '# AeroGap desktop configuration.\n' +
        '#\n' +
        '# Generated automatically. Everything the application needs is derived at\n' +
        '# launch by the desktop shell - nothing here has to be filled in by hand.\n' +
        '# AI provider keys are NOT stored here: they are added in the app under\n' +
        '# Settings > AI Keys and live in the local database, per company.\n' +
        '\n';
    } else if (!text.endsWith('\n')) {
      text += '\n';
    }

    text += 'AI_CREDENTIAL_SERVICE_TOKEN=' + token + '\n';
    text += 'AI_CREDENTIAL_ENCRYPTION_KEY=' + encKey + '\n';
    fs.writeFileSync(file, text, { encoding: 'utf8', mode: 0o600 });
    return file;
  }

  /**
   * Stable identity for this installation.
   *
   * Lets us offer an update to one site, enable a feature for one customer, and
   * know how many trials are actually running. Generated locally and never
   * derived from anything about the machine or the user - not the hostname, not
   * a MAC address, not an email. It is a random number whose only meaning is
   * "the same install as last time", which is all it needs to mean.
   *
   * Kept beside the instance secret so it survives upgrades and is captured by
   * the same backup, and so a restored backup keeps its entitlements.
   */
  installId() {
    const file = path.join(this.configDir, 'install-id');
    try {
      const existing = fs.readFileSync(file, 'utf8').trim();
      if (existing) return existing;
    } catch {
      // First run.
    }
    // Create the directory rather than assuming ensureLayout() ran first.
    // appEnv() is reachable before start() - the ordering holds today only by
    // convention, and an ENOENT here would surface as a failure to launch.
    fs.mkdirSync(this.configDir, { recursive: true });
    const id = crypto.randomUUID();
    fs.writeFileSync(file, id, { encoding: 'ascii' });
    return id;
  }

  /**
   * Bind the preferred ports or fail with a clear error.
   *
   * Port scanning was removed: LOCAL_AUTH_ISSUER is baked into Convex at first
   * run from APP_ORIGIN, so a port that changes between launches breaks every
   * sign-in with nothing useful in the logs.
   */
  async allocatePorts() {
    const checks = [
      ['database backend', PREFERRED.convex],
      ['database site proxy', PREFERRED.convexSite],
      ['application server', PREFERRED.app],
    ];
    for (const [label, port] of checks) {
      if (!(await isPortFree(port))) {
        throw new Error(
          'Port ' +
            port +
            ' is already in use (needed for the ' +
            label +
            '). Close the other program using it, or uninstall the other AeroGap copy on this machine.',
        );
      }
    }
    this.ports = { convex: PREFERRED.convex, convexSite: PREFERRED.convexSite, app: PREFERRED.app };
    return this.ports;
  }

  /** Append a child's output to a per-service log file. */
  pipeToLog(child, name) {
    const file = path.join(this.logDir, name + '.log');
    const stream = fs.createWriteStream(file, { flags: 'a' });
    stream.write('\n--- ' + new Date().toISOString() + ' started (pid ' + child.pid + ') ---\n');
    if (child.stdout) child.stdout.pipe(stream, { end: false });
    if (child.stderr) child.stderr.pipe(stream, { end: false });
    child.once('exit', (code) => {
      stream.write('--- exited with code ' + code + ' at ' + new Date().toISOString() + ' ---\n');
      stream.end();
    });
  }

  /**
   * Record a restart and report whether the child is still within its budget.
   * Restarts older than the window are forgotten, so a process that dies once a
   * day forever is not eventually treated as a crash loop.
   */
  withinRestartBudget(name) {
    const now = Date.now();
    const recent = this.restarts[name].filter((t) => now - t < RESTART_WINDOW_MS);
    recent.push(now);
    this.restarts[name] = recent;
    return recent.length <= MAX_RESTARTS;
  }

  startConvex() {
    const exe = path.join(this.installDir, 'convex-local-backend.exe');
    if (!fs.existsSync(exe)) {
      throw new Error('Convex backend binary not found at ' + exe);
    }

    const origin = 'http://127.0.0.1:' + this.ports.convex;
    const site = 'http://127.0.0.1:' + this.ports.convexSite;

    const args = [
      '--instance-name', INSTANCE_NAME,
      '--instance-secret', this.instanceSecret(),
      '--interface', '127.0.0.1',
      '--port', String(this.ports.convex),
      '--site-proxy-port', String(this.ports.convexSite),
      // Advertised to the browser, so it must be what the browser can actually
      // reach. In desktop mode that is loopback directly - there is no proxy in
      // front, which is the whole reason no certificate is needed.
      '--convex-origin', origin,
      '--convex-site', site,
      '--local-storage', this.storageDir,
      '--disable-beacon',
      '--redact-logs-to-client',
    ];

    // The backend resolves its SQLite database relative to the WORKING
    // DIRECTORY, not the binary location. This is what keeps customer data in
    // the per-user data folder instead of beside the executable, and is what
    // makes an upgrade (which replaces the install directory) non-destructive.
    const child = spawn(exe, args, {
      cwd: this.dataDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.children.convex = child;
    this.pipeToLog(child, 'convex');
    this.watch('convex', child, () => this.startConvex());
    return child;
  }

  startApp() {
    const nodeExe = path.join(this.installDir, 'node.exe');
    const serverJs = path.join(this.installDir, 'server.js');
    const checks = [[nodeExe, 'Node runtime'], [serverJs, 'application server bundle']];
    for (const [file, what] of checks) {
      if (!fs.existsSync(file)) throw new Error(what + ' not found at ' + file);
    }

    const child = spawn(nodeExe, [serverJs], {
      cwd: this.installDir,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, this.appEnv()),
    });

    this.children.app = child;
    this.pipeToLog(child, 'app');
    this.watch('app', child, () => this.startApp());
    return child;
  }

  /**
   * Environment for the application server.
   *
   * Everything the server needs is derived here rather than read from a config
   * file the user has to write. The one file that IS read (config\.env, via
   * AEROGAP_ENV_FILE) holds only values the app itself generates or the user
   * later supplies in Settings - never anything the installer had to ask for.
   */
  appEnv() {
    const convexInternal = 'http://127.0.0.1:' + this.ports.convex;
    const convexSiteInternal = 'http://127.0.0.1:' + this.ports.convexSite;
    const appOrigin = 'http://127.0.0.1:' + this.ports.app;
    const localIssuer = appOrigin + '/local-auth';
    const localJwks = localIssuer + '/.well-known/jwks.json';
    return {
      NODE_ENV: 'production',
      DEPLOYMENT_MODE: 'desktop',
      // Clerk production keys refuse a loopback origin; desktop always uses the
      // install's own identity provider (see convex/auth.config.ts).
      AUTH_MODE: 'local',
      LOCAL_AUTH_ISSUER: localIssuer,
      LOCAL_AUTH_JWKS_URL: localJwks,
      APP_PORT: String(this.ports.app),
      // Loopback only. Binding all interfaces would put the app server on every
      // interface of the user's laptop, including whatever wifi it is on.
      APP_BIND: '127.0.0.1',
      APP_ORIGIN: appOrigin,
      DIST_DIR: path.join(this.installDir, 'www'),
      AEROGAP_ENV_FILE: path.join(this.configDir, '.env'),
      // In desktop mode public and internal are the same address: there is no
      // proxy, so the browser and the server reach Convex identically.
      CONVEX_URL: convexInternal,
      CONVEX_PUBLIC_URL: convexInternal,
      CONVEX_SITE_URL: convexSiteInternal,
      CONVEX_SITE_INTERNAL_URL: convexSiteInternal,
      CONVEX_INSTANCE_NAME: INSTANCE_NAME,
      // Identity for the entitlement check-in. Passed in rather than read from
      // disk by the server so there is exactly one place it is generated.
      AEROGAP_INSTALL_ID: this.installId(),
      AEROGAP_DATA_ROOT: this.dataRoot,
    };
  }

  /**
   * Restart a child that exits unexpectedly.
   *
   * `shuttingDown` is checked first: during quit both children are killed on
   * purpose, and without that guard the supervisor would race the shutdown by
   * restarting them.
   */
  watch(name, child, restart) {
    child.once('exit', (code, signal) => {
      if (this.shuttingDown) return;
      this.children[name] = null;

      const label = name === 'convex' ? 'database backend' : 'application server';

      if (!this.withinRestartBudget(name)) {
        this.lastFailure = {
          name,
          code,
          signal,
          message:
            'The AeroGap ' + label + ' stopped ' + MAX_RESTARTS +
            ' times in under a minute and was not restarted again.',
          logFile: path.join(this.logDir, name + '.log'),
        };
        this.onStatus('failed', this.lastFailure.message);
        return;
      }

      this.onStatus('restarting', label + ' exited (code ' + code + ') - restarting');
      setTimeout(() => {
        if (this.shuttingDown) return;
        try {
          restart();
        } catch (err) {
          this.lastFailure = { name, message: String((err && err.message) || err) };
          this.onStatus('failed', this.lastFailure.message);
        }
      }, RESTART_DELAY_MS);
    });
  }

  /** Start both children. Does NOT wait for readiness - main.cjs polls /healthz. */
  async start() {
    this.ensureLayout();
    // Before anything spawns: the app server refuses to boot without this file.
    this.ensureEnvFile();
    this.onStatus('ports', 'Allocating local ports');
    await this.allocatePorts();

    this.onStatus('database', 'Starting the local database');
    this.startConvex();

    this.onStatus('server', 'Starting the application');
    this.startApp();

    return this.ports;
  }

  /**
   * Stop both children and wait for them to actually be gone.
   *
   * Order matters: the app depends on Convex, so it is stopped first and gets a
   * chance to finish in-flight work rather than having its database vanish
   * underneath it.
   */
  async stop() {
    this.shuttingDown = true;
    for (const name of ['app', 'convex']) {
      const child = this.children[name];
      if (!child) continue;
      this.children[name] = null;
      await killTree(child.pid);
    }
  }
}

module.exports = { Supervisor, findFreePort, isPortFree, killTree, PREFERRED, INSTANCE_NAME };
