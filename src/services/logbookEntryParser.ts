import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';
import type { ParsedLogEntry, LogbookEntryType } from '../types/logbook';

// ─── Document classification ──────────────────────────────────────────────────

export type LogbookDocumentType =
  | 'airframe_logbook'
  | 'engine_logbook'
  | 'propeller_logbook'
  | 'appliance_logbook'
  | 'mx_tracking_export'   // CSV/spreadsheet export from MX tracking software
  | 'work_order'           // 337/work order form
  | 'unknown';

const DOC_TYPE_SIGNALS: Array<{ type: LogbookDocumentType; patterns: RegExp[]; weight: number }> = [
  {
    type: 'engine_logbook',
    patterns: [
      /\bengine\s*log/i, /\beng(?:ine)?\s*(?:total\s*)?time/i,
      /\bTSN\b/, /\bTSO\b/, /\bTSMOH\b/, /\bTSREM\b/, /\bSMOH\b/,
      /\bengine\s*(?:serial|s\/n|model)/i, /\bhot\s*section/i,
      /\bcompressor\s*section/i, /\bturbine\s*section/i,
    ],
    weight: 2,
  },
  {
    type: 'propeller_logbook',
    patterns: [
      /\bprop(?:eller)?\s*log/i, /\bpropeller\s*(?:serial|s\/n|model)/i,
      /\bblade\b/i, /\bprop\s*(?:total\s*)?time/i, /\bhub\b.*\bblade/i,
      /\bprop\s*overhaul/i, /\bpropeller\s*(?:governor|pitch)/i,
    ],
    weight: 2,
  },
  {
    type: 'appliance_logbook',
    patterns: [
      /\bappliance\s*log/i, /\bcomponent\s*log/i,
      /\baccessory\s*log/i, /\bavionics\s*log/i,
    ],
    weight: 2,
  },
  {
    type: 'work_order',
    patterns: [
      /\bFAA\s*Form\s*337\b/i, /\bmajor\s*repair\s*and\s*alteration/i,
      /\bwork\s*order\b/i, /\brepair\s*station\s*(?:work|order)/i,
      /\bsquawk\s*(?:sheet|list)/i, /\bdiscrepancy\s*(?:sheet|list|report)/i,
    ],
    weight: 3,
  },
  {
    type: 'airframe_logbook',
    patterns: [
      /\bairframe\s*log/i, /\baircraft\s*log/i, /\baircraft\s*maintenance\s*record/i,
      /\btotal\s*(?:aircraft\s*)?time\s*(?:in\s*service)?/i, /\bTTAF\b/,
      /\bannual\s*inspection\b/i, /\b100[\s-]*(?:hr|hour)\s*inspection\b/i,
      /\bairworthiness\b/i, /\btail\s*(?:number|no\.?|#)/i,
    ],
    weight: 1,
  },
];

/**
 * Pre-classify the document type so downstream parsing can apply domain-specific
 * heuristics (engine logbooks emphasise TSN/TSMOH; airframe logbooks emphasise
 * annual/100-hr inspections; work orders have a flat structure).
 */
export function classifyDocumentType(text: string): LogbookDocumentType {
  const scores = new Map<LogbookDocumentType, number>();
  for (const signal of DOC_TYPE_SIGNALS) {
    let hits = 0;
    for (const pattern of signal.patterns) {
      if (pattern.test(text)) hits += 1;
    }
    if (hits > 0) {
      scores.set(signal.type, (scores.get(signal.type) ?? 0) + hits * signal.weight);
    }
  }
  if (scores.size === 0) return 'unknown';
  let best: LogbookDocumentType = 'unknown';
  let bestScore = 0;
  scores.forEach((score, type) => {
    if (score > bestScore) {
      best = type;
      bestScore = score;
    }
  });
  return best;
}

// ─── System prompt — deep aviation domain knowledge ───────────────────────────

const SYSTEM_PROMPT = `You are an expert aviation maintenance logbook parser with deep knowledge of FAA regulations (14 CFR Parts 43, 91, 121, 135, 145), EASA Part-M, and aircraft maintenance documentation standards.

CRITICAL RULES:
1. Return ALL entries you find in the text. Do not stop early. If the document contains 30 entries, return ALL 30 in the JSON array. Never truncate or summarize.
2. Each DISTINCT maintenance action with its own sign-off is a SEPARATE entry.
3. Multiple work items performed on the same date by the same mechanic under ONE sign-off = ONE entry (combine into workPerformed).
4. A single date with MULTIPLE different signers = MULTIPLE entries.

WHAT CONSTITUTES A LOGBOOK ENTRY:
An entry is a discrete maintenance record that typically contains:
- A date of work completion
- A description of work performed
- Aircraft time/cycles at time of work
- A sign-off (mechanic name, cert number, approval for return to service)

Special entry patterns to recognize:
- ANNUAL INSPECTION: "annual inspection performed IAW 14 CFR 91.409" or similar. entryType = "inspection"
- 100-HOUR INSPECTION: "100-hour inspection IAW..." entryType = "inspection"
- PROGRESSIVE INSPECTION: entryType = "inspection"
- AD COMPLIANCE: References to "AD 20XX-XX-XX" or "Airworthiness Directive". entryType = "ad_compliance"
- SERVICE BULLETIN compliance: References to "SB", "Service Bulletin", "Service Letter". Extract to sbReferences[].
- OIL CHANGE / FILTER: Usually entryType = "preventive_maintenance"
- ALTERATION: 337 form reference, STC, field approval. entryType = "alteration"
- REBUILD / OVERHAUL: Major overhaul, top overhaul, IRAN. entryType = "rebuilding"
- CONTINUITY ENTRIES: "No work performed — aircraft in storage" or "Aircraft not flown" — these ARE valid entries, entryType = "other"
- FERRY FLIGHT APPROVAL: Special flight permits. entryType = "other"
- WEIGHT & BALANCE: W&B updates. entryType = "other"
- COMPONENT INSTALLATION/REMOVAL: Part replacements. entryType = "maintenance"
- RETURN TO SERVICE: "I certify that this aircraft has been inspected IAW..." — this is part of the preceding maintenance entry, not a separate entry unless it has its own date.

ENTRY BOUNDARY DETECTION:
Look for these signals that a new entry begins:
- A new date (most common)
- A horizontal line, rule, or separator (----, ====, _____)
- An entry number or sequence identifier
- A different signer/mechanic following a previous sign-off
- A blank line cluster (2+ blank lines) between blocks of text
- Pre-printed form field boundaries
- Page headers/footers followed by new content

DO NOT create entries from:
- Page headers/footers (aircraft ID, page numbers, column headers)
- Table column headers ("Date | Work Performed | TT | Mechanic")
- Blank rows or separator lines by themselves
- Continuation text that belongs to the previous entry ("...continued from previous page")
- Printed form field labels without data

For EACH distinct maintenance entry, extract:
- entryDate: ISO date string (YYYY-MM-DD) of work completion. Parse all date formats: MM/DD/YYYY, DD-MMM-YY, YYYY-MM-DD, "January 15, 2024", etc.
- workPerformed: full description of work performed. Include ALL detail — item numbers, part numbers, torque values, etc.
- ataChapter: ATA chapter code if referenced (e.g. "24", "71-00", "05-10"). Infer from work description if not explicit (e.g. landing gear work → "32", oil change → "72").
- adReferences: array of AD numbers referenced (e.g. ["AD 2024-01-02", "AD 2019-26-51"])
- sbReferences: array of SB numbers referenced (e.g. ["SB 72-1045", "SL M80-15"])
- adSbReferences: combined array of all AD/SB references for compatibility
- totalTimeAtEntry: aircraft/engine total time in hours (number). Look for "TT:", "TTAF:", "TT:", "Hobbs:", "Tach:", "TTSN:", "AFTT:"
- totalCyclesAtEntry: total cycles (number). Look for "Cycles:", "TSC:", "Total Cycles:"
- totalLandingsAtEntry: total landings (number). Look for "Landings:", "Total Landings:"
- signerName: name of person who signed/approved
- signerCertNumber: certificate number. May appear as just a number near the signature.
- signerCertType: one of "A&P", "IA", "Repairman", "Repair Station", "Private Pilot" (for preventive maintenance), or other cert type
- returnToServiceStatement: the RTS approval text if present (e.g. "I certify that this aircraft has been inspected in accordance with an annual inspection and was determined to be in airworthy condition")
- hasReturnToService: true if ANY return-to-service/approval statement is present
- entryType: one of "maintenance", "preventive_maintenance", "alteration", "rebuilding", "inspection", "ad_compliance", "other"
- rawText: the verbatim source text for this entry (copy from the input)

CONFIDENCE SCORING (fieldConfidence):
For each field, provide a confidence score 0.0–1.0:
- 0.95–1.0: Clearly printed/typed text, unambiguous
- 0.8–0.94: Legible but some interpretation needed
- 0.5–0.79: Partially legible, OCR artifacts, abbreviations resolved by context
- 0.2–0.49: Mostly guessing from context, heavily degraded text
- 0.0–0.19: Pure inference, no direct evidence

Lower confidence for: handwritten text, faded/smudged content, abbreviations, inferred values.

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
  /\b(signed|signature|sign(?:ed)?\s*by|return\s*to\s*service|approved\s*(?:for)?\s*return\s*to\s*service|\bRTS\b|I\s+certify\b)\b/i;
const CERT_AND_NUMBER_PATTERN =
  /\b(a&?p|ia|repairman|repair\s*station|cert(?:ificate)?|lic(?:ense)?)\b.*\b\d{4,}\b/i;
// Standalone cert number at end of line (common in handwritten logbooks)
const STANDALONE_CERT_PATTERN = /^\s*#?\s*\d{6,10}\s*$/;

// ─── Entry boundary patterns (beyond dates) ──────────────────────────────────
const HORIZONTAL_RULE_PATTERN = /^[\s]*[-=_]{4,}[\s]*$/;
const ENTRY_NUMBER_PATTERN = /^\s*(?:entry|item|no\.?|#)\s*\d+/i;
const BLANK_LINE_CLUSTER_MIN = 2;

// ─── Delimited format detection ──────────────────────────────────────────────
// Known header keywords used by common MX tracking exports.
const DELIMITED_HEADER_KEYWORDS = [
  'date', 'work', 'performed', 'description', 'cert', 'ata',
  'tach', 'hobbs', 'total time', 'totaltime', 'ttaf', 'signer',
  'technician', 'mechanic', 'squawk', 'discrepancy', 'action',
  'status', 'component', 'part number', 'serial', 'cycles',
  'landings', 'hours', 'inspector',
];

type DelimiterKind = ',' | '\t' | ';' | '|';

function detectDelimiter(firstLine: string): DelimiterKind | null {
  const counts: Record<DelimiterKind, number> = {
    ',': (firstLine.match(/,/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
    ';': (firstLine.match(/;/g) ?? []).length,
    '|': (firstLine.match(/\|/g) ?? []).length,
  };
  let best: DelimiterKind | null = null;
  let bestCount = 1; // require at least 2 columns
  for (const [delim, count] of Object.entries(counts) as [DelimiterKind, number][]) {
    if (count > bestCount) {
      best = delim;
      bestCount = count;
    }
  }
  return best;
}

function looksLikeDelimited(text: string): { isDelimited: boolean; delimiter: DelimiterKind | null } {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const delimiter = detectDelimiter(firstLine);
  if (!delimiter) return { isDelimited: false, delimiter: null };
  const lower = firstLine.toLowerCase();
  const hasKeyword = DELIMITED_HEADER_KEYWORDS.some((kw) => lower.includes(kw));
  return { isDelimited: hasKeyword, delimiter: hasKeyword ? delimiter : null };
}

// ─── Smart delimited parser (CSV, TSV, pipe-delimited, semicolon) ────────────

function splitDelimitedRow(line: string, delimiter: DelimiterKind): string[] {
  // Handle quoted fields properly (RFC 4180 style)
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 1; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

function parseDelimitedToEntries(text: string, delimiter: DelimiterKind): ParsedLogEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = splitDelimitedRow(lines[0], delimiter)
    .map((h) => h.toLowerCase().replace(/[^a-z0-9_]/g, '_'));

  const col = (row: string[], key: string): string => {
    const idx = headers.findIndex((h) => h.includes(key));
    return idx >= 0 ? (row[idx] ?? '').trim() : '';
  };

  const multiCol = (row: string[], ...keys: string[]): string => {
    for (const key of keys) {
      const val = col(row, key);
      if (val) return val;
    }
    return '';
  };

  const entries: ParsedLogEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = splitDelimitedRow(lines[i], delimiter);
    const rawDate = col(row, 'date');
    const workRaw = multiCol(row, 'work', 'performed', 'description', 'squawk', 'discrepancy', 'action');
    if (!rawDate && !workRaw) continue;

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
      multiCol(row, 'totaltime', 'ttaf', 'tach', 'hobbs', 'total_time', 'hours', 'aftt')
    );
    const cycles = parseFloat(multiCol(row, 'cycle', 'tsc'));
    const landings = parseFloat(multiCol(row, 'landing'));

    const workLower = (workRaw ?? '').toLowerCase();
    const entryType = inferEntryTypeFromText(workLower);

    // Extract AD/SB references from work text
    const adRefs = extractAdReferences(workRaw);
    const sbRefs = extractSbReferences(workRaw);

    entries.push({
      rawText: lines[i],
      entryDate,
      workPerformed: workRaw || undefined,
      ataChapter: col(row, 'ata') || inferAtaChapter(workLower) || undefined,
      adReferences: adRefs.length > 0 ? adRefs : undefined,
      sbReferences: sbRefs.length > 0 ? sbRefs : undefined,
      signerName: multiCol(row, 'signer', 'technician', 'mechanic', 'inspector') || undefined,
      signerCertNumber: col(row, 'cert') || undefined,
      signerCertType: inferCertType(multiCol(row, 'cert_type', 'type')),
      entryType,
      totalTimeAtEntry: isNaN(totalTime) ? undefined : totalTime,
      totalCyclesAtEntry: isNaN(cycles) ? undefined : cycles,
      totalLandingsAtEntry: isNaN(landings) ? undefined : landings,
      hasReturnToService: /\breturn\s*to\s*service|rts\b/i.test(workRaw) || undefined,
      confidence: 0.9,
      fieldConfidence: {
        entryDate: entryDate ? 0.9 : 0,
        workPerformed: workRaw ? 0.9 : 0,
        ...(entryType ? { entryType: 0.75 } : {}),
      },
    });
  }
  return entries;
}

// ─── Deterministic entry-type classifier ──────────────────────────────────────

const ENTRY_TYPE_RULES: Array<{ type: LogbookEntryType; patterns: RegExp[]; priority: number }> = [
  {
    type: 'ad_compliance',
    priority: 10,
    patterns: [
      /\bAD\s*\d{2,4}[-/.]\d{2}[-/.]\d{2}\b/i,
      /\bairworthiness\s*directive\b/i,
      /\bAD\s*compliance\b/i,
      /\bcomplied?\s*with\s*AD\b/i,
    ],
  },
  {
    type: 'inspection',
    priority: 9,
    patterns: [
      /\bannual\s*inspection\b/i,
      /\b100[\s-]*(?:hr|hour)\s*inspection\b/i,
      /\bprogressive\s*inspection\b/i,
      /\bcondition\s*inspection\b/i,
      /\bphase\s*\d+\s*inspection\b/i,
      /\binspected?\s*(?:in\s*accordance\s*with|IAW|per)\b/i,
      /\b(?:annual|100[\s-]*hr|progressive)\b.*\b(?:inspection|insp)\b/i,
      /\breturn(?:ed)?\s*to\s*service\b.*\b(?:annual|100[\s-]*hr|inspection)\b/i,
      /\b(?:ICA|continued\s*airworthiness)\s*inspection\b/i,
    ],
  },
  {
    type: 'alteration',
    priority: 8,
    patterns: [
      /\b(?:major|minor)\s*alteration\b/i,
      /\bSTC\s*(?:SA|ST)\d/i,
      /\bSTC\b.*\b(?:installed|complied|completed)\b/i,
      /\bfield\s*approval\b/i,
      /\b337\b.*\b(?:form|completed|approved)\b/i,
      /\bengineering\s*order\b/i,
    ],
  },
  {
    type: 'rebuilding',
    priority: 7,
    patterns: [
      /\b(?:major\s*)?overhaul\b/i,
      /\btop\s*overhaul\b/i,
      /\brebui(?:lt|ld)\b/i,
      /\bIRAN\b/,
      /\bremanufactur/i,
      /\bSMOH\b/, /\bSTOH\b/, /\bSFOH\b/,
      /\bhot\s*section\s*(?:inspection|overhaul|replacement)\b/i,
    ],
  },
  {
    type: 'preventive_maintenance',
    priority: 5,
    patterns: [
      /\boil\s*(?:change|filter|screen)\b/i,
      /\btire\s*(?:change|replacement|inflate|pressure)\b/i,
      /\bspark\s*plug\b/i,
      /\bwheel\s*bearing\b/i,
      /\bpreventive\s*maintenance\b/i,
      /\bowner[\s-]*(?:performed|authorized)\s*(?:maintenance|work)\b/i,
      /\bAppendix\s*A\b.*\bpart\s*43\b/i,
      /\bgreased?\b.*\b(?:fittings|bearings|hinges)\b/i,
      /\bcleaned?\s*(?:and\s*)?(?:gapped?\s*)?spark\s*plug/i,
      /\bserviced?\s*(?:strut|shock|tire|battery)\b/i,
      /\breplaced?\s*(?:landing\s*light|nav\s*light|position\s*light|bulb)\b/i,
    ],
  },
  {
    type: 'maintenance',
    priority: 3,
    patterns: [
      /\breplaced?\b/i, /\binstalled?\b/i, /\bremoved?\b/i, /\brepaired?\b/i,
      /\badjusted?\b/i, /\btroublesh(?:oo|o)t/i, /\bcorrected?\b/i,
      /\bserviced?\b/i, /\bcomplied?\b/i,
    ],
  },
];

function inferEntryTypeFromText(textLower: string): LogbookEntryType | undefined {
  let bestType: LogbookEntryType | undefined;
  let bestPriority = -1;

  for (const rule of ENTRY_TYPE_RULES) {
    if (rule.priority <= bestPriority) continue;
    for (const pattern of rule.patterns) {
      if (pattern.test(textLower)) {
        bestType = rule.type;
        bestPriority = rule.priority;
        break;
      }
    }
  }
  return bestType;
}

// ─── ATA chapter inference ──────────────────────────────────────────────────

const ATA_INFERENCE_MAP: Array<{ chapter: string; patterns: RegExp[] }> = [
  { chapter: '05', patterns: [/\bperiodic\s*inspection/i, /\btime\s*limit/i, /\bscheduled\s*maint/i] },
  { chapter: '11', patterns: [/\bplacard/i, /\bmarkings?\b/i] },
  { chapter: '12', patterns: [/\bservicing\b/i, /\b(?:oil|fuel|hydraulic)\s*servic/i] },
  { chapter: '21', patterns: [/\bair\s*condition/i, /\bpressuriz/i, /\bcabin\s*(?:heat|temp)/i] },
  { chapter: '23', patterns: [/\bcommunication/i, /\bcom\s*radio/i, /\btransponder/i, /\bnavcom\b/i] },
  { chapter: '24', patterns: [/\belectrical/i, /\bbattery\b/i, /\balternator/i, /\bgenerator/i, /\bstarter\b/i, /\bvoltage\s*reg/i] },
  { chapter: '25', patterns: [/\bcabin\b.*\b(?:interior|seat|belt|carpet)/i, /\bseat\s*belt/i, /\bupholster/i] },
  { chapter: '27', patterns: [/\bflight\s*control/i, /\baileron/i, /\belevator/i, /\brudder/i, /\btrim\s*tab/i, /\bflap\b/i] },
  { chapter: '28', patterns: [/\bfuel\s*(?:system|tank|pump|line|selector|filter|cell|bladder)/i] },
  { chapter: '29', patterns: [/\bhydraulic/i] },
  { chapter: '30', patterns: [/\bde[\s-]*ic/i, /\banti[\s-]*ic/i, /\bpitot\s*heat/i] },
  { chapter: '31', patterns: [/\binstrument/i, /\battitude\s*(?:ind|gyro)/i, /\bairspeed\b/i, /\baltimeter\b/i, /\bturn\s*coord/i, /\bheading\s*ind/i, /\bvacuum\s*(?:pump|system)/i] },
  { chapter: '32', patterns: [/\blanding\s*gear/i, /\btire\b/i, /\bwheel\b/i, /\bbrake/i, /\bstrut/i, /\bnose\s*(?:gear|wheel)/i, /\bmain\s*(?:gear|wheel)/i] },
  { chapter: '33', patterns: [/\blight(?:s|ing)\b/i, /\blanding\s*light/i, /\bnav\s*light/i, /\bbeacon\b/i, /\bstrobe\b/i, /\btaxi\s*light/i] },
  { chapter: '34', patterns: [/\bnavigation\b/i, /\bGPS\b/i, /\bVOR\b/i, /\bILS\b/i, /\bADF\b/i, /\bglide\s*slope/i] },
  { chapter: '52', patterns: [/\bdoor/i, /\bwindow\b/i, /\bwindshield/i, /\bcanopy\b/i] },
  { chapter: '53', patterns: [/\bfuselage/i, /\bskin\b/i, /\bframe\b/i, /\bstringer/i, /\bbulkhead/i, /\bcorrosion/i] },
  { chapter: '55', patterns: [/\bstabilizer/i, /\bempennage/i, /\bhorizontal\s*stab/i, /\bvertical\s*stab/i] },
  { chapter: '56', patterns: [/\bwindow\b/i, /\bwindshield/i] },
  { chapter: '57', patterns: [/\bwing\b/i, /\bspar\b/i, /\brib\b/i, /\bflap\b/i, /\bwing\s*tip/i] },
  { chapter: '61', patterns: [/\bpropeller\b/i, /\bprop\b/i, /\bgovernor\b/i, /\bblade\b/i, /\bspinner\b/i] },
  { chapter: '71', patterns: [/\bpower\s*plant/i, /\bengine\s*install/i, /\bengine\s*(?:mount|cowl)/i] },
  { chapter: '72', patterns: [/\bengine\b/i, /\bcylinder/i, /\bcrankshaft/i, /\bcamshaft/i, /\bpiston/i, /\boil\s*(?:change|filter|screen|pressure|temp)/i, /\bcompression/i, /\bmagneto/i, /\bignition/i, /\bspark\s*plug/i, /\bexhaust/i, /\bturbocharger/i] },
  { chapter: '73', patterns: [/\bfuel\s*(?:control|metering|injection|nozzle|servo)/i] },
  { chapter: '76', patterns: [/\bengine\s*control/i, /\bthrottle\b/i, /\bmixture\b/i, /\bprop\s*control/i, /\bcable\b.*\bengine/i] },
  { chapter: '77', patterns: [/\bengine\s*indicating/i, /\bEGT\b/i, /\bCHT\b/i, /\bmanifold\s*pressure/i, /\btachometer/i, /\bfuel\s*(?:flow|quantity)/i] },
  { chapter: '79', patterns: [/\bengine\s*oil/i, /\boil\s*cooler/i, /\boil\s*system/i] },
  { chapter: '80', patterns: [/\bstarting\b/i, /\bstarter\b/i, /\bignition\s*switch/i] },
];

function inferAtaChapter(textLower: string): string | undefined {
  for (const { chapter, patterns } of ATA_INFERENCE_MAP) {
    for (const pattern of patterns) {
      if (pattern.test(textLower)) return chapter;
    }
  }
  return undefined;
}

// ─── Reference extraction ──────────────────────────────────────────────────

function extractAdReferences(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\bAD\s*\d{2,4}[-/.]\d{2}[-/.]\d{2,4}(?:R\d+)?\b/gi) ?? [];
  return Array.from(new Set(matches.map((m) => m.trim())));
}

function extractSbReferences(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b(?:SB|SL|ASB|CSB)\s*[\w-]{3,}/gi) ?? [];
  return Array.from(new Set(matches.map((m) => m.trim())));
}

function inferCertType(rawType: string): string | undefined {
  if (!rawType) return undefined;
  const lower = rawType.toLowerCase().replace(/[^a-z&]/g, '');
  if (lower.includes('ia')) return 'IA';
  if (lower.includes('a&p') || lower.includes('ap')) return 'A&P';
  if (lower.includes('repairstation')) return 'Repair Station';
  if (lower.includes('repairman')) return 'Repairman';
  return rawType || undefined;
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
  return (
    SIGNATURE_LINE_PATTERN.test(trimmed) ||
    CERT_AND_NUMBER_PATTERN.test(trimmed) ||
    STANDALONE_CERT_PATTERN.test(trimmed)
  );
}

function isHorizontalRule(line: string): boolean {
  return HORIZONTAL_RULE_PATTERN.test(line);
}

function isEntryNumber(line: string): boolean {
  return ENTRY_NUMBER_PATTERN.test(line);
}

function countMatches(lines: string[] | string, matcher: (line: string) => boolean): number {
  const lineArr = typeof lines === 'string' ? lines.split(/\r?\n/) : lines;
  let count = 0;
  for (const line of lineArr) {
    if (matcher(line)) count += 1;
  }
  return count;
}

// ─── Multi-signal entry boundary scoring ──────────────────────────────────────

interface BoundaryCandidate {
  lineIndex: number;
  score: number;
  signals: string[];
}

/**
 * Score every line as a potential entry boundary using multiple signals.
 * Higher score = stronger evidence that a new entry begins at this line.
 */
function scoreBoundaries(lines: string[]): BoundaryCandidate[] {
  const candidates: BoundaryCandidate[] = [];

  // Track blank-line runs
  let blankRun = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      blankRun += 1;
      continue;
    }

    let score = 0;
    const signals: string[] = [];

    // Signal 1: Date on this line (strongest signal)
    if (isLikelyDateLine(line)) {
      score += 5;
      signals.push('date');
    }

    // Signal 2: Preceded by blank-line cluster
    if (blankRun >= BLANK_LINE_CLUSTER_MIN) {
      score += 3;
      signals.push(`blank_cluster(${blankRun})`);
    } else if (blankRun === 1) {
      score += 1;
      signals.push('single_blank');
    }

    // Signal 3: Preceded by horizontal rule
    if (i > 0 && isHorizontalRule(lines[i - 1])) {
      score += 4;
      signals.push('horizontal_rule');
    }

    // Signal 4: Entry number on this line
    if (isEntryNumber(line)) {
      score += 4;
      signals.push('entry_number');
    }

    // Signal 5: Previous line was a signature/cert line (new entry follows sign-off)
    if (i > 0 && isLikelySignatureLine(lines[i - 1])) {
      score += 3;
      signals.push('after_signature');
    }

    // Signal 6: Preceded by standalone cert number
    if (i > 0 && STANDALONE_CERT_PATTERN.test(lines[i - 1])) {
      score += 2;
      signals.push('after_cert_number');
    }

    if (score > 0) {
      candidates.push({ lineIndex: i, score, signals });
    }

    blankRun = 0;
  }

  return candidates;
}

// ─── Smart segmenter ──────────────────────────────────────────────────────────

/**
 * Segment logbook text into individual entry segments using multi-signal
 * boundary detection. Falls back to date-only segmentation if boundary
 * scoring finds fewer candidates than pure date detection.
 */
export function segmentLogbookTextIntoEntrySegments(text: string): string[] {
  const lines = text.split(/\r?\n/);

  // Phase 1: Score all potential boundaries
  const candidates = scoreBoundaries(lines);

  // Phase 2: Filter to high-confidence boundaries (score >= 5 = date + something, or date alone)
  // Also accept non-date boundaries with very high scores (>= 7)
  const BOUNDARY_THRESHOLD = 4;
  const strongBoundaries = candidates
    .filter((c) => c.score >= BOUNDARY_THRESHOLD)
    .sort((a, b) => a.lineIndex - b.lineIndex);

  // Phase 3: If boundary detection found nothing useful, fall back to date-only
  if (strongBoundaries.length < MIN_ENTRY_SEGMENTS) {
    // Try weaker threshold
    const weakBoundaries = candidates
      .filter((c) => c.score >= 2 && c.signals.includes('date'))
      .sort((a, b) => a.lineIndex - b.lineIndex);
    if (weakBoundaries.length < MIN_ENTRY_SEGMENTS) return [];
    return buildSegmentsFromBoundaries(lines, weakBoundaries);
  }

  return buildSegmentsFromBoundaries(lines, strongBoundaries);
}

function buildSegmentsFromBoundaries(lines: string[], boundaries: BoundaryCandidate[]): string[] {
  const segments: string[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].lineIndex;
    const nextStart = i + 1 < boundaries.length ? boundaries[i + 1].lineIndex : lines.length;
    const rangeLines = lines.slice(start, nextStart);
    if (rangeLines.length === 0) continue;

    // Trim trailing blank/separator lines from segment
    let endOffset = rangeLines.length;
    while (endOffset > 1) {
      const lastLine = rangeLines[endOffset - 1].trim();
      if (!lastLine || isHorizontalRule(rangeLines[endOffset - 1])) {
        endOffset -= 1;
      } else {
        break;
      }
    }

    const segmentText = rangeLines.slice(0, endOffset).join('\n').trim();
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

  // Normalize the entry, then apply deterministic validation/enrichment
  const entry: ParsedLogEntry = {
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

  // Post-processing enrichment
  return enrichEntry(entry);
}

/**
 * Apply deterministic post-processing to fill gaps Claude may have left.
 * This catches things the LLM might miss and validates/corrects its output.
 */
function enrichEntry(entry: ParsedLogEntry): ParsedLogEntry {
  const workLower = (entry.workPerformed ?? '').toLowerCase();
  const rawLower = entry.rawText.toLowerCase();
  const combinedLower = workLower + ' ' + rawLower;

  // 1. Entry type: validate/infer if missing or low-confidence
  const deterministicType = inferEntryTypeFromText(combinedLower);
  if (!entry.entryType && deterministicType) {
    entry.entryType = deterministicType;
    entry.fieldConfidence.entryType = 0.7;
  }

  // 2. ATA chapter: infer if missing
  if (!entry.ataChapter) {
    const inferred = inferAtaChapter(combinedLower);
    if (inferred) {
      entry.ataChapter = inferred;
      entry.fieldConfidence.ataChapter = 0.6;
    }
  }

  // 3. Extract AD/SB references from work text if Claude missed them
  if (!entry.adReferences || entry.adReferences.length === 0) {
    const adRefs = extractAdReferences(entry.workPerformed ?? '');
    const adRefsRaw = extractAdReferences(entry.rawText);
    const combined = dedupeReferences([...adRefs, ...adRefsRaw]);
    if (combined.length > 0) {
      entry.adReferences = combined;
      entry.adSbReferences = dedupeReferences([...(entry.adSbReferences ?? []), ...combined]);
      entry.fieldConfidence.adReferences = 0.85;
    }
  }
  if (!entry.sbReferences || entry.sbReferences.length === 0) {
    const sbRefs = extractSbReferences(entry.workPerformed ?? '');
    const sbRefsRaw = extractSbReferences(entry.rawText);
    const combined = dedupeReferences([...sbRefs, ...sbRefsRaw]);
    if (combined.length > 0) {
      entry.sbReferences = combined;
      entry.adSbReferences = dedupeReferences([...(entry.adSbReferences ?? []), ...combined]);
      entry.fieldConfidence.sbReferences = 0.85;
    }
  }

  // 4. If AD references exist but entry type isn't ad_compliance, promote it
  if (entry.adReferences && entry.adReferences.length > 0 && entry.entryType !== 'ad_compliance') {
    if (entry.entryType === 'maintenance' || entry.entryType === 'other' || !entry.entryType) {
      entry.entryType = 'ad_compliance';
      entry.fieldConfidence.entryType = 0.8;
    }
  }

  // 5. hasReturnToService: detect from text if Claude missed it
  if (entry.hasReturnToService === undefined) {
    const rtsPattern = /\b(?:return(?:ed)?\s*to\s*service|RTS|approved\s*for\s*return|I\s+certify\s+that|airworthy\s*condition)\b/i;
    if (rtsPattern.test(combinedLower)) {
      entry.hasReturnToService = true;
      entry.fieldConfidence.hasReturnToService = 0.75;
    }
  }

  // 6. Total time extraction from rawText if Claude missed it
  if (entry.totalTimeAtEntry === undefined) {
    const ttMatch = rawLower.match(
      /\b(?:tt(?:af)?|total\s*time|ttsn|aftt|hobbs|tach)\s*[:=]?\s*(\d{1,6}(?:\.\d{1,2})?)\b/i
    );
    if (ttMatch) {
      const val = parseFloat(ttMatch[1]);
      if (!isNaN(val) && val > 0 && val < 200_000) {
        entry.totalTimeAtEntry = val;
        entry.fieldConfidence.totalTimeAtEntry = 0.7;
      }
    }
  }

  // 7. Cert number extraction from rawText if Claude missed it
  if (!entry.signerCertNumber) {
    const certMatch = entry.rawText.match(/\b(?:cert|certificate|license|#)\s*[:.]?\s*(\d{6,10})\b/i);
    if (certMatch) {
      entry.signerCertNumber = certMatch[1];
      entry.fieldConfidence.signerCertNumber = 0.65;
    }
  }

  // 8. Date sanity check: reject obviously wrong dates
  if (entry.entryDate) {
    const d = new Date(entry.entryDate);
    const year = d.getFullYear();
    // Aircraft logbooks don't predate 1903 and shouldn't be in the far future
    if (isNaN(d.getTime()) || year < 1940 || year > new Date().getFullYear() + 2) {
      entry.entryDate = undefined;
      entry.fieldConfidence.entryDate = 0;
    }
  }

  // 9. Total time sanity check
  if (entry.totalTimeAtEntry !== undefined) {
    if (entry.totalTimeAtEntry < 0 || entry.totalTimeAtEntry > 200_000) {
      entry.totalTimeAtEntry = undefined;
      entry.fieldConfidence.totalTimeAtEntry = 0;
    }
  }

  return entry;
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

// ─── Deduplication with fuzzy matching ────────────────────────────────────────

function normalizeTextForDedup(value: string | undefined, maxLen = 800): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s:/.-]/g, '')
    .trim()
    .slice(0, maxLen);
}

/**
 * Compute similarity between two strings using a combined approach:
 * 1. Token-level Jaccard index (handles reordering, extra words)
 * 2. Character-level bigram similarity (handles OCR typos like "assembly" → "asembly")
 * Returns the maximum of the two (0–1).
 */
function textSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  // Token Jaccard
  const tokensA = new Set(a.split(/\s+/));
  const tokensB = new Set(b.split(/\s+/));
  let intersection = 0;
  tokensA.forEach((t) => {
    if (tokensB.has(t)) intersection += 1;
  });
  const union = tokensA.size + tokensB.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;

  // Character bigram similarity (Dice coefficient) — catches single-char typos
  const bigramsA: Record<string, number> = {};
  const bigramsB: Record<string, number> = {};
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigramsA[bg] = (bigramsA[bg] ?? 0) + 1;
  }
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    bigramsB[bg] = (bigramsB[bg] ?? 0) + 1;
  }
  let bigramIntersection = 0;
  for (const bg of Object.keys(bigramsA)) {
    const countB = bigramsB[bg] ?? 0;
    bigramIntersection += Math.min(bigramsA[bg], countB);
  }
  const totalBigrams = (a.length - 1) + (b.length - 1);
  const dice = totalBigrams === 0 ? 0 : (2 * bigramIntersection) / totalBigrams;

  return Math.max(jaccard, dice);
}

function deduplicateEntries(entries: ParsedLogEntry[]): ParsedLogEntry[] {
  const seen = new Set<string>();
  const result: ParsedLogEntry[] = [];

  for (const entry of entries) {
    // Exact dedup key
    const key = [
      entry.entryDate ?? '',
      normalizeTextForDedup(entry.workPerformed, 1200),
      normalizeTextForDedup(entry.returnToServiceStatement, 400),
      normalizeTextForDedup(entry.signerName, 120),
      normalizeTextForDedup(entry.signerCertNumber, 120),
      entry.totalTimeAtEntry ?? '',
      entry.totalCyclesAtEntry ?? '',
      entry.totalLandingsAtEntry ?? '',
    ].join('|');

    if (seen.has(key)) continue;
    seen.add(key);

    // Fuzzy dedup: check if this entry is near-identical to one already kept
    const normWork = normalizeTextForDedup(entry.workPerformed, 1200);
    let isFuzzyDupe = false;
    for (const kept of result) {
      // Same date (or both missing) is a prerequisite for fuzzy matching
      if ((entry.entryDate ?? '') !== (kept.entryDate ?? '')) continue;
      const keptNormWork = normalizeTextForDedup(kept.workPerformed, 1200);
      const sim = textSimilarity(normWork, keptNormWork);
      if (sim > 0.85) {
        // Keep the one with higher confidence / more fields populated
        if ((entry.confidence ?? 0) > (kept.confidence ?? 0)) {
          // Replace the kept entry with this better version
          const idx = result.indexOf(kept);
          if (idx >= 0) result[idx] = entry;
        }
        isFuzzyDupe = true;
        break;
      }
    }

    if (!isFuzzyDupe) {
      result.push(entry);
    }
  }

  return result;
}

// ─── Cross-chunk entry merging ──────────────────────────────────────────────

/**
 * Detect and merge entries that were split across chunk boundaries.
 * Heuristic: if the last entry in chunk N has no sign-off and the first entry
 * in chunk N+1 has no date, they likely belong together.
 */
function mergeSplitEntries(entries: ParsedLogEntry[]): ParsedLogEntry[] {
  if (entries.length < 2) return entries;

  const merged: ParsedLogEntry[] = [entries[0]];

  for (let i = 1; i < entries.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = entries[i];

    // Merge candidate: previous entry has no sign-off AND current has no date
    // OR current entry's rawText starts with continuation markers
    const prevLacksSignoff = !prev.signerName && !prev.hasReturnToService;
    const currLacksDate = !curr.entryDate;
    const currIsContinuation = /^\s*(?:\.{3}|…|cont(?:inued)?\.?|(?:continued\s*from))/i.test(curr.rawText);

    if ((prevLacksSignoff && currLacksDate) || currIsContinuation) {
      // Merge: combine work descriptions and take the best of each field
      prev.workPerformed = [prev.workPerformed, curr.workPerformed].filter(Boolean).join(' ');
      prev.rawText = [prev.rawText, curr.rawText].filter(Boolean).join('\n');
      prev.signerName = prev.signerName || curr.signerName;
      prev.signerCertNumber = prev.signerCertNumber || curr.signerCertNumber;
      prev.signerCertType = prev.signerCertType || curr.signerCertType;
      prev.returnToServiceStatement = prev.returnToServiceStatement || curr.returnToServiceStatement;
      prev.hasReturnToService = prev.hasReturnToService || curr.hasReturnToService;
      prev.entryDate = prev.entryDate || curr.entryDate;
      prev.totalTimeAtEntry = prev.totalTimeAtEntry ?? curr.totalTimeAtEntry;
      prev.totalCyclesAtEntry = prev.totalCyclesAtEntry ?? curr.totalCyclesAtEntry;
      prev.totalLandingsAtEntry = prev.totalLandingsAtEntry ?? curr.totalLandingsAtEntry;
      prev.ataChapter = prev.ataChapter || curr.ataChapter;
      prev.entryType = prev.entryType || curr.entryType;
      prev.adReferences = dedupeReferences([...(prev.adReferences ?? []), ...(curr.adReferences ?? [])]);
      prev.sbReferences = dedupeReferences([...(prev.sbReferences ?? []), ...(curr.sbReferences ?? [])]);
      prev.adSbReferences = dedupeReferences([...(prev.adSbReferences ?? []), ...(curr.adSbReferences ?? [])]);
      if (prev.adReferences.length === 0) prev.adReferences = undefined;
      if (prev.sbReferences.length === 0) prev.sbReferences = undefined;
      if (prev.adSbReferences.length === 0) prev.adSbReferences = undefined;
      // Average confidences
      prev.confidence = ((prev.confidence ?? 0) + (curr.confidence ?? 0)) / 2;
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

// ─── Diagnostics types ────────────────────────────────────────────────────────

export interface LogbookParseResult {
  entries: ParsedLogEntry[];
  totalChunks: number;
  sourceDocumentId?: string;
  documentType?: LogbookDocumentType;
  diagnostics?: LogbookParseDiagnostics;
}

export interface LogbookParseChunkDiagnostic {
  chunkIndex: number;
  strategy: 'entry_segments' | 'char_chunks' | 'csv_fast_path' | 'delimited_fast_path';
  charLength: number;
  lineCount: number;
  estimatedStartDates: number;
  estimatedSignatureEnds: number;
  parsedEntriesCount: number;
  responseExcerpt: string;
}

export interface LogbookParseDiagnostics {
  strategyUsed: 'entry_segments' | 'char_chunks' | 'csv_fast_path' | 'delimited_fast_path';
  documentType: LogbookDocumentType;
  sourceTextLength: number;
  sourceLineCount: number;
  totalSegments: number;
  segmentCharLengths: number[];
  chunks: LogbookParseChunkDiagnostic[];
  boundarySignals?: Array<{ line: number; score: number; signals: string[] }>;
  mergedEntries?: number;
  fuzzyDedupRemoved?: number;
}

// ─── Main parse function ──────────────────────────────────────────────────────

/**
 * Parse extracted text from a scanned logbook document into structured entries.
 * Handles large documents by chunking and deduplicating across chunks.
 * Supports CSV/TSV/delimited fast-path, multi-signal boundary detection,
 * cross-chunk entry merging, fuzzy dedup, and deterministic enrichment.
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

  // ── Pre-classify the document ───────────────────────────────────────────────
  const documentType = classifyDocumentType(extractedText);

  // ── Delimited fast-path (CSV, TSV, pipe, semicolon) ─────────────────────────
  const { isDelimited, delimiter } = looksLikeDelimited(extractedText);
  if (isDelimited && delimiter) {
    const delimitedEntries = parseDelimitedToEntries(extractedText, delimiter);
    const lines = extractedText.split(/\r?\n/);
    const diagnostics: LogbookParseDiagnostics | undefined = opts?.debug
      ? {
          strategyUsed: 'delimited_fast_path',
          documentType,
          sourceTextLength: extractedText.length,
          sourceLineCount: lines.length,
          totalSegments: 1,
          segmentCharLengths: [extractedText.length],
          chunks: [{
            chunkIndex: 1,
            strategy: 'delimited_fast_path',
            charLength: extractedText.length,
            lineCount: lines.length,
            estimatedStartDates: delimitedEntries.length,
            estimatedSignatureEnds: 0,
            parsedEntriesCount: delimitedEntries.length,
            responseExcerpt: `Delimited fast-path (${delimiter === '\t' ? 'TSV' : delimiter}): ${delimitedEntries.length} rows parsed`,
          }],
        }
      : undefined;
    return {
      entries: delimitedEntries,
      totalChunks: 1,
      sourceDocumentId: opts?.sourceDocumentId,
      documentType,
      diagnostics,
    };
  }

  // ── Build document-type-specific prompt context ─────────────────────────────
  const docTypeHint = buildDocTypeHint(documentType);

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
        documentType,
        sourceTextLength: extractedText.length,
        sourceLineCount: extractedText.split(/\r?\n/).length,
        totalSegments: chunks.length,
        segmentCharLengths: chunks.map((chunk) => chunk.length),
        chunks: [],
        boundarySignals: scoreBoundaries(extractedText.split(/\r?\n/))
          .filter((c) => c.score >= 3)
          .map((c) => ({ line: c.lineIndex, score: c.score, signals: c.signals })),
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
          content: `Parse the following logbook text and return a JSON array of structured entries.${docTypeHint}${chunkLabel}${ocrHint}\n\n---\n${chunks[i]}\n---`,
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
            content: `Parse the following logbook text and return a JSON array of structured entries.${docTypeHint}\n\n[Retry chunk ${i + 1} of ${retryChunkList.length}]\n\n---\n${retryChunkList[i]}\n---`,
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

  // ── Post-processing pipeline ────────────────────────────────────────────────
  const merged = mergeSplitEntries(allEntries);
  const deduplicated = deduplicateEntries(merged);

  if (diagnostics) {
    diagnostics.mergedEntries = allEntries.length - merged.length;
    diagnostics.fuzzyDedupRemoved = merged.length - deduplicated.length;
  }

  return {
    entries: deduplicated,
    totalChunks: chunks.length,
    sourceDocumentId: opts?.sourceDocumentId,
    documentType,
    diagnostics,
  };
}

/**
 * Build a document-type-specific hint to inject into the LLM prompt.
 */
function buildDocTypeHint(docType: LogbookDocumentType): string {
  switch (docType) {
    case 'engine_logbook':
      return '\n\n[Document type: ENGINE LOGBOOK — prioritize TSN, TSMOH, TSOH fields. Look for hot section inspections, overhauls, engine-specific ADs. Total time = engine time, not airframe.]';
    case 'propeller_logbook':
      return '\n\n[Document type: PROPELLER LOGBOOK — prioritize prop-specific work: governor adjustments, blade inspections, overhauls, dynamic balancing. Total time = propeller time.]';
    case 'appliance_logbook':
      return '\n\n[Document type: APPLIANCE/COMPONENT LOGBOOK — track component-level maintenance, part numbers, serial numbers, TSN/TSO.]';
    case 'work_order':
      return '\n\n[Document type: WORK ORDER / 337 FORM — this may be a single multi-item work order. Each numbered squawk/discrepancy with its own corrective action is a separate entry. Look for Item numbers.]';
    case 'mx_tracking_export':
      return '\n\n[Document type: MX TRACKING EXPORT — structured data from maintenance tracking software. Rows are individual entries.]';
    case 'airframe_logbook':
      return '\n\n[Document type: AIRFRAME LOGBOOK — prioritize TTAF, annual/100-hr inspections, airframe ADs, structural work.]';
    default:
      return '';
  }
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
