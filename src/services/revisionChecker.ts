import type { DocumentRevision } from '../types/revisionTracking';
import type { FileInfo } from '../types/assessment';
import type { UploadedDocument } from '../types/document';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import type { ClaudeMessageContent } from './claudeProxy';
import { createClaudeMessage } from './claudeProxy';

export type AttachedImage = { media_type: string; data: string };

interface ExtractedRevision {
  documentName: string;
  sourceDocumentId: string;
  documentType: 'regulatory' | 'entity' | 'uploaded' | 'reference';
  category?: string;
  detectedRevision: string;
}

interface WebSearchResult {
  latestRevision: string;
  isCurrent: boolean;
  summary: string;
}

/** Minimal shape for a reference document in revision extraction */
export interface ReferenceDocumentForRevision {
  id: string;
  name: string;
}

export function normalizeRevisionToken(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw
    .replace(/\b(revision|rev\.?|version|ver\.?|issue|iss\.?|amendment|amdt|chg|change)\b/gi, ' ')
    .replace(/[^a-z0-9]/gi, '')
    .trim();
  return cleaned || null;
}

export function compareRevisionValues(
  detectedRevision?: string | null,
  manualRevision?: string | null
): { comparisonStatus: 'match' | 'mismatch' | 'unknown'; matchConfidence: number } {
  const left = normalizeRevisionToken(detectedRevision);
  const right = normalizeRevisionToken(manualRevision);
  if (!left || !right) return { comparisonStatus: 'unknown', matchConfidence: 0.25 };
  if (left === right) return { comparisonStatus: 'match', matchConfidence: 1 };
  if (left.includes(right) || right.includes(left)) return { comparisonStatus: 'match', matchConfidence: 0.7 };
  return { comparisonStatus: 'mismatch', matchConfidence: 0.95 };
}

