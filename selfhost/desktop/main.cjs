/**
 * AeroGap desktop shell.
 *
 * TWO MODES, ONE SHELL
 *
 *   desktop  This process OWNS the stack. supervisor.cjs starts the Convex
 *            backend and the application server as child processes on
 *            127.0.0.1, and they are killed when this window closes. No
 *            services, no administrator rights, no TLS, no hostname - which is
 *            what removes every question the installer used to ask.
 *
 *   server   The historical behaviour. The stack runs as three Windows
 *            Services installed elevated, reachable over the LAN by hostname
 *            and fronted by Caddy for TLS. This process is only a window onto
 *            it, and closing the window stops nothing.
 *
 * The mode is read from a marker file written at build time (see
 * resolveMode). It defaults to `server` so that an existing install, which has
 * no marker, keeps behaving exactly as it does today.
 *
 * WHY IT IS NOT TAURI
 * Tauri would be ~10 MB instead of ~150 MB and would reuse the WebView2 runtime
 * already present on Windows 10/11. It also requires the Rust toolchain and
 * MSVC build tools on every build machine, which this project does not
 * otherwise need. The logic here is small and framework-agnostic, so switching
 * later is cheap.
 */
const { app, BrowserWindow, shell, dialog, Menu, net, screen, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { Supervisor, INSTANCE_NAME } = require('./supervisor.cjs');
const { FirstRun } = require('./firstRun.cjs');
const windowState = require('./windowState.cjs');
const { buildMenu } = require('./menu.cjs');
const { UPDATE_PUBLIC_KEY_PEM } = require('./updateManifest.cjs');
const { checkForUpdate, downloadAndVerify, launchInstaller } = require('./updater.cjs');

/** Where the local application server listens in a server-mode install. */
const DEFAULT_URL = 'http://localhost:8080';

/** Read a `--flag=value` command-line argument. */
function argValue(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

/**
 * Install root - the directory holding convex-local-backend.exe, node.exe,
 * server.js and www\.
 *
 * A packaged shell lives at <install>\desktop\AeroGap.exe, so the root is two
 * levels up from the executable. Under `electron .` during development there is
 * no such layout, hence the explicit override.
 */
function resolveInstallDir() {
  const fromArg = argValue('aerogap-install-dir') || process.env.AEROGAP_INSTALL_DIR;
  if (fromArg) return path.resolve(fromArg);
  return path.resolve(path.dirname(process.execPath), '..');
}

/**
 * `desktop` or `server`.
 *
 * Written into the payload by build-staging.ps1 rather than inferred from the
 * filesystem: both builds ship the same binaries, so there is nothing to sniff.
 * Defaults to `server` because that is what every install predating this file
 * is, and guessing `desktop` there would start a second copy of a backend that
 * is already running as a service.
 */
function resolveMode(installDir) {
  const override = argValue('aerogap-mode') || process.env.AEROGAP_MODE;
  if (override === 'desktop' || override === 'server') return override;
  try {
    const marker = fs.readFileSync(path.join(installDir, 'aerogap-mode.txt'), 'utf8').trim();
    if (marker === 'desktop' || marker === 'server') return marker;
  } catch {
    // No marker - an install from before modes existed.
  }
  return 'server';
}

/** Per-user data root for a desktop install. */
function resolveDataRoot() {
  const fromArg = argValue('aerogap-data-root') || process.env.AEROGAP_DATA_ROOT;
  if (fromArg) return path.resolve(fromArg);
  const localAppData = process.env.LOCALAPPDATA || app.getPath('userData');
  return path.join(localAppData, 'AeroGap');
}

/**
 * Resolve the server URL for a SERVER-mode install. An installed shell reads it
 * from the same configuration the services use, so a non-default port does not
 * silently produce a window pointing at nothing.
 */
function resolveServerUrl() {
  const fromArg = argValue('aerogap-url');
  if (fromArg) return fromArg.replace(/\/+$/, '');
  if (process.env.AEROGAP_URL) return process.env.AEROGAP_URL.replace(/\/+$/, '');

  const programData = process.env.ProgramData || 'C:\\ProgramData';

  // Published by install.ps1 specifically for this process. config\.env is
  // restricted to Administrators and SYSTEM because it holds API keys, and this
  // shell runs as the logged-in user - so it cannot read the origin from there.
  // The origin is not a secret; it is in every user's address bar.
  try {
    const published = fs
      .readFileSync(path.join(programData, 'AeroGap', 'app-url.txt'), 'utf8')
      .trim()
      .replace(/\/+$/, '');
    if (published) return published;
  } catch {
    // Not published (older install) - fall through.
  }

  // Only works when running elevated, which is unusual. Kept because it makes
  // an admin-launched shell work against an install predating app-url.txt.
  try {
    const text = fs.readFileSync(path.join(programData, 'AeroGap', 'config', '.env'), 'utf8');
    const match = text.match(/^\s*APP_ORIGIN\s*=\s*(.+?)\s*$/m);
    if (match) return match[1].replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  } catch {
    // Expected for a non-elevated run.
  }

  return DEFAULT_URL;
}

const INSTALL_DIR = resolveInstallDir();
const MODE = resolveMode(INSTALL_DIR);
const DATA_ROOT = resolveDataRoot();

/**
 * In desktop mode the URL is not known until the supervisor has picked its
 * ports, so it is resolved during startup rather than at module load.
 */
let serverUrl = MODE === 'desktop' ? null : resolveServerUrl();

/** @type {Supervisor|null} */
let supervisor = null;
let mainWindow = null;

function logDir() {
  return MODE === 'desktop'
    ? path.join(DATA_ROOT, 'logs')
    : path.join(process.env.ProgramData || 'C:\\ProgramData', 'AeroGap', 'logs');
}

/**
 * The app icon, for surfaces that do not read it from the .exe resource.
 * Returns undefined when missing so BrowserWindow falls back rather than throws.
 */
function appIcon() {
  const file = path.join(__dirname, 'build', 'AeroGap.ico');
  try {
    if (!fs.existsSync(file)) return undefined;
    const image = nativeImage.createFromPath(file);
    return image.isEmpty() ? undefined : image;
  } catch {
    return undefined;
  }
}

/** Push a progress line to the splash, if it is still up. */
function reportStatus(text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('aerogap:status', text);
  }
}

/**
 * Probe /healthz. The server may still be starting.
 *
 * Uses Electron's net module rather than node:http or node:https, for two
 * reasons that both bit this code:
 *
 *   1. node:http throws ERR_INVALID_PROTOCOL on an https URL, and picking the
 *      module by scheme only moves the problem.
 *   2. node:https validates against Node's own bundled CA list, which does not
 *      include the Windows certificate store - so the internal CA the operator
 *      trusted for the browser would still be rejected here.
 *
 * Electron's net uses Chromium's stack, which reads the system store. The probe
 * therefore succeeds exactly when the real page load would.
 *
 * Never rejects: a failed probe is an expected state while the backend starts,
 * and an unhandled rejection here previously killed the retry loop outright.
 */
function checkHealth(timeoutMs = 4000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    try {
      const request = net.request({ method: 'GET', url: `${serverUrl}/healthz` });
      const timer = setTimeout(() => {
        try {
          request.abort();
        } catch {
          /* already gone */
        }
        finish(false);
      }, timeoutMs);

      request.on('response', (response) => {
        clearTimeout(timer);
        // Drain, or the socket is held open until GC.
        response.on('data', () => {});
        response.on('end', () => {});
        finish(response.statusCode === 200);
      });
      request.on('error', () => {
        clearTimeout(timer);
        finish(false);
      });
      request.end();
    } catch {
      finish(false);
    }
  });
}

