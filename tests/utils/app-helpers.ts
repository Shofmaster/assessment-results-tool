/**
 * Shared helpers for AeroGap Playwright E2E tests.
 */
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Page, expect, type TestInfo } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAVED_AUTH_STATE = path.join(__dirname, '..', '..', 'playwright', '.auth', 'user.json');

/** Wait for app to be ready: either main nav (authenticated) or sign-in form (unauthenticated). */
export async function waitForAppReady(page: Page, timeout = 30_000): Promise<'authenticated' | 'unauthenticated'> {
  const nav = page.getByRole('navigation', { name: /main navigation/i });
  const signIn = page.locator('#clerk-sign-in');

  const result = await Promise.race([
    nav.waitFor({ state: 'visible', timeout }).then(() => 'authenticated' as const),
    signIn.waitFor({ state: 'visible', timeout }).then(() => 'unauthenticated' as const),
  ]).catch(async () => {
    // If we timed out, check for MissingConfig to give a clearer error
    const setupRequired = page.locator('text=Setup required');
    if (await setupRequired.isVisible().catch(() => false)) {
      throw new Error(
        'App shows "Setup required" - ensure VITE_CLERK_PUBLISHABLE_KEY and VITE_CONVEX_URL are set in .env.local',
      );
    }
    const loading = page.getByText(/Loading/i);
    if (await loading.isVisible().catch(() => false)) {
      throw new Error(
        `App stuck on "Loading" after ${timeout}ms - Clerk or Convex may be slow or unreachable. Try increasing the timeout.`,
      );
    }
    const navVisible = await nav.isVisible().catch(() => false);
    return navVisible ? 'authenticated' : 'unauthenticated';
  });
  return result;
}

/** Open a route and assert the unauthenticated Clerk sign-in gate is shown. */
export async function expectRouteRequiresSignIn(page: Page, route: string): Promise<void> {
  await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  const state = await waitForAppReady(page, 50_000);
  expect(state).toBe('unauthenticated');
  await expect(page.locator('#clerk-sign-in')).toBeVisible({ timeout: 15_000 });
}

/** Return a skip reason when an authenticated Playwright project cannot run. */
export function getAuthProjectSkipReason(testInfo: TestInfo): string | null {
  if (testInfo.project.name !== 'chromium-with-auth') {
    return 'Requires authenticated session';
  }
  if (!existsSync(SAVED_AUTH_STATE)) {
    return 'Missing saved Playwright auth state. Run `npm run test:auth:save` first.';
  }
  return null;
}

/** Assert the main page heading/title is visible. */
export async function expectPageTitle(page: Page, title: string | RegExp): Promise<void> {
  const heading = page.locator('h1, h2').filter({ hasText: title }).first();
  await expect(heading).toBeVisible({ timeout: 10_000 });
}

/** Assert the "Select a Project" card is shown (when no project is active). */
export async function expectProjectRequired(page: Page): Promise<void> {
  await expect(page.locator('text=Select a Project')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: /go to projects/i })).toBeVisible();
}

/** Check if "Select a Project" card is visible. */
export async function hasProjectRequired(page: Page): Promise<boolean> {
  return page.locator('text=Select a Project').isVisible().catch(() => false);
}

/** Check if project switcher shows a project (not "No Project Selected"). */
export async function hasProject(page: Page): Promise<boolean> {
  const noProjectBtn = page.getByRole('button', { name: /No Project Selected/i });
  const noProject = await noProjectBtn.isVisible().catch(() => false);
  return !noProject;
}

/** Click a sidebar nav link by its label (exact or partial match). */
export async function navigateSidebar(page: Page, label: string | RegExp): Promise<void> {
  const nav = page.getByRole('navigation', { name: /main navigation/i });
  const link = nav.getByRole('link', { name: label });
  await link.click();
}

/** Open Manual Writer via the sidebar section dropdown (no dedicated nav link when already in Manuals). */
export async function navigateToManualWriterSection(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: /select section/i }).selectOption('manual-writer');
  await page.waitForURL(/\/manual-writer/, { timeout: 15_000 }).catch(() => {});
}

/** Open Manual Management via the sidebar section dropdown (label "Manuals"). */
export async function navigateToManualManagementSection(page: Page): Promise<void> {
  await page.getByRole('combobox', { name: /select section/i }).selectOption('manual-management');
  await page.waitForURL(/\/manual-management/, { timeout: 15_000 }).catch(() => {});
}
