/**
 * CSV Importer for Logbook Entries
 *
 * Parses CSV/TSV exports from aviation maintenance systems (Bluetail, CAMP,
 * Veryon, spreadsheets) into LogbookEntry-compatible objects for bulk import.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedCSV {
  headers: string[];
  rows: string[][];
  /** Detected delimiter character */
  delimiter: string;
}

export type MappableField =
  | 'entryDate'
  | 'workPerformed'
  | 'ataChapter'
  | 'totalTimeAtEntry'
  | 'totalCyclesAtEntry'
  | 'totalLandingsAtEntry'
  | 'signerName'
  | 'signerCertNumber'
  | 'signerCertType'
  | 'entryType'
  | 'adReferences'
  | 'sbReferences'
  | 'returnToServiceStatement';

export type ColumnMapping = Record<MappableField, string | null>;

export interface MappedEntry {
  aircraftId: string;
  rawText: string;
  userVerified: boolean;
  confidence: number;
  entryDate?: string;
  workPerformed?: string;
  ataChapter?: string;
  totalTimeAtEntry?: number;
  totalCyclesAtEntry?: number;
  totalLandingsAtEntry?: number;
  signerName?: string;
  signerCertNumber?: string;
  signerCertType?: string;
  entryType?: string;
  adReferences?: string[];
  sbReferences?: string[];
  adSbReferences?: string[];
  returnToServiceStatement?: string;
}

export interface ImportPreviewRow {
  /** Mapped data (undefined means field not mapped or empty) */
  mapped: Partial<MappedEntry>;
  /** Original raw values keyed by CSV column name */
  raw: Record<string, string>;
  /** 1-based row number in original CSV */
  rowNum: number;
  /** Any warnings about this row (bad date format, non-numeric TT, etc.) */
  warnings: string[];
}

// ── CSV Parser ────────────────────────────────────────────────────────────────

/** Detect delimiter by counting occurrences in first 5 lines. */
function detectDelimiter(text: string): string {
  const sample = text.split('\n').slice(0, 5).join('\n');
  const counts: Record<string, number> = { ',': 0, '\t': 0, ';': 0, '|': 0 };
  for (const ch of sample) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

/**
 * RFC-4180-compliant CSV parser. Handles quoted fields containing
 * the delimiter, newlines, and escaped double-quotes ("").
 */
export function parseCSV(text: string): ParsedCSV {
  const delimiter = detectDelimiter(text);
  // Normalise line endings
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < normalised.length) {
    const ch = normalised[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalised[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field.trim());
        field = '';
        i++;
        continue;
      } else if (ch === '\n') {
        row.push(field.trim());
        field = '';
        if (row.some((c) => c !== '')) rows.push(row);
        row = [];
        i++;
        continue;
      } else {
        field += ch;
      }
    }
    i++;
  }
  // Last field/row
  row.push(field.trim());
  if (row.some((c) => c !== '')) rows.push(row);

  if (rows.length === 0) return { headers: [], rows: [], delimiter };
  const [headers, ...dataRows] = rows;
  return { headers, rows: dataRows, delimiter };
}

// ── Column Auto-Detection ─────────────────────────────────────────────────────

