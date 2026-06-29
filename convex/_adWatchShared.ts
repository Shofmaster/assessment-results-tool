/**
 * Shared AD/SB-watch discovery contract: the web-search prompt and the
 * response parser, used by BOTH the client on-demand path
 * (src/services/adWatchService.ts) and the server-side scheduled path
 * (convex/adWatchActions.ts).
 *
 * Lives under convex/ and is dependency-free (only imports the sibling
 * _textUtils) so the client can import it the same way it already imports
 * normalizeAdNumber — keeping one source of truth and preventing prompt drift.
 */

import { normalizeAdNumber } from "./_textUtils";

export interface AdWatchFindingDraft {
  adNumber: string;
  title: string;
  summary?: string;
  effectiveDate?: string;
  sourceUrl?: string;
  confidence: "high" | "medium" | "low";
}

/** Aircraft identity the search prompt is built from. */
export interface AdWatchAircraftRef {
  make?: string;
  model?: string;
  serial?: string;
  year?: number;
}

/**
 * Build the FAA AD discovery prompt for an aircraft. Returns null when there is
 * no make/model to search on (the caller should skip — searching with an empty
 * type description yields noise).
 */
export function buildAdSearchPrompt(
  aircraft: AdWatchAircraftRef,
  lookbackMonths = 24,
): string | null {
  const typeDesc = [aircraft.make, aircraft.model].filter(Boolean).join(" ");
  if (!typeDesc) return null;

  return `You are an aviation airworthiness specialist. Search for FAA Airworthiness Directives (ADs) issued or made effective in the last ${lookbackMonths} months that may apply to this aircraft type:

Aircraft: ${typeDesc}${aircraft.year ? ` (year ${aircraft.year})` : ""}${aircraft.serial ? `, serial ${aircraft.serial}` : ""}

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
}

/**
 * Pull a `{ findings: [...] }` (or bare array) object out of a model response.
 * Dependency-free so it runs in the Convex runtime: tries a ```json fence, then
 * a balanced object containing "findings", then a whole-string parse.
 */
function extractFindingsJson(text: string): unknown {
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      /* fall through */
    }
  }

  const keyIdx = text.indexOf('"findings"');
  if (keyIdx !== -1) {
    const open = text.lastIndexOf("{", keyIdx);
    if (open !== -1) {
      let depth = 0;
      for (let i = open; i < text.length; i++) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(text.slice(open, i + 1));
            } catch {
              break;
            }
          }
        }
      }
    }
  }

  try {
    return JSON.parse(text.trim());
  } catch {
    return null;
  }
}

/** Shape findings out of the model's JSON; drops rows without an AD-shaped number. */
export function parseAdFindings(responseText: string): AdWatchFindingDraft[] {
  const parsed = extractFindingsJson(responseText);
  const rawList: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { findings?: unknown[] })?.findings)
      ? (parsed as { findings: unknown[] }).findings
      : [];

  const out: AdWatchFindingDraft[] = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const adNumber = normalizeAdNumber(String(obj.adNumber ?? obj.ad_number ?? ""));
    if (!adNumber || seen.has(adNumber)) continue;
    seen.add(adNumber);
    const confidenceRaw = String(obj.confidence ?? "low").toLowerCase();
    out.push({
      adNumber,
      title: String(obj.title ?? `AD ${adNumber}`).slice(0, 200),
      summary: obj.summary ? String(obj.summary).slice(0, 600) : undefined,
      effectiveDate: obj.effectiveDate ? String(obj.effectiveDate).slice(0, 10) : undefined,
      sourceUrl:
        typeof obj.sourceUrl === "string" && /^https?:\/\//.test(obj.sourceUrl)
          ? obj.sourceUrl
          : undefined,
      confidence: confidenceRaw === "high" ? "high" : confidenceRaw === "medium" ? "medium" : "low",
    });
  }
  return out;
}
