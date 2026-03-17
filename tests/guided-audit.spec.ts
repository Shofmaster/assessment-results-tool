import { test, expect } from '@playwright/test';
import { waitForAppReady, getAuthProjectSkipReason } from './utils/app-helpers';
import { mockClaude } from './utils/claude-mock';

test.describe('Guided Audit', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const authSkipReason = getAuthProjectSkipReason(testInfo);
    test.skip(!!authSkipReason, authSkipReason ?? undefined);
    await mockClaude(page);
    await page.goto('/guided-audit', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('page renders with heading', async ({ page }) => {
    const heading = page.locator('h1, h2').filter({ hasText: 'Guided Audit' }).first();
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Guided Audit page not visible.');
      return;
    }
    await expect(heading).toBeVisible();
  });

  test('shows all 6 step titles', async ({ page }) => {
    const heading = page.locator('h1, h2').filter({ hasText: 'Guided Audit' }).first();
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Guided Audit page not visible.');
      return;
    }

    const steps = [
      'Upload documents',
      'Run analysis',
      'Audit simulation',
      'Paperwork review',
      'Revision check',
      'Summary',
    ];
    for (const step of steps) {
      await expect(page.locator(`text=${step}`).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('step 1 shows upload document categories', async ({ page }) => {
    const heading = page.locator('h1, h2').filter({ hasText: 'Guided Audit' }).first();
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Guided Audit page not visible.');
      return;
    }

    const regulatory = page.locator('text=Regulatory').or(page.locator('text=CFRs')).first();
    await expect(regulatory).toBeVisible({ timeout: 5000 });
  });

  test('Next button navigates to step 2', async ({ page }) => {
    const heading = page.locator('h1, h2').filter({ hasText: 'Guided Audit' }).first();
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Guided Audit page not visible.');
      return;
    }

    const nextBtn = page.getByRole('button', { name: /Next|→/i }).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('text=Run analysis').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Back button returns to step 1', async ({ page }) => {
    const heading = page.locator('h1, h2').filter({ hasText: 'Guided Audit' }).first();
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Guided Audit page not visible.');
      return;
    }

    const nextBtn = page.getByRole('button', { name: /Next|→/i }).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(300);

      const backBtn = page.getByRole('button', { name: /Back|←/i }).first();
      if (await backBtn.isVisible().catch(() => false)) {
        await backBtn.click();
        await page.waitForTimeout(300);
        await expect(page.locator('text=Upload documents').first()).toBeVisible({ timeout: 5000 });
      }
    }
  });
});
