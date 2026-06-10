/**
 * Due-list report importer (CAMP / Veryon / generic CSV).
 *
 * Customers export the due-list report from their maintenance tracker and
 * upload it here. Reuses the RFC-4180 parser and date normaliser from
 * csvImporter.ts; this module owns the due-list column vocabulary, provider
 * detection, and row mapping (including tail-number normalization). Header
 * signatures are best-effort and pinned in tests — detection failure degrades
 * to manual column mapping, never a hard error.
 */

import { normaliseDate } from './csvImporter';

export type DueListField =
  | 'tailNumber'
  | 'title'
  | 'ataChapter'
  | 'intervalText'
  | 'lastDoneDate'
  | 'lastDoneHours'
  | 'lastDoneCycles'
  | 'nextDueDate'
  | 'nextDueHours'
  | 'nextDueCycles'
  | 'remainingText';

export type DueListColumnMapping = Record<DueListField, string | null>;
export type DueListProvider = 'generic' | 'camp' | 'veryon';

export interface MappedDueItem {
  /** Normalized registration, e.g. "N123AB" (uppercase, separators stripped). */
  tailNumber: string;
  title: string;
  ataChapter?: string;
  intervalText?: string;
  lastDoneDate?: string;
  lastDoneHours?: number;
  lastDoneCycles?: number;
  nextDueDate?: string;
  nextDueHours?: number;
  nextDueCycles?: number;
  remainingText?: string;
}

export interface DueItemPreviewRow {
  mapped: MappedDueItem | null;
  raw: Record<string, string>;
  rowNum: number;
  warnings: string[];
}

const DUE_FIELD_PATTERNS: Record<DueListField, string[]> = {
  tailNumber: [
    'tail number', 'tail', 'aircraft', 'registration', 'reg', 'ac reg', 'a/c reg',
    'aircraft registration', 'tail no', 'registration number', 'ac', 'a/c',
  ],
  title: [
    'task description', 'item description', 'description', 'task', 'item',
    'requirement', 'event', 'maintenance item', 'due item', 'task name', 'item name',
  ],
  ataChapter: ['ata', 'ata chapter', 'chapter', 'ata/item', 'ata code'],
  intervalText: ['interval', 'frequency', 'schedule', 'recurrence', 'period'],
  lastDoneDate: [
    'last done date', 'last done', 'compliance date', 'last complied date',
    'last complied with', 'c/w date', 'last c/w date', 'completed date', 'last completed',
  ],
  lastDoneHours: [
    'last done hours', 'compliance hours', 'c/w hours', 'last c/w hours',
    'last done time', 'completed hours',
  ],
  lastDoneCycles: [
    'last done cycles', 'compliance cycles', 'c/w cycles', 'c/w landings',
    'last done landings', 'completed cycles',
  ],
  nextDueDate: [
    'due date', 'next due date', 'next due', 'due', 'estimated due date',
    'projected due date', 'date due',
  ],
  nextDueHours: [
    'due hours', 'due at hours', 'next due hours', 'due time', 'hours due',
    'estimated due hours', 'due hrs',
  ],
  nextDueCycles: [
    'due cycles', 'due landings', 'next due cycles', 'cycles due', 'landings due',
    'estimated due cycles',
  ],
  remainingText: [
    'time remaining', 'remaining', 'days remaining', 'hours remaining',
    'remaining time', 'time to go', 'tolerance',
  ],
};

const DUE_PROVIDER_PRESETS: Record<Exclude<DueListProvider, 'generic'>, Partial<Record<DueListField, string[]>>> = {
  camp: {
    tailNumber: ['aircraft', 'tail number', 'registration'],
    title: ['task description', 'description', 'requirement'],
    ataChapter: ['ata', 'ata/item', 'chapter'],
    lastDoneDate: ['compliance date', 'c/w date', 'last done date'],
    lastDoneHours: ['compliance hours', 'c/w hours'],
    nextDueDate: ['due date', 'next due date'],
    nextDueHours: ['due hours', 'due hrs'],
    nextDueCycles: ['due landings', 'due cycles'],
    remainingText: ['time remaining', 'tolerance'],
  },
  veryon: {
    tailNumber: ['aircraft', 'registration', 'tail'],
    title: ['item', 'description', 'item description', 'task name'],
    ataChapter: ['ata code', 'ata'],
    lastDoneDate: ['last complied with', 'last complied date', 'completed date'],
    nextDueDate: ['estimated due date', 'due date', 'next due'],
    nextDueHours: ['estimated due hours', 'due hours'],
    nextDueCycles: ['estimated due cycles', 'due cycles'],
    remainingText: ['remaining', 'time to go'],
  },
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().trim().replace(/[\s_-]+/g, ' ');
}

