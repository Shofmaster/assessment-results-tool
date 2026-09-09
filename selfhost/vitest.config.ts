import { defineConfig } from 'vitest/config';

/**
 * Standalone from the app's vitest config: this project is plain Node server
 * code, so it needs no jsdom environment and no `src/` setup file. Without this
 * file vitest walks up and picks the app's config, whose include globs do not
 * cover selfhost/ and which would load a browser environment for no reason.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['__tests__/**/*.test.ts', 'server/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
