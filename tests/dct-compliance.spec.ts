import { test, expect } from '@playwright/test';
import { waitForAppReady, hasProject, getAuthProjectSkipReason } from './utils/app-helpers';

const DCT_URL = '/dct-compliance';

async function navigateToDct(page: Parameters<typeof waitForAppReady>[0]) {
  await page.goto(DCT_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await waitForAppReady(page, 60_000);
  await page.waitForTimeout(1500);
}

/** Returns false if DCT feature flag is off (page redirects away or shows no DCT content). */
async function isDctEnabled(page: Parameters<typeof waitForAppReady>[0]): Promise<boolean> {
  return page.url().includes('dct-compliance');
}

/** Click the named DCT sub-tab (Matrix, Settings, Overview, etc.). */
async function clickDctTab(page: Parameters<typeof waitForAppReady>[0], name: string | RegExp) {
  const btn = page.getByRole('button', { name }).first();
  await btn.click();
  await page.waitForTimeout(1000);
}

/** Return the current "X of Y requirements" counter as { filtered, total } or null. */
async function readCounter(page: Parameters<typeof waitForAppReady>[0]): Promise<{ filtered: number; total: number } | null> {
  const counter = page.locator('span').filter({ hasText: /\d+ of \d+ requirements/ }).first();
  const visible = await counter.isVisible().catch(() => false);
  if (!visible) return null;
  const text = (await counter.textContent()) ?? '';
  const m = text.match(/(\d+)\s+of\s+(\d+)/);
  if (!m) return null;
  return { filtered: parseInt(m[1]), total: parseInt(m[2]) };
}

/** Find the applicability filter <select> (the one that has an "applicable" option). */
function applicabilitySelect(page: Parameters<typeof waitForAppReady>[0]) {
  return page.locator('select').filter({ has: page.locator('option[value="applicable"]') }).first();
}

test.describe('DCT Compliance — unauthenticated', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Only run without saved auth');
  });

  test('DCT route requires sign-in', async ({ page }) => {
    await page.goto(DCT_URL, { waitUntil: 'domcontentloaded', timeout: 15_000 });
    const state = await waitForAppReady(page, 50_000);
    expect(state).toBe('unauthenticated');
  });
});

