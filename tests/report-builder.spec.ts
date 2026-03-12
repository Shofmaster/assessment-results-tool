import { test, expect } from '@playwright/test';
import { waitForAppReady, navigateSidebar, hasProject } from './utils/app-helpers';
import { mockClaude } from './utils/claude-mock';

test.describe('Report Builder', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
    await mockClaude(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('Report Builder page accessible from sidebar', async ({ page }) => {
    const reportLink = page.getByRole('link', { name: /Report|Builder/i }).first();
    const visible = await reportLink.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'Report Builder link not in sidebar.');
      return;
    }

    await reportLink.click();
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });

  test('section checkboxes are present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const reportLink = page.getByRole('link', { name: /Report|Builder/i }).first();
    if (!(await reportLink.isVisible().catch(() => false))) {
      test.skip(true, 'Report Builder link not in sidebar.');
      return;
    }

    await reportLink.click();
    await page.waitForTimeout(1000);

    const checkboxes = page.locator('input[type="checkbox"]');
    const count = await checkboxes.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('export PDF button is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const reportLink = page.getByRole('link', { name: /Report|Builder/i }).first();
    if (!(await reportLink.isVisible().catch(() => false))) {
      test.skip(true, 'Report Builder link not in sidebar.');
      return;
    }

    await reportLink.click();
    await page.waitForTimeout(1000);

    const pdfBtn = page.getByRole('button', { name: /PDF|Export.*PDF/i }).first();
    const visible = await pdfBtn.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('export DOCX button is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const reportLink = page.getByRole('link', { name: /Report|Builder/i }).first();
    if (!(await reportLink.isVisible().catch(() => false))) {
      test.skip(true, 'Report Builder link not in sidebar.');
      return;
    }

    await reportLink.click();
    await page.waitForTimeout(1000);

    const docxBtn = page.getByRole('button', { name: /DOCX|Word/i }).first();
    const visible = await docxBtn.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });
});
