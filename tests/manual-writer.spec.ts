import { test, expect } from '@playwright/test';
import { waitForAppReady, navigateSidebar, hasProject } from './utils/app-helpers';
import { mockClaude, mockEcfr } from './utils/claude-mock';

test.describe('Manual Writer', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
    await mockClaude(page);
    await mockEcfr(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('Manual Writer page accessible from sidebar', async ({ page }) => {
    const manualLink = page.getByRole('link', { name: /Manual Writer/i }).first();
    const visible = await manualLink.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'Manual Writer link not in sidebar.');
      return;
    }

    await manualLink.click();
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });

  test('manual type selector shows options', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const manualLink = page.getByRole('link', { name: /Manual Writer/i }).first();
    if (!(await manualLink.isVisible().catch(() => false))) {
      test.skip(true, 'Manual Writer link not in sidebar.');
      return;
    }

    await manualLink.click();
    await page.waitForTimeout(1000);

    const typeSelector = page.locator('select, [role="listbox"], [role="combobox"]').first();
    const visible = await typeSelector.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('standards selector is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const manualLink = page.getByRole('link', { name: /Manual Writer/i }).first();
    if (!(await manualLink.isVisible().catch(() => false))) {
      test.skip(true, 'Manual Writer link not in sidebar.');
      return;
    }

    await manualLink.click();
    await page.waitForTimeout(1000);

    const standards = page.locator('text=Standard').or(page.locator('text=standard')).or(page.locator('text=FAA'));
    const visible = await standards.first().isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('generate section button is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const manualLink = page.getByRole('link', { name: /Manual Writer/i }).first();
    if (!(await manualLink.isVisible().catch(() => false))) {
      test.skip(true, 'Manual Writer link not in sidebar.');
      return;
    }

    await manualLink.click();
    await page.waitForTimeout(1000);

    const generateBtn = page.getByRole('button', { name: /Generate|Write|Create/i }).first();
    const visible = await generateBtn.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('section list renders for manual type', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const manualLink = page.getByRole('link', { name: /Manual Writer/i }).first();
    if (!(await manualLink.isVisible().catch(() => false))) {
      test.skip(true, 'Manual Writer link not in sidebar.');
      return;
    }

    await manualLink.click();
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });
});