export class RevisionChecker {
  async extractRevisionLevels(
    regulatoryFiles: FileInfo[],
    entityDocuments: FileInfo[],
    uploadedDocuments: UploadedDocument[],
    referenceDocuments: ReferenceDocumentForRevision[] = [],
    model: string = DEFAULT_CLAUDE_MODEL,
    attachedImages: AttachedImage[] = []
  ): Promise<DocumentRevision[]> {
    const allDocs: Array<{ name: string; id: string; type: 'regulatory' | 'entity' | 'uploaded' | 'reference'; category?: string }> = [
      ...regulatoryFiles.map((f) => ({ name: f.name, id: f.id, type: 'regulatory' as const, category: f.category })),
      ...entityDocuments.map((f) => ({ name: f.name, id: f.id, type: 'entity' as const })),
      ...uploadedDocuments.map((d) => ({ name: d.name, id: d.id, type: 'uploaded' as const })),
      ...referenceDocuments.map((d) => ({ name: d.name, id: d.id, type: 'reference' as const })),
    ];

    if (allDocs.length === 0) return [];

    const prompt = `You are an aviation document specialist. Analyze the following document names and identify any revision levels, amendment numbers, edition numbers, or version identifiers.

DOCUMENTS (each line is prefixed with its zero-based index — you MUST use this exact index in your JSON "index" field):
${allDocs.map((d, i) => `[${i}] "${d.name}" (type: ${d.type}${d.category ? `, category: ${d.category}` : ''})`).join('\n')}

For each document, extract the revision/version identifier if present. Common patterns include:
- "Rev A", "Rev B", "Revision 5"
- "Amendment 14", "Amdt 39-12345"
- "Change 3", "Edition 2"
- "AC 43.13-1B" (the "1B" indicates edition/revision)
- "Issue 3", "Version 2.1"
- Date-based revisions like "(2023)" or "dated March 2024"
- CFR annual edition years
- IS-BAO edition numbers

Return a JSON array with exactly ${allDocs.length} entries — one for each index [0] through [${allDocs.length - 1}] inclusive. Do not omit documents. Each entry must include:
- "index": the bracket number from the list above (0-based)
- "detectedRevision": the detected value or "No revision detected"

Example shape (your array length must be ${allDocs.length}, not 1):
\`\`\`json
[
  { "index": 0, "detectedRevision": "Rev B" },
  { "index": 1, "detectedRevision": "No revision detected" }
]
\`\`\`

If no revision info is detectable from the name, set detectedRevision to "No revision detected".${attachedImages.length ? '\n\nOptional attached images (e.g. photos of nameplates or document covers) are provided below; use them to help identify or confirm revision information where relevant.' : ''}`;

    const userContent: string | ClaudeMessageContent[] =
      attachedImages.length > 0
        ? [
            { type: 'text', text: prompt },
            ...attachedImages.map((img) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: img.media_type, data: img.data },
            })),
          ]
        : prompt;

    const message = await createClaudeMessage({
      model,
      max_tokens: Math.min(16_000, 2_000 + allDocs.length * 180),
      temperature: 0.2,
      messages: [{ role: 'user', content: userContent }],
    });

    const responseText = message.content[0]?.type === 'text' ? (message.content[0].text || '') : '';
    const extracted = this.parseExtractionResponse(responseText, allDocs);

    return extracted.map((ext): DocumentRevision => ({
      id: `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      documentName: ext.documentName,
      documentType: ext.documentType,
      sourceDocumentId: ext.sourceDocumentId,
      category: ext.category,
      detectedRevision: ext.detectedRevision,
      latestKnownRevision: '',
      isCurrentRevision: null,
      lastCheckedAt: null,
      searchSummary: '',
      status: 'unknown',
    }));
  }

  async checkCurrentRevision(revision: DocumentRevision, model: string = DEFAULT_CLAUDE_MODEL): Promise<Partial<DocumentRevision>> {
    const prompt = `You are an aviation regulatory document specialist. I need to verify whether the following document revision is the most current version available.

Document: "${revision.documentName}"
Type: ${revision.documentType}${revision.category ? ` (${revision.category})` : ''}
Current Revision: ${revision.detectedRevision}

Search the internet to find the latest/current revision of this document. Check official sources like:
- FAA.gov for CFRs, Advisory Circulars, Airworthiness Directives
- IBAC.org for IS-BAO standards
- EASA.europa.eu for EASA regulations
- SAE International for AS9100 and other SAE standards
- Any relevant regulatory body website

After searching, provide your findings as JSON:
\`\`\`json
{
  "latestRevision": "the most current revision/version you found",
  "isCurrent": true or false,
  "summary": "Brief explanation of your findings, including the source URL if found"
}
\`\`\`

If you cannot determine the latest revision, set latestRevision to "Unable to determine" and isCurrent to null.`;

    try {
      const message = await createClaudeMessage({
        model,
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract text from response (may include tool_use blocks for web search)
      const textBlocks = message.content.filter((b) => b.type === 'text');
      const responseText = textBlocks.map((b) => b.type === 'text' ? b.text : '').join('\n');

      const result = this.parseWebSearchResponse(responseText);

      return {
        latestKnownRevision: result.latestRevision,
        isCurrentRevision: result.isCurrent,
        searchSummary: result.summary,
        lastCheckedAt: new Date().toISOString(),
        status: result.isCurrent === null ? 'unknown' : result.isCurrent ? 'current' : 'outdated',
      };
    } catch (error) {
      console.error('Error checking revision:', error);
      return {
        lastCheckedAt: new Date().toISOString(),
        searchSummary: `Error checking revision: ${error instanceof Error ? error.message : 'Unknown error'}`,
        status: 'error',
      };
    }
  }

  async checkAllRevisions(
    revisions: DocumentRevision[],
    onUpdate: (id: string, updates: Partial<DocumentRevision>) => void,
    model: string = DEFAULT_CLAUDE_MODEL
  ): Promise<void> {
    for (const revision of revisions) {
      if (revision.detectedRevision === 'No revision detected') continue;

      onUpdate(revision.id, { status: 'checking' });

      const updates = await this.checkCurrentRevision(revision, model);
      onUpdate(revision.id, updates);

      // Delay between requests to stay under 30k tokens/min rate limit
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  }

  private parseExtractionResponse(
    response: string,
    allDocs: Array<{ name: string; id: string; type: 'regulatory' | 'entity' | 'uploaded' | 'reference'; category?: string }>
  ): ExtractedRevision[] {
    const fallback = (): ExtractedRevision[] =>
      allDocs.map((doc) => ({
        documentName: doc.name,
        sourceDocumentId: doc.id,
        documentType: doc.type,
        category: doc.category,
        detectedRevision: 'No revision detected',
      }));

    try {
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]) as unknown;
        const detectedByIndex = new Map<number, string>();

        if (Array.isArray(parsed)) {
          // Ordered array of strings — one revision per document in list order
          if (
            parsed.length === allDocs.length &&
            parsed.every((x) => typeof x === 'string')
          ) {
            parsed.forEach((detectedRevision, i) => {
              detectedByIndex.set(i, (detectedRevision as string).trim() || 'No revision detected');
            });
          } else {
            for (const item of parsed as Array<{ index?: number; detectedRevision?: string }>) {
              if (!item || typeof item !== 'object') continue;
              const raw = item.index;
              if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
              const idxInt = Math.trunc(raw);
              const rev = String(item.detectedRevision ?? '').trim() || 'No revision detected';
              if (idxInt >= 0 && idxInt < allDocs.length) {
                detectedByIndex.set(idxInt, rev);
              } else if (idxInt >= 1 && idxInt <= allDocs.length) {
                // Common model mistake: 1-based index matching human line numbers
                detectedByIndex.set(idxInt - 1, rev);
              }
            }
          }
        }

        return allDocs.map((doc, i) => ({
          documentName: doc.name,
          sourceDocumentId: doc.id,
          documentType: doc.type,
          category: doc.category,
          detectedRevision: detectedByIndex.get(i) ?? 'No revision detected',
        }));
      }
    } catch (error) {
      console.error('Error parsing extraction response:', error);
    }

    return fallback();
  }

  private parseWebSearchResponse(response: string): WebSearchResult {
    try {
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          latestRevision: parsed.latestRevision || 'Unable to determine',
          isCurrent: parsed.isCurrent ?? null,
          summary: parsed.summary || 'No details available',
        };
      }
    } catch (error) {
      console.error('Error parsing web search response:', error);
    }

    return {
      latestRevision: 'Unable to determine',
      isCurrent: false,
      summary: 'Could not parse the search results.',
    };
  }
}
