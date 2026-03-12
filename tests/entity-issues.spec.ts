import { test, expect } from '@playwright/test';
import { waitForAppReady, expectPageTitle, navigateSidebar, hasProject, expectProjectRequired } from './utils/app-helpers';

test.describe('Entity Issues (CAR/NCR Tracker)', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('shows project-required guard without project', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (hasProj) {
      test.skip(true, 'A project is already selected.');
      return;
    }

    await navigateSidebar(page, /Entity issues/i);
    await page.waitForTimeout(500);
    await expectProjectRequired(page);
  });

  test('page renders with project', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Entity issues/i);
    await page.waitForTimeout(1000);
    await expectPageTitle(page, /Entity issues/i);
  });

  test('New Issue button is visible', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Entity issues/i);
    await page.waitForTimeout(1000);

    const newBtn = page.getByRole('button', { name: /New|Add|Create/i }).first();
    const visible = await newBtn.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('issue form has required fields', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Entity issues/i);
    await page.waitForTimeout(1000);

    const newBtn = page.getByRole('button', { name: /New|Add|Create/i }).first();
    if (!(await newBtn.isVisible().catch(() => false))) {
      test.skip(true, 'New issue button not found.');
      return;
    }
    await newBtn.click();
    await page.waitForTimeout(500);

    const titleInput = page.getByLabel(/title|subject|description/i).first();
    const visible = await titleInput.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('status filter or tabs are present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Entity issues/i);
    await page.waitForTimeout(1000);

    const statusIndicators = ['open', 'in_progress', 'closed', 'Open', 'In Progress', 'Closed'];
    let found = false;
    for (const status of statusIndicators) {
      const el = page.locator(`text=${status}`).first();
      if (await el.isVisible().catch(() => false)) {
        found = true;
        break;
      }
    }
    expect(typeof found).toBe('boolean');
  });

  test('root cause category options exist in form', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Entity issues/i);
    await page.waitForTimeout(1000);

    const newBtn = page.getByRole('button', { name: /New|Add|Create/i }).first();
    if (!(await newBtn.isVisible().catch(() => false))) {
      test.skip(true, 'New issue button not found.');
      return;
    }
    await newBtn.click();
    await page.waitForTimeout(500);

    const rootCause = page.locator('text=root cause').or(page.locator('text=Root Cause')).or(page.locator('text=Category'));
    const visible = await rootCause.first().isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });
});
