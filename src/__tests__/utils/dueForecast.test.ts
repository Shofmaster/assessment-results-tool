import { describe, it, expect } from 'vitest';
import {
  deriveDailyRates,
  forecastItem,
  forecastProject,
  bucketize,
  addMonthsClamped,
  formatDateOnly,
  dueInText,
  type AircraftUtilizationInput,
  type ScheduleItemInput,
  type LogbookRecurrenceInput,
  type ComponentInput,
} from '../../utils/dueForecast';

const TODAY = new Date(2026, 5, 10); // 2026-06-10

function aircraft(overrides: Partial<AircraftUtilizationInput> = {}): AircraftUtilizationInput {
  return {
    aircraftId: 'ac1',
    tailNumber: 'N123AB',
    baselineTotalTime: 1000,
    baselineTotalCycles: 800,
    baselineAsOfDate: '2026-01-01',
    currentTotalTime: 1160, // +160 hr over 145 days ≈ 1.103 hr/day
    currentTotalCycles: 945, // +145 cyc over 145 days = 1.0 cyc/day
    currentAsOfDate: '2026-05-26', // 15 days before TODAY → not stale
    ...overrides,
  };
}

describe('deriveDailyRates', () => {
  it('derives rates from baseline-to-current deltas', () => {
    const rates = deriveDailyRates(aircraft(), TODAY);
    expect(rates.hours?.source).toBe('derived');
    expect(rates.hours?.perDay).toBeCloseTo(160 / 145, 5);
    expect(rates.cycles?.perDay).toBeCloseTo(1.0, 5);
    expect(rates.stale).toBe(false);
  });

  it('returns no rate for windows under 7 days', () => {
    const rates = deriveDailyRates(
      aircraft({ baselineAsOfDate: '2026-05-23', currentAsOfDate: '2026-05-26' }),
      TODAY,
    );
    expect(rates.hours).toBeUndefined();
  });

  it('returns no rate for non-positive deltas', () => {
    const rates = deriveDailyRates(aircraft({ currentTotalTime: 1000 }), TODAY);
    expect(rates.hours).toBeUndefined();
  });

  it('returns no rate when baseline is missing and no manual override', () => {
    const rates = deriveDailyRates(aircraft({ baselineTotalTime: undefined }), TODAY);
    expect(rates.hours).toBeUndefined();
  });

  it('uses the manual override when nothing can be derived', () => {
    const rates = deriveDailyRates(
      aircraft({ baselineTotalTime: undefined, estDailyHours: 2.5 }),
      TODAY,
    );
    expect(rates.hours).toEqual({ perDay: 2.5, source: 'manual' });
  });

  it('prefers derived over manual when the window is >=30 days', () => {
    const rates = deriveDailyRates(aircraft({ estDailyHours: 9 }), TODAY);
    expect(rates.hours?.source).toBe('derived');
  });

  it('prefers manual over a short-window derived rate', () => {
    const rates = deriveDailyRates(
      aircraft({
        baselineAsOfDate: '2026-05-16', // 10-day window: derivable but short
        baselineTotalTime: 1140,
        estDailyHours: 1.8,
      }),
      TODAY,
    );
    expect(rates.hours).toEqual({ perDay: 1.8, source: 'manual' });
  });

  it('flags stale utilization (currentAsOfDate older than 30 days)', () => {
    const rates = deriveDailyRates(aircraft({ currentAsOfDate: '2026-04-01' }), TODAY);
    expect(rates.stale).toBe(true);
  });

  it('flags stale when currentAsOfDate is missing', () => {
    const rates = deriveDailyRates(aircraft({ currentAsOfDate: undefined }), TODAY);
    expect(rates.stale).toBe(true);
  });
});

describe('bucketize', () => {
  it('maps day counts to buckets with inclusive boundaries', () => {
    expect(bucketize(-1)).toBe('overdue');
    expect(bucketize(0)).toBe('due30');
    expect(bucketize(30)).toBe('due30');
    expect(bucketize(31)).toBe('due60');
    expect(bucketize(60)).toBe('due60');
    expect(bucketize(61)).toBe('due90');
    expect(bucketize(90)).toBe('due90');
    expect(bucketize(91)).toBe('later');
  });
});

