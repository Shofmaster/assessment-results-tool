/**
 * Hosted runtime-config stub.
 *
 * index.html loads /config.js as a classic script before the app bundle.
 * Self-hosted installs never serve this file: the application server handles
 * that URL first and assigns window.__AVIATION_APP_CONFIG__ (see
 * selfhost/server/src/clientConfig.ts).
 *
 * On Vercel there is no application server. This file is copied to
 * dist/config.js and served as JavaScript. It deliberately does not assign
 * the global, so src/config/runtimeEnv.ts keeps the Vite build-time values.
 *
 * The file has to exist. vercel.json rewrites unknown paths to /index.html,
 * and X-Content-Type-Options: nosniff makes browsers refuse to execute that
 * HTML as a script. Do not put customer values or secrets here.
 */