const FIELD_PATTERNS: Record<MappableField, string[]> = {
  entryDate: [
    'date', 'entry date', 'performed date', 'date performed', 'work date',
    'inspection date', 'date of maintenance', 'maintenance date', 'service date',
    'log date', 'entry_date', 'date_performed',
  ],
  workPerformed: [
    'description', 'work description', 'work performed', 'remarks', 'narrative',
    'maintenance performed', 'action taken', 'corrective action', 'squawk', 'discrepancy',
    'findings', 'maintenance remarks', 'work', 'maintenance description', 'details',
    'work_performed', 'work_description',
  ],
  ataChapter: [
    'ata', 'ata chapter', 'ata code', 'ata/item', 'system', 'system code',
    'chapter', 'ata_chapter', 'ata_code',
  ],
  totalTimeAtEntry: [
    'total time', 'aircraft total time', 'airframe time', 'tt', 'tach time',
    'ac total time', 'airframe total time', 'ttsn', 'ttaf', 'aircraft time',
    'total_time', 'airframe_hours', 'aircraft hours', 'log time', 'time in service',
  ],
  totalCyclesAtEntry: [
    'cycles', 'total cycles', 'aircraft cycles', 'cycle count', 'total_cycles',
    'eng cycles', 'engine cycles',
  ],
  totalLandingsAtEntry: [
    'landings', 'total landings', 'aircraft landings', 'landing count',
    'total_landings', 'number of landings',
  ],
  signerName: [
    'signer', 'signed by', 'technician', 'mechanic', 'performed by', 'inspector',
    'maintenance performed by', 'tech name', 'technician name', 'signer name',
    'authorized by', 'completed by', 'mechanic name',
  ],
  signerCertNumber: [
    'cert', 'cert number', 'cert #', 'certificate', 'certificate number',
    'certificate #', 'a&p number', 'ia number', 'license', 'license number',
    'cert_number', 'faa cert', 'certificate_number',
  ],
  signerCertType: [
    'cert type', 'certificate type', 'license type', 'credential', 'cert_type',
    'type of certificate', 'certification type',
  ],
  entryType: [
    'type', 'entry type', 'work type', 'maintenance type', 'log type',
    'entry_type', 'maintenance_type',
  ],
  adReferences: [
    'ad', 'ads', 'ad reference', 'ad number', 'airworthiness directive',
    'ad_reference', 'ad_number',
  ],
  sbReferences: [
    'sb', 'sbs', 'sb reference', 'sb number', 'service bulletin',
    'sb_reference', 'sb_number',
  ],
  returnToServiceStatement: [
    'return to service', 'rts', 'rts statement', 'return_to_service',
    'return to service statement',
  ],
};

/** Auto-detect column mapping from CSV headers. */
export function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    entryDate: null, workPerformed: null, ataChapter: null,
    totalTimeAtEntry: null, totalCyclesAtEntry: null, totalLandingsAtEntry: null,
    signerName: null, signerCertNumber: null, signerCertType: null,
    entryType: null, adReferences: null, sbReferences: null,
    returnToServiceStatement: null,
  };

  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  for (const [field, patterns] of Object.entries(FIELD_PATTERNS) as [MappableField, string[]][]) {
    for (const pattern of patterns) {
      const idx = lowerHeaders.findIndex(
        (h) => h === pattern || h.replace(/[\s_-]+/g, ' ') === pattern,
      );
      if (idx >= 0) {
        mapping[field] = headers[idx];
        break;
      }
    }
  }

  return mapping;
}

// ── Date Normaliser ───────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