/** "N-123AB" / "n123ab " → "N123AB". Strips separators, uppercases. */
export function normalizeTailNumber(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function detectDueListProvider(headers: string[]): DueListProvider {
  const normalized = new Set(headers.map(normalizeHeader));
  const scoreProvider = (provider: Exclude<DueListProvider, 'generic'>): number => {
    let score = 0;
    for (const patterns of Object.values(DUE_PROVIDER_PRESETS[provider])) {
      for (const pattern of patterns ?? []) {
        if (normalized.has(normalizeHeader(pattern))) {
          score += 1;
          break;
        }
      }
    }
    return score;
  };
  const scores: Array<{ provider: Exclude<DueListProvider, 'generic'>; score: number }> = [
    { provider: 'camp', score: scoreProvider('camp') },
    { provider: 'veryon', score: scoreProvider('veryon') },
  ];
  const best = scores.sort((a, b) => b.score - a.score)[0];
  return best.score >= 4 ? best.provider : 'generic';
}

export function dueListProviderLabel(provider: DueListProvider): string {
  if (provider === 'camp') return 'CAMP';
  if (provider === 'veryon') return 'Veryon';
  return 'Generic CSV';
}

export function autoDetectDueListMapping(
  headers: string[],
  provider: DueListProvider = 'generic',
): DueListColumnMapping {
  const mapping: DueListColumnMapping = {
    tailNumber: null,
    title: null,
    ataChapter: null,
    intervalText: null,
    lastDoneDate: null,
    lastDoneHours: null,
    lastDoneCycles: null,
    nextDueDate: null,
    nextDueHours: null,
    nextDueCycles: null,
    remainingText: null,
  };
  const normalizedHeaders = headers.map(normalizeHeader);
  const preset = provider === 'generic' ? undefined : DUE_PROVIDER_PRESETS[provider];
  const used = new Set<string>();

  for (const field of Object.keys(DUE_FIELD_PATTERNS) as DueListField[]) {
    const patterns = [...(preset?.[field] ?? []), ...DUE_FIELD_PATTERNS[field]];
    for (const pattern of patterns) {
      const target = normalizeHeader(pattern);
      const idx = normalizedHeaders.findIndex((h, i) => h === target && !used.has(headers[i]));
      if (idx >= 0) {
        mapping[field] = headers[idx];
        used.add(headers[idx]);
        break;
      }
    }
  }
  return mapping;
}

/** A usable mapping needs a tail, a title, and at least one due signal. */
export function dueListMappingIssues(mapping: DueListColumnMapping): string[] {
  const issues: string[] = [];
  if (!mapping.tailNumber) issues.push('No tail-number column mapped.');
  if (!mapping.title) issues.push('No item/task description column mapped.');
  if (!mapping.nextDueDate && !mapping.nextDueHours && !mapping.nextDueCycles) {
    issues.push('No due date / due hours / due cycles column mapped.');
  }
  return issues;
}

function parseNumber(raw: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[,\s]/g, '');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

export function mapRowToDueItem(
  row: string[],
  headers: string[],
  mapping: DueListColumnMapping,
): { item: MappedDueItem | null; warnings: string[] } {
  const warnings: string[] = [];
  const col = (field: DueListField): string => {
    const name = mapping[field];
    if (!name) return '';
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] ?? '').trim() : '';
  };

  const tailRaw = col('tailNumber');
  const tailNumber = normalizeTailNumber(tailRaw);
  const title = col('title');
  if (!tailNumber || !title) {
    warnings.push(!tailNumber ? 'Missing tail number' : 'Missing item description');
    return { item: null, warnings };
  }

  const parseDateField = (field: DueListField): string | undefined => {
    const raw = col(field);
    if (!raw) return undefined;
    const normalised = normaliseDate(raw);
    if (!normalised) warnings.push(`Unrecognized date "${raw}" in ${field}`);
    return normalised ?? undefined;
  };
  const parseNumberField = (field: DueListField): number | undefined => {
    const raw = col(field);
    if (!raw) return undefined;
    const value = parseNumber(raw);
    if (value === undefined) warnings.push(`Non-numeric "${raw}" in ${field}`);
    return value;
  };

  const item: MappedDueItem = {
    tailNumber,
    title,
    ataChapter: col('ataChapter') || undefined,
    intervalText: col('intervalText') || undefined,
    lastDoneDate: parseDateField('lastDoneDate'),
    lastDoneHours: parseNumberField('lastDoneHours'),
    lastDoneCycles: parseNumberField('lastDoneCycles'),
    nextDueDate: parseDateField('nextDueDate'),
    nextDueHours: parseNumberField('nextDueHours'),
    nextDueCycles: parseNumberField('nextDueCycles'),
    remainingText: col('remainingText') || undefined,
  };

  if (!item.nextDueDate && item.nextDueHours === undefined && item.nextDueCycles === undefined) {
    warnings.push('Row has no due date, due hours, or due cycles');
  }
  return { item, warnings };
}

export function buildDueListPreview(
  rows: string[][],
  headers: string[],
  mapping: DueListColumnMapping,
): DueItemPreviewRow[] {
  return rows.map((row, i) => {
    const { item, warnings } = mapRowToDueItem(row, headers, mapping);
    const raw: Record<string, string> = {};
    headers.forEach((h, idx) => {
      raw[h] = row[idx] ?? '';
    });
    return { mapped: item, raw, rowNum: i + 2, warnings }; // +2: 1-based + header row
  });
}
