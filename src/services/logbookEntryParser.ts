import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';
import type { ParsedLogEntry, LogbookEntryType } from '../types/logbook';

const SYSTEM_PROMPT = `You are an expert aviation maintenance logbook parser. You analyze raw OCR text from scanned aircraft maintenance logbook pages and extract structured maintenance record entries.

CRITICAL: Return ALL entries you find in the text. Do not stop early. If the document contains 30 entries, return all 30 in the JSON array. Never truncate or summarize — every entry must appear in the output.

For EACH distinct maintenance entry you find in the text, extract:
- entryDate: ISO date string (YYYY-MM-DD) of the work completion
- workPerformed: description of work performed
- ataChapter: ATA chapter code if referenced (e.g. "24", "71-00")
- adReferences: array of AD numbers referenced (e.g. ["AD 2024-01-02"])
- sbReferences: array of SB numbers referenced (e.g. ["SB 72-1045"])
- adSbReferences: optional legacy combined array of AD/SB references if needed for compatibility
- totalTimeAtEntry: aircraft total time in hours at time of entry (number)
- totalCyclesAtEntry: total engine cycles at time of entry (number)
- totalLandingsAtEntry: total landings at time of entry (number)
- signerName: name of person who signed/approved the work
- signerCertNumber: certificate number of the signer
- signerCertType: type of certificate (e.g. "A&P", "IA", "Repairman", "Repair Station")
- returnToServiceStatement: the RTS approval text if present
- hasReturnToService: boolean — true if a return-to-service statement/approval is present
- entryType: one of "maintenance", "preventive_maintenance", "alteration", "rebuilding", "inspection", "ad_compliance", "other"
- rawText: the verbatim source text for this entry (copy from the input)

For each field, also provide a confidence score (0.0-1.0) in fieldConfidence. Use lower confidence for handwritten text that is hard to read, ambiguous abbreviations, or values you're inferring rather than reading directly.

Handle handwritten text gracefully: best-effort transcription with lower confidence scores for uncertain reads.

Return a JSON array of entry objects. If no entries can be identified, return an empty array.`;

const MAX_CHUNK_CHARS = 16_000;
const CHUNK_OVERLAP = 2_000;
const MIN_ENTRY_SEGMENTS = 1;
const SEGMENT_RESPONSE_EXCERPT_CHARS = 240;

// ─── Date-line detection ───────────────────────────────────────────────────
// Covers: ISO, US slash/dash, D Mon YYYY, Mon D YYYY, full-month, aviation-style,
// short-year variants, and 2-digit year formats common in older logbooks.
const DATE_LINE_PATTERNS: RegExp[] = [
  /\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/,                                                   // 2025-01-12
  /\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/,                                                 // 01/12/2025 or 1/12/25
  /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[,.\s]+\d{2,4}\b/i, // 12 Jan 2025
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}[,.\s]+\d{2,4}\b/i, // Jan 12, 2025
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}[,.\s]+\d{2,4}\b/i, // December 15, 2024
  /\b\d{1,2}[-](?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-]\d{2,4}\b/i, // 15-DEC-24 or 15-DEC-2024
  /\b\d{1,2}(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\d{2,4}\b/i,         // 15DEC2024
  /\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+\d{2,4}\b/i,  // 15 DEC 2024
];

const SIGNATURE_LINE_PATTERN =
  /\b(signed|signature|sign(?:ed)?\s*by|return\s*to\s*service|approved\s*(?:for)?\s*return\s*to\s*service|\bRTS\b)\b/i;
const CERT_AND_NUMBER_PATTERN =
  /\b(a&?p|ia|repairman|repair\s*station|cert(?:ificate)?|lic(?:ense)?)\b.*\b\d{4,}\b/i;

// ─── CSV detection ──────────────────────────────────────────────────────────
// Known header keywords used by common MX tracking exports.
const CSV_HEADER_KEYWORDS = [
  'date', 'work', 'performed', 'description', 'cert', 'ata',
  'tach', 'hobbs', 'total time', 'totaltime', 'ttaf', 'signer',
  'technician', 'mechanic', 'squawk',
];

