import { describe, it, expect } from 'vitest';
import { buildScheduleLogbookCrossRef, scoreEntryForScheduleItem } from '../../services/scheduleLogbookCrossRef';
import type { InspectionScheduleItem } from '../../types/inspectionSchedule';
import type { LogbookEntry } from '../../types/logbook';

describe('scoreEntryForScheduleItem', () => {
  it('boosts score for matching ATA and inspection', () => {
    const item: Pick<InspectionScheduleItem, 'title' | 'description' | 'category' | 'ataChapter'> = {
      title: '100-hour inspection',
      description: '',
      category: 'other',
      ataChapter: '05',
    };
    const entry: Pick<LogbookEntry, 'entryType' | 'ataChapter' | 'workPerformed' | 'rawText' | 'inspectionType' | 'entryDate'> = {
      entryType: 'inspection',
      ataChapter: '05',
      workPerformed: '100 hour inspection completed',
      rawText: '',
      inspectionType: '100_hour',
      entryDate: '2024-01-01',
    };
    expect(scoreEntryForScheduleItem(item, entry)).toBeGreaterThan(30);
  });
});

describe('buildScheduleLogbookCrossRef', () => {
  it('links schedule item to latest matching inspection', () => {
    const items: InspectionScheduleItem[] = [
      {
        _id: 's1',
        projectId: 'p',
        userId: 'u',
        title: 'Annual inspection',
        intervalType: 'calendar',
        intervalMonths: 12,
        ataChapter: '05',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const entries: LogbookEntry[] = [
      {
        _id: 'e1',
        projectId: 'p',
        userId: 'u',
        aircraftId: 'a',
        rawText: 'Annual inspection',
        entryDate: '2023-06-01',
        entryType: 'inspection',
        ataChapter: '05',
        inspectionType: 'annual',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const rows = buildScheduleLogbookCrossRef(items, entries);
    expect(rows).toHaveLength(1);
    expect(rows[0].matchedEntry?._id).toBe('e1');
  });
});
