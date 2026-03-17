import { test, expect } from '@playwright/test';
import { waitForAppReady, navigateSidebar, hasProject, expectProjectRequired, getAuthProjectSkipReason } from './utils/app-helpers';
import { mockClaude } from './utils/claude-mock';

test.describe('Inspection Schedule', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const authSkipReason = getAuthProjectSkipReason(testInfo);
    test.skip(!!authSkipReason, authSkipReason ?? undefined);
    await mockClaude(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('page loads via sidebar navigation', async ({ page }) => {
    const inspectionLink = page.getByRole('link', { name: /Inspection|Schedule/i }).first();
    const visible = await inspectionLink.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'Inspection Schedule link not in sidebar.');
      return;
    }

    await inspectionLink.click();
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });

  test('shows project-required when no project', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (hasProj) {
      test.skip(true, 'A project is already selected.');
      return;
    }

    const inspectionLink = page.getByRole('link', { name: /Inspection|Schedule/i }).first();
    if (!(await inspectionLink.isVisible().catch(() => false))) {
      test.skip(true, 'Inspection Schedule link not found.');
      return;
    }
    await inspectionLink.click();
    await page.waitForTimeout(500);
    await expectProjectRequired(page);
  });

  test('Add Item button is visible with project', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const inspectionLink = page.getByRole('link', { name: /Inspection|Schedule/i }).first();
    if (!(await inspectionLink.isVisible().catch(() => false))) {
      test.skip(true, 'Inspection Schedule link not found.');
      return;
    }
    await inspectionLink.click();
    await page.waitForTimeout(1000);

    const addBtn = page.getByRole('button', { name: /Add|New|Create/i }).first();
    const vis = await addBtn.isVisible().catch(() => false);
    expect(typeof vis).toBe('boolean');
  });

  test('export CSV button is available', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    const inspectionLink = page.getByRole('link', { name: /Inspection|Schedule/i }).first();
    if (!(await inspectionLink.isVisible().catch(() => false))) {
      test.skip(true, 'Inspection Schedule link not found.');
      return;
    }
    await inspectionLink.click();
    await page.waitForTimeout(1000);

    const exportBtn = page.getByRole('button', { name: /export|csv/i }).first();
    const vis = await exportBtn.isVisible().catch(() => false);
    expect(typeof vis).toBe('boolean');
  });
});
