import { createClaudeMessage } from './claudeProxy';
import type { ExtractedInspectionItem } from '../types/inspectionSchedule';

const CHUNK_SIZE = 16000;
const CHUNK_OVERLAP = 2000;
const MAX_TEXT_LENGTH = 18000;

/** Minimal entity document shape for extraction. */
export interface EntityDocumentForExtraction {
  id: string;
  name: string;
  extractedText?: string;
}

/** One extracted item per document (before deduplication). */
export interface ExtractionResult {
  documentId: string;
  documentName: string;
  items: ExtractedInspectionItem[];
}

const EXTRACTION_PROMPT = `You are an aviation compliance specialist. Extract ONLY true recurring inspection, calibration, audit, or surveillance REQUIREMENTS from the document text below.

## CRITICAL: What qualifies as a recurring/due inspection

Extract ONLY when ALL of these are true:
1. The text explicitly REQUIRES or MANDATES performing an action (shall, must, required to, at intervals of, not to exceed)
2. There is a CLEAR, SPECIFIC recurring interval (e.g., every 6 months, quarterly, every 100 hours)
3. The action is something that must be DONE on a schedule (inspect, calibrate, audit, surveil, certify), not merely mentioned or referenced

## DO NOT EXTRACT

- **Keyword matches without a requirement**: "Inspection" or "calibration" mentioned in passing, table of contents, section headers, or procedural descriptions that don't state an interval
- **Past events or historical descriptions**: "Audits were performed quarterly in 2023" (describes what happened, not a requirement)
- **References or pointers**: "See Section 4 for calibration requirements", "refer to the manual"
- **One-time tasks**: Initial certification, one-time approvals, setup tasks
- **Retention periods**: "Records retained for 2 years" (retention, not a recurring inspection)
- **Vague or unspecific**: "Periodic review", "as needed", "from time to time", "regular inspections" with no numeric interval
- **General availability**: "Equipment must be available for inspection" (no recurring schedule)
- **Training without schedule**: "Personnel shall be trained" with no retraining interval

## Valid extraction patterns

- "shall be calibrated every X months" / "calibration interval of X months"
- "performed at least every X months" / "at intervals not exceeding X months"
- "quarterly" / "semi-annual" / "annual" / "biennial" when used as a requirement
- "every X hours" / "every X cycles" for usage-based intervals
- "inspected every X days" when it's a mandate, not a past event

## Output schema

For each valid requirement found, extract:
1. title - short description (e.g., "Torque wrench calibration")
2. description - optional longer context
3. category - one of: calibration, audit, training, surveillance, facility, ad_compliance, other
4. intervalType - "calendar" for time-based (months/days), "hours" or "cycles" for usage-based
5. intervalMonths - number (e.g., 3=quarterly, 6=semi-annual, 12=annual), or null
6. intervalDays - number for sub-month cadence (e.g., 7 for weekly), or null
7. intervalValue - number for hours/cycles-based (e.g., 100 for "every 100 hours"), or null
8. regulationRef - regulatory citation if present, or null
9. isRegulatory - true if hard regulatory requirement, false if internal policy, or null
10. lastPerformedAt - ISO date (YYYY-MM-DD) ONLY if explicitly stated in text, or null
11. documentExcerpt - short snippet that clearly supports the requirement
12. confidence - "high" if explicit mandate + clear interval; "medium" if inferred from context; "low" only if interval is implied but not explicit

IMPORTANT: Every extracted item MUST have at least one of intervalMonths, intervalDays, or intervalValue filled. If you cannot determine a numeric interval, do NOT include the item.

Return a JSON array. If nothing qualifies, return [].
\`\`\`json
[
  {
    "title": "Torque wrench calibration",
    "description": "All torque wrenches used for critical fasteners",
    "category": "calibration",
    "intervalType": "calendar",
    "intervalMonths": 6,
    "intervalDays": null,
    "intervalValue": null,
    "regulationRef": "RSM Section 4.3",
    "isRegulatory": false,
    "lastPerformedAt": null,
    "documentExcerpt": "Torque wrenches shall be calibrated every 6 months...",
    "confidence": "high"
  }
]
\`\`\``;

function chunkText(text: string): string[] {
  if (text.length <= MAX_TEXT_LENGTH) return [text];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + CHUNK_SIZE, text.length);
    chunks.push(text.slice(start, end));
    start += CHUNK_SIZE - CHUNK_OVERLAP;
  }
  return chunks;
}

