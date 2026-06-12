import { describe, it, expect } from 'vitest';
import { buildDueListIcs, escapeIcsText, foldIcsLine } from '../../utils/icalFeed';
import type { DueForecastItem } from '../../utils/dueForecast';

const NOW = new Date(Date.UTC(2026, 5, 10, 12, 0, 0));

function item(overrides: Partial<DueForecastItem> = {}): DueForecastItem {
  return {
    source: 'logbook',
    sourceId: 'e1',
    aircraftId: 'ac1',
    tailNumber: 'N123AB',
    title: '100 hour inspection',
    dueDate: '2026-07-01',
    days: 21,
    bucket: 'due30',
    reasons: [],
    stale: false,
    ...overrides,
  };
}

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma, and newlines', () => {
    expect(escapeIcsText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
    expect(escapeIcsText('crlf\r\nend')).toBe('crlf\\nend');
  });
});

describe('foldIcsLine', () => {
  it('leaves short lines unchanged', () => {
    expect(foldIcsLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds long lines with CRLF + space continuation', () => {
    const folded = foldIcsLine(`SUMMARY:${'x'.repeat(200)}`);
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines[0].length).toBe(75);
    for (const cont of lines.slice(1)) {
      expect(cont.startsWith(' ')).toBe(true);
      expect(cont.length).toBeLessThanOrEqual(75);
    }
    // Round-trip: unfolding restores the original content.
    expect(folded.replace(/\r\n /g, '')).toBe(`SUMMARY:${'x'.repeat(200)}`);
  });
});

describe('buildDueListIcs', () => {
  it('emits a valid calendar wrapper and one VEVENT per forecastable item', () => {
    const ics = buildDueListIcs([item(), item({ sourceId: 'e2', dueDate: '2026-08-01', days: 52 })], { now: NOW });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(ics).toContain('DTSTART;VALUE=DATE:20260701');
    expect(ics).toContain('SUMMARY:100 hour inspection (N123AB)');
  });

  it('uses stable UIDs so calendar clients update instead of duplicate', () => {
    const a = buildDueListIcs([item()], { now: NOW });
    const b = buildDueListIcs([item({ days: 20, dueDate: '2026-06-30' })], { now: new Date(Date.UTC(2026, 5, 11)) });
    const uidOf = (ics: string) => /UID:(.+)/.exec(ics)?.[1];
    expect(uidOf(a)).toBe('aerogap-logbook-e1@aerogap.app');
    expect(uidOf(a)).toBe(uidOf(b));
  });

  it('includes overdue items but skips beyond-horizon and unforecastable items', () => {
    const ics = buildDueListIcs(
      [
        item({ sourceId: 'over', days: -5, dueDate: '2026-06-05', bucket: 'overdue' }),
        item({ sourceId: 'far', days: 200, dueDate: '2026-12-27', bucket: 'later' }),
        item({ sourceId: 'none', days: undefined, dueDate: undefined, bucket: 'unforecastable', reasons: ['x'] }),
      ],
      { now: NOW },
    );
    expect(ics).toContain('aerogap-logbook-over');
    expect(ics).not.toContain('aerogap-logbook-far');
    expect(ics).not.toContain('aerogap-logbook-none');
  });

  it('escapes commas and semicolons in titles', () => {
    const ics = buildDueListIcs([item({ title: 'Check, adjust; verify' })], { now: NOW });
    expect(ics).toContain('SUMMARY:Check\\, adjust\\; verify (N123AB)');
  });

  it('notes remaining value and staleness in the description', () => {
    const ics = buildDueListIcs(
      [item({ remainingValue: 40.4, remainingUnit: 'hours', stale: true })],
      { now: NOW },
    );
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain('DESCRIPTION:Logbook recurrence · 40 hours remaining · utilization data stale');
  });
});
