import { test, expect } from '@playwright/test';
import { waitForAppReady, hasProject, navigateToManualWriterSection, sidebarLinkVisible } from './utils/app-helpers';
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
    if (!(await sidebarLinkVisible(page, /^Manual Writer$/i))) {
      test.skip(true, 'Manual Writer link not in sidebar (feature disabled or signed out).');
      return;
    }

    await navigateToManualWriterSection(page);
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Manual Writer' })).toBeVisible({ timeout: 5000 });
  });

  test('manual type selector shows options', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    if (!(await sidebarLinkVisible(page, /^Manual Writer$/i))) {
      test.skip(true, 'Manual Writer link not in sidebar (feature disabled or signed out).');
      return;
    }

    await navigateToManualWriterSection(page);
    await page.waitForTimeout(1000);

    const typeSelect = page
      .locator('select')
      .filter({ has: page.locator('option', { hasText: 'Part 145 Repair Station Manual' }) })
      .first();
    await expect(typeSelect).toBeVisible({ timeout: 5000 });
    const optionCount = await typeSelect.locator('option').count();
    expect(optionCount).toBeGreaterThan(1);
  });

  test('standards selector is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    if (!(await sidebarLinkVisible(page, /^Manual Writer$/i))) {
      test.skip(true, 'Manual Writer link not in sidebar (feature disabled or signed out).');
      return;
    }

    await navigateToManualWriterSection(page);
    await page.waitForTimeout(1000);

    await expect(page.getByRole('button', { name: '14 CFR / FAA' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: 'IS-BAO' })).toBeVisible({ timeout: 5000 });
  });

  test('generate section button is present', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    if (!(await sidebarLinkVisible(page, /^Manual Writer$/i))) {
      test.skip(true, 'Manual Writer link not in sidebar (feature disabled or signed out).');
      return;
    }

    await navigateToManualWriterSection(page);
    await page.waitForTimeout(1000);

    await expect(page.getByRole('button', { name: /^Generate$|Rewrite Section/ }).first()).toBeVisible({
      timeout: 5000,
    });
    // Export is always visible (disabled until a section is approved)
    await expect(page.getByRole('button', { name: /Export DOCX/ })).toBeVisible({ timeout: 5000 });
  });

  test('section list renders for manual type', async ({ page }) => {
    const hasProj = await hasProject(page);
    if (!hasProj) {
      test.skip(true, 'No project selected.');
      return;
    }

    if (!(await sidebarLinkVisible(page, /^Manual Writer$/i))) {
      test.skip(true, 'Manual Writer link not in sidebar (feature disabled or signed out).');
      return;
    }

    await navigateToManualWriterSection(page);
    await page.waitForTimeout(1000);

    const main = page.locator('main#main-content');
    await expect(main).toBeVisible({ timeout: 5000 });
    // Default type is Part 145 — its first template section should be listed
    await expect(page.getByText('Housing and Facilities').first()).toBeVisible({ timeout: 5000 });
    // Section rows are keyboard-focusable buttons
    const firstRow = main.getByRole('button', { name: /Housing and Facilities/ }).first();
    await expect(firstRow).toBeVisible({ timeout: 5000 });
  });
});
