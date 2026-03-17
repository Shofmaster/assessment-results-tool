/**
 * One-off setup: run once to save signed-in session for specs that need auth.
 *
 * Automatic sign-in (recommended):
 *   Option A: Set env and run
 *     PLAYWRIGHT_AUTH_EMAIL=you@example.com PLAYWRIGHT_AUTH_PASSWORD=secret npm run test:auth:save
 *   Option B: Create playwright/.env (or .env.playwright in project root) with:
 *     PLAYWRIGHT_AUTH_EMAIL=you@example.com
 *     PLAYWRIGHT_AUTH_PASSWORD=yourpassword
 *   Then run: npm run test:auth:save
 *
 * Manual sign-in: run without env vars; sign in in the browser when it opens; the test
 * waits for the main nav then saves storage state.
 *
 * Run: npm run test:auth:save  (or npx playwright test tests/setup-auth.spec.ts --project=chromium)
 * Then run specs with saved auth: npx playwright test … --project=chromium-with-auth
 */
import { test } from '@playwright/test';
import { mkdirSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_FILE = path.join(__dirname, '..', 'playwright', '.auth', 'user.json');

const AUTH_EMAIL = process.env.PLAYWRIGHT_AUTH_EMAIL;
const AUTH_PASSWORD = process.env.PLAYWRIGHT_AUTH_PASSWORD;
const useAutoSignIn = Boolean(AUTH_EMAIL && AUTH_PASSWORD);
const allowAuthSetup =
  process.env.npm_lifecycle_event === 'test:auth:save' ||
  process.env.PLAYWRIGHT_RUN_AUTH_SETUP === 'true';

/** Wait for Clerk sign-in form to be visible and return a locator for the email input. */
async function waitForSignInForm(page: import('@playwright/test').Page) {
  const container = page.locator('#clerk-sign-in');
  await container.waitFor({ state: 'visible', timeout: 25_000 });
  // Clerk may show loading or transition; wait for an email-type input
  const emailInput = page.getByRole('textbox', { name: /email|identifier/i })
    .or(page.locator('#clerk-sign-in input[type="email"]'))
    .or(page.locator('#clerk-sign-in input[name="identifier"]'))
    .first();
  await emailInput.waitFor({ state: 'visible', timeout: 15_000 });
  return emailInput;
}

/** Click the primary action button (Continue / Sign in). */
async function clickContinue(page: import('@playwright/test').Page) {
  const btn = page.getByRole('button', { name: /continue|sign in/i }).first();
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
}

test.describe('Auth setup (save storage state)', () => {
  test('sign in then save storage state', async ({ page }) => {
    test.skip(
      !allowAuthSetup,
      'Auth setup is opt-in. Run `npm run test:auth:save` or set PLAYWRIGHT_RUN_AUTH_SETUP=true.',
    );
    test.setTimeout(180_000); // Clerk + Convex can be slow

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 20_000 });

    if (useAutoSignIn) {
      const emailInput = await waitForSignInForm(page);
      await emailInput.fill(AUTH_EMAIL!);
      await clickContinue(page);

      // Clerk often uses two steps: email → then password. Wait for password field or main nav to appear.
      const mainNav = page.getByRole('navigation', { name: /main navigation/i });
      const passwordInput = page.getByPlaceholder(/password/i)
        .or(page.locator('#clerk-sign-in input[type="password"]'))
        .or(page.getByLabel(/password/i))
        .first();
      const errorAccount = page.getByText(/couldn't find your account|doesn't exist/i);
      const errorPassword = page.getByText(/incorrect password|invalid password|wrong password/i);

      let which: 'nav' | 'password' | 'error' = 'password';
      try {
        which = await Promise.race([
          mainNav.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'nav' as const),
          passwordInput.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'password' as const),
          errorAccount.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'error' as const),
        ]);
      } catch {
        throw new Error(
          'After entering email, neither the main app nav nor the password field appeared in time. Check that Clerk is loaded and email/password sign-in is enabled.'
        );
      }

      if (which === 'error') {
        throw new Error(
          'Sign-in failed: Clerk says the account was not found. Create an account with this email (or use Sign Up) and try again.'
        );
      }
      if (which === 'password') {
        await passwordInput.fill(AUTH_PASSWORD!);
        await clickContinue(page);
      }

      // Wait for success or surface errors (only if we still need to wait for nav)
      if (which !== 'nav') {
        await Promise.race([
          mainNav.waitFor({ state: 'visible', timeout: 90_000 }),
          errorAccount.waitFor({ state: 'visible', timeout: 12_000 }).then(() =>
            Promise.reject(new Error(
              'Sign-in failed: Clerk says the account was not found. Create an account with this email (or use Sign Up) and try again.'
            ))
          ),
          errorPassword.waitFor({ state: 'visible', timeout: 12_000 }).then(() =>
            Promise.reject(new Error(
              'Sign-in failed: Clerk says the password is incorrect. Check PLAYWRIGHT_AUTH_PASSWORD.'
            ))
          ),
        ]);
      }
    } else {
      await page
        .getByRole('navigation', { name: /main navigation/i })
        .waitFor({ state: 'visible', timeout: 120_000 });
    }

    const context = page.context();
    mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
    await context.storageState({ path: AUTH_FILE });
  });
});