/** Simple title similarity: normalize and compare. */
function titlesSimilar(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60);
  return normalize(a) === normalize(b);
}

function deduplicateByTitle(items: ExtractedInspectionItem[]): ExtractedInspectionItem[] {
  const seen: ExtractedInspectionItem[] = [];
  for (const item of items) {
    if (!seen.some((s) => titlesSimilar(s.title, item.title))) {
      seen.push(item);
    }
  }
  return seen;
}

/** Returns true if the item has a usable recurring interval for scheduling. */
function hasUsableInterval(x: {
  intervalMonths?: number;
  intervalDays?: number;
  intervalValue?: number;
  intervalType?: string;
}): boolean {
  if (typeof x.intervalMonths === 'number' && x.intervalMonths > 0) return true;
  if (typeof x.intervalDays === 'number' && x.intervalDays > 0) return true;
  if (
    (x.intervalType === 'hours' || x.intervalType === 'cycles') &&
    typeof x.intervalValue === 'number' &&
    x.intervalValue > 0
  )
    return true;
  return false;
}

function parseExtractionResponse(response: string): ExtractedInspectionItem[] {
  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1].trim() : response.trim();
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    const mapped = arr
      .filter((x: any) => x && typeof x.title === 'string')
      .map((x: any) => ({
        title: String(x.title).trim(),
        description: x.description != null ? String(x.description) : undefined,
        category: ['calibration', 'audit', 'training', 'surveillance', 'facility', 'ad_compliance', 'other'].includes(x.category)
          ? x.category
          : 'other',
        intervalType: ['calendar', 'hours', 'cycles'].includes(x.intervalType) ? x.intervalType : 'calendar',
        intervalMonths: typeof x.intervalMonths === 'number' ? x.intervalMonths : undefined,
        intervalDays: typeof x.intervalDays === 'number' ? x.intervalDays : undefined,
        intervalValue: typeof x.intervalValue === 'number' ? x.intervalValue : undefined,
        regulationRef: x.regulationRef != null ? String(x.regulationRef) : undefined,
        isRegulatory: typeof x.isRegulatory === 'boolean' ? x.isRegulatory : undefined,
        lastPerformedAt: x.lastPerformedAt != null ? String(x.lastPerformedAt).slice(0, 10) : null,
        documentExcerpt: x.documentExcerpt != null ? String(x.documentExcerpt).slice(0, 500) : undefined,
        confidence: ['high', 'medium', 'low'].includes(x.confidence) ? x.confidence : 'medium',
      }));
    // Drop items without a usable interval - these are keyword matches, not actual recurring requirements
    return mapped.filter(hasUsableInterval);
  } catch {
    return [];
  }
}

const COMPLETION_FINDER_PROMPT = `You are an aviation compliance specialist. Given the numbered list of recurring inspection/calibration items below, search the document text for any evidence that these were last PERFORMED or COMPLETED with a specific date.

Look for patterns such as:
- "Last calibrated: [date]" / "Calibrated on [date]"
- "Audit completed [date]" / "Last audit: [date]"
- Logbook entries or maintenance records showing a task was performed
- "Performed on [date]" / "Completed [date]" / "Conducted [date]"
- Certificate/record effective dates tied to a specific inspection

## Critical rules
- Only report matches where the document text clearly associates THAT specific item with a SPECIFIC past date
- Do NOT infer or guess dates — only report explicitly stated dates
- Do NOT match if the date is a future scheduled date (e.g. "next due", "expires")
- Do NOT match if the text is a requirement/interval statement, not a completion record
- Return ISO dates: YYYY-MM-DD

Items to match (by index):
{ITEMS_LIST}

Document: "{DOC_NAME}"

Return JSON array only. For each item where you find clear completion evidence with a specific date:
\`\`\`json
[{ "itemIndex": 0, "lastPerformedAt": "2024-08-15", "excerpt": "..." }]
\`\`\`
If nothing found, return [].`;

interface CompletionMatch {
  itemIndex: number;
  lastPerformedAt: string;
  excerpt: string;
}

function parseCompletionResponse(response: string): CompletionMatch[] {
  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1].trim() : response.trim();
    if (!raw || raw === '[]') return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
      .filter(
        (x: any) =>
          x &&
          typeof x.itemIndex === 'number' &&
          typeof x.lastPerformedAt === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(x.lastPerformedAt.slice(0, 10))
      )
      .map((x: any) => ({
        itemIndex: x.itemIndex,
        lastPerformedAt: String(x.lastPerformedAt).slice(0, 10),
        excerpt: x.excerpt ? String(x.excerpt).slice(0, 300) : '',
      }));
  } catch {
    return [];
  }
}