function looksLikeCsv(text: string): boolean {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  if (commaCount < 2) return false;
  const lower = firstLine.toLowerCase();
  return CSV_HEADER_KEYWORDS.some((kw) => lower.includes(kw));
}

// ─── CSV fast-path parser ───────────────────────────────────────────────────

function parseCsvToEntries(text: string): ParsedLogEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  const col = (row: string[], key: string): string => {
    const idx = headers.findIndex((h) => h.includes(key));
    return idx >= 0 ? (row[idx] ?? '').trim() : '';
  };

  const entries: ParsedLogEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const rawDate = col(row, 'date');
    const workRaw = col(row, 'work') || col(row, 'performed') || col(row, 'description') || col(row, 'squawk');
    if (!rawDate && !workRaw) continue;

    // Attempt to normalise date to ISO
    let entryDate: string | undefined;
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        entryDate = d.toISOString().slice(0, 10);
      }
    } catch {
      entryDate = undefined;
    }

    const totalTime = parseFloat(
      col(row, 'totaltime') || col(row, 'ttaf') || col(row, 'tach') || col(row, 'hobbs') || col(row, 'total_time')
    );
    const cycles = parseFloat(col(row, 'cycle'));
    const landings = parseFloat(col(row, 'landing'));

    entries.push({
      rawText: lines[i],
      entryDate,
      workPerformed: workRaw || undefined,
      ataChapter: col(row, 'ata') || undefined,
      signerName: col(row, 'signer') || col(row, 'technician') || col(row, 'mechanic') || undefined,
      signerCertNumber: col(row, 'cert') || undefined,
      totalTimeAtEntry: isNaN(totalTime) ? undefined : totalTime,
      totalCyclesAtEntry: isNaN(cycles) ? undefined : cycles,
      totalLandingsAtEntry: isNaN(landings) ? undefined : landings,
      confidence: 0.9,
      fieldConfidence: {
        entryDate: entryDate ? 0.9 : 0,
        workPerformed: workRaw ? 0.9 : 0,
      },
    });
  }
  return entries;
}

// ─── Chunking helpers ───────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    chunks.push(text.slice(offset, offset + MAX_CHUNK_CHARS));
    offset += MAX_CHUNK_CHARS - CHUNK_OVERLAP;
  }
  return chunks;
}

function splitLargeSegmentWithoutOverlap(segment: string): string[] {
  if (segment.length <= MAX_CHUNK_CHARS) return [segment];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < segment.length) {
    chunks.push(segment.slice(offset, offset + MAX_CHUNK_CHARS));
    offset += MAX_CHUNK_CHARS;
  }
  return chunks;
}

// ─── Line classifiers ────────────────────────────────────────────────────────

function isLikelyDateLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return DATE_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function isLikelySignatureLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  return SIGNATURE_LINE_PATTERN.test(trimmed) || CERT_AND_NUMBER_PATTERN.test(trimmed);
}

function countMatches(lines: string[], matcher: (line: string) => boolean): number {
  let count = 0;
  for (const line of lines) {
    if (matcher(line)) count += 1;
  }
  return count;
}

// ─── Segmenter ───────────────────────────────────────────────────────────────

export function segmentLogbookTextIntoEntrySegments(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const startIndices: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (isLikelyDateLine(lines[i])) startIndices.push(i);
  }
  if (startIndices.length < MIN_ENTRY_SEGMENTS) return [];

  const segments: string[] = [];
  for (let i = 0; i < startIndices.length; i++) {
    const start = startIndices[i];
    const nextStart = i + 1 < startIndices.length ? startIndices[i + 1] : lines.length;
    const rangeLines = lines.slice(start, nextStart);
    if (rangeLines.length === 0) continue;

    let endOffset = rangeLines.length - 1;
    for (let j = rangeLines.length - 1; j >= 0; j--) {
      if (isLikelySignatureLine(rangeLines[j])) {
        endOffset = j;
        break;
      }
    }
    const segmentLines = rangeLines.slice(0, endOffset + 1);
    const segmentText = segmentLines.join('\n').trim();
    if (segmentText) segments.push(segmentText);
  }
  return segments;
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

