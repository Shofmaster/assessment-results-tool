import { describe, it, expect } from 'vitest';
import { parseCSV } from '../../services/csvImporter';
import {
  detectDueListProvider,
  autoDetectDueListMapping,
  dueListMappingIssues,
  buildDueListPreview,
  normalizeTailNumber,
  mapRowToDueItem,
} from '../../services/dueListImporter';

/** Pinned CAMP-style due-list export fixture. */
const CAMP_CSV = [
  'Aircraft,ATA/Item,Task Description,Compliance Date,Compliance Hours,Due Date,Due Hours,Time Remaining',
  'N123AB,05-10,100 Hour Inspection,03/15/2026,"1,100.0",,"1,200.0",40 hrs',
  'N123AB,25-60,ELT Battery Replacement,01/10/2025,,01/10/2027,,7 months',
  'N-456CD,32-40,Main Tire Replacement,02/01/2026,"3,400.0",,"3,650.0",250 hrs',
].join('\n');

/** Pinned Veryon-style due-list export fixture. */
const VERYON_CSV = [
  'Registration,ATA Code,Item Description,Last Complied With,Estimated Due Date,Estimated Due Hours,Remaining',
  'N123AB,05,Annual Inspection,2025-08-20,2026-08-20,,71 days',
].join('\n');

describe('detectDueListProvider', () => {
  it('detects CAMP due-list headers', () => {
    const { headers } = parseCSV(CAMP_CSV);
    expect(detectDueListProvider(headers)).toBe('camp');
  });

  it('detects Veryon due-list headers', () => {
    const { headers } = parseCSV(VERYON_CSV);
    expect(detectDueListProvider(headers)).toBe('veryon');
  });

  it('falls back to generic for unknown headers', () => {
    expect(detectDueListProvider(['Col A', 'Col B', 'Col C'])).toBe('generic');
  });
});

describe('autoDetectDueListMapping', () => {
  it('maps the CAMP fixture completely enough to import', () => {
    const { headers } = parseCSV(CAMP_CSV);
    const mapping = autoDetectDueListMapping(headers, 'camp');
    expect(mapping.tailNumber).toBe('Aircraft');
    expect(mapping.title).toBe('Task Description');
    expect(mapping.ataChapter).toBe('ATA/Item');
    expect(mapping.nextDueDate).toBe('Due Date');
    expect(mapping.nextDueHours).toBe('Due Hours');
    expect(dueListMappingIssues(mapping)).toEqual([]);
  });

  it('maps the Veryon fixture', () => {
    const { headers } = parseCSV(VERYON_CSV);
    const mapping = autoDetectDueListMapping(headers, 'veryon');
    expect(mapping.tailNumber).toBe('Registration');
    expect(mapping.title).toBe('Item Description');
    expect(mapping.nextDueDate).toBe('Estimated Due Date');
    expect(dueListMappingIssues(mapping)).toEqual([]);
  });

  it('reports issues for unusable mappings', () => {
    const mapping = autoDetectDueListMapping(['Foo', 'Bar'], 'generic');
    const issues = dueListMappingIssues(mapping);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it('never maps one column to two fields', () => {
    const { headers } = parseCSV(VERYON_CSV);
    const mapping = autoDetectDueListMapping(headers, 'veryon');
    const used = Object.values(mapping).filter((v): v is string => v !== null);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe('normalizeTailNumber', () => {
  it('strips separators and uppercases', () => {
    expect(normalizeTailNumber('N-123AB')).toBe('N123AB');
    expect(normalizeTailNumber(' n123ab ')).toBe('N123AB');
    expect(normalizeTailNumber('D-ABCD')).toBe('DABCD');
  });
});

describe('mapRowToDueItem / buildDueListPreview', () => {
  it('maps CAMP rows with thousands separators and mixed axes', () => {
    const { headers, rows } = parseCSV(CAMP_CSV);
    const mapping = autoDetectDueListMapping(headers, 'camp');
    const preview = buildDueListPreview(rows, headers, mapping);

    expect(preview).toHaveLength(3);
    const first = preview[0].mapped!;
    expect(first.tailNumber).toBe('N123AB');
    expect(first.title).toBe('100 Hour Inspection');
    expect(first.lastDoneDate).toBe('2026-03-15');
    expect(first.lastDoneHours).toBe(1100);
    expect(first.nextDueHours).toBe(1200);
    expect(preview[0].warnings).toEqual([]);

    const second = preview[1].mapped!;
    expect(second.nextDueDate).toBe('2027-01-10');
    expect(second.nextDueHours).toBeUndefined();

    const third = preview[2].mapped!;
    expect(third.tailNumber).toBe('N456CD'); // dash stripped
  });

  it('rejects rows without a tail number', () => {
    const headers = ['Aircraft', 'Task Description', 'Due Date'];
    const { item, warnings } = mapRowToDueItem(['', 'Annual', '01/01/2027'], headers, {
      tailNumber: 'Aircraft',
      title: 'Task Description',
      ataChapter: null,
      intervalText: null,
      lastDoneDate: null,
      lastDoneHours: null,
      lastDoneCycles: null,
      nextDueDate: 'Due Date',
      nextDueHours: null,
      nextDueCycles: null,
      remainingText: null,
    });
    expect(item).toBeNull();
    expect(warnings[0]).toMatch(/tail number/i);
  });

  it('warns on rows with no due signal', () => {
    const headers = ['Aircraft', 'Task Description', 'Due Date'];
    const { item, warnings } = mapRowToDueItem(['N1', 'Annual', ''], headers, {
      tailNumber: 'Aircraft',
      title: 'Task Description',
      ataChapter: null,
      intervalText: null,
      lastDoneDate: null,
      lastDoneHours: null,
      lastDoneCycles: null,
      nextDueDate: 'Due Date',
      nextDueHours: null,
      nextDueCycles: null,
      remainingText: null,
    });
    expect(item).not.toBeNull();
    expect(warnings[0]).toMatch(/no due date/i);
  });

  it('warns on unparseable dates and numbers without dropping the row', () => {
    const headers = ['Aircraft', 'Task Description', 'Due Date', 'Due Hours'];
    const { item, warnings } = mapRowToDueItem(['N1', 'Annual', 'someday', 'lots'], headers, {
      tailNumber: 'Aircraft',
      title: 'Task Description',
      ataChapter: null,
      intervalText: null,
      lastDoneDate: null,
      lastDoneHours: null,
      lastDoneCycles: null,
      nextDueDate: 'Due Date',
      nextDueHours: 'Due Hours',
      nextDueCycles: null,
      remainingText: null,
    });
    expect(item).not.toBeNull();
    expect(warnings.some((w) => w.includes('Unrecognized date'))).toBe(true);
    expect(warnings.some((w) => w.includes('Non-numeric'))).toBe(true);
  });
});