/**
 * Wait for the server, then load it.
 *
 * In server mode this matters most at login right after a reboot: Windows
 * starts the services and the shell at roughly the same moment, and Convex
 * takes a few seconds to open its database. In desktop mode the same wait
 * covers the backend this process just spawned - and on a first run, the schema
 * deploy that follows it.
 */
async function loadWhenReady(win) {
  const deadline = Date.now() + 90_000;
  let attempt = 0;

  while (Date.now() < deadline) {
    // The user can close the splash while the backend is still coming up.
    // Touching webContents after that throws "Object has been destroyed", which
    // took down the whole startup path - so treat a closed window as a normal
    // exit rather than an error.
    if (!win || win.isDestroyed()) return true;

    // A child that exhausted its restart budget is never coming back; waiting
    // out the remaining timeout would just delay the error the user needs.
    if (supervisor && supervisor.lastFailure) return false;

    if (await checkHealth()) {
      if (win.isDestroyed()) return true;
      await win.loadURL(serverUrl);
      return true;
    }

    attempt += 1;
    if (!win.isDestroyed()) {
      win.webContents.send('aerogap:waiting', attempt);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

function showServerUnavailable() {
  // Closing the window during startup is a deliberate "never mind", not a
  // failure worth interrogating the user about.
  if (!mainWindow || mainWindow.isDestroyed()) {
    app.quit();
    return;
  }

  // The two modes fail for completely different reasons, and the server-mode
  // advice ("check the Windows Services") is actively misleading in desktop
  // mode, where there are none.
  const detail =
    MODE === 'desktop'
      ? (supervisor && supervisor.lastFailure
          ? `${supervisor.lastFailure.message}\n\n`
          : 'The AeroGap backend did not finish starting.\n\n') +
        `Details are in:\n    ${logDir()}`
      : 'The AeroGapApp and AeroGapConvex Windows Services provide the application. ' +
        'They may be stopped, still starting, or failing to start.\n\n' +
        'To check, run in an elevated PowerShell:\n' +
        '    Get-Service AeroGap*\n\n' +
        `If a service is stopped, its reason is in:\n    ${logDir()}`;

  const choice = dialog.showMessageBoxSync(mainWindow, {
    type: 'error',
    title: 'AeroGap is not responding',
    message: `Could not reach the AeroGap application server at ${serverUrl || 'the local server'}.`,
    detail,
    buttons: ['Retry', 'Open logs folder', 'Quit'],
    defaultId: 0,
    cancelId: 2,
  });

  if (choice === 0) {
    // A retry after a hard failure has to clear the failure and restart the
    // children, otherwise loadWhenReady bails out immediately on the stale one.
    if (supervisor) supervisor.lastFailure = null;
    startup();
  } else if (choice === 1) {
    shell.openPath(logDir());
    showServerUnavailable();
  } else {
    app.quit();
  }
}

function createWindow() {
  // Reopen where the user left it, validated against the displays that exist
  // now - a window restored onto a monitor that has since been unplugged is
  // running, listed in the taskbar, and invisible.
  const geometry = windowState.restore(app.getPath('userData'), screen.getAllDisplays());

  mainWindow = new BrowserWindow({
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
    minWidth: windowState.MINIMUM.width,
    minHeight: windowState.MINIMUM.height,
    show: false,
    backgroundColor: '#0a1628', // matches the app's theme-color, so no white flash
    title: 'AeroGap',
    // Explicit even though electron-builder embeds it in the .exe: a dev run
    // (`npm start`) has no embedded resource and would otherwise show the
    // default Electron icon, which is exactly the tell we are removing.
    icon: appIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // The shell renders a local web app; it must not hand that page Node.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    if (geometry.maximized) mainWindow.maximize();
    mainWindow.show();
  });

  // Saved on move/resize rather than only on close, so a crash or a forced
  // shutdown does not lose the position.
  let saveTimer = null;
  const rememberGeometry = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => windowState.save(app.getPath('userData'), mainWindow), 400);
  };
  mainWindow.on('resize', rememberGeometry);
  mainWindow.on('move', rememberGeometry);
  mainWindow.on('maximize', rememberGeometry);
  mainWindow.on('unmaximize', rememberGeometry);

  mainWindow.on('close', () => windowState.save(app.getPath('userData'), mainWindow));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Keep the window pinned to the local server. Anything else - a docs link, an
  // external site, an OAuth provider - belongs in the real browser, where the
  // user can see the address bar and judge it.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!serverUrl || new URL(url).origin !== new URL(serverUrl).origin) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  return mainWindow;
}

/**
 * Start the backend in desktop mode.
 *
 * Idempotent: a Retry after a failed start reuses the existing supervisor so
 * the ports and the instance secret stay stable across the attempt.
 */
async function ensureBackend() {
  if (MODE !== 'desktop') return;

  if (!supervisor) {
    supervisor = new Supervisor({
      installDir: INSTALL_DIR,
      dataRoot: DATA_ROOT,
      onStatus: (stage, detail) => {
        console.log(`[aerogap] ${stage}: ${detail || ''}`);
        if (detail) reportStatus(detail);
      },
    });
  }

  if (!supervisor.ports) {
    await supervisor.start();
    serverUrl = supervisor.appUrl;
  }
}

/**
 * Deploy the schema and functions into the local backend when needed.
 *
 * Runs on a fresh install and after an upgrade that changed the version. On
 * every other launch it is a marker-file read and returns immediately.
 *
 * Waits for Convex to answer first: the CLI talks to the backend this process
 * only just spawned, and on a cold machine that takes a few seconds.
 */
async function ensureSetup() {
  if (MODE !== 'desktop' || !supervisor) return;

  const firstRun = new FirstRun({
    installDir: INSTALL_DIR,
    dataRoot: DATA_ROOT,
    ports: supervisor.ports,
    instanceName: INSTANCE_NAME,
    onStatus: (text) => {
      console.log(`[aerogap] setup: ${text}`);
      reportStatus(text);
    },
  });

  if (firstRun.alreadyDeployed()) return;

  const convexReady = await waitForConvex();
  if (!convexReady) {
    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'AeroGap could not start the database',
      message: 'The local database did not become ready in time.',
      detail:
        'First-time setup needs the database backend to answer before it can continue.\n\n' +
        `Logs are in:\n    ${logDir()}`,
      buttons: ['Retry', 'Open logs folder', 'Quit'],
      defaultId: 0,
      cancelId: 2,
    });
    if (choice === 0) return ensureSetup();
    if (choice === 1) shell.openPath(logDir());
    app.quit();
    return;
  }

  try {
    await firstRun.ensure();
  } catch (err) {
    // A failed deploy leaves a running but empty backend: the app would load,
    // sign-in would work, and then every query would fail. That is far harder
    // to report than stopping here with the actual reason.
    console.error('[aerogap] first-run setup failed:', err);
    const detail = [
      String((err && err.message) || err),
      err && err.stderr ? `\n${String(err.stderr).slice(-2000)}` : '',
    ].join('');

    const choice = dialog.showMessageBoxSync({
      type: 'error',
      title: 'AeroGap could not finish setting up',
      message: 'The first-time setup did not complete, so the application is not ready to use.',
      detail: `${detail}\n\nLogs are in:\n    ${logDir()}`,
      buttons: ['Retry', 'Open logs folder', 'Quit'],
      defaultId: 0,
      cancelId: 2,
    });

    if (choice === 0) return ensureSetup();
    if (choice === 1) shell.openPath(logDir());
    app.quit();
    throw err;
  }
}

