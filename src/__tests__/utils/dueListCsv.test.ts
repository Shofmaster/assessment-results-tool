import { describe, it, expect } from 'vitest';
import { csvEscape, dueListToCsv } from '../../utils/dueListCsv';
import type { DueForecastItem } from '../../utils/dueForecast';

function item(overrides: Partial<DueForecastItem>): DueForecastItem {
  return {
    source: 'schedule',
    sourceId: 's1',
    title: 'Torque wrench calibration',
    bucket: 'due30',
    days: 21,
    dueDate: '2026-07-01',
    reasons: [],
    stale: false,
    ...overrides,
  };
}

describe('csvEscape', () => {
  it('passes plain values through', () => {
    expect(csvEscape('hello')).toBe('hello');
    expect(csvEscape(42)).toBe('42');
    expect(csvEscape(undefined)).toBe('');
  });

  it('quotes commas, quotes, and newlines', () => {
    expect(csvEscape('a,b')).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"');
  });
});

describe('dueListToCsv', () => {
  it('emits a header plus one row per item', () => {
    const csv = dueListToCsv([item({}), item({ sourceId: 's2', bucket: 'overdue', days: -3 })]);
    const lines = csv.split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Bucket');
    expect(lines[1]).toContain('due30');
    expect(lines[2]).toContain('overdue');
  });

  it('escapes titles containing commas', () => {
    const csv = dueListToCsv([item({ title: 'ELT battery, replace' })]);
    expect(csv.split('\r\n')[1]).toContain('"ELT battery, replace"');
  });

  it('writes reasons for unforecastable items', () => {
    const csv = dueListToCsv([
      item({ bucket: 'unforecastable', days: undefined, dueDate: undefined, reasons: ['needs utilization data (hr/day rate)'] }),
    ]);
    expect(csv).toContain('needs utilization data');
  });

  it('includes remaining hours rounded to one decimal', () => {
    const csv = dueListToCsv([item({ remainingValue: 39.96, remainingUnit: 'hours', rateSource: 'derived' })]);
    const row = csv.split('\r\n')[1];
    expect(row).toContain('40');
    expect(row).toContain('hours');
    expect(row).toContain('derived');
  });
});
