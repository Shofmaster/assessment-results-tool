/**
 * Production smoke sweep: signs in to https://www.aerogaptechnologies.com with
 * credentials from .env.playwright, visits every route read-only, and records
 * render status, console errors, and failed network requests per route.
 *
 * Run: node scripts/prod-smoke.mjs
 * Output: test-results/prod-smoke/report.json + per-route screenshots
 *
 * Strictly read-only: no buttons clicked, no data created, no AI runs triggered.
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';

const BASE = 'https://www.aerogaptechnologies.com';
const OUT_DIR = path.resolve('test-results', 'prod-smoke');
const AUTH_FILE = path.resolve('playwright', '.auth', 'prod-user.json');
mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = [
  '/splash',
  '/library',
  '/analysis',
  '/audit',
  '/review',
  '/entity-issues',
  '/guided-audit',
  '/revisions',
  '/compliance-report',
  '/quality-command-center',
  '/checklists',
  '/schedule',
  '/logbook',
  '/logbook/entry-review',
  '/fleet',
  '/form-337',
  '/analytics',
  '/report',
  '/manual-writer',
  '/manual-management',
  '/dct-compliance',
  '/roster',
  '/settings',
  '/company-admin',
  '/help',
  '/privacy',
  '/terms',
  '/admin',
  '/aerogap-dashboard',
  '/companies',
];

const ERROR_BOUNDARY_PATTERNS = [
  /something went wrong/i,
  /an unexpected error/i,
  /error boundary/i,
];

function slug(route) {
  return route.replace(/^\//, '').replace(/[/:]+/g, '_') || 'root';
}

// Persistent real-Chrome profile dedicated to these tests. First run: a visible
// window opens and the user signs in manually (Google SSO works in real Chrome
// with automation flags hidden). The session persists in the profile, so later
// runs need no sign-in. hasSavedAuth marker tracks whether sign-in ever succeeded.
const PROFILE_DIR = path.resolve('playwright', '.auth', 'prod-chrome-profile');
const hasSavedAuth = existsSync(AUTH_FILE);
const context = await chromium.launchPersistentContext(PROFILE_DIR, {
  channel: 'chrome',
  headless: false,
  viewport: { width: 1440, height: 900 },
  args: ['--disable-blink-features=AutomationControlled'],
  ignoreDefaultArgs: ['--enable-automation'],
});
const browser = context;
const page = context.pages()[0] ?? (await context.newPage());

// Per-route diagnostics buffers
let consoleErrors = [];
let pageErrors = [];
let failedRequests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 500));
});
page.on('pageerror', (err) => pageErrors.push(String(err).slice(0, 500)));
page.on('response', (res) => {
  if (res.status() >= 400) {
    failedRequests.push(`${res.status()} ${res.request().method()} ${res.url().slice(0, 200)}`);
  }
});

function resetDiagnostics() {
  consoleErrors = [];
  pageErrors = [];
  failedRequests = [];
}

async function signIn() {
  await page.goto(`${BASE}/library`, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  const mainNav = page.getByRole('navigation', { name: /main navigation/i });
  if (hasSavedAuth) {
    await mainNav.waitFor({ state: 'visible', timeout: 60_000 });
    console.log('Signed in via saved session.');
    return;
  }

  console.log(
    'A browser window is open at the sign-in page. Complete sign-in there ' +
      '(e.g. Continue with Google). Waiting up to 5 minutes...',
  );
  await mainNav.waitFor({ state: 'visible', timeout: 300_000 });
  mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await context.storageState({ path: AUTH_FILE });
  console.log(`Signed in. Session saved to ${AUTH_FILE} for future headless runs.`);
}

async function checkRoute(route) {
  resetDiagnostics();
  const result = { route, status: 'unknown', heading: '', notes: [], consoleErrors: [], failedRequests: [] };
  try {
    await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Give the SPA time to render data (Convex queries)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    const bodyText = (await page.evaluate(() => document.body.innerText)) || '';
    const h1 = await page.locator('h1, h2').first().textContent({ timeout: 3000 }).catch(() => '');
    result.heading = (h1 || '').trim().slice(0, 80);

    const redirected = !finalUrl.includes(route) && route !== '/splash';
    if (redirected) result.notes.push(`redirected to ${finalUrl.replace(BASE, '')}`);

    const boundaryHit = ERROR_BOUNDARY_PATTERNS.some((re) => re.test(bodyText));
    const blank = bodyText.replace(/\s+/g, ' ').trim().length < 80;

    if (boundaryHit) {
      result.status = 'broken';
      result.notes.push('error boundary text detected');
    } else if (blank) {
      result.status = 'broken';
      result.notes.push(`page nearly blank (${bodyText.trim().length} chars)`);
    } else if (pageErrors.length > 0) {
      result.status = 'degraded';
      result.notes.push('uncaught page errors');
    } else if (consoleErrors.length > 0 || failedRequests.length > 0) {
      result.status = 'degraded';
    } else {
      result.status = 'ok';
    }
  } catch (err) {
    result.status = 'broken';
    result.notes.push(`navigation failed: ${String(err).slice(0, 200)}`);
  }
  result.consoleErrors = [...new Set(consoleErrors)].slice(0, 5);
  result.pageErrors = [...new Set(pageErrors)].slice(0, 5);
  result.failedRequests = [...new Set(failedRequests)].slice(0, 5);
  await page
    .screenshot({ path: path.join(OUT_DIR, `${slug(route)}.png`), fullPage: false })
    .catch(() => {});
  console.log(`${result.status.toUpperCase().padEnd(8)} ${route} ${result.notes.join('; ')}`);
  return result;
}

const report = { base: BASE, startedAt: new Date().toISOString(), signIn: 'pending', routes: [] };
try {
  await signIn();
  report.signIn = 'ok';
} catch (err) {
  report.signIn = `failed: ${String(err).slice(0, 300)}`;
  await page.screenshot({ path: path.join(OUT_DIR, 'signin-failure.png') }).catch(() => {});
  console.error('Sign-in failed:', err);
  writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(2);
}

for (const route of ROUTES) {
  report.routes.push(await checkRoute(route));
}

report.finishedAt = new Date().toISOString();
writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nReport written to ${path.join(OUT_DIR, 'report.json')}`);
await browser.close();
