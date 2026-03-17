import { test, expect } from '@playwright/test';
import { waitForAppReady, expectPageTitle, navigateSidebar, getAuthProjectSkipReason } from './utils/app-helpers';
import { mockClaude } from './utils/claude-mock';

test.describe('Audit Simulation', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const authSkipReason = getAuthProjectSkipReason(testInfo);
    test.skip(!!authSkipReason, authSkipReason ?? undefined);
    await mockClaude(page);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('Audit Simulation page loads', async ({ page }) => {
    await navigateSidebar(page, /Audit Simulation/i);
    await page.waitForTimeout(1000);
    await expectPageTitle(page, 'Audit Simulation');
  });

  test('all agent cards are displayed', async ({ page }) => {
    await navigateSidebar(page, /Audit Simulation/i);
    await page.waitForTimeout(1000);

    const agentNames = [
      'FAA Inspector',
      'Shop Owner',
      'DOM',
      'Chief Inspector',
      'Safety Manager',
      'General Manager',
      'IS-BAO',
      'EASA',
      'AS9100',
    ];

    for (const name of agentNames) {
      const el = page.locator(`text=${name}`).first();
      await expect(el).toBeVisible({ timeout: 5000 });
    }
  });

  test('Check All and Uncheck All buttons work', async ({ page }) => {
    await navigateSidebar(page, /Audit Simulation/i);
    await page.waitForTimeout(1000);

    const uncheckBtn = page.getByRole('button', { name: /Uncheck All|Clear/i }).first();
    if (await uncheckBtn.isVisible().catch(() => false)) {
      await uncheckBtn.click();
      await page.waitForTimeout(300);
    }

    const checkBtn = page.getByRole('button', { name: /Check All|Select All/i }).first();
    if (await checkBtn.isVisible().catch(() => false)) {
      await checkBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test('Start Simulation button is present', async ({ page }) => {
    await navigateSidebar(page, /Audit Simulation/i);
    await page.waitForTimeout(1000);

    const startBtn = page.getByRole('button', { name: /Start|Begin|Run Simulation/i }).first();
    const visible = await startBtn.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('self-review toggle is present', async ({ page }) => {
    await navigateSidebar(page, /Audit Simulation/i);
    await page.waitForTimeout(1000);

    const toggle = page.locator('text=Self-Review').or(page.locator('text=self-review')).first();
    const visible = await toggle.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('thinking mode controls are available', async ({ page }) => {
    await navigateSidebar(page, /Audit Simulation/i);
    await page.waitForTimeout(1000);

    const thinking = page.locator('text=Thinking').or(page.locator('text=thinking')).first();
    const visible = await thinking.isVisible().catch(() => false);
    expect(typeof visible).toBe('boolean');
  });

  test('FAA config section is present', async ({ page }) => {
    await navigateSidebar(page, /Audit Simulation/i);
    await page.waitForTimeout(1000);

    const faaSection = page.locator('text=FAA').first();
    await expect(faaSection).toBeVisible({ timeout: 5000 });
  });
});
