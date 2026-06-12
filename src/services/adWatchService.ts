/**
 * AD/SB watch discovery: Claude + web_search (same pattern as
 * revisionChecker / kbCurrencyChecker) looks for recent Airworthiness
 * Directives applicable to an aircraft's make/model, returning structured
 * findings for convex/adWatch.upsertFindings to store and cross-reference.
 *
 * Advisory by design: results say "may apply — review", never "applies".
 */

import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';
import { extractJsonFromMarkdown } from '../utils/jsonParsing';
import { normalizeAdNumber } from '../../convex/_textUtils';

export interface AdWatchFindingDraft {
  adNumber: string;
  title: string;
  summary?: string;
  effectiveDate?: string;
  sourceUrl?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface AdWatchAircraft {
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
  year?: number;
}

/** Shape findings out of the model's JSON; drops rows without an AD-shaped number. */
export function parseAdFindings(responseText: string): AdWatchFindingDraft[] {
  const parsed = extractJsonFromMarkdown<{ findings?: unknown[] } | unknown[]>(
    responseText,
    'adWatchService',
  );
  const rawList: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { findings?: unknown[] })?.findings)
      ? (parsed as { findings: unknown[] }).findings
      : [];
  const out: AdWatchFindingDraft[] = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;
    const adNumber = normalizeAdNumber(String(obj.adNumber ?? obj.ad_number ?? ''));
    if (!adNumber || seen.has(adNumber)) continue;
    seen.add(adNumber);
    const confidenceRaw = String(obj.confidence ?? 'low').toLowerCase();
    out.push({
      adNumber,
      title: String(obj.title ?? `AD ${adNumber}`).slice(0, 200),
      summary: obj.summary ? String(obj.summary).slice(0, 600) : undefined,
      effectiveDate: obj.effectiveDate ? String(obj.effectiveDate).slice(0, 10) : undefined,
      sourceUrl: typeof obj.sourceUrl === 'string' && /^https?:\/\//.test(obj.sourceUrl) ? obj.sourceUrl : undefined,
      confidence: confidenceRaw === 'high' ? 'high' : confidenceRaw === 'medium' ? 'medium' : 'low',
    });
  }
  return out;
}

export async function checkAircraftForAds(
  aircraft: AdWatchAircraft,
  options?: { model?: string; lookbackMonths?: number },
): Promise<AdWatchFindingDraft[]> {
  const lookback = options?.lookbackMonths ?? 24;
  const typeDesc = [aircraft.make, aircraft.model].filter(Boolean).join(' ');
  if (!typeDesc) return [];

  const prompt = `You are an aviation airworthiness specialist. Search for FAA Airworthiness Directives (ADs) issued or made effective in the last ${lookback} months that may apply to this aircraft type:

Aircraft: ${typeDesc}${aircraft.year ? ` (year ${aircraft.year})` : ''}${aircraft.serial ? `, serial ${aircraft.serial}` : ''}

Search the FAA Dynamic Regulatory System (drs.faa.gov), federalregister.gov, and faa.gov for current ADs against the airframe and commonly installed engines/appliances for this type. Only report ADs you actually found in search results — do not list ADs from memory.

For each AD found, assess applicability to this make/model:
- "high" confidence: the AD explicitly names this make/model.
- "medium": the AD targets this manufacturer or a model family that may include it.
- "low": possibly relevant (e.g. common appliance) but applicability is unclear.

Return JSON only:
\`\`\`json
{
  "findings": [
    {
      "adNumber": "2026-04-05",
      "title": "short title",
      "summary": "what the AD requires and which serial numbers/configurations it applies to",
      "effectiveDate": "YYYY-MM-DD",
      "sourceUrl": "https://...",
      "confidence": "high"
    }
  ]
}
\`\`\`
Return {"findings": []} if you find none.`;

  const message = await createClaudeMessage({
    model: options?.model ?? DEFAULT_CLAUDE_MODEL,
    max_tokens: 4000,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
    messages: [{ role: 'user', content: prompt }],
  });

  const responseText = message.content
    .filter((b): b is { type: string; text?: string } => b.type === 'text')
    .map((b) => b.text || '')
    .join('\n');
  return parseAdFindings(responseText);
}