/** Poll the Convex backend directly - the CLI needs it before the app does. */
async function waitForConvex(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  const url = `http://127.0.0.1:${supervisor.ports.convex}/version`;
  while (Date.now() < deadline) {
    const reachable = await new Promise((resolve) => {
      const request = net.request({ method: 'GET', url });
      const timer = setTimeout(() => {
        try {
          request.abort();
        } catch {
          /* already gone */
        }
        resolve(false);
      }, 3000);
      request.on('response', (res) => {
        clearTimeout(timer);
        res.on('data', () => {});
        res.on('end', () => {});
        resolve(res.statusCode === 200);
      });
      request.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
      request.end();
    });
    if (reachable) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

/**
 * Help > Check for updates.
 *
 * Every outcome ends in a dialog. A menu item that appears to do nothing is
 * worse than one that reports "you are up to date" - and a REJECTED manifest
 * must be shown, not swallowed, because it means either our release process is
 * broken or someone is interfering with the channel.
 */
/**
 * The .aqp.json path from a command line, if there is one.
 *
 * Windows passes the file as a bare argument when a user double-clicks it. The
 * shell's own flags all start with `--`, and in a dev run argv also carries the
 * script path, so match on the extension rather than on position.
 */
function fileArgument(argv) {
  return (argv || []).find((arg) => /\.aqp\.json$/i.test(arg)) || null;
}

/**
 * Hand a project bundle to the SPA.
 *
 * The path is passed as a query parameter rather than read here: this process
 * has no business parsing a customer's project file, and the import logic
 * already exists in the app.
 */
function openProjectFile(filePath) {
  if (!filePath || !mainWindow || mainWindow.isDestroyed() || !serverUrl) return;
  if (!fs.existsSync(filePath)) return;
  void mainWindow.loadURL(`${serverUrl}/projects?import=${encodeURIComponent(filePath)}`);
}

async function runUpdateCheck() {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const ask = (options) => (win ? dialog.showMessageBoxSync(win, options) : dialog.showMessageBoxSync(options));

  const result = await checkForUpdate({
    feedUrl: process.env.AEROGAP_UPDATE_FEED || '',
    currentVersion: app.getVersion(),
    channel: process.env.AEROGAP_UPDATE_CHANNEL || 'stable',
  });

  if (result.status === 'not-configured') {
    ask({
      type: 'info',
      title: 'Updates',
      message: 'Automatic updates are not configured for this installation.',
      detail: 'Your administrator distributes AeroGap updates manually.',
      buttons: ['Close'],
    });
    return;
  }

  if (result.status === 'unreachable') {
    ask({
      type: 'info',
      title: 'Updates',
      message: 'Could not reach the update server.',
      detail: `AeroGap will try again later. Nothing has changed.

${result.detail || ''}`,
      buttons: ['Close'],
    });
    return;
  }

  if (result.status === 'rejected') {
    // Deliberately alarming. A signature failure is not a network hiccup.
    ask({
      type: 'error',
      title: 'Update refused',
      message: 'An update was offered but could not be verified, so it was not installed.',
      detail:
        `Reason: ${result.reason}
${result.detail || ''}

` +
        'AeroGap only installs updates signed by Aviation Quality Company. ' +
        'If this repeats, contact support before installing anything manually.',
      buttons: ['Close'],
    });
    return;
  }

  if (result.status === 'up-to-date') {
    ask({
      type: 'info',
      title: 'Updates',
      message: `AeroGap ${app.getVersion()} is up to date.`,
      buttons: ['Close'],
    });
    return;
  }

  const manifest = result.manifest;
  const proceed = ask({
    type: 'question',
    title: 'Update available',
    message: `AeroGap ${manifest.version} is available.`,
    detail:
      `${manifest.notes || ''}

AeroGap will close while it installs, then reopen. ` +
      'Your data is not affected.',
    buttons: ['Download and install', 'Not now'],
    defaultId: 0,
    cancelId: 1,
  });
  if (proceed !== 0) return;

  reportStatus(`Downloading AeroGap ${manifest.version}...`);
  const download = await downloadAndVerify(manifest, {
    downloadDir: path.join(DATA_ROOT, 'updates'),
  });

  if (!download.ok) {
    ask({
      type: 'error',
      title: 'Update failed',
      message: 'The update could not be verified and was discarded.',
      detail:
        `Reason: ${download.reason}
${download.detail || ''}

` +
        'Your installation is unchanged.',
      buttons: ['Close'],
    });
    return;
  }

  // Stop the backend BEFORE handing over: the installer must be able to replace
  // convex-local-backend.exe and node.exe, and a running child holds both open.
  // Inno would otherwise fail the copy and roll back while still exiting 0.
  if (supervisor) await supervisor.stop();

  try {
    launchInstaller(download.path);
  } catch (err) {
    ask({
      type: 'error',
      title: 'Update failed',
      message: 'The verified installer could not be started.',
      detail: String((err && err.message) || err),
      buttons: ['Close'],
    });
    return;
  }

  app.quit();
}

async function startup() {
  try {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : createWindow();
    await win.loadFile(path.join(__dirname, 'loading.html'));

    await ensureBackend();
    await ensureSetup();

    const ok = await loadWhenReady(win);
    if (!ok) {
      showServerUnavailable();
      return;
    }
    // Launched by double-clicking a project bundle. Done after the SPA is up,
    // because the route it navigates to does not exist until then.
    openProjectFile(fileArgument(process.argv));
  } catch (err) {
    // Anything thrown here previously surfaced as an unhandled rejection: the
    // splash stayed up forever with no dialog and no way to tell what happened.
    console.error('[aerogap] startup failed:', err);
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'AeroGap could not start',
      message: 'The application shell failed to start.',
      detail: String((err && err.stack) || err),
      buttons: ['Quit'],
    });
    app.quit();
  }
}

