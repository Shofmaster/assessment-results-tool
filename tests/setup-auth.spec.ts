/**
 * One-off setup: run once to save signed-in session for specs that need auth
 * (e.g. menu-organization). Opens the app; you sign in in the browser; the
 * test waits for the main nav then saves storage state to playwright/.auth/user.json.
 *
 * Run: npx playwright test tests/setup-auth.spec.ts --project=chromium
 * Then run menu audit with saved auth: npx playwright test tests/menu-organization.spec.ts --project=chromium-with-auth
 */
import { test } from '@playwright/test';
import * as path from 'path';

const AUTH_FILE = path.join(__dirname, '..', 'playwright', '.auth', 'user.json');

test.describe('Auth setup (save storage state)', () => {
  test('wait for sign-in then save storage state', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page
      .getByRole('navigation', { name: /main navigation/i })
      .waitFor({ state: 'visible', timeout: 120_000 });
    const context = page.context();
    await context.storageState({ path: AUTH_FILE });
  });
});
