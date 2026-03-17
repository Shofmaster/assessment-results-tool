/**
 * Load PLAYWRIGHT_AUTH_EMAIL and PLAYWRIGHT_AUTH_PASSWORD from a file (if present)
 * then run the Playwright auth-setup test. Lets you avoid typing credentials in the shell.
 *
 * Looks for (first wins):
 *   - playwright/.env
 *   - .env.playwright
 *
 * Lines should be: PLAYWRIGHT_AUTH_EMAIL=... and PLAYWRIGHT_AUTH_PASSWORD=...
 * Comments (#) and empty lines are ignored.
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const candidates = [
  join(root, 'playwright', '.env'),
  join(root, '.env.playwright'),
];

for (const file of candidates) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.replace(/#.*/, '').trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && value && (key === 'PLAYWRIGHT_AUTH_EMAIL' || key === 'PLAYWRIGHT_AUTH_PASSWORD')) {
      process.env[key] = value;
    }
  }
  break;
}

process.env.PLAYWRIGHT_RUN_AUTH_SETUP = 'true';

const result = spawnSync(
  'npx',
  ['playwright', 'test', 'tests/setup-auth.spec.ts', '--project=auth-setup', '--headed'],
  { stdio: 'inherit', shell: true, cwd: root, env: process.env }
);
process.exit(result.status ?? 1);
