import { describe, it, expect } from 'vitest';
import {
  reconcileDueLists,
  titleOverlap,
  type ExternalDueRow,
} from '../../utils/dueListReconcile';
import { deriveDailyRates, forecastProject, type DueForecastInput } from '../../utils/dueForecast';

const TODAY = new Date(2026, 5, 10);

const AIRCRAFT = {
  aircraftId: 'ac1',
  tailNumber: 'N123AB',
  baselineTotalTime: 1000,
  baselineAsOfDate: '2026-01-01',
  currentTotalTime: 1160,
  currentAsOfDate: '2026-05-26',
};

function buildNative(inputs: DueForecastInput[]) {
  const summary = forecastProject([AIRCRAFT], inputs, TODAY);
  return {
    items: summary.items.filter((i) => i.aircraftId),
    rates: summary.rates,
  };
}

function external(overrides: Partial<ExternalDueRow> = {}): ExternalDueRow {
  return {
    sourceId: 'x1',
    aircraftId: 'ac1',
    provider: 'camp',
    title: '100 Hour Inspection',
    ...overrides,
  };
}

describe('titleOverlap', () => {
  it('matches synonym-normalized titles', () => {
    expect(titleOverlap('100 hr insp', '100 hour inspection')).toBe(1);
  });

  it('scores unrelated titles low', () => {
    expect(titleOverlap('ELT battery replacement', 'Pitot static check')).toBeLessThan(0.2);
  });
});

describe('reconcileDueLists', () => {
  const hoursEntry: DueForecastInput = {
    kind: 'logbook',
    sourceId: 'e1',
    aircraftId: 'ac1',
    title: '100 hour inspection',
    ataChapter: '05',
    recurrenceUnit: 'hours',
    recurrenceInterval: 100,
    totalTimeAtEntry: 1100, // due at 1200 hr
  };

  it('agrees when due hours are within tolerance', () => {
    const { items, rates } = buildNative([hoursEntry]);
    const summary = reconcileDueLists(items, [external({ nextDueHours: 1203 })], rates);
    expect(summary.counts.agrees).toBe(1);
    expect(summary.counts.mismatch).toBe(0);
    expect(summary.pairs[0].deltaHours).toBe(3);
  });

  it('flags an hours mismatch beyond tolerance with both values in the note', () => {
    const { items, rates } = buildNative([hoursEntry]);
    const summary = reconcileDueLists(items, [external({ nextDueHours: 1250 })], rates);
    expect(summary.counts.mismatch).toBe(1);
    expect(summary.pairs[0].note).toContain('CAMP: due at 1250.0 hr');
    expect(summary.pairs[0].note).toContain('AeroGap logbooks: 1200.0 hr');
  });

  it('compares dates when no hours axis exists', () => {
    const { items, rates } = buildNative([
      { kind: 'logbook', sourceId: 'e2', aircraftId: 'ac1', title: 'Annual inspection', nextDueDate: '2026-08-01' },
    ]);
    const ok = reconcileDueLists(
      items,
      [external({ title: 'Annual inspection', nextDueDate: '2026-08-03' })],
      rates,
    );
    expect(ok.counts.agrees).toBe(1);
    const bad = reconcileDueLists(
      items,
      [external({ title: 'Annual inspection', nextDueDate: '2026-09-01' })],
      rates,
    );
    expect(bad.counts.mismatch).toBe(1);
    expect(bad.pairs[0].deltaDays).toBe(31);
  });

  it('marks unmatched external rows as only_external', () => {
    const { items, rates } = buildNative([hoursEntry]);
    const summary = reconcileDueLists(
      items,
      [external({ title: 'Fire bottle hydrostatic test', nextDueDate: '2026-07-01' })],
      rates,
    );
    expect(summary.counts.only_external).toBe(1);
    expect(summary.counts.only_aerogap).toBe(1); // native 100-hr had no partner
  });

  it('disqualifies candidates with conflicting ATA chapters', () => {
    const { items, rates } = buildNative([{ ...hoursEntry, ataChapter: '05' }]);
    const summary = reconcileDueLists(
      items,
      [external({ ataChapter: '32', title: '100 hour inspection' })],
      rates,
    );
    expect(summary.counts.only_external).toBe(1);
  });

  it('accepts a weaker title match when ATA chapters agree', () => {
    const { items, rates } = buildNative([{ ...hoursEntry, title: 'Airframe periodic inspection per 91.409' }]);
    const summary = reconcileDueLists(
      items,
      [external({ ataChapter: '05', title: 'Periodic inspection', nextDueHours: 1200 })],
      rates,
    );
    expect(summary.counts.agrees).toBe(1);
  });

  it('never matches across aircraft', () => {
    const { items, rates } = buildNative([hoursEntry]);
    const summary = reconcileDueLists(
      items,
      [external({ aircraftId: 'ac2', nextDueHours: 1200 })],
      rates,
    );
    expect(summary.counts.only_external).toBe(1);
  });

  it('counts a matched pair with no comparable axis as agreement', () => {
    const { items, rates } = buildNative([
      { kind: 'logbook', sourceId: 'e3', aircraftId: 'ac1', title: 'Annual inspection', nextDueDate: '2026-08-01' },
    ]);
    const summary = reconcileDueLists(items, [external({ title: 'Annual inspection' })], rates);
    expect(summary.counts.agrees).toBe(1);
  });

  it('matches one-to-one (a second identical external row goes unmatched)', () => {
    const { items, rates } = buildNative([hoursEntry]);
    const summary = reconcileDueLists(
      items,
      [external({ nextDueHours: 1200 }), external({ sourceId: 'x2', nextDueHours: 1200 })],
      rates,
    );
    expect(summary.counts.agrees).toBe(1);
    expect(summary.counts.only_external).toBe(1);
  });
});

describe('rates integration', () => {
  it('uses derived rates in hours comparisons', () => {
    const rates = deriveDailyRates(AIRCRAFT, TODAY);
    expect(rates.hours?.source).toBe('derived');
  });
});
