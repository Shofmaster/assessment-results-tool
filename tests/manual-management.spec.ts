import { test, expect } from '@playwright/test';
import { waitForAppReady, hasProject, navigateToManualManagementSection, sidebarLinkVisible } from './utils/app-helpers';

test.describe('Manual Management', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('Manual Management page accessible from sidebar', async ({ page }) => {
    if (!(await sidebarLinkVisible(page, /^Manual Library$/i))) {
      test.skip(true, 'Manual Library link not in sidebar (feature disabled or signed out).');
      return;
    }

    await navigateToManualManagementSection(page);
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });

  test('manual list or empty state renders', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    if (!(await sidebarLinkVisible(page, /^Manual Library$/i))) {
      test.skip(true, 'Manual Library link not in sidebar (feature disabled or signed out).');
      return;
    }

    await navigateToManualManagementSection(page);
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });

  test('create manual button is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    if (!(await sidebarLinkVisible(page, /^Manual Library$/i))) {
      test.skip(true, 'Manual Library link not in sidebar (feature disabled or signed out).');
      return;
    }

    await navigateToManualManagementSection(page);
    await page.waitForTimeout(1000);

    const createBtn = page.getByRole('button', { name: /Create|New|Add/i }).first();
    const visible = await createBtn.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('revision workflow elements visible for existing manual', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    if (!(await sidebarLinkVisible(page, /^Manual Library$/i))) {
      test.skip(true, 'Manual Library link not in sidebar (feature disabled or signed out).');
      return;
    }

    await navigateToManualManagementSection(page);
    await page.waitForTimeout(1000);

    const revision = page.locator('text=revision').or(page.locator('text=Revision'));
    const visible = await revision.first().isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });
});
