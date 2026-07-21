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

/**
 * Navigate to `/companies/:id/projects` when the user is staff (Companies table) or tenant admin/manager (Settings).
 * Returns false if no entry point is available.
 */
export async function openCompanyProjectsPageIfPossible(page: Page): Promise<boolean> {
  await page.goto('/companies', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForTimeout(800);
  const projectsBtn = page.getByRole('button', { name: 'Projects', exact: true }).first();
  if (await projectsBtn.isVisible().catch(() => false)) {
    await projectsBtn.click();
    try {
      await page.waitForURL(/\/companies\/[^/]+\/projects/, { timeout: 12_000 });
    } catch {
      /* still check URL below */
    }
    if (page.url().includes('/companies/') && page.url().includes('/projects')) return true;
  }

  await page.goto('/settings', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await page.waitForTimeout(800);
  const card = page.locator('div.glass').filter({ has: page.getByRole('heading', { name: 'Company projects' }) });
  const link = card.getByRole('link').first();
  if (!(await link.isVisible().catch(() => false))) return false;
  await link.click();
  try {
    await page.waitForURL(/\/companies\/[^/]+\/projects/, { timeout: 12_000 });
  } catch {
    /* still check URL below */
  }
  return page.url().includes('/companies/') && page.url().includes('/projects');
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

/** True when a sidebar nav link with the given name is visible (signed-in + feature enabled). */
export async function sidebarLinkVisible(page: Page, label: string | RegExp): Promise<boolean> {
  const nav = page.getByRole('navigation', { name: /main navigation/i });
  return nav.getByRole('link', { name: label }).isVisible().catch(() => false);
}

/** Open Manual Writer via its sidebar nav link (Modules group). */
export async function navigateToManualWriterSection(page: Page): Promise<void> {
  await navigateSidebar(page, /^Manual Writer$/i);
  await page.waitForURL(/\/manual-writer/, { timeout: 15_000 }).catch(() => {});
}

/** Open the Manual Library via its sidebar nav link (Modules group). */
export async function navigateToManualManagementSection(page: Page): Promise<void> {
  await navigateSidebar(page, /^Manual Library$/i);
  await page.waitForURL(/\/manual-management/, { timeout: 15_000 }).catch(() => {});
}
