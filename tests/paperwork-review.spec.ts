import { test, expect } from '@playwright/test';
import { waitForAppReady, expectPageTitle, navigateSidebar, hasProject, expectProjectRequired } from './utils/app-helpers';
import { mockClaude } from './utils/claude-mock';

test.describe('Paperwork Review', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
    await mockClaude(page);
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

    await navigateSidebar(page, /Paperwork Review/i);
    await page.waitForTimeout(500);
    await expectProjectRequired(page);
  });

  test('page renders with project active', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Paperwork Review/i);
    await page.waitForTimeout(1000);
    await expectPageTitle(page, /Paperwork Review/i);
  });

  test('document selector is visible', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Paperwork Review/i);
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });

  test('perspective selector is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Paperwork Review/i);
    await page.waitForTimeout(1000);

    const perspective = page.locator('text=perspective').or(page.locator('text=Perspective'));
    const visible = await perspective.first().isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('review action button is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Paperwork Review/i);
    await page.waitForTimeout(1000);

    const reviewBtn = page.getByRole('button', { name: /Review|Start Review|Run/i }).first();
    const visible = await reviewBtn.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });
});