describe('addMonthsClamped', () => {
  it('clamps month-end rollover (Jan 31 + 1 month = Feb 28)', () => {
    expect(formatDateOnly(addMonthsClamped(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
  });

  it('handles leap years (Jan 31 2024 + 1 month = Feb 29)', () => {
    expect(formatDateOnly(addMonthsClamped(new Date(2024, 0, 31), 1))).toBe('2024-02-29');
  });

  it('adds plain months without clamping when the day exists', () => {
    expect(formatDateOnly(addMonthsClamped(new Date(2026, 2, 15), 12))).toBe('2027-03-15');
  });
});

describe('forecastItem — schedule items', () => {
  function schedule(overrides: Partial<ScheduleItemInput> = {}): ScheduleItemInput {
    return {
      kind: 'schedule',
      sourceId: 's1',
      title: 'Torque wrench calibration',
      intervalType: 'calendar',
      intervalMonths: 12,
      lastPerformedAt: '2025-07-01',
      ...overrides,
    };
  }

  it('forecasts calendar-month intervals from last performed', () => {
    const item = forecastItem(schedule(), undefined, TODAY);
    expect(item.dueDate).toBe('2026-07-01');
    expect(item.days).toBe(21);
    expect(item.bucket).toBe('due30');
  });

  it('forecasts calendar-day intervals', () => {
    const item = forecastItem(
      schedule({ intervalMonths: undefined, intervalDays: 30, lastPerformedAt: '2026-06-01' }),
      undefined,
      TODAY,
    );
    expect(item.dueDate).toBe('2026-07-01');
  });

  it('is unforecastable without a last-performed date', () => {
    const item = forecastItem(schedule({ lastPerformedAt: undefined }), undefined, TODAY);
    expect(item.bucket).toBe('unforecastable');
    expect(item.reasons[0]).toMatch(/last-performed/);
  });

  it('is unforecastable for hours-type schedule items', () => {
    const item = forecastItem(schedule({ intervalType: 'hours', intervalValue: 100 }), undefined, TODAY);
    expect(item.bucket).toBe('unforecastable');
  });

  it('marks overdue calendar items', () => {
    const item = forecastItem(schedule({ lastPerformedAt: '2025-01-01' }), undefined, TODAY);
    expect(item.bucket).toBe('overdue');
    expect(item.days).toBeLessThan(0);
  });
});

describe('forecastItem — logbook recurrences', () => {
  const rates = deriveDailyRates(aircraft(), TODAY);

  function entry(overrides: Partial<LogbookRecurrenceInput> = {}): LogbookRecurrenceInput {
    return {
      kind: 'logbook',
      sourceId: 'e1',
      aircraftId: 'ac1',
      title: '100 hour inspection',
      ...overrides,
    };
  }

  it('prefers an explicit nextDueDate', () => {
    const item = forecastItem(entry({ nextDueDate: '2026-08-15' }), rates, TODAY);
    expect(item.dueDate).toBe('2026-08-15');
    expect(item.bucket).toBe('due90');
  });

  it('projects hours recurrences through the utilization rate', () => {
    // Due at 1100 + 100 = 1200 hr; current 1160 → 40 hr remaining at ~1.103 hr/day ≈ 36 days.
    const item = forecastItem(
      entry({ recurrenceUnit: 'hours', recurrenceInterval: 100, totalTimeAtEntry: 1100 }),
      rates,
      TODAY,
    );
    expect(item.remainingValue).toBe(40);
    expect(item.remainingUnit).toBe('hours');
    expect(item.days).toBe(36);
    expect(item.bucket).toBe('due60');
    expect(item.rateSource).toBe('derived');
  });

  it('reports hours overdue when past the due value', () => {
    const item = forecastItem(
      entry({ recurrenceUnit: 'hours', recurrenceInterval: 100, totalTimeAtEntry: 1000 }),
      rates,
      TODAY,
    );
    expect(item.remainingValue).toBe(-60);
    expect(item.bucket).toBe('overdue');
    expect(dueInText(item)).toBe('overdue by 60 hr');
  });

  it('anchors calendar_months recurrences on the entry date', () => {
    const item = forecastItem(
      entry({ recurrenceUnit: 'calendar_months', recurrenceInterval: 12, entryDate: '2025-08-20' }),
      rates,
      TODAY,
    );
    expect(item.dueDate).toBe('2026-08-20');
  });

  it('is unforecastable without a rate for hours items', () => {
    const noRates = deriveDailyRates(
      aircraft({ baselineTotalTime: undefined, currentTotalTime: 1160 }),
      TODAY,
    );
    const item = forecastItem(
      entry({ recurrenceUnit: 'hours', recurrenceInterval: 100, totalTimeAtEntry: 1100 }),
      noRates,
      TODAY,
    );
    expect(item.bucket).toBe('unforecastable');
    expect(item.reasons[0]).toMatch(/needs utilization data/);
    expect(item.remainingValue).toBe(40); // remaining still shown
  });

  it('is unforecastable when the entry lacks time-at-compliance', () => {
    const item = forecastItem(entry({ recurrenceUnit: 'hours', recurrenceInterval: 100 }), rates, TODAY);
    expect(item.bucket).toBe('unforecastable');
    expect(item.reasons[0]).toMatch(/missing aircraft hours/);
  });

  it('is unforecastable when the aircraft is unknown', () => {
    const item = forecastItem(
      entry({ recurrenceUnit: 'hours', recurrenceInterval: 100, totalTimeAtEntry: 1100 }),
      undefined,
      TODAY,
    );
    expect(item.bucket).toBe('unforecastable');
  });
});

describe('forecastItem — life-limited components', () => {
  const rates = deriveDailyRates(aircraft(), TODAY);

  function component(overrides: Partial<ComponentInput> = {}): ComponentInput {
    return {
      kind: 'component',
      sourceId: 'c1',
      aircraftId: 'ac1',
      title: 'Main rotor blade',
      lifeLimit: 2000,
      lifeLimitUnit: 'hours',
      tsnAtInstall: 1700,
      aircraftTimeAtInstall: 1000,
      ...overrides,
    };
  }

  it('forecasts hours life limits from component time since new', () => {
    // Consumed since install: 1160-1000 = 160; component time 1700+160 = 1860; remaining 140 hr ≈ 126 days.
    const item = forecastItem(component(), rates, TODAY);
    expect(item.remainingValue).toBe(140);
    expect(item.bucket).toBe('later');
    expect(item.days).toBe(126);
  });

  it('falls back to TSO at install when TSN is absent', () => {
    const item = forecastItem(component({ tsnAtInstall: undefined, tsoAtInstall: 1900 }), rates, TODAY);
    expect(item.remainingValue).toBe(-60);
    expect(item.bucket).toBe('overdue');
  });

  it('forecasts cycles life limits', () => {
    const item = forecastItem(
      component({
        lifeLimitUnit: 'cycles',
        lifeLimit: 1000,
        cyclesAtInstall: 800,
        aircraftCyclesAtInstall: 845,
        tsnAtInstall: undefined,
        aircraftTimeAtInstall: undefined,
      }),
      rates,
      TODAY,
    );
    // Consumed: 945-845 = 100; component cycles 800+100 = 900; remaining 100 cyc at 1/day = 100 days.
    expect(item.remainingValue).toBe(100);
    expect(item.days).toBe(100);
  });

  it('forecasts calendar-month life limits from install date', () => {
    const item = forecastItem(
      component({ lifeLimitUnit: 'calendar_months', lifeLimit: 24, installDate: '2024-08-31' }),
      rates,
      TODAY,
    );
    expect(item.dueDate).toBe('2026-08-31');
  });

  it('is unforecastable for landings life limits (no install anchor)', () => {
    const item = forecastItem(component({ lifeLimitUnit: 'landings' }), rates, TODAY);
    expect(item.bucket).toBe('unforecastable');
  });

  it('is unforecastable without a life limit', () => {
    const item = forecastItem(component({ lifeLimit: undefined }), rates, TODAY);
    expect(item.bucket).toBe('unforecastable');
  });
});

describe('forecastProject', () => {
  it('sorts soonest-first with unforecastable last and counts buckets', () => {
    const summary = forecastProject(
      [aircraft()],
      [
        {
          kind: 'schedule',
          sourceId: 's-overdue',
          title: 'Overdue audit',
          intervalType: 'calendar',
          intervalMonths: 12,
          lastPerformedAt: '2025-01-01',
        },
        {
          kind: 'schedule',
          sourceId: 's-none',
          title: 'Never performed',
          intervalType: 'calendar',
          intervalMonths: 12,
        },
        {
          kind: 'logbook',
          sourceId: 'e-soon',
          aircraftId: 'ac1',
          title: 'Soon',
          nextDueDate: '2026-06-20',
        },
      ],
      TODAY,
    );
    expect(summary.items.map((i) => i.sourceId)).toEqual(['s-overdue', 'e-soon', 's-none']);
    expect(summary.counts.overdue).toBe(1);
    expect(summary.counts.due30).toBe(1);
    expect(summary.counts.unforecastable).toBe(1);
    expect(summary.items[1].tailNumber).toBe('N123AB');
  });

  it('never drops an item: every input lands in exactly one bucket', () => {
    const inputs = [
      { kind: 'schedule', sourceId: 'a', title: 'A', intervalType: 'hours', intervalValue: 50 },
      { kind: 'schedule', sourceId: 'b', title: 'B', intervalType: 'calendar' },
      { kind: 'logbook', sourceId: 'c', aircraftId: 'ghost', title: 'C', recurrenceUnit: 'hours', recurrenceInterval: 10, totalTimeAtEntry: 5 },
    ] as const;
    const summary = forecastProject([aircraft()], [...inputs], TODAY);
    expect(summary.items).toHaveLength(inputs.length);
    const total = Object.values(summary.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(inputs.length);
  });
});

describe('dueInText', () => {
  it('formats day-based and unit-based text', () => {
    const summary = forecastProject(
      [aircraft()],
      [
        { kind: 'logbook', sourceId: 'x', aircraftId: 'ac1', title: 'X', nextDueDate: '2026-06-11' },
        { kind: 'logbook', sourceId: 'y', aircraftId: 'ac1', title: 'Y', nextDueDate: '2026-06-10' },
        { kind: 'logbook', sourceId: 'z', aircraftId: 'ac1', title: 'Z', nextDueDate: '2026-06-08' },
      ],
      TODAY,
    );
    const byId = new Map(summary.items.map((i) => [i.sourceId, i]));
    expect(dueInText(byId.get('x')!)).toBe('due in 1 day');
    expect(dueInText(byId.get('y')!)).toBe('due today');
    expect(dueInText(byId.get('z')!)).toBe('overdue by 2 days');
  });
});
