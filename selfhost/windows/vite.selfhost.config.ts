/**
 * Vite config override for building the on-prem SPA bundle.
 *
 * WHY THIS FILE EXISTS
 * Vite loads .env, .env.local and friends from `envDir` (default: the project
 * root) and inlines every VITE_* value it finds. On a developer machine that
 * means the repo's .env.local - which holds the CLOUD Convex deployment URL and
 * Supabase credentials - gets baked into an artifact we ship to customers. An
 * early build of this pipeline did exactly that.
 *
 * The obvious defence, setting the unwanted variables to "" in the build
 * environment, does NOT work on Windows: assigning an empty string deletes the
 * variable, so the .env.local value flows through unopposed. Verified directly.
 *
 * So the isolation happens here instead. `envDir` points at this directory,
 * which contains no .env files, so nothing is read from disk and the only
 * source of VITE_* values is the build process's own environment.
 *
 * Everything else is inherited from the app's real config, so the on-prem
 * bundle is built exactly like the hosted one.
 *
 * NOTE: `root` is deliberately NOT overridden. Vite defaults it to
 * process.cwd(), and build-staging.ps1 runs the build from the repo root. An
 * earlier version computed it from import.meta.url via URL.pathname, which is
 * percent-encoded - "Aviation Quality Company" became "Aviation%20Quality%20..."
 * and the entry module could not be resolved.
 */
import { defineConfig, mergeConfig, type UserConfig } from 'vite';
// Extension included on purpose: Vite's native config loader warns on
// extensionless relative imports and will require it in a future major.
import baseConfigExport from '../../vite.config.ts';

const baseConfig = (
  typeof baseConfigExport === 'function'
    ? // Vite passes a ConfigEnv to function-style configs. The app's config is
      // currently a plain object, but handle both so this keeps working if it changes.
      (baseConfigExport as (env: { command: 'build'; mode: string }) => UserConfig)({
        command: 'build',
        mode: 'production',
      })
    : baseConfigExport
) as UserConfig;

export default defineConfig(
  mergeConfig(baseConfig, {
    // No .env files live in this directory - see the note above.
    envDir: import.meta.dirname,
  } satisfies UserConfig),
);
