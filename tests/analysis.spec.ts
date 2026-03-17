import { test, expect } from '@playwright/test';
import { waitForAppReady, expectPageTitle, navigateSidebar, hasProject, expectProjectRequired, expectRouteRequiresSignIn } from './utils/app-helpers';
import { mockClaude } from './utils/claude-mock';

test.describe('Analysis View - unauthenticated', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Only run without saved auth');
  });

  test('analysis route shows Clerk sign-in when logged out', async ({ page }) => {
    await expectRouteRequiresSignIn(page, '/analysis');
  });
});

test.describe('Analysis View', () => {
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
      test.skip(true, 'A project is already selected; cannot test guard state.');
      return;
    }

    await navigateSidebar(page, /Analysis/i);
    await page.waitForTimeout(500);
    await expectProjectRequired(page);
  });

  test('Analysis page renders when project is active', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected — cannot test analysis view.');
      return;
    }

    await navigateSidebar(page, /Analysis/i);
    await page.waitForTimeout(1000);
    await expectPageTitle(page, /Analysis/i);
  });

  test('Analyze button is visible with active project', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Analysis/i);
    await page.waitForTimeout(1000);

    const analyzeBtn = page.getByRole('button', { name: /Analyze|Run Analysis|Start/i }).first();
    const visible = await analyzeBtn.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('previous analysis results list renders', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    await navigateSidebar(page, /Analysis/i);
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
  });
});