export function normaliseDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  // Already ISO YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // MM/DD/YYYY or M/D/YYYY
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // MM-DD-YYYY
  m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // YYYY/MM/DD
  m = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo}-${d}`;
  }

  // DD-Mon-YY or DD-Mon-YYYY  e.g. 15-Jan-23
  m = s.match(/^(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{2,4})$/);
  if (m) {
    const [, d, mon, yr] = m;
    const mo = MONTH_NAMES[mon.toLowerCase().slice(0, 3)];
    if (mo) {
      const year = yr.length === 2 ? (parseInt(yr) >= 70 ? `19${yr}` : `20${yr}`) : yr;
      return `${year}-${mo}-${d.padStart(2, '0')}`;
    }
  }

  // Mon DD, YYYY or Month DD, YYYY  e.g. January 15, 2023
  m = s.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const [, mon, d, y] = m;
    const mo = MONTH_NAMES[mon.toLowerCase().slice(0, 3)];
    if (mo) return `${y}-${mo}-${d.padStart(2, '0')}`;
  }

  return null;
}

// ── Row Mapper ────────────────────────────────────────────────────────────────

function col(row: string[], headers: string[], name: string | null): string {
  if (!name) return '';
  const idx = headers.indexOf(name);
  return idx >= 0 ? (row[idx] ?? '').trim() : '';
}

export function mapRowToEntry(
  row: string[],
  headers: string[],
  mapping: ColumnMapping,
  aircraftId: string,
): { entry: MappedEntry; warnings: string[] } {
  const warnings: string[] = [];
  const get = (f: MappableField) => col(row, headers, mapping[f]);

  // Work performed / raw text
  const workRaw = get('workPerformed');

  // Date
  const dateRaw = get('entryDate');
  let entryDate: string | undefined;
  if (dateRaw) {
    const normalised = normaliseDate(dateRaw);
    if (normalised) {
      entryDate = normalised;
    } else {
      warnings.push(`Unrecognised date format: "${dateRaw}"`);
    }
  }

  // Numeric fields
  const parseTT = (raw: string, label: string): number | undefined => {
    if (!raw) return undefined;
    const n = parseFloat(raw.replace(/,/g, ''));
    if (isNaN(n)) { warnings.push(`${label}: "${raw}" is not a number, skipped`); return undefined; }
    return n;
  };
  const parseInt2 = (raw: string, label: string): number | undefined => {
    if (!raw) return undefined;
    const n = parseInt(raw.replace(/,/g, ''), 10);
    if (isNaN(n)) { warnings.push(`${label}: "${raw}" is not an integer, skipped`); return undefined; }
    return n;
  };

  const totalTimeAtEntry = parseTT(get('totalTimeAtEntry'), 'Total Time');
  const totalCyclesAtEntry = parseInt2(get('totalCyclesAtEntry'), 'Cycles');
  const totalLandingsAtEntry = parseInt2(get('totalLandingsAtEntry'), 'Landings');

  // AD/SB refs — split by common separators
  const splitRefs = (raw: string) =>
    raw ? raw.split(/[;,]+/).map((r) => r.trim()).filter((r) => r.length > 0) : undefined;

  const adRefs = splitRefs(get('adReferences'));
  const sbRefs = splitRefs(get('sbReferences'));
  const adSbRefs =
    adRefs || sbRefs
      ? Array.from(new Set([...(adRefs ?? []), ...(sbRefs ?? [])]))
      : undefined;

  // ATA chapter — normalise to string
  const ataRaw = get('ataChapter').replace(/^0+/, '') || undefined;

  // Build raw text for display / fallback search
  const rawText = workRaw || [
    entryDate && `Date: ${entryDate}`,
    ataRaw && `ATA: ${ataRaw}`,
    totalTimeAtEntry && `TT: ${totalTimeAtEntry}`,
  ].filter(Boolean).join(' | ') || '(imported)';

  const entry: MappedEntry = {
    aircraftId,
    rawText,
    userVerified: true,
    confidence: 1.0,
    ...(entryDate && { entryDate }),
    ...(workRaw && { workPerformed: workRaw }),
    ...(ataRaw && { ataChapter: ataRaw }),
    ...(totalTimeAtEntry !== undefined && { totalTimeAtEntry }),
    ...(totalCyclesAtEntry !== undefined && { totalCyclesAtEntry }),
    ...(totalLandingsAtEntry !== undefined && { totalLandingsAtEntry }),
    ...(get('signerName') && { signerName: get('signerName') }),
    ...(get('signerCertNumber') && { signerCertNumber: get('signerCertNumber') }),
    ...(get('signerCertType') && { signerCertType: get('signerCertType') }),
    ...(get('entryType') && { entryType: get('entryType') }),
    ...(adRefs?.length && { adReferences: adRefs }),
    ...(sbRefs?.length && { sbReferences: sbRefs }),
    ...(adSbRefs?.length && { adSbReferences: adSbRefs }),
    ...(get('returnToServiceStatement') && {
      returnToServiceStatement: get('returnToServiceStatement'),
    }),
  };

  return { entry, warnings };
}

/** Build preview rows from a parsed CSV + mapping (max `limit` rows). */
export function buildPreview(
  csv: ParsedCSV,
  mapping: ColumnMapping,
  aircraftId: string,
  limit = 8,
): ImportPreviewRow[] {
  return csv.rows.slice(0, limit).map((row, idx) => {
    const raw: Record<string, string> = {};
    csv.headers.forEach((h, i) => { raw[h] = row[i] ?? ''; });
    const { entry, warnings } = mapRowToEntry(row, csv.headers, mapping, aircraftId);
    return { mapped: entry, raw, rowNum: idx + 2, warnings };
  });
}

/** Map ALL CSV rows to entries, skipping completely empty rows. */
export function mapAllRows(
  csv: ParsedCSV,
  mapping: ColumnMapping,
  aircraftId: string,
): MappedEntry[] {
  return csv.rows
    .filter((row) => row.some((cell) => cell.trim() !== ''))
    .map((row) => mapRowToEntry(row, csv.headers, mapping, aircraftId).entry);
}
