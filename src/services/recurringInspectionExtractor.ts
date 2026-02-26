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

const EXTRACTION_PROMPT = `You are an aviation compliance specialist. Extract recurring inspection, calibration, audit, and surveillance requirements from the document text below.

Look for phrases such as:
- "every X months" / "every X weeks" / "every X hours" / "every X cycles"
- "quarterly" / "semi-annual" / "annual" / "biennial"
- "performed at least every..." / "shall be inspected every..." / "calibration interval of..."
- "not to exceed X months" / "at intervals not exceeding..."

For each requirement found, extract:
1. title - short description (e.g., "Torque wrench calibration")
2. description - optional longer context
3. category - one of: calibration, audit, training, surveillance, facility, ad_compliance, other
4. intervalType - "calendar" for time-based (months/days), "hours" or "cycles" for usage-based
5. intervalMonths - number (e.g., 3=quarterly, 6=semi-annual, 12=annual), or null
6. intervalDays - number for sub-month cadence (e.g., 7 for weekly), or null
7. intervalValue - number for hours/cycles-based (e.g., 100 for "every 100 hours"), or null
8. regulationRef - regulatory citation if present (e.g., "14 CFR 145.157(a)", "RSM Section 4.3"), or null
9. isRegulatory - true if hard regulatory requirement, false if internal policy, or null
10. lastPerformedAt - ISO date string (YYYY-MM-DD) if explicitly stated in the text, or null
11. documentExcerpt - short snippet supporting the requirement
12. confidence - "high" if clear interval and requirement, "medium" if inferred, "low" if vague (e.g., "periodic review" with no explicit interval)

Return a JSON array. If nothing is found, return [].
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
    "lastPerformedAt": "2024-10-15" or null,
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

function parseExtractionResponse(response: string): ExtractedInspectionItem[] {
  try {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const raw = jsonMatch ? jsonMatch[1].trim() : response.trim();
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    return arr
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
}
