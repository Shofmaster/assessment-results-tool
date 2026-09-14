/**
 * Pure helpers for the desktop shell main process.
 *
 * Kept free of Electron so they can be unit-tested under Node. main.cjs wires
 * them to app.getPath / process.argv / the live window.
 */

/** Where the local application server listens in a server-mode install. */
const DEFAULT_SERVER_URL = 'http://localhost:8080';

/** Read a `--flag=value` command-line argument from an argv-like list. */
function argValue(name, argv = process.argv) {
  const prefix = `--${name}=`;
  const found = (argv || []).find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

/**
 * `desktop` or `server`.
 *
 * Marker file wins over nothing; CLI/env override everything. Defaults to
 * `server` so installs that predate the marker keep the historical behaviour.
 *
 * @param {string} installDir
 * @param {{readFileSync?: Function, argv?: string[], env?: NodeJS.ProcessEnv}} [io]
 */
function resolveMode(installDir, io = {}) {
  const argv = io.argv || process.argv;
  const env = io.env || process.env;
  const override = argValue('aerogap-mode', argv) || env.AEROGAP_MODE;
  if (override === 'desktop' || override === 'server') return override;
  try {
    const read = io.readFileSync || require('node:fs').readFileSync;
    const marker = read(require('node:path').join(installDir, 'aerogap-mode.txt'), 'utf8').trim();
    if (marker === 'desktop' || marker === 'server') return marker;
  } catch {
    // No marker - an install from before modes existed.
  }
  return 'server';
}

/**
 * Resolve the server URL for a SERVER-mode install.
 *
 * @param {{argv?: string[], env?: NodeJS.ProcessEnv, readFileSync?: Function, programData?: string}} [io]
 */
function resolveServerUrl(io = {}) {
  const argv = io.argv || process.argv;
  const env = io.env || process.env;
  const fromArg = argValue('aerogap-url', argv);
  if (fromArg) return fromArg.replace(/\/+$/, '');
  if (env.AEROGAP_URL) return env.AEROGAP_URL.replace(/\/+$/, '');

  const programData = io.programData || env.ProgramData || 'C:\\ProgramData';
  const read = io.readFileSync || require('node:fs').readFileSync;
  const path = require('node:path');

  try {
    const published = read(path.join(programData, 'AeroGap', 'app-url.txt'), 'utf8')
      .trim()
      .replace(/\/+$/, '');
    if (published) return published;
  } catch {
    // Not published (older install) - fall through.
  }

  try {
    const text = read(path.join(programData, 'AeroGap', 'config', '.env'), 'utf8');
    const match = text.match(/^\s*APP_ORIGIN\s*=\s*(.+?)\s*$/m);
    if (match) return match[1].replace(/^["']|["']$/g, '').replace(/\/+$/, '');
  } catch {
    // Expected for a non-elevated run.
  }

  return DEFAULT_SERVER_URL;
}

/**
 * True when `target` is one of the origins the application itself is served from.
 * @param {URL} target
 * @param {(string|null|undefined)[]} bases
 */
function isAppOrigin(target, bases) {
  return (bases || []).some((base) => {
    if (!base) return false;
    try {
      return new URL(base).origin === target.origin;
    } catch {
      return false;
    }
  });
}

/**
 * Windows passes a double-clicked bundle as a bare argument. Match on the
 * extension rather than position: the shell's own flags start with `--`, and
 * in a dev run argv also carries the script path.
 * @param {string[]} argv
 * @returns {string|null}
 */
function fileArgument(argv) {
  return (argv || []).find((arg) => /\.aq[po]\.json$/i.test(arg)) || null;
}

/**
 * Only http(s) URLs may leave the shell via openExternal.
 * @param {string} url
 */
function isSafeExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

module.exports = {
  DEFAULT_SERVER_URL,
  argValue,
  resolveMode,
  resolveServerUrl,
  isAppOrigin,
  fileArgument,
  isSafeExternalUrl,
};
