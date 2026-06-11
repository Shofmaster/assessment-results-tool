import { dueInText, type DueForecastItem } from './dueForecast';

/**
 * CSV export of the due-list forecast — for sharing with a DOM or auditor.
 * Includes every item (even unforecastable, with reasons) so the export is a
 * faithful copy of the forecast, not a filtered view.
 */

export function csvEscape(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const HEADER = [
  'Bucket',
  'Due date',
  'Days until due',
  'Item',
  'Tail number',
  'Source',
  'Remaining',
  'Unit',
  'Rate basis',
  'Times stale',
  'Notes',
];

export function dueListToCsv(items: DueForecastItem[]): string {
  const lines = [HEADER.join(',')];
  for (const item of items) {
    lines.push(
      [
        csvEscape(item.bucket),
        csvEscape(item.dueDate ?? ''),
        csvEscape(typeof item.days === 'number' ? item.days : ''),
        csvEscape(item.title),
        csvEscape(item.tailNumber ?? ''),
        csvEscape(item.source),
        csvEscape(typeof item.remainingValue === 'number' ? Math.round(item.remainingValue * 10) / 10 : ''),
        csvEscape(item.remainingUnit ?? ''),
        csvEscape(item.rateSource ?? ''),
        csvEscape(item.stale ? 'yes' : ''),
        csvEscape(item.bucket === 'unforecastable' ? item.reasons.join('; ') : dueInText(item)),
      ].join(','),
    );
  }
  return lines.join('\r\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