/**
 * Stop the backend before the process exits.
 *
 * Electron's `will-quit` is the last point at which async work can still be
 * awaited, and the event has to be cancelled once to get that chance -
 * otherwise the process exits with the children still running, and orphaned
 * copies hold the SQLite file and the TCP ports so the NEXT launch fails.
 */
let shutdownDone = false;
async function shutdown(event) {
  if (MODE !== 'desktop' || !supervisor || shutdownDone) return;
  event.preventDefault();
  try {
    await supervisor.stop();
  } catch (err) {
    console.error('[aerogap] error stopping backend:', err);
  }
  shutdownDone = true;
  app.quit();
}

// One window per machine. A second launch (Start Menu, taskbar, shortcut)
// should surface the existing window rather than open a duplicate. In desktop
// mode this is load-bearing rather than a nicety: two shells would start two
// backends against one SQLite database.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // Double-clicking a .aqp.json while AeroGap is already open launches a
      // SECOND process, which the single-instance lock immediately quits. Its
      // command line arrives here, and is the only place the file path exists.
      openProjectFile(fileArgument(argv));
    }
  });

  app.on('will-quit', (event) => {
    void shutdown(event);
  });

  // A console kill (taskkill, Ctrl+C in a dev run) does not raise will-quit, so
  // the children would survive the parent. Best-effort synchronous cleanup.
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.on(signal, () => {
      if (supervisor) void supervisor.stop();
      app.quit();
    });
  }

  app.whenReady().then(() => {
    // A minimal menu: keep the accelerators people expect (copy/paste, reload,
    // zoom, devtools) without a File menu that implies desktop-app semantics
    // this shell does not yet have. Phase 4 replaces this with a real one.
    Menu.setApplicationMenu(
      buildMenu({
        getWindow: () => mainWindow,
        getServerUrl: () => serverUrl,
        getLogDir: logDir,
        getDataRoot: () => DATA_ROOT,
        mode: MODE,
        onCheckForUpdates: runUpdateCheck,
        updatesEnabled: Boolean(UPDATE_PUBLIC_KEY_PEM && (process.env.AEROGAP_UPDATE_FEED || '').trim()),
      }),
    );

    startup();
  });

  app.on('window-all-closed', () => app.quit());
}