test.describe('DCT Compliance — applicability filtering', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    const skipReason = getAuthProjectSkipReason(testInfo);
    if (skipReason) {
      test.skip(true, skipReason);
      return;
    }
    await navigateToDct(page);
  });

  // -------------------------------------------------------------------------
  // Basic load
  // -------------------------------------------------------------------------

  test('DCT section loads or redirects gracefully', async ({ page }) => {
    const enabled = await isDctEnabled(page);
    if (!enabled) {
      test.skip(true, 'DCT Compliance feature not enabled for this account');
      return;
    }
    const hasProj = await hasProject(page);
    if (!hasProj) {
      await expect(page.locator('text=Select a Project')).toBeVisible({ timeout: 8_000 });
      return;
    }
    // Any of these headings indicate the page loaded
    const heading = page
      .locator('h1, h2')
      .filter({ hasText: /DCT|Compliance|Traceability/i })
      .first();
    await expect(heading).toBeVisible({ timeout: 12_000 });
  });

  // -------------------------------------------------------------------------
  // Matrix counter
  // -------------------------------------------------------------------------

  test('Matrix tab shows "X of Y requirements" counter', async ({ page }) => {
    if (!await isDctEnabled(page)) test.skip(true, 'DCT not enabled');
    if (!await hasProject(page)) test.skip(true, 'No project selected');

    await clickDctTab(page, /^Matrix$/i);
    await page.waitForTimeout(2000);

    const counter = page.locator('span').filter({ hasText: /\d+ of \d+ requirements/ }).first();
    await expect(counter).toBeVisible({ timeout: 12_000 });

    const counts = await readCounter(page);
    expect(counts).not.toBeNull();
    // There should be at least some rows if DCT data was ingested
    // (this may be 0 if no corpus loaded — that's also a valid diagnostic)
    expect(typeof counts?.total).toBe('number');
  });

  // -------------------------------------------------------------------------
  // KEY TEST: applicability filter dropdown must change row count
  // -------------------------------------------------------------------------

  test('applicability dropdown partitions rows — not all buckets equal total', async ({ page }) => {
    if (!await isDctEnabled(page)) test.skip(true, 'DCT not enabled');
    if (!await hasProject(page)) test.skip(true, 'No project selected');

    await clickDctTab(page, /^Matrix$/i);
    await page.waitForTimeout(2500);

    const sel = applicabilitySelect(page);
    const selVisible = await sel.isVisible().catch(() => false);
    if (!selVisible) {
      test.skip(true, 'Applicability filter select not visible — no data ingested yet');
      return;
    }

    // Baseline: all
    await sel.selectOption('all');
    await page.waitForTimeout(400);
    const allCounts = await readCounter(page);
    if (!allCounts || allCounts.total === 0) {
      test.skip(true, 'No DCT rows loaded — ingest a corpus first');
      return;
    }

    // Applicable bucket
    await sel.selectOption('applicable');
    await page.waitForTimeout(400);
    const applicableCounts = await readCounter(page);

    // Not-applicable bucket
    await sel.selectOption('not_applicable');
    await page.waitForTimeout(400);
    const notApplicableCounts = await readCounter(page);

    // Unsure bucket
    await sel.selectOption('unsure');
    await page.waitForTimeout(400);
    const unsureCounts = await readCounter(page);

    // Reset
    await sel.selectOption('all');

    const aC = applicableCounts?.filtered ?? 0;
    const nC = notApplicableCounts?.filtered ?? 0;
    const uC = unsureCounts?.filtered ?? 0;
    const total = allCounts.filtered; // filtered when mode=all === all rows

    // Screenshot the filter in action
    await sel.selectOption('applicable');
    await page.screenshot({ path: 'test-results/dct-applicable-filter.png' });
    await sel.selectOption('all');

    // DIAGNOSTIC: print bucket breakdown regardless of pass/fail
    const msg =
      `Bucket breakdown — applicable: ${aC}, not_applicable: ${nC}, unsure: ${uC}, total: ${total}. ` +
      `If all buckets equal ${total} the filter is NOT working.`;

    // The filter works if at least one bucket is strictly less than the total
    // (or the total itself is 0, meaning no data).
    const filterIsWorking = aC < total || nC < total || uC < total;
    expect(filterIsWorking, msg).toBe(true);
  });

  // -------------------------------------------------------------------------
  // "No requirements match" empty state
  // -------------------------------------------------------------------------

  test('"No requirements match" appears when filter excludes all rows', async ({ page }) => {
    if (!await isDctEnabled(page)) test.skip(true, 'DCT not enabled');
    if (!await hasProject(page)) test.skip(true, 'No project selected');

    await clickDctTab(page, /^Matrix$/i);
    await page.waitForTimeout(2000);

    const sel = applicabilitySelect(page);
    if (!await sel.isVisible().catch(() => false)) {
      test.skip(true, 'No data to filter');
      return;
    }

    // Apply a text search guaranteed to match nothing
    const searchInput = page.locator('input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill('ZZZZ_NO_MATCH_SENTINEL_XYZ');
      await page.waitForTimeout(400);
      const empty = page.locator('text=No requirements match these filters');
      await expect(empty).toBeVisible({ timeout: 6_000 });
      await searchInput.fill('');
    } else {
      // Fallback: combine not_applicable status filter with "aligned" status — unlikely to match
      await sel.selectOption('not_applicable');
      const statusSelect = page
        .locator('select')
        .filter({ has: page.locator('option[value="aligned"]') })
        .first();
      if (await statusSelect.isVisible().catch(() => false)) {
        await statusSelect.selectOption('aligned');
        await page.waitForTimeout(400);
        const counts = await readCounter(page);
        if (counts && counts.filtered === 0) {
          const empty = page.locator('text=No requirements match these filters');
          await expect(empty).toBeVisible({ timeout: 6_000 });
        }
        await statusSelect.selectOption('all');
      }
      await sel.selectOption('all');
    }
  });

  // -------------------------------------------------------------------------
  // showAllDcts setting
  // -------------------------------------------------------------------------

  test('showAllDcts=ON forces all rows to "applicable"', async ({ page }) => {
    if (!await isDctEnabled(page)) test.skip(true, 'DCT not enabled');
    if (!await hasProject(page)) test.skip(true, 'No project selected');

    // Navigate to Settings tab
    await clickDctTab(page, /^Settings$/i);
    await page.waitForTimeout(1500);

    const showAllCheckbox = page
      .locator('label')
      .filter({ hasText: /Show all DCTs/i })
      .locator('input[type="checkbox"]')
      .first();

    if (!await showAllCheckbox.isVisible().catch(() => false)) {
      test.skip(true, 'Show all DCTs checkbox not found in Settings tab');
      return;
    }

    const wasChecked = await showAllCheckbox.isChecked();

    // Ensure showAllDcts is OFF first, record applicable count
    if (wasChecked) {
      await showAllCheckbox.uncheck();
      await page.waitForTimeout(2000);
    }

    await clickDctTab(page, /^Matrix$/i);
    await page.waitForTimeout(2000);

    const sel = applicabilitySelect(page);
    if (!await sel.isVisible().catch(() => false)) {
      test.skip(true, 'No DCT data loaded');
      return;
    }

    await sel.selectOption('applicable');
    await page.waitForTimeout(400);
    const offCounts = await readCounter(page);
    await sel.selectOption('all');
    const totalCounts = await readCounter(page);

    // Now turn showAllDcts ON (auto-saves on toggle)
    await clickDctTab(page, /^Settings$/i);
    await page.waitForTimeout(1500);
    await showAllCheckbox.check();
    await page.waitForTimeout(2500);

    await clickDctTab(page, /^Matrix$/i);
    await page.waitForTimeout(2000);
    await sel.selectOption('applicable');
    await page.waitForTimeout(400);
    const onCounts = await readCounter(page);

    // With showAllDcts ON, applicable count should equal the total
    expect(
      onCounts?.filtered,
      `showAllDcts=ON should make all ${totalCounts?.filtered} rows applicable, got ${onCounts?.filtered}`,
    ).toBe(totalCounts?.filtered);

    // With showAllDcts OFF, applicable count should be ≤ total (ideally less)
    // Log for diagnostics even if it was already equal (could mean all rows genuinely applicable)
    if (offCounts && totalCounts && offCounts.filtered === totalCounts.filtered) {
      console.warn(
        `[DCT] showAllDcts=OFF still shows ${offCounts.filtered}/${totalCounts.filtered} applicable. ` +
        `This may mean all rows are heuristically applicable for this entity profile, ` +
        `or applicabilityState was never stamped (run Re-evaluate in Settings).`,
      );
    }

    // Restore original state
    await clickDctTab(page, /^Settings$/i);
    await page.waitForTimeout(1500);
    if (!wasChecked) {
      await showAllCheckbox.uncheck();
    } else {
      await showAllCheckbox.check();
    }
    await page.waitForTimeout(1500);
  });

  // -------------------------------------------------------------------------
  // Exclude list
  // -------------------------------------------------------------------------

  test('structured rating selection persists after page refresh', async ({ page }) => {
    if (!await isDctEnabled(page)) test.skip(true, 'DCT not enabled');
    if (!await hasProject(page)) test.skip(true, 'No project selected');

    await clickDctTab(page, /^Settings$/i);
    await page.waitForTimeout(1500);

    const structuredDetails = page.locator('details').filter({ hasText: /Structured selectors/i });
    const summary = structuredDetails.locator('summary').first();
    if (!await summary.isVisible().catch(() => false)) {
      test.skip(true, 'Structured selectors panel not visible');
      return;
    }
    await summary.click();
    await page.waitForTimeout(500);

    const firstRatingLabel = structuredDetails
      .locator('label')
      .filter({ hasText: /class/i })
      .first();
    if (!await firstRatingLabel.isVisible().catch(() => false)) {
      test.skip(true, 'No class ratings on file to select');
      return;
    }

    const checkbox = firstRatingLabel.locator('input[type="checkbox"]');
    const ratingLabelText = ((await firstRatingLabel.textContent()) ?? '').trim();
    const wasChecked = await checkbox.isChecked();
    if (!wasChecked) {
      await checkbox.check();
    }

    await expect(page.getByText(/Filters saved|Saving filters/i).first()).toBeVisible({ timeout: 8000 });

    await page.reload({ waitUntil: 'domcontentloaded' });
    await navigateToDct(page);
    await clickDctTab(page, /^Settings$/i);
    await page.waitForTimeout(1500);
    await structuredDetails.locator('summary').first().click();
    await page.waitForTimeout(500);

    const restoredCheckbox = structuredDetails
      .locator('label')
      .filter({ hasText: ratingLabelText })
      .first()
      .locator('input[type="checkbox"]');
    await expect(restoredCheckbox).toBeChecked({ timeout: 8000 });

    if (!wasChecked) {
      await restoredCheckbox.uncheck();
      await expect(page.getByText(/Filters saved|Saving filters/i).first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('exclude list reduces applicable count', async ({ page }) => {
    if (!await isDctEnabled(page)) test.skip(true, 'DCT not enabled');
    if (!await hasProject(page)) test.skip(true, 'No project selected');

    // First ensure showAllDcts is OFF (exclude list is irrelevant if showAllDcts=true)
    await clickDctTab(page, /^Settings$/i);
    await page.waitForTimeout(1500);

    const showAllCheckbox = page
      .locator('label')
      .filter({ hasText: /Show all DCTs/i })
      .locator('input[type="checkbox"]')
      .first();
    const wasShowAll = await showAllCheckbox.isChecked().catch(() => false);
    if (wasShowAll) {
      await showAllCheckbox.uncheck();
      await page.waitForTimeout(2000);
      await clickDctTab(page, /^Settings$/i);
      await page.waitForTimeout(1000);
    }

    // Clear exclude field
    const excludeInput = page.locator('input[placeholder*="121"]').first();
    if (!await excludeInput.isVisible().catch(() => false)) {
      test.skip(true, 'Exclude input not visible');
      return;
    }
    const originalExclude = await excludeInput.inputValue();
    await excludeInput.fill('');
    await expect(page.getByText(/Filters saved|Saving filters/i).first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(1500);

    // Baseline applicable count with empty exclude list
    await clickDctTab(page, /^Matrix$/i);
    await page.waitForTimeout(2000);
    const sel = applicabilitySelect(page);
    if (!await sel.isVisible().catch(() => false)) {
      test.skip(true, 'No DCT data loaded');
      return;
    }
    await sel.selectOption('applicable');
    await page.waitForTimeout(400);
    const baselineCounts = await readCounter(page);
    await sel.selectOption('all');

    if (!baselineCounts || baselineCounts.filtered === 0) {
      test.skip(true, 'No applicable rows to test against');
      return;
    }

    // Add a common exclude substring. "145" appears in many peer group labels.
    // If this is a Part 145 shop ALL rows may be excluded — we'll check for that.
    await clickDctTab(page, /^Settings$/i);
    await page.waitForTimeout(1000);
    await excludeInput.fill('145');
    await expect(page.getByText(/Filters saved|Saving filters/i).first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(1500);

    await clickDctTab(page, /^Matrix$/i);
    await page.waitForTimeout(2000);
    await sel.selectOption('applicable');
    await page.waitForTimeout(400);
    const excludedCounts = await readCounter(page);
    await sel.selectOption('all');

    // Restore
    await clickDctTab(page, /^Settings$/i);
    await page.waitForTimeout(1000);
    await excludeInput.fill(originalExclude);
    await expect(page.getByText(/Filters saved|Saving filters/i).first()).toBeVisible({ timeout: 8000 });
    await page.waitForTimeout(1500);

    // If the exclude list changed nothing, the filter is broken
    expect(
      excludedCounts?.filtered,
      `Exclude list "145" did not reduce applicable count. ` +
      `Before: ${baselineCounts.filtered}, After: ${excludedCounts?.filtered}. ` +
      `Either the exclude filter is broken, or no rows have "145" in their peer group label.`,
    ).toBeLessThan(baselineCounts.filtered);
  });
});
