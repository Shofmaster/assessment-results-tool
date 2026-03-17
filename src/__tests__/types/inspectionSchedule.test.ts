import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeNextDue, getDueStatus } from '../../types/inspectionSchedule';

describe('computeNextDue', () => {
  it('returns null when last performed date is missing', () => {
    expect(
      computeNextDue({
        intervalType: 'calendar',
        intervalMonths: 6,
      }),
    ).toBeNull();
  });

  it('computes month-based due dates', () => {
    expect(
      computeNextDue({
        lastPerformedAt: '2024-01-15',
        intervalType: 'calendar',
        intervalMonths: 6,
      }),
    ).toBe('2024-07-15');
  });

  it('computes day-based due dates', () => {
    expect(
      computeNextDue({
        lastPerformedAt: '2024-01-15',
        intervalType: 'calendar',
        intervalDays: 30,
      }),
    ).toBe('2024-02-14');
  });

  it('returns null for non-calendar intervals in v1', () => {
    expect(
      computeNextDue({
        lastPerformedAt: '2024-01-15',
        intervalType: 'hours',
        intervalValue: 100,
      }),
    ).toBeNull();
  });
});

describe('getDueStatus', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns no_date when there is no due date', () => {
    expect(getDueStatus(null)).toBe('no_date');
  });

  it('classifies overdue, due soon, and on track dates against today', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-01T12:00:00Z'));

    expect(getDueStatus('2024-04-30')).toBe('overdue');
    expect(getDueStatus('2024-05-31')).toBe('due_soon');
    expect(getDueStatus('2024-06-01')).toBe('on_track');
  });
});
