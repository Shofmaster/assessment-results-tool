/**
 * Soft-nav smoke: stay in one signed-in SPA session and click sidebar links
 * (avoids AuthGate remount bounce on hard navigation).
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';

const BASE = 'https://www.aerogaptechnologies.com';
const OUT = path.resolve('test-results', 'prod-smoke');
const PROFILE_DIR = path.resolve('playwright', '.auth', 'prod-chrome-profile');
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  '/splash',
  '/fleet',
  '/library',
  '/schedule',
  '/roster',
  '/settings',
  '/help',
  '/quality-command-center',
  '/checklists',
  '/guided-audit',
  '/entity-issues',
  '/audit',
  '/review',
  '/analysis',
  '/logbook',
  '/form-337',
  '/analytics',
  '/report',
  '/manual-writer',
  '/manual-management',
  '/dct-compliance',
  '/company-admin',
  '/admin',
  '/aerogap-dashboard',
  '/companies',
  '/revisions',
];

const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: 'chrome',
  headless: true,
  viewport: { width: 1440, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
  ignoreDefaultArgs: ['--enable-automation'],
});
const page = context.pages()[0] ?? (await context.newPage());

await page.goto(`${BASE}/splash`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.getByRole('navigation', { name: /main navigation/i }).waitFor({
  state: 'visible',
  timeout: 60_000,
});
await page.waitForTimeout(2000);

const results = [];

for (const route of ROUTES) {
  const consoleErrors = [];
  const onConsole = (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200));
  };
  page.on('console', onConsole);

  // Always start from splash so we click a real nav link when available.
  if (!page.url().includes('/splash')) {
    const home = page.locator('a[href="/splash"]').first();
    if (await home.isVisible().catch(() => false)) {
      await home.click();
      await page.waitForTimeout(1000);
    } else {
      await page.goto(`${BASE}/splash`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
    }
  }

  const link = page.locator(`nav a[href="${route}"]`).first();
  const hasLink = (await link.count()) > 0 && (await link.isVisible().catch(() => false));

  if (route === '/splash') {
    // already there
  } else if (hasLink) {
    await link.click();
    await page.waitForTimeout(2500);
  } else {
    // Feature-gated / staff-only: try direct SPA navigation via history + React Router
    await page.evaluate((r) => {
      window.history.pushState({}, '', r);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, route);
    await page.waitForTimeout(2500);
    // If still on splash, hard-fallback note (AuthGate bug on prod)
    if (page.url().replace(BASE, '').startsWith('/splash') && route !== '/splash') {
      await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2000);
    }
  }

  const final = page.url().replace(BASE, '');
  const body = ((await page.evaluate(() => document.body.innerText)) || '')
    .replace(/\s+/g, ' ')
    .trim();
  const heading = (
    (await page.locator('h1, h2').first().textContent({ timeout: 2000 }).catch(() => '')) || ''
  )
    .trim()
    .slice(0, 70);
  const broken = /something went wrong|unexpected error/i.test(body);
  let status = 'ok';
  if (broken) status = 'broken';
  else if (!(final === route || final.startsWith(`${route}?`) || final.startsWith(`${route}/`))) {
    status = 'redirect';
  }

  const row = {
    route,
    final,
    status,
    heading,
    hasLink,
    bodyLen: body.length,
    consoleErrors: [...new Set(consoleErrors)].slice(0, 3),
  };
  results.push(row);
  console.log(
    `${status.toUpperCase().padEnd(9)} ${route} -> ${final} ${heading || ''}`.trim(),
  );
  page.off('console', onConsole);
  const slug = route.replace(/^\//, '').replace(/[/:]+/g, '_') || 'splash';
  await page.screenshot({ path: path.join(OUT, `soft-${slug}.png`), fullPage: false }).catch(() => {});
}

writeFileSync(
  path.join(OUT, 'soft-nav-report.json'),
  JSON.stringify({ finishedAt: new Date().toISOString(), results }, null, 2),
);
const nonOk = results.filter((r) => r.status !== 'ok');
console.log(`\nDONE ${nonOk.length} non-ok of ${results.length}`);
await context.close();
process.exit(nonOk.some((r) => r.status === 'broken') ? 1 : 0);
