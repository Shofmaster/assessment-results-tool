import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';
import type { ParsedLogEntry, LogbookEntryType } from '../types/logbook';

const SYSTEM_PROMPT = `You are an expert aviation maintenance logbook parser. You analyze raw OCR text from scanned aircraft maintenance logbook pages and extract structured maintenance record entries.

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

For each field, also provide a confidence score (0.0-1.0) in fieldConfidence. Use lower confidence for handwritten text that is hard to read, ambiguous abbreviations, or values you're inferring rather than reading directly.

Handle handwritten text gracefully: best-effort transcription with lower confidence scores for uncertain reads.

Return a JSON array of entry objects. If no entries can be identified, return an empty array.`;

const MAX_CHUNK_CHARS = 16_000;
const CHUNK_OVERLAP = 2_000;

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
      normalizeText(e.rawText, 600),
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export interface LogbookParseResult {
  entries: ParsedLogEntry[];
  totalChunks: number;
  sourceDocumentId?: string;
}

/**
 * Parse extracted text from a scanned logbook document into structured entries.
 * Handles large documents by chunking and deduplicating across chunks.
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
  }
): Promise<LogbookParseResult> {
  const model = opts?.model ?? DEFAULT_CLAUDE_MODEL;
  const chunks = chunkText(extractedText);
  const allEntries: ParsedLogEntry[] = [];

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
      max_tokens: 8000,
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

    for (const entry of entries) {
      if (!entry.rawText && chunks[i]) {
        entry.rawText = chunks[i].slice(0, 500);
      }
      if (opts?.startPage !== undefined && entry.sourcePage === undefined) {
        entry.sourcePage = opts.startPage + i;
      }
    }

    allEntries.push(...entries);
  }

  return {
    entries: deduplicateEntries(allEntries),
    totalChunks: chunks.length,
    sourceDocumentId: opts?.sourceDocumentId,
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
