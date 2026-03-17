import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const drawTextCalls: string[] = [];

vi.mock('pdf-lib', () => {
  const fakePages: Array<{ drawText: (text: string) => void }> = [];

  const createDoc = () => ({
    addPage: vi.fn(() => {
      const page = {
        drawText: vi.fn((text: string) => {
          drawTextCalls.push(text);
        }),
      };
      fakePages.push(page);
      return page;
    }),
    embedFont: vi.fn(async (fontName: string) => fontName),
    getPages: vi.fn(() => fakePages),
    save: vi.fn(async () => new Uint8Array([1, 2, 3])),
  });

  return {
    PDFDocument: {
      create: vi.fn(async () => createDoc()),
    },
    StandardFonts: {
      Helvetica: 'Helvetica',
      HelveticaBold: 'HelveticaBold',
    },
    rgb: vi.fn(() => ({ r: 0, g: 0, b: 0 })),
  };
});

import {
  exportOverdueListing,
  exportScheduleMonthByMonth,
  exportToGoogleCalendar,
  type ScheduleItemWithDue,
} from '../../utils/exportInspectionSchedule';

describe('inspection schedule exports', () => {
  let capturedBlob: Blob | null;
  let fakeAnchor: { href: string; download: string; click: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-05-01T12:00:00Z'));

    drawTextCalls.length = 0;
    capturedBlob = null;
    fakeAnchor = { href: '', download: '', click: vi.fn() };

    vi.spyOn(document, 'createElement').mockReturnValue(fakeAnchor as any);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
    vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:inspection-export';
      }),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('exports overdue CSV with only overdue items and escaped values', async () => {
    const items: ScheduleItemWithDue[] = [
      {
        _id: 'overdue',
        title: 'Torque "Wrench" Calibration',
        category: 'calibration',
        intervalType: 'calendar',
        intervalMonths: 6,
        lastPerformedAt: '2023-10-26',
        sourceDocumentName: 'Repair Station Manual',
        nextDue: '2024-04-26',
        status: 'overdue',
      },
      {
        _id: 'soon',
        title: 'Internal Audit',
        category: 'audit',
        intervalType: 'calendar',
        intervalMonths: 12,
        lastPerformedAt: '2023-06-01',
        sourceDocumentName: 'Audit Procedure',
        nextDue: '2024-05-20',
        status: 'due_soon',
      },
    ];

    exportOverdueListing(items, 'Test Project');

    expect(fakeAnchor.download).toBe('inspection-overdue-2024-05-01.csv');
    expect(fakeAnchor.click).toHaveBeenCalledOnce();
    const csv = await capturedBlob?.text();
    expect(csv).toContain('"Torque ""Wrench"" Calibration"');
    expect(csv).toContain('"5"');
    expect(csv).not.toContain('Internal Audit');
  });

  it('exports Google Calendar ICS with escaped summary and description', async () => {
    const items: ScheduleItemWithDue[] = [
      {
        _id: 'calendar-item',
        title: 'Torque, Wrench; Calibration\\Check',
        category: 'calibration',
        intervalType: 'calendar',
        intervalMonths: 6,
        lastPerformedAt: '2023-11-10',
        sourceDocumentName: 'Manual, Rev A',
        nextDue: '2024-05-10',
        status: 'due_soon',
      },
      {
        _id: 'hours-item',
        title: 'Engine borescope',
        category: 'other',
        intervalType: 'hours',
        intervalValue: 100,
        nextDue: '2024-05-15',
        status: 'due_soon',
      } as ScheduleItemWithDue,
    ];

    exportToGoogleCalendar(items, 'Test Project');

    expect(fakeAnchor.download).toBe('inspection-schedule-2024-05-01.ics');
    const ics = await capturedBlob?.text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Torque\\, Wrench\\; Calibration\\\\Check');
    expect(ics).toContain('DESCRIPTION:Category: calibration\\nInterval: Semi-annual\\nSource: Manual\\, Rev A');
    expect(ics).not.toContain('Engine borescope');
  });

  it('exports month-by-month PDF and includes matching due items', async () => {
    const items: ScheduleItemWithDue[] = [
      {
        _id: 'may-item',
        title: 'Torque Wrench Calibration',
        category: 'calibration',
        intervalType: 'calendar',
        intervalMonths: 6,
        lastPerformedAt: '2023-11-10',
        sourceDocumentName: 'Repair Station Manual',
        nextDue: '2024-05-10',
        status: 'due_soon',
      },
      {
        _id: 'hours-item',
        title: 'Engine borescope',
        category: 'other',
        intervalType: 'hours',
        intervalValue: 100,
        nextDue: '2024-05-15',
        status: 'due_soon',
      } as ScheduleItemWithDue,
    ];

    await exportScheduleMonthByMonth(items, 'Test Project');

    expect(fakeAnchor.download).toBe('inspection-schedule-2024-05-01.pdf');
    expect(fakeAnchor.click).toHaveBeenCalledOnce();
    expect(drawTextCalls).toContain('Inspection Schedule: Test Project');
    expect(drawTextCalls).toContain('May 2024');
    expect(
      drawTextCalls.some((text) => text.includes('2024-05-10') && text.includes('Torque Wrench Calibration')),
    ).toBe(true);
    expect(drawTextCalls.some((text) => text.includes('Engine borescope'))).toBe(false);
  });
});
