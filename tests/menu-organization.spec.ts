/**
 * Menu organization audit for AeroGap sidebar.
 *
 * When run authenticated (sidebar visible): extracts nav structure, writes
 * test-results/menu-structure.json, and asserts expected count/order.
 * When run unauthenticated: skips extraction and logs that menu audit requires
 * sign-in (or use storage state). See README or docs for auth setup.
 *
 * Organization evaluation (current):
 * - One flat, grouped sidebar (no section switcher): Command Center → Audit
 *   Prep (collapsible, workflow-ordered) → Evidence → People → Planning →
 *   Assessment → Logbook → Modules.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

/** Expected nav links in order (Sidebar.tsx flat grouped menu: Audit Prep → Evidence → People → Assessment). */
const EXPECTED_NAV_LABELS = [
  'Guided Audit',
  'Checklists',
  'Paperwork Review',
  'Audit Simulation',
  'CARs & Issues',
  'Report Builder',
  'Library',
  'Revisions',
  'Roster',
  'Analysis',
];

const EXPECTED_NAV_PATHS = [
  '/guided-audit',
  '/checklists',
  '/review',
  '/audit',
  '/entity-issues',
  '/report',
  '/library',
  '/revisions',
  '/roster',
  '/analysis',
];

test.describe('Menu organization audit', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
  });

  test('extracts sidebar menu structure when visible and asserts order', async ({
    page,
  }, testInfo) => {
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    const sidebarVisible = await nav.isVisible().catch(() => false);

    if (!sidebarVisible) {
      testInfo.annotations.push({
        type: 'note',
        description:
          'Menu audit skipped: sidebar not visible (sign-in required). Run with storage state after signing in once, or run locally and sign in.',
      });
      test.skip(true, 'Sidebar not visible (unauthenticated); menu audit requires signed-in session.');
      return;
    }

    const links = nav.locator('a[href]');
    const count = await links.count();

    const structure: { href: string; label: string }[] = [];
    for (let i = 0; i < count; i++) {
      const a = links.nth(i);
      const href = (await a.getAttribute('href')) ?? '';
      let label = (await a.textContent()) ?? '';
      label = label.replace(/\s*Ctrl\+\d+\s*/g, '').trim();
      structure.push({ href, label });
    }

    const projectSwitcher = page.locator('aside').filter({ has: page.getByRole('button', { name: /project|no project selected/i }) });
    const switcherVisible = await projectSwitcher.locator('button').first().isVisible().catch(() => false);
    const projectSwitcherLabel = switcherVisible
      ? await projectSwitcher.locator('button').first().textContent().then((t) => t?.trim() ?? null).catch(() => null)
      : null;

    const report = {
      extractedAt: new Date().toISOString(),
      viewport: DESKTOP_VIEWPORT,
      mainNavLinks: structure,
      projectSwitcherLabel,
      expectedLabels: EXPECTED_NAV_LABELS,
      expectedPaths: EXPECTED_NAV_PATHS,
    };

    const resultsDir = testInfo.outputDir;
    const reportPath = path.join(resultsDir, 'menu-structure.json');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    testInfo.attachments.push({
      name: 'menu-structure.json',
      path: reportPath,
      contentType: 'application/json',
    });

    const normalizePath = (href: string) => {
      try {
        if (href.startsWith('http')) return new URL(href).pathname || '/';
        const p = href.replace(/#.*$/, '').split('?')[0] || '/';
        return p === '' ? '/' : p;
      } catch {
        return href;
      }
    };

    const navOnly = structure.filter((s) =>
      EXPECTED_NAV_PATHS.some((p) => normalizePath(s.href) === p)
    );
    expect(navOnly.length).toBe(EXPECTED_NAV_LABELS.length);

    const pathsInOrder = navOnly.map((s) => normalizePath(s.href));
    expect(pathsInOrder).toEqual(EXPECTED_NAV_PATHS);

    const labelsInOrder = navOnly.map((s) => s.label);
    for (let i = 0; i < EXPECTED_NAV_LABELS.length; i++) {
      expect(labelsInOrder[i]).toBe(EXPECTED_NAV_LABELS[i]);
    }
  });

  test('shows DCT Compliance in the Modules group', async ({ page }, testInfo) => {
    const nav = page.getByRole('navigation', { name: /main navigation/i });
    const sidebarVisible = await nav.isVisible().catch(() => false);

    if (!sidebarVisible) {
      testInfo.annotations.push({
        type: 'note',
        description:
          'DCT nav audit skipped: sidebar not visible (sign-in required). Run with storage state after signing in once, or run locally and sign in.',
      });
      test.skip(true, 'Sidebar not visible (unauthenticated); DCT nav audit requires signed-in session.');
      return;
    }

    const dctLink = nav.getByRole('link', { name: /DCT Compliance/i });
    await expect(dctLink).toBeVisible();
    await expect(dctLink).toHaveAttribute('href', '/dct-compliance');
  });
});
