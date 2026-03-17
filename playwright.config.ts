import { existsSync } from 'fs';
import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const authFile = path.join(__dirname, 'playwright', '.auth', 'user.json');
const hasAuthFile = existsSync(authFile);
const authOnlySpecs = [
  'tests/analysis.spec.ts',
  'tests/admin-panel.spec.ts',
  'tests/app-full.spec.ts',
  'tests/analytics.spec.ts',
  'tests/audit-sim-buttons.spec.ts',
  'tests/audit-simulation.spec.ts',
  'tests/document-library.spec.ts',
  'tests/entity-issues.spec.ts',
  'tests/guided-audit.spec.ts',
  'tests/inspection-schedule.spec.ts',
  'tests/manual-management.spec.ts',
  'tests/manual-writer.spec.ts',
  'tests/menu-organization.spec.ts',
  'tests/paperwork-review-agent.spec.ts',
  'tests/paperwork-review.spec.ts',
  'tests/projects.spec.ts',
  'tests/report-builder.spec.ts',
  'tests/role-access.spec.ts',
  'tests/settings.spec.ts',
  'tests/setup-auth.spec.ts',
];

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('')`. */
    baseURL: 'https://localhost:5173',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Accept self-signed cert for local dev HTTPS */
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: authOnlySpecs,
    },

    /* Dedicated project for one-off auth save (run via npm run test:auth:save). */
    {
      name: 'auth-setup',
      use: {
        ...devices['Desktop Chrome'],
        headless: false, // always show browser so you can see sign-in
      },
      testMatch: /setup-auth\.spec\.ts/,
    },

    {
      name: 'chromium-with-auth',
      use: {
        ...devices['Desktop Chrome'],
        ...(hasAuthFile ? { storageState: authFile } : {}),
      },
      dependencies: [],
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },

    /* Test against branded browsers. */
    // {
    //   name: 'Microsoft Edge',
    //   use: { ...devices['Desktop Edge'], channel: 'msedge' },
    // },
    // {
    //   name: 'Google Chrome',
    //   use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    // },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run dev',
    url: 'https://localhost:5173',
    reuseExistingServer: !process.env.CI,
    ignoreHTTPSErrors: true,
  },
});
