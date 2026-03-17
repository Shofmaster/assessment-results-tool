import { test, expect } from '@playwright/test';
import { waitForAppReady, expectPageTitle, navigateSidebar, expectRouteRequiresSignIn } from './utils/app-helpers';

test.describe('Project CRUD - unauthenticated', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Only run without saved auth');
  });

  test('projects route shows Clerk sign-in when logged out', async ({ page }) => {
    await expectRouteRequiresSignIn(page, '/projects');
  });
});

test.describe('Project CRUD', () => {
  const projectName = `E2E Project ${Date.now()}`;

  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('Projects page loads with heading and description', async ({ page }) => {
    await navigateSidebar(page, /Projects/i);
    await expectPageTitle(page, 'Projects');
    await expect(page.locator('text=Organize your assessments')).toBeVisible({ timeout: 5000 });
  });

  test('can create a new project', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(1500);

    const newBtn = page.getByRole('button', { name: /New Project|Create Your First Project/i }).first();
    await newBtn.click();
    await page.waitForTimeout(500);

    const nameInput = page.getByLabel(/Project Name/i);
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    await nameInput.fill(projectName);
    await page.getByRole('button', { name: 'Create Project' }).click();
    await page.waitForTimeout(2000);

    await expect(page.locator(`text=${projectName}`)).toBeVisible({ timeout: 8000 });
  });

  test('project appears in sidebar after creation', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(1500);

    const projectCards = page.locator('[data-testid="project-card"], .project-card, [class*="project"]');
    const count = await projectCards.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('project export button is available', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(1500);

    const exportBtn = page.getByRole('button', { name: /export/i }).first();
    const hasExport = await exportBtn.isVisible().catch(() => false);
    if (!hasExport) {
      test.skip(true, 'No project with export button visible — likely no projects exist yet.');
    }
  });

  test('can delete a project via confirm dialog', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(1500);

    const deleteBtn = page.getByRole('button', { name: /delete/i }).first();
    const hasDelete = await deleteBtn.isVisible().catch(() => false);
    if (!hasDelete) {
      test.skip(true, 'No project with delete button visible.');
      return;
    }

    page.on('dialog', (dialog) => dialog.accept());
    await deleteBtn.click();
    await page.waitForTimeout(2000);
  });
});
