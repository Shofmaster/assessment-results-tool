/**
 * App version, injected at build time from package.json by the `__APP_VERSION__`
 * define in vite.config.ts. Previously the About panel hardcoded a string that
 * had already drifted from package.json.
 *
 * The guard keeps this safe under vitest, which uses its own config without the
 * define.
 */
declare const __APP_VERSION__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
