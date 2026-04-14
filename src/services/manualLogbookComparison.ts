/**
 * On-demand extraction of inspection-type requirements from aircraft manual text
 * and comparison against a log entry. Used by Logbook Entry Review.
 */

import { createClaudeMessage } from './claudeProxy';

export type ManualComparisonItemStatus = 'matched' | 'missing' | 'unclear';

export interface ManualComparisonItem {
  requirementText: string;
  status: ManualComparisonItemStatus;
  manualEvidence: string;
  logEvidence: string;
  notes?: string;
}

export interface ManualComparisonSummary {
  matched: number;
  missing: number;
  unclear: number;
}

export interface ManualComparisonResult {
  inspectionType: string;
  requiredItems: ManualComparisonItem[];
  summary: ManualComparisonSummary;
  /** True when manual text was trimmed to fit model context */
  truncatedManual?: boolean;
  manualCharsUsed?: number;
  /** True when requirement list was capped before compare step */
  truncatedRequirements?: boolean;
  requirementsCap?: number;
}

const MAX_MANUAL_CHARS = 120_000;
const CHUNK_SIZE = 24_000;
const CHUNK_OVERLAP = 1_500;
const MAX_REQUIREMENTS_TO_COMPARE = 60;

const EXTRACT_SYSTEM = `You are an aviation maintenance documentation specialist. Your job is to read aircraft manual / maintenance program text and extract discrete REQUIRED items that apply to a specific inspection or maintenance event type the user names.

Rules:
- Only include items that are clearly required (shall, must, required, mandatory, verify, check, inspect, accomplish, perform, document, record, sign, etc.) or are explicit checklist / task steps for that program.
- If the excerpt does not mention the user's inspection type, still extract any numbered checklist items or table rows that clearly belong to recurring or phased inspections when context matches; otherwise return an empty list.
- Each item must be a single actionable or verifiable requirement (one line to a few sentences), not entire sections.
- Include a short manualEvidence quote copied from the excerpt (max ~240 chars).

Respond ONLY with JSON (no markdown): {"items":[{"requirementText":"string","manualEvidence":"string"}]}`;

const COMPARE_SYSTEM = `You are an aviation maintenance records analyst. You are given:
1) A named inspection / program type
2) A list of required items (from the aircraft manual)
3) Text from a maintenance log entry

For EACH required item, decide if the log entry clearly documents compliance:
- "matched": The log shows the work, check, sign-off, or explicit reference that satisfies the requirement.
- "missing": The log does not mention the requirement and nothing clearly equivalent appears.
- "unclear": Partial mention, ambiguous wording, or insufficient detail to confirm.

Be conservative: if unsure, use "unclear". Quote brief evidence from the log when matched or unclear (max ~240 chars).

Respond ONLY with JSON (no markdown):
{
  "inspectionType": "<same as user provided>",
  "requiredItems": [
    {
      "requirementText": "<exact from input list>",
      "status": "matched" | "missing" | "unclear",
      "manualEvidence": "<from input or repeat>",
      "logEvidence": "<snippet or empty>",
      "notes": "<optional short rationale>"
    }
  ],
  "summary": { "matched": 0, "missing": 0, "unclear": 0 }
}

The requiredItems array MUST be the same length and same order as the input list; requirementText must match exactly.`;

export interface ComplianceFindingInput {
  aircraftId: string;
  logbookEntryId?: string;
  ruleId: string;
  findingType: string;
  severity: string;
  title: string;
  description: string;
  citation: string;
  evidenceSnippet?: string;
}

function parseJsonObject(raw: string): unknown {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in response');
  return JSON.parse(match[0]) as unknown;
}

function normalizeInspectionType(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

function normalizeReqKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 .,_-]/g, '')
    .trim()
    .slice(0, 120);
}

function mergeExtractedItems(
  rows: Array<{ requirementText: string; manualEvidence: string }>,
): Array<{ requirementText: string; manualEvidence: string }> {
  const seen = new Set<string>();
  const out: Array<{ requirementText: string; manualEvidence: string }> = [];
  for (const row of rows) {
    const t = (row.requirementText ?? '').trim();
    if (!t) continue;
    const key = normalizeReqKey(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      requirementText: t,
      manualEvidence: (row.manualEvidence ?? '').trim().slice(0, 500),
    });
  }
  return out;
}