export class RecurringInspectionExtractor {
  async extractFromDocument(
    doc: EntityDocumentForExtraction,
    model: string,
    onProgress?: (message: string) => void
  ): Promise<ExtractionResult> {
    const text = doc.extractedText?.trim() || '';
    if (!text) {
      return { documentId: doc.id, documentName: doc.name, items: [] };
    }

    const chunks = chunkText(text);
    const allItems: ExtractedInspectionItem[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (onProgress) {
        onProgress(
          chunks.length > 1
            ? `Scanning ${doc.name} (part ${i + 1}/${chunks.length})...`
            : `Scanning ${doc.name}...`
        );
      }
      const prompt = `${EXTRACTION_PROMPT}\n\n---\nDocument: "${doc.name}"\n---\n\n${chunks[i]}`;
      const message = await createClaudeMessage({
        model,
        max_tokens: 4000,
        temperature: 0.2,
        messages: [{ role: 'user', content: prompt }],
      });
      const responseText = message.content[0]?.type === 'text' ? (message.content[0].text || '') : '';
      const items = parseExtractionResponse(responseText);
      allItems.push(...items);
    }

    const deduped = deduplicateByTitle(allItems);
    return { documentId: doc.id, documentName: doc.name, items: deduped };
  }

  async extractFromDocuments(
    docs: EntityDocumentForExtraction[],
    model: string,
    onProgress?: (documentIndex: number, documentName: string, message?: string) => void
  ): Promise<ExtractionResult[]> {
    const results: ExtractionResult[] = [];
    for (let i = 0; i < docs.length; i++) {
      const doc = docs[i];
      if (onProgress) onProgress(i, doc.name);
      const result = await this.extractFromDocument(
        doc,
        model,
        (msg) => onProgress?.(i, doc.name, msg)
      );
      results.push(result);
    }
    return results;
  }

  /**
   * Second pass: scan all selected documents for evidence that the extracted
   * inspection items were last performed on a specific date.
   *
   * Returns a map of item title → most-recent lastPerformedAt found across all docs.
   * Only items with no existing lastPerformedAt are candidates (caller decides).
   */
  async findCompletionDates(
    items: Array<{ title: string; lastPerformedAt?: string | null }>,
    docs: EntityDocumentForExtraction[],
    model: string,
    onProgress?: (message: string) => void
  ): Promise<Map<string, string>> {
    if (items.length === 0 || docs.length === 0) return new Map();

    const itemsList = items.map((it, idx) => `${idx}. ${it.title}`).join('\n');
    // best date found per item index (keep the most recent)
    const bestByIndex = new Map<number, string>();

    for (const doc of docs) {
      const text = doc.extractedText?.trim() || '';
      if (!text) continue;

      const chunks = chunkText(text);
      for (let ci = 0; ci < chunks.length; ci++) {
        if (onProgress) {
          onProgress(
            chunks.length > 1
              ? `Checking ${doc.name} for completed inspections (part ${ci + 1}/${chunks.length})...`
              : `Checking ${doc.name} for completed inspections...`
          );
        }

        const prompt = COMPLETION_FINDER_PROMPT
          .replace('{ITEMS_LIST}', itemsList)
          .replace('{DOC_NAME}', doc.name)
          + `\n\n---\n${chunks[ci]}`;

        try {
          const message = await createClaudeMessage({
            model,
            max_tokens: 2000,
            temperature: 0.1,
            messages: [{ role: 'user', content: prompt }],
          });
          const responseText =
            message.content[0]?.type === 'text' ? message.content[0].text || '' : '';
          const matches = parseCompletionResponse(responseText);

          for (const m of matches) {
            if (m.itemIndex < 0 || m.itemIndex >= items.length) continue;
            const existing = bestByIndex.get(m.itemIndex);
            // Keep the most recent date found across all docs/chunks
            if (!existing || m.lastPerformedAt > existing) {
              bestByIndex.set(m.itemIndex, m.lastPerformedAt);
            }
          }
        } catch {
          // Non-fatal — skip this chunk and continue
        }
      }
    }

    // Convert index-keyed map → title-keyed map
    const result = new Map<string, string>();
    bestByIndex.forEach((date, idx) => {
      const item = items[idx];
      if (item) result.set(item.title, date);
    });
    return result;
  }
}
