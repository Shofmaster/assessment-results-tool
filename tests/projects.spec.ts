import { test, expect } from '@playwright/test';
import {
  waitForAppReady,
  expectRouteRequiresSignIn,
  openCompanyProjectsPageIfPossible,
} from './utils/app-helpers';

test.describe('Project CRUD - unauthenticated', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Only run without saved auth');
  });

  test('projects route shows Clerk sign-in when logged out', async ({ page }) => {
    await expectRouteRequiresSignIn(page, '/projects');
  });
});

test.describe('Project CRUD', () => {
  const projectName = `E2E Project ${Date.now()}`;

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('legacy /projects redirects to logbook', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(page).toHaveURL(/\/logbook/);
  });

  test('company projects page loads when user has access', async ({ page }) => {
    const opened = await openCompanyProjectsPageIfPossible(page);
    if (!opened) {
      test.skip(true, 'No company project management access or no companies.');
      return;
    }
    await expect(page.getByRole('heading', { name: /Projects —/ })).toBeVisible({ timeout: 12_000 });
    await expect(page.getByText(/Create or delete projects for this company/i)).toBeVisible({
      timeout: 5000,
    });
  });

  test('can create a project from company projects page', async ({ page }) => {
    const opened = await openCompanyProjectsPageIfPossible(page);
    if (!opened) {
      test.skip(true, 'No company project management access or no companies.');
      return;
    }

    await page.getByLabel(/^Name$/i).fill(projectName);
    await page.getByRole('button', { name: 'Create project' }).click();
    await page.waitForTimeout(2000);
    await expect(page.getByText(projectName, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
  });
});
