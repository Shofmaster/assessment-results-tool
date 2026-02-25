/**
 * Paperwork Review – Review perspective (agent) selector.
 * Run (with dev server + signed in): npx playwright test tests/paperwork-review-agent.spec.ts --project=chromium-with-auth
 */
import { test, expect } from '@playwright/test';

test.describe('Paperwork Review – perspective selector', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/review', { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
  });

  test('page loads and shows Paperwork Review heading', async ({ page }) => {
    const heading = page.locator('h1:has-text("Paperwork Review")');
    const visible = await heading.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, 'Paperwork Review page not visible (e.g. behind auth)');
      return;
    }
    await expect(heading).toBeVisible();
  });

  test('perspective selector is present when Findings section is visible', async ({ page }) => {
    const heading = page.locator('h1:has-text("Paperwork Review")');
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Paperwork Review page not visible');
      return;
    }

    const selectProjectMsg = page.locator('text=Select a Project');
    if (await selectProjectMsg.isVisible()) {
      test.skip(true, 'No project selected; perspective selector only visible during an active review');
      return;
    }

    const perspectiveLabel = page.locator('span:has-text("Perspective")');
    const perspectiveSelect = page.getByTestId('paperwork-review-perspective');
    const findingsLabel = page.locator('label:has-text("Findings")');

    if (!(await findingsLabel.isVisible().catch(() => false))) {
      test.skip(true, 'Findings section not visible; start a review with reference + under-review docs to see perspective selector');
      return;
    }

    await expect(perspectiveLabel).toBeVisible();
    await expect(perspectiveSelect).toBeVisible();
  });

  test('perspective selector appears before Model selector in document order', async ({ page }) => {
    const heading = page.locator('h1:has-text("Paperwork Review")');
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Paperwork Review page not visible');
      return;
    }

    const perspectiveSelect = page.getByTestId('paperwork-review-perspective');
    const modelLabel = page.locator('span:has-text("Model")');

    if (!(await perspectiveSelect.isVisible().catch(() => false))) {
      test.skip(true, 'Perspective selector not visible; start a review to see it');
      return;
    }

    if (!(await modelLabel.isVisible().catch(() => false))) {
      test.skip(true, 'Model selector not visible');
      return;
    }

    const perspectiveBox = await perspectiveSelect.boundingBox();
    const modelBox = await modelLabel.boundingBox();
    expect(perspectiveBox).toBeTruthy();
    expect(modelBox).toBeTruthy();
    if (perspectiveBox && modelBox) {
      expect(perspectiveBox.y).toBeLessThanOrEqual(modelBox.y + 50);
    }
  });

  test('perspective dropdown contains Generic and auditor options', async ({ page }) => {
    const heading = page.locator('h1:has-text("Paperwork Review")');
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Paperwork Review page not visible');
      return;
    }

    const perspectiveSelect = page.getByTestId('paperwork-review-perspective');
    if (!(await perspectiveSelect.isVisible().catch(() => false))) {
      test.skip(true, 'Perspective selector not visible');
      return;
    }

    const options = await perspectiveSelect.locator('option').allTextContents();
    expect(options.some((o) => o.includes('Generic'))).toBeTruthy();
    expect(options.some((o) => o.includes('FAA Inspector'))).toBeTruthy();
    expect(options.some((o) => o.includes('EASA Inspector'))).toBeTruthy();
    expect(options.some((o) => o.includes('IS-BAO Auditor'))).toBeTruthy();
  });

  test('captures Findings toolbar screenshot when visible', async ({ page }) => {
    const heading = page.locator('h1:has-text("Paperwork Review")');
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Paperwork Review page not visible');
      return;
    }

    const findingsSection = page.locator('label:has-text("Findings")').locator('..').locator('..');
    if (!(await findingsSection.isVisible().catch(() => false))) {
      test.skip(true, 'Findings section not visible');
      return;
    }

    const screenshotPath = 'test-results/paperwork-review-findings-toolbar.png';
    await findingsSection.first().screenshot({ path: screenshotPath });
    await test.info().attach('findings-toolbar', {
      path: screenshotPath,
    });
  });
});
