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

  test('Check all / Uncheck all are placed above agent grid in Configure Simulation', async ({ page }) => {
    const heading = page.locator('h1:has-text("Audit Simulation")');
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Audit page not visible (e.g. behind auth)');
      return;
    }

    const configureCard = page.locator('h2:has-text("Configure Simulation")').first();
    await configureCard.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});

    const checkAll = page.getByRole('button', { name: /Check all/i });
    const uncheckAll = page.getByRole('button', { name: /Uncheck all/i });

    await expect(checkAll).toBeVisible();
    await expect(uncheckAll).toBeVisible();

    // Buttons should be inside the same section as "Click to select or deselect participants"
    const participantsText = page.locator('p:has-text("Click to select or deselect participants")');
    await expect(participantsText).toBeVisible();

    // Check all should appear after the participants text (in document order)
    const participantsBox = await participantsText.boundingBox();
    const checkAllBox = await checkAll.boundingBox();
    expect(participantsBox).toBeTruthy();
    expect(checkAllBox).toBeTruthy();
    if (participantsBox && checkAllBox) {
      expect(checkAllBox.y).toBeGreaterThanOrEqual(participantsBox.y);
    }

    // Agent grid (first card in the participants grid) should be below the buttons
    const participantsGroup = page.getByRole('group', { name: 'Select or clear all participants' });
    const grid = participantsGroup.locator('.. >> div.grid >> div').first();
    if (await grid.isVisible()) {
      const gridBox = await grid.boundingBox();
      if (checkAllBox && gridBox) {
        expect(gridBox.y).toBeGreaterThan(checkAllBox.y);
      }
    }
  });
});
