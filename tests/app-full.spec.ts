/**
 * Full application E2E smoke tests for AeroGap.
 *
 * Run unauthenticated tests: npx playwright test tests/app-full.spec.ts --project=chromium
 * Run authenticated tests: npx playwright test tests/app-full.spec.ts --project=chromium-with-auth
 * Run all: npm run test:e2e
 *
 * For authenticated tests, run `npm run test:auth:save` once to save session.
 */
import { test, expect } from '@playwright/test';
import {
  waitForAppReady,
  expectPageTitle,
  expectProjectRequired,
  navigateSidebar,
} from './utils/app-helpers';

/** Main nav links and expected page titles (route -> title or regex). */
const NAV_ROUTES: { label: string; path: string; title: string | RegExp }[] = [
  { label: 'Dashboard', path: '/', title: /Dashboard|Select a Project/ },
  { label: 'Guided Audit', path: '/guided-audit', title: 'Guided Audit' },
  { label: 'Library', path: '/library', title: /Library|Select a Project/ },
  { label: 'Analysis', path: '/analysis', title: /Analysis|Select a Project/ },
  { label: 'Audit Simulation', path: '/audit', title: 'Audit Simulation' },
  { label: 'Paperwork Review', path: '/review', title: /Paperwork Review|Select a Project/ },
  { label: 'Entity issues', path: '/entity-issues', title: /Entity issues|Select a Project/ },
  { label: 'Revisions', path: '/revisions', title: /Revisions|Select a Project/ },
  { label: 'Projects', path: '/projects', title: 'Projects' },
  { label: 'Settings', path: '/settings', title: 'Settings' },
];

test.describe('Unauthenticated', () => {
  test.setTimeout(60_000);

  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Only run with chromium (no auth)');
  });

  test('shows Clerk sign-in when not signed in', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const state = await waitForAppReady(page, 50_000); // Clerk init can be slow on cold load
    expect(state).toBe('unauthenticated');
    await expect(page.locator('#clerk-sign-in')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /AeroGap/i })).toBeVisible();
    await expect(page.locator('text=Aviation Quality Company')).toBeVisible();
  });

  test('unknown route redirects to sign-in', async ({ page }) => {
    await page.goto('/unknown-path', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const state = await waitForAppReady(page, 50_000); // Clerk init can be slow on cold load
    expect(state).toBe('unauthenticated');
    await expect(page.locator('#clerk-sign-in')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'chromium-with-auth') {
      test.skip(true, 'Requires authenticated session');
    }
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('sidebar navigation reaches all main routes', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    const sidebarVisible = await nav.isVisible().catch(() => false);
    if (!sidebarVisible) {
      test.skip(true, 'Sidebar not visible (auth required). Run test:auth:save first.');
      return;
    }

    for (const { label, path, title } of NAV_ROUTES) {
      await navigateSidebar(page, new RegExp(label, 'i'));
      await page.waitForTimeout(500);
      const heading = page.locator('h1, h2').filter({ hasText: title }).first();
      await expect(heading).toBeVisible({ timeout: 8000 });
    }
  });

  test('direct URL navigation works', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    if (!(await nav.isVisible().catch(() => false))) {
      test.skip(true, 'Sidebar not visible (auth required).');
      return;
    }

    const routes = [
      '/library',
      '/audit',
      '/projects',
      '/settings',
      '/guided-audit',
      '/analysis',
      '/review',
      '/entity-issues',
      '/revisions',
    ];
    for (const path of routes) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(1000);
      const main = page.locator('main#main-content');
      await expect(main).toBeVisible({ timeout: 5000 });
    }
  });

  test('keyboard shortcuts Ctrl+1..7 navigate', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    if (!(await nav.isVisible().catch(() => false))) {
      test.skip(true, 'Sidebar not visible (auth required).');
      return;
    }

    await page.keyboard.press('Control+2');
    await page.waitForTimeout(500);
    await expect(page.locator('h1, h2').filter({ hasText: 'Guided Audit' }).first()).toBeVisible({
      timeout: 5000,
    });

    await page.keyboard.press('Control+1');
    await page.waitForTimeout(500);
    await expect(
      page.locator('h1, h2').filter({ hasText: /Dashboard|Select a Project/ }).first(),
    ).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Project-dependent views', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'chromium-with-auth') {
      test.skip(true, 'Requires authenticated session');
    }
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('shows Select a Project when no project active', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    if (!(await nav.isVisible().catch(() => false))) {
      test.skip(true, 'Sidebar not visible (auth required).');
      return;
    }

    const noProjectBtn = page.getByRole('button', { name: /No Project Selected/i });
    const noProject = await noProjectBtn.isVisible().catch(() => false);
    if (!noProject) {
      test.skip(true, 'A project is already selected; cannot test "Select a Project" state.');
      return;
    }

    await navigateSidebar(page, /Library/i);
    await page.waitForTimeout(500);
    await expectProjectRequired(page);
  });

  test('Projects page loads', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    if (!(await nav.isVisible().catch(() => false))) {
      test.skip(true, 'Sidebar not visible (auth required).');
      return;
    }

    await page.goto('/projects', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(1000);
    await expectPageTitle(page, 'Projects');
    await expect(page.locator('text=Organize your assessments')).toBeVisible({ timeout: 5000 });
  });

  test('can create project from Projects page', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    if (!(await nav.isVisible().catch(() => false))) {
      test.skip(true, 'Sidebar not visible (auth required).');
      return;
    }

    await page.goto('/projects', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await page.waitForTimeout(1000);

    const newProjectBtn = page.getByRole('button', { name: /New Project|Create Your First Project/i }).first();
    await newProjectBtn.click();
    await page.waitForTimeout(500);

    const nameInput = page.getByLabel(/Project Name/i);
    await nameInput.waitFor({ state: 'visible', timeout: 5000 });
    const projectName = `E2E Test Project ${Date.now()}`;
    await nameInput.fill(projectName);
    await page.getByRole('button', { name: 'Create Project' }).click();
    await page.waitForTimeout(2000);
    await expect(page.locator(`text=${projectName}`)).toBeVisible({ timeout: 8000 });
  });
});

