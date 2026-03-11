import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';
import type { ManualTypeDefinition } from './manualWriterService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PartAmendment {
  part: string;
  lastAmendedOn: string | null;
  citation: string;
}

export type PartAmendmentWithStatus = PartAmendment & {
  /** 'current' = regulation unchanged since sections written; 'updated' = amended after; 'unknown' = date unavailable */
  status: 'current' | 'updated' | 'unknown';
};

export interface ManualRegUpdateResult {
  checkedAt: string;
  parts: PartAmendmentWithStatus[];
  /** Titles of saved sections whose underlying CFR parts have been amended since they were written. */
  sectionsToReview: string[];
  /** Claude's web-search summary of what changed and why it matters. Empty string if no updates found. */
  summary: string;
}

// ---------------------------------------------------------------------------
// Saved-section shape (minimal — only fields the checker needs)
// ---------------------------------------------------------------------------

export interface SavedSectionForCheck {
  sectionTitle: string;
  sectionNumber?: string;
  updatedAt: string;
  cfrRefs?: string[];
}

// ---------------------------------------------------------------------------
// Fetch amendment dates from the /api/ecfr?amendments= proxy
// ---------------------------------------------------------------------------

export async function fetchPartAmendmentDates(parts: string[]): Promise<PartAmendment[]> {
  if (parts.length === 0) return [];
  const resp = await fetch(`/api/ecfr?amendments=${parts.join(',')}`);
  if (!resp.ok) {
    throw new Error(`eCFR amendment check failed: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json() as { amendments: PartAmendment[] };
  return data.amendments ?? [];
}

// ---------------------------------------------------------------------------
// Determine which saved sections are stale
// ---------------------------------------------------------------------------

function findStaleSections(
  amendments: PartAmendment[],
  savedSections: SavedSectionForCheck[],
  manualCfrParts: string[]
): { staleSections: string[]; updatedParts: PartAmendment[] } {
  const updatedParts = amendments.filter((a) => a.lastAmendedOn !== null);

  const staleSections: string[] = [];

  for (const section of savedSections) {
    const sectionDate = new Date(section.updatedAt);

    // Determine which CFR parts apply to this section.
    // If the section has explicit cfrRefs (e.g. ["145", "43"]) use those;
    // otherwise fall back to all parts for the manual type.
    const relevantParts = section.cfrRefs?.length
      ? updatedParts.filter((a) => section.cfrRefs!.includes(a.part))
      : updatedParts.filter((a) => manualCfrParts.includes(a.part));

    const isStale = relevantParts.some(
      (a) => a.lastAmendedOn && new Date(a.lastAmendedOn) > sectionDate
    );

    if (isStale) staleSections.push(section.sectionTitle);
  }

  return { staleSections, updatedParts };
}

// ---------------------------------------------------------------------------
// Ask Claude to summarise the regulatory changes
// ---------------------------------------------------------------------------

async function summariseChanges(
  manualType: ManualTypeDefinition,
  staleSections: string[],
  updatedParts: PartAmendment[],
  model: string
): Promise<string> {
  const partsDesc = updatedParts
    .filter((p) => p.lastAmendedOn)
    .map((p) => `${p.citation} (last amended ${p.lastAmendedOn})`)
    .join(', ');

  const sectionsDesc = staleSections.join(', ');

  const prompt = `You are an aviation regulatory specialist. The following 14 CFR parts relevant to a "${manualType.label}" have been amended since certain manual sections were last written.

Parts to research: ${partsDesc}
Manual sections that may be affected: ${sectionsDesc}

Search the internet (Federal Register, FAA.gov, and eCFR.gov) to identify the most significant regulatory changes in these CFR parts that are relevant to a ${manualType.label}. Focus on amendments published in the last 24 months.

For each significant change, note:
1. The section number that changed
2. A one-sentence description of what changed
3. Which of the above manual sections is most likely affected

Then provide an overall recommendation for which manual sections should be reviewed and why.

Return your findings as JSON:
\`\`\`json
{
  "changes": [
    { "regulation": "14 CFR §145.211", "change": "Brief description", "affectedSections": ["Quality Control System"] }
  ],
  "recommendation": "Overall guidance on which sections need review and why."
}
\`\`\``;

  try {
    const message = await createClaudeMessage({
      model,
      max_tokens: 4000,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    });

    const textBlocks = message.content.filter((b) => b.type === 'text');
    const responseText = textBlocks.map((b) => (b.type === 'text' ? b.text : '')).join('\n');

    // Try to extract structured JSON, fall back to raw text
    const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]) as {
          changes?: Array<{ regulation: string; change: string; affectedSections: string[] }>;
          recommendation?: string;
        };
        const lines: string[] = [];
        if (parsed.changes?.length) {
          lines.push('Recent regulatory changes:\n');
          for (const c of parsed.changes) {
            lines.push(`• ${c.regulation}: ${c.change}`);
            if (c.affectedSections?.length) {
              lines.push(`  Affects: ${c.affectedSections.join(', ')}`);
            }
          }
        }
        if (parsed.recommendation) {
          lines.push(`\nRecommendation: ${parsed.recommendation}`);
        }
        return lines.join('\n').trim();
      } catch {
        // fall through to raw text
      }
    }

    return responseText.trim();
  } catch (error) {
    return `Unable to retrieve change summary: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Check whether FAA regulatory updates may have affected sections of a manual
 * since they were last written.
 *
 * @param manualType   The selected manual type (used for its cfrParts list)
 * @param savedSections Saved/approved sections for the current project + manual type
 * @param model        Claude model to use for the web-search summary
 */
export async function checkManualForUpdates(
  manualType: ManualTypeDefinition,
  savedSections: SavedSectionForCheck[],
  model: string = DEFAULT_CLAUDE_MODEL
): Promise<ManualRegUpdateResult> {
  const checkedAt = new Date().toISOString();

  // 1. Fetch amendment dates for all relevant CFR parts
  let amendments: PartAmendment[] = [];
  try {
    amendments = await fetchPartAmendmentDates(manualType.cfrParts);
  } catch (error) {
    // Return an error-state result so the UI can display the failure gracefully
    return {
      checkedAt,
      parts: manualType.cfrParts.map((p) => ({
        part: p,
        lastAmendedOn: null,
        citation: `14 CFR Part ${p}`,
        status: 'unknown',
      })),
      sectionsToReview: [],
      summary: `Could not reach eCFR: ${error instanceof Error ? error.message : 'Network error'}`,
    };
  }

  // 2. Find stale sections (regulation amended after the section was written)
  const { staleSections, updatedParts } = findStaleSections(
    amendments,
    savedSections,
    manualType.cfrParts
  );

  // 3. Build the oldest section date so we can classify per-part status
  const oldestSectionDate = savedSections.length
    ? new Date(
        savedSections.reduce((oldest, s) =>
          s.updatedAt < oldest.updatedAt ? s : oldest
        ).updatedAt
      )
    : null;

  const partsWithStatus: PartAmendmentWithStatus[] = amendments.map((a) => {
    if (!a.lastAmendedOn) return { ...a, status: 'unknown' as const };
    if (!oldestSectionDate) return { ...a, status: 'unknown' as const };
    return {
      ...a,
      status: new Date(a.lastAmendedOn) > oldestSectionDate ? 'updated' : 'current',
    };
  });

  // 4. If there are stale sections, ask Claude what changed
  let summary = '';
  if (staleSections.length > 0 && updatedParts.length > 0) {
    summary = await summariseChanges(manualType, staleSections, updatedParts, model);
  }

  return { checkedAt, parts: partsWithStatus, sectionsToReview: staleSections, summary };
}
