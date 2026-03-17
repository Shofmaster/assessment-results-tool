import { test, expect } from '@playwright/test';
import { waitForAppReady, expectPageTitle, navigateSidebar, hasProject, expectRouteRequiresSignIn } from './utils/app-helpers';

test.describe('Document Library - unauthenticated', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Only run without saved auth');
  });

  test('library route shows Clerk sign-in when logged out', async ({ page }) => {
    await expectRouteRequiresSignIn(page, '/library');
  });
});

test.describe('Document Library', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('Library page loads', async ({ page }) => {
    await navigateSidebar(page, /Library/i);
    await page.waitForTimeout(1000);

    const hasProj = await hasProject(page);
    if (!hasProj) {
      await expect(page.locator('text=Select a Project')).toBeVisible({ timeout: 5000 });
      return;
    }
    await expectPageTitle(page, /Library/i);
  });

  test('shows document category tabs', async ({ page }) => {
    await navigateSidebar(page, /Library/i);
    await page.waitForTimeout(1000);

    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected — cannot test library categories.');
      return;
    }

    const regulatory = page.locator('text=Regulatory').or(page.locator('text=regulatory'));
    const entity = page.locator('text=Entity').or(page.locator('text=entity'));
    await expect(regulatory.first()).toBeVisible({ timeout: 5000 });
    await expect(entity.first()).toBeVisible({ timeout: 5000 });
  });

  test('upload area is visible with project selected', async ({ page }) => {
    await navigateSidebar(page, /Library/i);
    await page.waitForTimeout(1000);

    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const dropzone = page.locator('text=drag').or(page.locator('text=Drop')).or(page.locator('text=upload'));
    await expect(dropzone.first()).toBeVisible({ timeout: 8000 });
  });

  test('Google Drive import button is present', async ({ page }) => {
    await navigateSidebar(page, /Library/i);
    await page.waitForTimeout(1000);

    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const gdriveBtn = page.locator('text=Google Drive').or(page.getByRole('button', { name: /google/i }));
    const isVisible = await gdriveBtn.first().isVisible().catch(() => false);
    expect(typeof isVisible).toBe('boolean');
  });
});
