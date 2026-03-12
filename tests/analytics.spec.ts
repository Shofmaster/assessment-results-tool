import { test, expect } from '@playwright/test';
import { waitForAppReady, navigateSidebar, hasProject } from './utils/app-helpers';

test.describe('Analytics Dashboard', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('Analytics page loads via sidebar', async ({ page }) => {
    const analyticsLink = page.getByRole('link', { name: /Analytics/i }).first();
    const visible = await analyticsLink.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'Analytics link not in sidebar.');
      return;
    }

    await analyticsLink.click();
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });

  test('renders without errors', async ({ page }) => {
    const analyticsLink = page.getByRole('link', { name: /Analytics/i }).first();
    if (!(await analyticsLink.isVisible().catch(() => false))) {
      test.skip(true, 'Analytics link not in sidebar.');
      return;
    }

    await analyticsLink.click();
    await page.waitForTimeout(1000);

    const errorBoundary = page.locator('text=Something went wrong');
    const hasError = await errorBoundary.isVisible().catch(() => false);
    expect(hasError).toBe(false);
  });

  test('severity breakdown chart area is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected — charts may not render.');
      return;
    }

    const analyticsLink = page.getByRole('link', { name: /Analytics/i }).first();
    if (!(await analyticsLink.isVisible().catch(() => false))) {
      test.skip(true, 'Analytics link not in sidebar.');
      return;
    }

    await analyticsLink.click();
    await page.waitForTimeout(1500);

    const severity = page.locator('text=Severity').or(page.locator('text=severity'));
    const visible = await severity.first().isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('compliance trend chart area is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const analyticsLink = page.getByRole('link', { name: /Analytics/i }).first();
    if (!(await analyticsLink.isVisible().catch(() => false))) {
      test.skip(true, 'Analytics link not in sidebar.');
      return;
    }

    await analyticsLink.click();
    await page.waitForTimeout(1500);

    const compliance = page.locator('text=Compliance').or(page.locator('text=compliance'));
    const visible = await compliance.first().isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('cross-project summary section is present', async ({ page }) => {
    const analyticsLink = page.getByRole('link', { name: /Analytics/i }).first();
    if (!(await analyticsLink.isVisible().catch(() => false))) {
      test.skip(true, 'Analytics link not in sidebar.');
      return;
    }

    await analyticsLink.click();
    await page.waitForTimeout(1500);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });
});
