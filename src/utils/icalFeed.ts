/**
 * iCalendar (RFC 5545) builder for the due-list feed. Pure functions — used by
 * api/due-ical.ts and unit-tested directly.
 *
 * Each forecastable item becomes an all-day VEVENT with a stable UID
 * (source + sourceId), so calendar clients update events on refresh instead of
 * duplicating them.
 */

import type { DueForecastItem } from './dueForecast';

export const ICAL_HORIZON_DAYS = 90;

/** Escape per RFC 5545 §3.3.11: backslash, semicolon, comma, newline. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold lines longer than 75 octets with CRLF + space (RFC 5545 §3.1). */
export function foldIcsLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let rest = line;
  let first = true;
  while (rest.length > 0) {
    const width = first ? 75 : 74;
    parts.push((first ? '' : ' ') + rest.slice(0, width));
    rest = rest.slice(width);
    first = false;
  }
  return parts.join('\r\n');
}

function dateToIcsDate(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}

function dateToIcsTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

const SOURCE_LABEL: Record<DueForecastItem['source'], string> = {
  schedule: 'Inspection schedule',
  logbook: 'Logbook recurrence',
  component: 'Life-limited component',
};

/**
 * Build the ICS document for forecastable items due within the horizon
 * (overdue items included so they stay visible on the calendar).
 */
export function buildDueListIcs(
  items: DueForecastItem[],
  options: { calendarName?: string; now: Date; horizonDays?: number },
): string {
  const horizon = options.horizonDays ?? ICAL_HORIZON_DAYS;
  const dtstamp = dateToIcsTimestamp(options.now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AeroGap//Due List//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(options.calendarName ?? 'AeroGap Due List')}`),
  ];

  for (const item of items) {
    if (item.bucket === 'unforecastable') continue;
    if (!item.dueDate || typeof item.days !== 'number') continue;
    if (item.days > horizon) continue;

    const summaryText = item.tailNumber ? `${item.title} (${item.tailNumber})` : item.title;
    const remaining =
      typeof item.remainingValue === 'number' && item.remainingUnit
        ? ` · ${Math.round(item.remainingValue)} ${item.remainingUnit} remaining`
        : '';
    const description = `${SOURCE_LABEL[item.source]}${remaining}${item.stale ? ' · utilization data stale' : ''}`;

    lines.push(
      'BEGIN:VEVENT',
      foldIcsLine(`UID:aerogap-${item.source}-${item.sourceId}@aerogap.app`),
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dateToIcsDate(item.dueDate)}`,
      foldIcsLine(`SUMMARY:${escapeIcsText(summaryText)}`),
      foldIcsLine(`DESCRIPTION:${escapeIcsText(description)}`),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
