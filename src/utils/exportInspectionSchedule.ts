/**
 * Export inspection schedule: month-by-month, overdue listing, Google Calendar (ICS).
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export interface ScheduleItemWithDue {
  _id: string;
  title: string;
  category?: string;
  intervalType: string;
  intervalMonths?: number;
  intervalDays?: number;
  lastPerformedAt?: string;
  sourceDocumentName?: string;
  nextDue: string | null;
  status: string;
}

function formatInterval(item: {
  intervalType: string;
  intervalMonths?: number;
  intervalDays?: number;
}): string {
  if (item.intervalType === 'calendar') {
    if (item.intervalMonths) {
      if (item.intervalMonths === 3) return 'Quarterly';
      if (item.intervalMonths === 6) return 'Semi-annual';
      if (item.intervalMonths === 12) return 'Annual';
      return `Every ${item.intervalMonths} months`;
    }
    if (item.intervalDays) return `Every ${item.intervalDays} days`;
  }
  return '—';
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/** Export schedule as month-by-month PDF (next 12 months from today). */
export async function exportScheduleMonthByMonth(
  items: ScheduleItemWithDue[],
  projectName?: string
): Promise<void> {
  const calendarItems = items.filter((i) => i.nextDue && i.intervalType === 'calendar');
  const today = new Date();
  const monthCount = 12;

  const byMonthSimple = new Map<string, ScheduleItemWithDue[]>();
  for (let m = 0; m < monthCount; m++) {
    const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
    const key = d.toISOString().slice(0, 7);
    byMonthSimple.set(
      key,
      calendarItems.filter((i) => i.nextDue && i.nextDue.startsWith(key))
    );
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  let y = 750;
  const lineHeight = 14;
  const margin = 50;
  const pageWidth = 612;

  const addHeader = (text: string) => {
    if (y < 100) {
      doc.addPage([612, 792]);
      y = 750;
    }
    doc.getPages().at(-1)!.drawText(text, {
      x: margin,
      y,
      size: 12,
      font: boldFont,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= lineHeight;
  };

  const addLine = (text: string) => {
    if (y < 60) {
      doc.addPage([612, 792]);
      y = 750;
    }
    doc.getPages().at(-1)!.drawText(text.slice(0, 90), {
      x: margin,
      y,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= lineHeight;
  };

  addHeader(projectName ? `Inspection Schedule: ${projectName}` : 'Inspection Schedule');
  addHeader(`Exported ${today.toLocaleDateString()}`);
  y -= 10;

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  for (const [key, arr] of Array.from(byMonthSimple.entries()).sort()) {
    const [yyyy, mm] = key.split('-');
    const monthName = monthNames[parseInt(mm, 10) - 1];
    addHeader(`${monthName} ${yyyy}`);
    if (arr.length === 0) {
      addLine('  (no items due)');
    } else {
      for (const item of arr.sort((a, b) => (a.nextDue || '').localeCompare(b.nextDue || ''))) {
        addLine(`  ${item.nextDue} — ${item.title} (${formatInterval(item)})${item.sourceDocumentName ? ` — ${item.sourceDocumentName}` : ''}`);
      }
    }
    y -= 8;
  }

  const pdfBytes = await doc.save();
  const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
  const date = today.toISOString().split('T')[0];
  downloadBlob(blob, `inspection-schedule-${date}.pdf`);
}

/** Export overdue items as CSV. */
export function exportOverdueListing(
  items: ScheduleItemWithDue[],
  projectName?: string
): void {
  const overdue = items.filter((i) => i.status === 'overdue' && i.nextDue);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows: string[][] = [
    ['Title', 'Category', 'Interval', 'Last Performed', 'Next Due', 'Days Overdue', 'Source Document'],
    ...overdue.map((item) => {
      const due = new Date(item.nextDue!);
      due.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((today.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
      return [
        item.title,
        item.category ?? '',
        formatInterval(item),
        item.lastPerformedAt ?? '',
        item.nextDue ?? '',
        String(daysOverdue),
        item.sourceDocumentName ?? '',
      ];
    }),
  ];

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const date = today.toISOString().split('T')[0];
  downloadBlob(blob, `inspection-overdue-${date}.csv`);
}

/** Export schedule as ICS for Google Calendar import. */
export function exportToGoogleCalendar(
  items: ScheduleItemWithDue[],
  projectName?: string
): void {
  const calendarItems = items.filter((i) => i.nextDue && i.intervalType === 'calendar');
  const now = new Date();
  const nowStr = now.toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';

  const events: string[] = [];
  for (const item of calendarItems) {
    if (!item.nextDue) continue;
    const dtStart = item.nextDue.replace(/-/g, '');
    const uid = `${item._id}-${item.nextDue}@aviationassessment`;
    const summary = escapeIcsText(item.title);
    const descParts = [
      item.category ? `Category: ${item.category}` : '',
      formatInterval(item) !== '—' ? `Interval: ${formatInterval(item)}` : '',
      item.sourceDocumentName ? `Source: ${item.sourceDocumentName}` : '',
    ].filter(Boolean);
    const description = escapeIcsText(descParts.join('\n'));

    events.push(
      [
        'BEGIN:VEVENT',
        `UID:${uid}`,
        `DTSTAMP:${nowStr}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtStart}`,
        `SUMMARY:${summary}`,
        description ? `DESCRIPTION:${description}` : '',
        'END:VEVENT',
      ]
        .filter(Boolean)
        .join('\r\n')
    );
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AviationAssessment//InspectionSchedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const date = now.toISOString().split('T')[0];
  downloadBlob(blob, `inspection-schedule-${date}.ics`);
}
