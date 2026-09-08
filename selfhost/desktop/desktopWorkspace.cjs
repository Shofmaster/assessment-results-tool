/**
 * Which WORKSPACE a desktop install opens: online or offline.
 *
 * TWO WORKSPACES, ONE WINDOW
 *
 *   online   The window loads the hosted AeroGap application itself, so the
 *            user sees exactly the companies, projects and documents of their
 *            hosted account, live, and signs in the way the website does. The
 *            data lives in the hosted deployment. Needs an internet connection;
 *            nothing runs locally beyond the window.
 *
 *   offline  The install this product always had: the Convex backend and the
 *            application server run as child processes on 127.0.0.1 and the
 *            data lives on this machine. Works with no network at all. Local
 *            accounts sign in here; so can a hosted account, when online.
 *
 * The two hold DIFFERENT data. Convex has no offline store, so a hosted
 * workspace cannot be read without a connection - that is a property of the
 * database, not a limitation of this shell. Work moves between the two with the
 * project and organisation bundle export/import the app already provides.
 *
 * THE RULE
 *   - No hosted URL in the build: offline, always. Behaves exactly as before.
 *   - Preference 'offline' (the DEFAULT): offline, without probing the network.
 *     The desktop product is the local workspace; the hosted account reaches
 *     it through sign-in and the company mirror (see AUTH.md), not by showing
 *     the website in the window.
 *   - Preference 'auto' (opt-in, Workspace menu): online when the hosted
 *     application answers, and when it does not the user is ASKED - work
 *     offline, retry, or quit - rather than silently dropped into a workspace
 *     whose data is not the one they expect.
 *
 * Kept free of Electron so it can be tested; the shell supplies the network
 * probe and the dialogs.
 */
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('./desktopAuth.cjs');

const PREFERENCE_FILE = 'workspace.json';

/** Normalise a hosted app URL to an https origin, or null when unusable. */
function normalizeHostedUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    // Only https: this URL receives the user's hosted session. A plain-http
    // override in a config file would downgrade every sign-in on the machine.
    if (url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * The hosted application's origin, or null when this build has none.
 *
 * `HOSTED_APP_URL=` in config\.env overrides the build (a site with its own
 * hosted tenant), and an EMPTY value there switches the online workspace off
 * entirely - the same file-based opt-out pattern as AUTH_MODE=local.
 *
 * @param {{installDir: string, configDir: string}} options
 * @returns {string|null}
 */
function resolveHostedAppUrl({ installDir, configDir }) {
  let env = {};
  try {
    env = parseEnv(fs.readFileSync(path.join(configDir, '.env'), 'utf8'));
  } catch {
    // No .env yet - first launch.
  }
  if (Object.prototype.hasOwnProperty.call(env, 'HOSTED_APP_URL')) {
    return normalizeHostedUrl(env.HOSTED_APP_URL);
  }
  const build = readJson(path.join(installDir, 'build-config.json'));
  return normalizeHostedUrl(build.HOSTED_APP_URL);
}

/**
 * @typedef {'auto'|'offline'} WorkspacePreference
 * The user's standing choice. 'offline' is the default: the local workspace,
 * every launch, no probe. 'auto' is the opt-in: online when available. There
 * is deliberately no 'online' - a preference that can only be honoured with a
 * connection is not a preference, it is a hope; 'auto' already means "online
 * whenever possible".
 */
const DEFAULT_PREFERENCE = 'offline';

/** @returns {WorkspacePreference} */
function readWorkspacePreference(configDir) {
  const data = readJson(path.join(configDir, PREFERENCE_FILE));
  return data.workspace === 'auto' ? 'auto' : DEFAULT_PREFERENCE;
}

/** @param {WorkspacePreference} preference */
function writeWorkspacePreference(configDir, preference) {
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, PREFERENCE_FILE),
    `${JSON.stringify({ workspace: preference === 'auto' ? 'auto' : DEFAULT_PREFERENCE }, null, 2)}\n`,
    'utf8',
  );
}

/**
 * Decide the workspace from the facts. Pure.
 *
 * @param {object} facts
 * @param {string|null} facts.hostedUrl        from resolveHostedAppUrl
 * @param {WorkspacePreference} facts.preference
 * @param {boolean|null} facts.reachable       result of probing hostedUrl; null = not probed
 * @returns {'online'|'offline'|'ask'}  'ask' = online wanted but unreachable
 */
function decideWorkspace({ hostedUrl, preference, reachable }) {
  if (!hostedUrl) return 'offline';
  if (preference === 'offline') return 'offline';
  return reachable === true ? 'online' : 'ask';
}

/**
 * Route the SPA starts on in the online workspace.
 *
 * Not the root: signed out, the hosted app shows the marketing landing page
 * there, which is the wrong thing inside a program the user already installed.
 * On any other route the app shows the sign-in card, or the workspace when
 * already signed in.
 */
const ONLINE_START_PATH = '/splash';

module.exports = {
  PREFERENCE_FILE,
  DEFAULT_PREFERENCE,
  ONLINE_START_PATH,
  normalizeHostedUrl,
  resolveHostedAppUrl,
  readWorkspacePreference,
  writeWorkspacePreference,
  decideWorkspace,
};
