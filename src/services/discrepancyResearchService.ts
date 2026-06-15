/**
 * Client-side discrepancy research: builds the prompt from discrepancy +
 * aircraft + manual-excerpt search hits, calls Claude through the authed
 * /api/claude proxy, and parses the structured result.
 *
 * This used to run inside a Convex action (convex/discrepancyResearch.ts),
 * but a ~30-60s model call inside an action bills Convex action compute for
 * the entire wait. The orchestration now lives in useResearchDiscrepancy
 * (src/hooks/useConvexData.ts); persistence + server-side coercion stays in
 * convex/discrepancyResearch.ts:saveResearch.
 */

import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';
import { extractJsonFromMarkdown } from '../utils/jsonParsing';

const RESEARCH_MAX_TOKENS = 2048;
export const RESEARCH_SEARCH_TOP_K = 12;

export interface ResearchSearchChunk {
  documentId: string;
  docName: string;
  chunkIndex: number;
  text: string;
  score: number;
}

export interface ResearchAircraftInput {
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
  currentTotalTime?: number;
  currentTotalCycles?: number;
}

export interface ResearchDiscrepancyInput {
  description: string;
  ataChapter?: string;
  melItem?: string;
  partNumbers?: string[];
  location?: string;
  category?: string;
  status: string;
  discoveredAt?: string;
}

// Static system instructions — identical on every call, so we send them as a
// cached system block (cache_control: ephemeral) and keep only the per-discrepancy
// data in the user message. Avoids re-billing these tokens on repeat research.
const RESEARCH_SYSTEM_INSTRUCTIONS = `You are an aviation maintenance technician's research assistant. Given a current discrepancy on an aircraft and excerpts from the project's manuals (general AND aircraft-specific OEM manuals), produce a structured response that helps the tech (1) understand the problem, (2) follow troubleshooting steps grounded in the manual excerpts, and (3) draft a maintenance logbook entry.

Return ONLY a JSON object — no prose before or after — matching this TypeScript type exactly:

{
  "problemAnalysis": string,           // 1-2 paragraphs, plain language
  "likelyRootCauses": string[],        // 2-5 items, ordered most-likely first
  "troubleshootingSteps": string[],    // ordered, actionable, reference manual excerpts when relevant
  "correctiveAction": string,          // the recommended fix, referencing parts/torque/procedures from the manuals when applicable
  "partsNeeded": [{ "partNumber": string, "description": string }],
  "references": [
    { "documentId": string, "docName": string, "chunkIndex": number, "excerpt": string }
  ],                                   // only include refs you actually relied on; "excerpt" is a short verbatim snippet (<200 chars)
  "suggestedLogbookEntry": {
    "workPerformed": string,           // imperative past-tense, ready for a 14 CFR 43.9 entry
    "ataChapter": string,              // best-fit ATA chapter (e.g. "32-40-00") or "" if not determinable
    "returnToServiceStatement": string // standard RTS language appropriate for the work
  },
  "noManualReferencesFound": boolean   // true ONLY if zero relevant manual excerpts exist; in that case provide general best-practice guidance in the other fields and acknowledge the gap in problemAnalysis
}

Rules:
- Do NOT hallucinate manual references that aren't in the excerpts above.
- If part numbers in the discrepancy are unfamiliar, note that as a likelyRootCause / troubleshooting step rather than inventing fixes.
- Use only the documentIds and chunkIndexes I gave you in references.
- Keep partNumbers list to items genuinely needed; empty array if none.`;

function buildResearchPrompt(args: {
  aircraft: ResearchAircraftInput;
  discrepancy: ResearchDiscrepancyInput;
  chunks: ResearchSearchChunk[];
}): string {
  const acft = args.aircraft;
  const d = args.discrepancy;
  const aircraftHeader = [
    `Tail: ${acft.tailNumber}`,
    acft.make ? `Make: ${acft.make}` : null,
    acft.model ? `Model: ${acft.model}` : null,
    acft.serial ? `Serial: ${acft.serial}` : null,
    typeof acft.currentTotalTime === 'number' ? `Current TT: ${acft.currentTotalTime}` : null,
    typeof acft.currentTotalCycles === 'number' ? `Current cycles: ${acft.currentTotalCycles}` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const discrepancyBlock = [
    `Description: ${d.description}`,
    d.ataChapter ? `ATA: ${d.ataChapter}` : null,
    d.melItem ? `MEL item: ${d.melItem}` : null,
    d.location ? `Location: ${d.location}` : null,
    d.category ? `Category: ${d.category}` : null,
    d.partNumbers?.length ? `Part numbers cited: ${d.partNumbers.join(', ')}` : null,
    d.discoveredAt ? `Discovered: ${d.discoveredAt}` : null,
    `Status: ${d.status}`,
  ]
    .filter(Boolean)
    .join('\n');

  const chunksBlock = args.chunks.length
    ? args.chunks
        .map(
          (c, i) =>
            `[Ref ${i + 1}] documentId=${c.documentId} | docName="${c.docName}" | chunkIndex=${c.chunkIndex} | score=${c.score.toFixed(3)}\n${c.text}`,
        )
        .join('\n\n---\n\n')
    : "(No matching excerpts found in the project's manuals.)";

  return `AIRCRAFT
${aircraftHeader}

DISCREPANCY
${discrepancyBlock}

MANUAL EXCERPTS (vector-search hits, most relevant first; each tagged with documentId + chunkIndex so you can cite them)
${chunksBlock}`;
}

function tryParseLooseJson(text: string): unknown {
  const fenced = extractJsonFromMarkdown<unknown>(text, 'discrepancyResearchService');
  if (fenced !== null) return fenced;
  const trimmed = text.trim();
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Run the research prompt through Claude and return the parsed (but not yet
 * coerced) JSON blob. Coercion/validation happens server-side in
 * convex/discrepancyResearch.ts:saveResearch before anything is persisted.
 */
export async function runDiscrepancyResearch(args: {
  aircraft: ResearchAircraftInput;
  discrepancy: ResearchDiscrepancyInput;
  chunks: ResearchSearchChunk[];
}): Promise<Record<string, unknown>> {
  const prompt = buildResearchPrompt(args);
  const response = await createClaudeMessage({
    model: DEFAULT_CLAUDE_MODEL,
    max_tokens: RESEARCH_MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: RESEARCH_SYSTEM_INSTRUCTIONS,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: prompt }],
  });
  const text = response.content
    .map((b) => ('text' in b && typeof b.text === 'string' ? b.text : ''))
    .join('\n')
    .trim();
  const parsed = tryParseLooseJson(text);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Claude returned unparseable research output');
  }
  const result = parsed as Record<string, unknown>;
  if (args.chunks.length === 0) {
    result.noManualReferencesFound = true;
  }
  return result;
}