function extractJsonArrayLiterals(text: string): string[] {
  const arrays: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '[') {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }

    if (ch === ']') {
      if (depth === 0) continue;
      depth -= 1;
      if (depth === 0 && start !== -1) {
        arrays.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return arrays;
}

function parseJsonFromResponse(text: string): ParsedLogEntry[] {
  const parsedEntries: ParsedLogEntry[] = [];

  for (const jsonArray of extractJsonArrayLiterals(text)) {
    try {
      const raw = JSON.parse(jsonArray);
      if (!Array.isArray(raw)) continue;
      parsedEntries.push(
        ...raw
          .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
          .map(normalizeEntry)
      );
    } catch {
      // Ignore malformed slices and continue scanning for additional arrays.
    }
  }

  if (parsedEntries.length > 0) return parsedEntries;

  try {
    const rawObject = JSON.parse(text) as { entries?: Array<Record<string, unknown>> };
    if (Array.isArray(rawObject.entries)) {
      return rawObject.entries.map(normalizeEntry);
    }
  } catch {
    // Fall through to empty result.
  }

  return [];
}

// ─── Entry normalisation ──────────────────────────────────────────────────────

function normalizeEntry(raw: Record<string, unknown>): ParsedLogEntry {
  const fieldConfidence: Record<string, number> = {};
  const rawConf = (raw.fieldConfidence ?? {}) as Record<string, number>;

  const fields = [
    'entryDate', 'workPerformed', 'ataChapter', 'adReferences', 'sbReferences', 'adSbReferences',
    'totalTimeAtEntry', 'totalCyclesAtEntry', 'totalLandingsAtEntry',
    'signerName', 'signerCertNumber', 'signerCertType',
    'returnToServiceStatement', 'hasReturnToService', 'entryType',
  ];

  for (const f of fields) {
    if (raw[f] !== undefined && raw[f] !== null) {
      fieldConfidence[f] = typeof rawConf[f] === 'number' ? rawConf[f] : 0.8;
    }
  }

  const confidenceValues = Object.values(fieldConfidence);
  const overallConfidence = confidenceValues.length > 0
    ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length
    : 0;

  const adReferences = normalizeReferenceArray(raw.adReferences);
  const sbReferences = normalizeReferenceArray(raw.sbReferences);
  const legacyCombined = normalizeReferenceArray(raw.adSbReferences);
  const splitFromLegacy = splitLegacyReferences(legacyCombined);

  const normalizedAdReferences = dedupeReferences([...adReferences, ...splitFromLegacy.adReferences]);
  const normalizedSbReferences = dedupeReferences([...sbReferences, ...splitFromLegacy.sbReferences]);
  const normalizedCombined = dedupeReferences([
    ...legacyCombined,
    ...normalizedAdReferences,
    ...normalizedSbReferences,
  ]);

  return {
    rawText: typeof raw.rawText === 'string' ? raw.rawText : '',
    sourcePage: typeof raw.sourcePage === 'number' ? raw.sourcePage : undefined,
    entryDate: typeof raw.entryDate === 'string' ? raw.entryDate : undefined,
    workPerformed: typeof raw.workPerformed === 'string' ? raw.workPerformed : undefined,
    ataChapter: typeof raw.ataChapter === 'string' ? raw.ataChapter : undefined,
    adReferences: normalizedAdReferences.length > 0 ? normalizedAdReferences : undefined,
    sbReferences: normalizedSbReferences.length > 0 ? normalizedSbReferences : undefined,
    adSbReferences: normalizedCombined.length > 0 ? normalizedCombined : undefined,
    totalTimeAtEntry: typeof raw.totalTimeAtEntry === 'number' ? raw.totalTimeAtEntry : undefined,
    totalCyclesAtEntry: typeof raw.totalCyclesAtEntry === 'number' ? raw.totalCyclesAtEntry : undefined,
    totalLandingsAtEntry: typeof raw.totalLandingsAtEntry === 'number' ? raw.totalLandingsAtEntry : undefined,
    signerName: typeof raw.signerName === 'string' ? raw.signerName : undefined,
    signerCertNumber: typeof raw.signerCertNumber === 'string' ? raw.signerCertNumber : undefined,
    signerCertType: typeof raw.signerCertType === 'string' ? raw.signerCertType : undefined,
    returnToServiceStatement: typeof raw.returnToServiceStatement === 'string' ? raw.returnToServiceStatement : undefined,
    hasReturnToService: typeof raw.hasReturnToService === 'boolean' ? raw.hasReturnToService : undefined,
    entryType: normalizeEntryType(raw.entryType),
    confidence: overallConfidence,
    fieldConfidence,
  };
}

function normalizeReferenceArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function dedupeReferences(references: string[]): string[] {
  return Array.from(new Set(references));
}

function splitLegacyReferences(references: string[]): { adReferences: string[]; sbReferences: string[] } {
  const adReferences: string[] = [];
  const sbReferences: string[] = [];
  for (const reference of references) {
    if (/^AD\b/i.test(reference)) {
      adReferences.push(reference);
      continue;
    }
    if (/^SB\b/i.test(reference)) {
      sbReferences.push(reference);
    }
  }
  return {
    adReferences: dedupeReferences(adReferences),
    sbReferences: dedupeReferences(sbReferences),
  };
}

function isValidEntryType(val: unknown): val is LogbookEntryType {
  return typeof val === 'string' &&
    ['maintenance', 'preventive_maintenance', 'alteration', 'rebuilding', 'inspection', 'ad_compliance', 'preventive', 'other'].includes(val);
}

function normalizeEntryType(val: unknown): LogbookEntryType | undefined {
  if (!isValidEntryType(val)) return undefined;
  if (val === 'preventive') return 'preventive_maintenance';
  return val;
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function deduplicateEntries(entries: ParsedLogEntry[]): ParsedLogEntry[] {
  const normalizeText = (value: string | undefined, maxLen = 800) =>
    (value ?? '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s:/.-]/g, '')
      .trim()
      .slice(0, maxLen);

  const seen = new Set<string>();
  return entries.filter((e) => {
    const key = [
      e.entryDate ?? '',
      normalizeText(e.workPerformed, 1200),
      normalizeText(e.returnToServiceStatement, 400),
      normalizeText(e.signerName, 120),
      normalizeText(e.signerCertNumber, 120),
      e.totalTimeAtEntry ?? '',
      e.totalCyclesAtEntry ?? '',
      e.totalLandingsAtEntry ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Diagnostics types ────────────────────────────────────────────────────────

export interface LogbookParseResult {
  entries: ParsedLogEntry[];
  totalChunks: number;
  sourceDocumentId?: string;
  diagnostics?: LogbookParseDiagnostics;
}

export interface LogbookParseChunkDiagnostic {
  chunkIndex: number;
  strategy: 'entry_segments' | 'char_chunks' | 'csv_fast_path';
  charLength: number;
  lineCount: number;
  estimatedStartDates: number;
  estimatedSignatureEnds: number;
  parsedEntriesCount: number;
  responseExcerpt: string;
}

export interface LogbookParseDiagnostics {
  strategyUsed: 'entry_segments' | 'char_chunks' | 'csv_fast_path';
  sourceTextLength: number;
  sourceLineCount: number;
  totalSegments: number;
  segmentCharLengths: number[];
  chunks: LogbookParseChunkDiagnostic[];
}

// ─── Main parse function ──────────────────────────────────────────────────────

/**
 * Parse extracted text from a scanned logbook document into structured entries.
 * Handles large documents by chunking and deduplicating across chunks.
 * Supports CSV fast-path for structured exports, and retries zero-yield chunks.
 */
export async function parseLogbookText(
  extractedText: string,
  opts?: {
    sourceDocumentId?: string;
    startPage?: number;
    model?: string;
    ocrConfidenceHint?: number;
    ocrBackendHint?: string;
    onProgress?: (chunk: number, total: number) => void;
    debug?: boolean;
  }
): Promise<LogbookParseResult> {
  const model = opts?.model ?? DEFAULT_CLAUDE_MODEL;

  // ── CSV fast-path ──────────────────────────────────────────────────────────
  if (looksLikeCsv(extractedText)) {
    const csvEntries = parseCsvToEntries(extractedText);
    const lines = extractedText.split(/\r?\n/);
    const diagnostics: LogbookParseDiagnostics | undefined = opts?.debug
      ? {
          strategyUsed: 'csv_fast_path',
          sourceTextLength: extractedText.length,
          sourceLineCount: lines.length,
          totalSegments: 1,
          segmentCharLengths: [extractedText.length],
          chunks: [{
            chunkIndex: 1,
            strategy: 'csv_fast_path',
            charLength: extractedText.length,
            lineCount: lines.length,
            estimatedStartDates: csvEntries.length,
            estimatedSignatureEnds: 0,
            parsedEntriesCount: csvEntries.length,
            responseExcerpt: `CSV fast-path: ${csvEntries.length} rows parsed`,
          }],
        }
      : undefined;
    return {
      entries: csvEntries,
      totalChunks: 1,
      sourceDocumentId: opts?.sourceDocumentId,
      diagnostics,
    };
  }

  // ── Segment or chunk strategy ──────────────────────────────────────────────
  const entrySegments = segmentLogbookTextIntoEntrySegments(extractedText);
  const strategyUsed: 'entry_segments' | 'char_chunks' =
    entrySegments.length >= MIN_ENTRY_SEGMENTS ? 'entry_segments' : 'char_chunks';
  const chunks = strategyUsed === 'entry_segments'
    ? entrySegments.flatMap((segment) => splitLargeSegmentWithoutOverlap(segment))
    : chunkText(extractedText);

  const allEntries: ParsedLogEntry[] = [];
  const diagnostics: LogbookParseDiagnostics | undefined = opts?.debug
    ? {
        strategyUsed,
        sourceTextLength: extractedText.length,
        sourceLineCount: extractedText.split(/\r?\n/).length,
        totalSegments: chunks.length,
        segmentCharLengths: chunks.map((chunk) => chunk.length),
        chunks: [],
      }
    : undefined;

  // Track which chunks yielded zero entries for the retry pass.
  const zeroYieldChunkIndices: number[] = [];

  for (let i = 0; i < chunks.length; i++) {
    opts?.onProgress?.(i + 1, chunks.length);

    const chunkLabel = chunks.length > 1
      ? `\n\n[Chunk ${i + 1} of ${chunks.length}]`
      : '';
    const ocrHint =
      typeof opts?.ocrConfidenceHint === 'number'
        ? `\n\n[OCR metadata]\n- backend: ${opts?.ocrBackendHint ?? 'unknown'}\n- page/segment OCR confidence estimate: ${opts.ocrConfidenceHint.toFixed(3)}\nTreat low OCR confidence as a signal to lower fieldConfidence and avoid over-asserting uncertain text.`
        : '';

    const message = await createClaudeMessage({
      model,
      max_tokens: 16_000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Parse the following logbook text and return a JSON array of structured entries.${chunkLabel}${ocrHint}\n\n---\n${chunks[i]}\n---`,
        },
      ],
    });

    const text = message.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const entries = parseJsonFromResponse(text);
    const responseExcerpt = text.replace(/\s+/g, ' ').trim().slice(0, SEGMENT_RESPONSE_EXCERPT_CHARS);
    const chunkLines = chunks[i].split(/\r?\n/);

    for (const entry of entries) {
      // Use the segment text as rawText when Claude did not echo it back.
      if (!entry.rawText) {
        entry.rawText = chunks[i].slice(0, 500);
      }
      if (opts?.startPage !== undefined && entry.sourcePage === undefined) {
        entry.sourcePage = opts.startPage + i;
      }
    }

    if (entries.length === 0) {
      zeroYieldChunkIndices.push(i);
    }

    allEntries.push(...entries);
    if (diagnostics) {
      diagnostics.chunks.push({
        chunkIndex: i + 1,
        strategy: strategyUsed,
        charLength: chunks[i].length,
        lineCount: chunkLines.length,
        estimatedStartDates: countMatches(chunkLines, isLikelyDateLine),
        estimatedSignatureEnds: countMatches(chunkLines, isLikelySignatureLine),
        parsedEntriesCount: entries.length,
        responseExcerpt,
      });
    }
  }

  // ── Retry zero-yield entry-segment chunks with char_chunks fallback ──────
  // Only retry when using entry_segments strategy, where each chunk should have
  // produced at least one entry. If a segment yielded 0, re-send via char_chunks.
  if (strategyUsed === 'entry_segments' && zeroYieldChunkIndices.length > 0) {
    const retryChunks = zeroYieldChunkIndices.map((idx) => chunks[idx]);
    const combinedRetryText = retryChunks.join('\n\n');
    const retryChunkList = chunkText(combinedRetryText);

    for (let i = 0; i < retryChunkList.length; i++) {
      opts?.onProgress?.(chunks.length + i + 1, chunks.length + retryChunkList.length);

      const message = await createClaudeMessage({
        model,
        max_tokens: 16_000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Parse the following logbook text and return a JSON array of structured entries.\n\n[Retry chunk ${i + 1} of ${retryChunkList.length}]\n\n---\n${retryChunkList[i]}\n---`,
          },
        ],
      });

      const text = message.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const retryEntries = parseJsonFromResponse(text);
      for (const entry of retryEntries) {
        if (!entry.rawText) entry.rawText = retryChunkList[i].slice(0, 500);
      }
      allEntries.push(...retryEntries);

      if (diagnostics) {
        diagnostics.chunks.push({
          chunkIndex: chunks.length + i + 1,
          strategy: 'char_chunks',
          charLength: retryChunkList[i].length,
          lineCount: retryChunkList[i].split(/\r?\n/).length,
          estimatedStartDates: countMatches(retryChunkList[i].split(/\r?\n/), isLikelyDateLine),
          estimatedSignatureEnds: countMatches(retryChunkList[i].split(/\r?\n/), isLikelySignatureLine),
          parsedEntriesCount: retryEntries.length,
          responseExcerpt: text.replace(/\s+/g, ' ').trim().slice(0, SEGMENT_RESPONSE_EXCERPT_CHARS),
        });
      }
    }
  }

  return {
    entries: deduplicateEntries(allEntries),
    totalChunks: chunks.length,
    sourceDocumentId: opts?.sourceDocumentId,
    diagnostics,
  };
}

/**
 * Parse logbook text page by page (for scanned PDFs where each page is extracted separately).
 * Accepts an array of page texts and preserves page number linkage.
 */
export async function parseLogbookPages(
  pages: Array<{ pageNumber: number; text: string }>,
  opts?: {
    sourceDocumentId?: string;
    model?: string;
    onProgress?: (page: number, total: number) => void;
  }
): Promise<LogbookParseResult> {
  const combined = pages
    .map((p) => `--- Page ${p.pageNumber} ---\n${p.text}`)
    .join('\n\n');

  return parseLogbookText(combined, {
    sourceDocumentId: opts?.sourceDocumentId,
    startPage: pages[0]?.pageNumber ?? 1,
    model: opts?.model,
    onProgress: opts?.onProgress,
  });
}
