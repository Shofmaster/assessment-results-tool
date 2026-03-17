import { test, expect } from '@playwright/test';
import { expectRouteRequiresSignIn, waitForAppReady } from './utils/app-helpers';

const protectedRoutes = [
  '/analysis',
  '/projects',
  '/library',
  '/settings',
  '/guided-audit',
  '/audit',
  '/review',
  '/entity-issues',
  '/revisions',
];

test.describe('No-auth smoke', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Only run without saved auth');
  });

  test('shows Clerk sign-in on the home route', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const state = await waitForAppReady(page, 50_000);
    expect(state).toBe('unauthenticated');
    await expect(page.locator('#clerk-sign-in')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /AeroGap/i })).toBeVisible();
    await expect(page.locator('text=Aviation Quality Company')).toBeVisible();
  });

  test('unknown route redirects to sign-in', async ({ page }) => {
    await expectRouteRequiresSignIn(page, '/unknown-path');
  });

  for (const route of protectedRoutes) {
    test(`${route} requires sign-in`, async ({ page }) => {
      await expectRouteRequiresSignIn(page, route);
    });
  }
});
