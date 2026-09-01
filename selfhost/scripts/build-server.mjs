/**
 * Bundles the self-hosted application server into a single dist/server.js.
 *
 * The server imports handlers from the repo's `api/` directory and Convex's
 * generated client, both of which are TypeScript with ESM-style `.js` import
 * specifiers. Bundling resolves that graph once at build time so the runtime
 * image needs no TypeScript toolchain.
 *
 * Third-party packages stay external and are installed normally in the image.
 * Bundling them would inline the Anthropic and Clerk SDKs, which makes patching
 * a vendor CVE a rebuild-from-source exercise instead of an `npm update`.
 */
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const selfhostRoot = resolve(here, '..');

const result = await build({
  entryPoints: [resolve(selfhostRoot, 'server/src/index.ts')],
  outfile: resolve(selfhostRoot, 'dist/server.js'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  // Leave node_modules alone — see the note above about vendor patching.
  packages: 'external',
  sourcemap: true,
  // Keep names intact: stack traces from an on-prem install arrive as pasted
  // text in a support ticket, and minified frames make them useless.
  minify: false,
  keepNames: true,
  logLevel: 'info',
  metafile: true,
  banner: {
    // Convex's generated client and some SDK code paths reach for CommonJS
    // globals that do not exist in an ESM bundle. Shim them at the top.
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "import { fileURLToPath as __fileURLToPath } from 'node:url';",
      "import { dirname as __dirname_fn } from 'node:path';",
      'const require = __createRequire(import.meta.url);',
      'const __filename = __fileURLToPath(import.meta.url);',
      'const __dirname = __dirname_fn(__filename);',
    ].join('\n'),
  },
});

const outputs = Object.entries(result.metafile.outputs).filter(([f]) => f.endsWith('.js'));
for (const [file, meta] of outputs) {
  console.log(`[build] ${file}  ${(meta.bytes / 1024).toFixed(1)} kB`);
}
