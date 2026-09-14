/**
 * Where the desktop shell learns the update feed URL and public key.
 *
 * Priority:
 *   1. process.env.AEROGAP_UPDATE_FEED / AEROGAP_UPDATE_PUBLIC_KEY (ops override)
 *   2. build-config.json UPDATE_FEED_URL / UPDATE_PUBLIC_KEY_PEM (baked at staging)
 *   3. the compile-time constant in updateManifest.cjs (empty until a key exists)
 *
 * An empty feed or key means Help > Check for updates stays hidden and updates
 * are distributed manually - the correct default until Aviation Quality Company
 * publishes a signed feed.
 */
const fs = require('node:fs');
const path = require('node:path');
const { UPDATE_PUBLIC_KEY_PEM: BUILTIN_KEY } = require('./updateManifest.cjs');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * @param {{installDir: string, env?: NodeJS.ProcessEnv}} options
 * @returns {{feedUrl: string, publicKeyPem: string, channel: string, configured: boolean}}
 */
function resolveUpdateConfig({ installDir, env = process.env }) {
  const build = readJson(path.join(installDir, 'build-config.json'));
  const str = (v) => (typeof v === 'string' ? v.trim() : '');

  const feedUrl =
    str(env.AEROGAP_UPDATE_FEED) || str(build.UPDATE_FEED_URL) || '';
  const publicKeyPem =
    str(env.AEROGAP_UPDATE_PUBLIC_KEY) ||
    str(build.UPDATE_PUBLIC_KEY_PEM) ||
    str(BUILTIN_KEY) ||
    '';
  const channel = str(env.AEROGAP_UPDATE_CHANNEL) || str(build.UPDATE_CHANNEL) || 'stable';

  return {
    feedUrl,
    publicKeyPem,
    channel,
    configured: Boolean(feedUrl && publicKeyPem),
  };
}

module.exports = { resolveUpdateConfig };