/** Force requirement text order to match extracted list; fill gaps as unclear. */
export function alignComparisonToExpected(
  expected: Array<{ requirementText: string; manualEvidence: string }>,
  parsed: ManualComparisonResult,
): ManualComparisonItem[] {
  return expected.map((exp, i) => {
    const row = parsed.requiredItems[i];
    if (!row) {
      return {
        requirementText: exp.requirementText,
        status: 'unclear' as const,
        manualEvidence: exp.manualEvidence,
        logEvidence: '',
        notes: 'No comparison row returned for this item.',
      };
    }
    return {
      requirementText: exp.requirementText,
      status: row.status,
      manualEvidence: (row.manualEvidence || exp.manualEvidence).trim(),
      logEvidence: row.logEvidence,
      notes: row.notes,
    };
  });
}

function summaryFromItems(items: ManualComparisonItem[]): ManualComparisonSummary {
  return {
    matched: items.filter((i) => i.status === 'matched').length,
    missing: items.filter((i) => i.status === 'missing').length,
    unclear: items.filter((i) => i.status === 'unclear').length,
  };
}

async function extractFromChunk(
  inspectionType: string,
  chunk: string,
  model: string,
): Promise<Array<{ requirementText: string; manualEvidence: string }>> {
  const user = `Inspection / program type (user label): "${inspectionType}"

Manual excerpt:
---
${chunk}
---

Extract required items JSON only.`;

  const response = await createClaudeMessage({
    model,
    max_tokens: 4096,
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: user }],
  });

  const raw = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('');
  const parsed = parseJsonObject(raw) as { items?: unknown };
  const items = parsed.items;
  if (!Array.isArray(items)) return [];

  const out: Array<{ requirementText: string; manualEvidence: string }> = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const o = it as Record<string, unknown>;
    const requirementText = typeof o.requirementText === 'string' ? o.requirementText : '';
    const manualEvidence = typeof o.manualEvidence === 'string' ? o.manualEvidence : '';
    if (requirementText.trim()) out.push({ requirementText, manualEvidence });
  }
  return out;
}

async function compareItems(
  inspectionType: string,
  items: Array<{ requirementText: string; manualEvidence: string }>,
  logEntryText: string,
  model: string,
): Promise<ManualComparisonResult> {
  const user = `Inspection / program type: "${inspectionType}"

Required items (in order — preserve in output):
${JSON.stringify(items, null, 2)}

Log entry text:
---
${logEntryText.trim().slice(0, 32_000)}
---

Return comparison JSON only.`;

  const response = await createClaudeMessage({
    model,
    max_tokens: 8192,
    system: COMPARE_SYSTEM,
    messages: [{ role: 'user', content: user }],
  });

  const raw = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text || '').join('');
  const parsed = normalizeManualComparisonResult(parseJsonObject(raw));
  const requiredItems = alignComparisonToExpected(items, parsed);
  return {
    inspectionType: parsed.inspectionType || inspectionType,
    requiredItems,
    summary: summaryFromItems(requiredItems),
  };
}

/** Normalize and validate a parsed Claude comparison payload. */
export function normalizeManualComparisonResult(data: unknown): ManualComparisonResult {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid comparison payload');
  }
  const o = data as Record<string, unknown>;
  const inspectionType = typeof o.inspectionType === 'string' ? o.inspectionType : '';

  const rawItems = o.requiredItems;
  if (!Array.isArray(rawItems)) {
    throw new Error('Invalid comparison payload: requiredItems');
  }

  const requiredItems: ManualComparisonItem[] = [];
  for (const it of rawItems) {
    if (!it || typeof it !== 'object') continue;
    const row = it as Record<string, unknown>;
    const requirementText = typeof row.requirementText === 'string' ? row.requirementText.trim() : '';
    if (!requirementText) continue;
    const statusRaw = row.status;
    const status: ManualComparisonItemStatus =
      statusRaw === 'matched' || statusRaw === 'missing' || statusRaw === 'unclear' ? statusRaw : 'unclear';
    const manualEvidence =
      typeof row.manualEvidence === 'string' ? row.manualEvidence : '';
    const logEvidence = typeof row.logEvidence === 'string' ? row.logEvidence : '';
    const notes = typeof row.notes === 'string' ? row.notes : undefined;
    requiredItems.push({ requirementText, status, manualEvidence, logEvidence, notes });
  }

  const summary: ManualComparisonSummary = {
    matched: requiredItems.filter((i) => i.status === 'matched').length,
    missing: requiredItems.filter((i) => i.status === 'missing').length,
    unclear: requiredItems.filter((i) => i.status === 'unclear').length,
  };

  return {
    inspectionType,
    requiredItems,
    summary,
  };
}