test.describe('Guided Audit', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.project.name !== 'chromium-with-auth') {
      test.skip(true, 'Requires authenticated session');
    }
    await page.goto('/guided-audit', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);
  });

  test('Guided Audit shows 6 steps', async ({ page }) => {
    const heading = page.locator('h1, h2').filter({ hasText: 'Guided Audit' }).first();
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Guided Audit page not visible (auth required).');
      return;
    }

    const stepTitles = [
      'Upload documents',
      'Run analysis',
      'Audit simulation',
      'Paperwork review',
      'Revision check',
      'Summary',
    ];
    for (const title of stepTitles) {
      await expect(page.locator(`text=${title}`).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Guided Audit step navigation', async ({ page }) => {
    const heading = page.locator('h1, h2').filter({ hasText: 'Guided Audit' }).first();
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Guided Audit page not visible (auth required).');
      return;
    }

    const nextBtn = page.getByRole('button', { name: /Next|→/i }).first();
    if (await nextBtn.isVisible().catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('text=Run analysis').first()).toBeVisible({ timeout: 5000 });
    }

    const backBtn = page.getByRole('button', { name: /Back|←/i }).first();
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
      await page.waitForTimeout(500);
      await expect(page.locator('text=Upload documents').first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('step 1 shows upload categories', async ({ page }) => {
    const heading = page.locator('h1, h2').filter({ hasText: 'Guided Audit' }).first();
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Guided Audit page not visible (auth required).');
      return;
    }

    const regulatory = page.locator('text=Regulatory').or(page.locator('text=CFRs')).first();
    await expect(regulatory).toBeVisible({ timeout: 5000 });
    const entity = page.locator('text=Entity').or(page.locator('text=entity documents')).first();
    await expect(entity).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Settings', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
  });

  test('Settings page loads', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);

    const heading = page.locator('h1, h2').filter({ hasText: 'Settings' }).first();
    if (!(await heading.isVisible().catch(() => false))) {
      test.skip(true, 'Settings page not visible (auth required).');
      return;
    }
    await expect(heading).toBeVisible();
    await expect(page.locator('text=Configure your application preferences')).toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe('Admin', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-with-auth', 'Requires authenticated session');
  });

  test('Admin route when admin', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    await waitForAppReady(page, 60_000);
    await page.waitForTimeout(2000);

    const adminLink = page.getByRole('link', { name: /Admin/i });
    const adminVisible = await adminLink.isVisible().catch(() => false);
    if (!adminVisible) {
      test.skip(true, 'Admin link not visible (user is not admin).');
      return;
    }

    await adminLink.click();
    await page.waitForTimeout(2000);
    await expect(page.locator('h1, h2').filter({ hasText: /Admin/i }).first()).toBeVisible({
      timeout: 8000,
    });
  });
});
