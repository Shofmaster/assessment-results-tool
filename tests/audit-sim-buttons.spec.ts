/**
 * Audit Simulation page – button size and layout checks.
 * Run (with dev server + signed in): npx playwright test tests/audit-sim-buttons.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test';

test.describe('Audit Simulation – buttons', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/audit', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test('inspects button and card sizes when configure view is visible', async ({ page }) => {
    const heading = page.locator('h1:has-text("Audit Simulation")');
    const visible = await heading.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'Audit page not visible (e.g. behind auth)');
      return;
    }

    const configureCard = page.locator('h2:has-text("Configure Simulation")').first();
    await configureCard.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

    const getBox = (loc: ReturnType<typeof page.locator>) =>
      loc.evaluate((el) => {
        const r = (el as HTMLElement).getBoundingClientRect();
        return { w: r.width, h: r.height };
      });

    const startBtn = page.getByRole('button', { name: /Start Audit Simulation/i });
    if (await startBtn.isVisible()) {
      const startBox = await getBox(startBtn);
      expect(startBox.h).toBeGreaterThan(0);
      expect(startBox.w).toBeGreaterThan(0);
      await test.info().attach('start-button-box', {
        body: `Start button: ${Math.round(startBox.w)}×${Math.round(startBox.h)}px`,
        contentType: 'text/plain',
      });
    }

    const modelSelect = page.locator('select').first();
    if (await modelSelect.isVisible()) {
      const selectBox = await getBox(modelSelect);
      await test.info().attach('model-select-box', {
        body: `Model select: ${Math.round(selectBox.w)}×${Math.round(selectBox.h)}px`,
        contentType: 'text/plain',
      });
    }
  });
});