export interface RunManualLogbookComparisonArgs {
  inspectionType: string;
  manualText: string;
  logEntryText: string;
  model: string;
}

/**
 * Extract requirements from manual (chunked), then compare to log entry in one model call.
 */
export async function runManualLogbookComparison(
  args: RunManualLogbookComparisonArgs,
): Promise<ManualComparisonResult> {
  const inspectionType = normalizeInspectionType(args.inspectionType);
  if (!inspectionType) throw new Error('Inspection type is required');
  const fullManual = args.manualText.trim();
  if (!fullManual) throw new Error('Manual text is required');
  const logEntryText = args.logEntryText.trim();
  if (!logEntryText) throw new Error('Log entry text is required');

  const truncatedManual = fullManual.length > MAX_MANUAL_CHARS;
  const manualSlice = truncatedManual ? fullManual.slice(0, MAX_MANUAL_CHARS) : fullManual;

  const chunks = chunkText(manualSlice);
  const merged: Array<{ requirementText: string; manualEvidence: string }> = [];
  for (const chunk of chunks) {
    const part = await extractFromChunk(inspectionType, chunk, args.model);
    merged.push(...part);
  }

  let unique = mergeExtractedItems(merged);
  if (unique.length === 0) {
    return {
      inspectionType,
      requiredItems: [],
      summary: { matched: 0, missing: 0, unclear: 0 },
      truncatedManual,
      manualCharsUsed: manualSlice.length,
    };
  }

  let truncatedRequirements = false;
  if (unique.length > MAX_REQUIREMENTS_TO_COMPARE) {
    truncatedRequirements = true;
    unique = unique.slice(0, MAX_REQUIREMENTS_TO_COMPARE);
  }

  const compared = await compareItems(inspectionType, unique, logEntryText, args.model);
  return {
    ...compared,
    inspectionType: compared.inspectionType || inspectionType,
    truncatedManual,
    manualCharsUsed: manualSlice.length,
    truncatedRequirements,
    requirementsCap: truncatedRequirements ? MAX_REQUIREMENTS_TO_COMPARE : undefined,
  };
}

function slugRuleSegment(s: string, max = 48): string {
  const x = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max);
  return x || 'item';
}

/** Simple string hash for stable rule ids */
export function hashRequirementId(inspectionType: string, requirementText: string, index: number): string {
  const str = `${inspectionType}\0${requirementText}\0${index}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

/**
 * Build Convex complianceFindings.addBatch payloads for missing/unclear items only.
 */
export function comparisonGapsToComplianceFindings(
  aircraftId: string,
  result: ManualComparisonResult,
  options?: { logbookEntryId?: string },
): ComplianceFindingInput[] {
  const citationBase = `Aircraft manual — ${result.inspectionType || 'inspection'}`;

  return result.requiredItems.flatMap((item, idx) => {
    if (item.status !== 'missing' && item.status !== 'unclear') return [];
    const h = hashRequirementId(result.inspectionType, item.requirementText, idx);
    const ruleId = `manual-logbook:${slugRuleSegment(result.inspectionType)}:${h}`;
    const sev = item.status === 'missing' ? 'major' : 'minor';
    const title =
      item.requirementText.length > 120 ? `${item.requirementText.slice(0, 117)}…` : item.requirementText;
    const descParts = [
      `Manual comparison (${result.inspectionType}): required item not clearly documented in the log entry.`,
      item.status === 'unclear' ? 'Status: unclear / insufficient detail in log.' : 'Status: missing.',
      item.notes ? `Notes: ${item.notes}` : '',
      item.manualEvidence ? `Manual evidence: ${item.manualEvidence}` : '',
    ].filter(Boolean);

    const row: ComplianceFindingInput = {
      aircraftId,
      ruleId,
      findingType: 'data_mismatch',
      severity: sev,
      title,
      description: descParts.join(' '),
      citation: citationBase,
      evidenceSnippet: item.logEvidence || item.manualEvidence || undefined,
    };
    if (options?.logbookEntryId) row.logbookEntryId = options.logbookEntryId;
    return [row];
  });
}
