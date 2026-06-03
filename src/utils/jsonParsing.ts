/**
 * Pure, dependency-free helpers for parsing JSON out of LLM responses.
 *
 * LLM output is inherently unreliable: models wrap JSON in markdown fences,
 * occasionally emit malformed JSON, or ignore the requested shape entirely.
 * These helpers centralize the extraction strategies so they can be unit-tested
 * in isolation, and they route every fallback through {@link reportParseFailure}
 * so a silent empty result is always accompanied by a diagnostic log instead of
 * vanishing without a trace.
 */

/** Finding severities recognized across analysis and paperwork-review flows. */
export const VALID_SEVERITIES = ['critical', 'major', 'minor', 'observation'] as const;
export type FindingSeverity = (typeof VALID_SEVERITIES)[number];

/** Normalized finding shape shared by single- and batch-comparison parsers. */
export interface ParsedFinding {
  severity: FindingSeverity;
  location?: string;
  description: string;
}

/**
 * Single seam for reporting an LLM-parse fallback. Today it logs a structured
 * warning; swap the body for Sentry/structured logging without touching callers.
 */
export function reportParseFailure(source: string, reason: string, sample?: string): void {
  console.warn(
    `[llm-parse] ${source}: ${reason}`,
    sample ? { sample: sample.slice(0, 300) } : undefined
  );
}

/**
 * Extracts the contents of the first ```json ... ``` fence. Tolerates casing
 * (```JSON) and surrounding whitespace. Returns the raw inner string, or null
 * if no fence is present.
 */
export function extractJsonBlock(response: string): string | null {
  const match = response.match(/```json\s*([\s\S]*?)```/i);
  return match ? match[1].trim() : null;
}

/**
 * Extracts and parses a JSON block from a markdown code fence (```json ... ```).
 * Returns null if no fence is found (silent — the caller may try other
 * strategies) or reports a failure if a fence is present but does not parse.
 */
export function extractJsonFromMarkdown<T>(response: string, source = 'extractJsonFromMarkdown'): T | null {
  const block = extractJsonBlock(response);
  if (block === null) return null;
  try {
    return JSON.parse(block) as T;
  } catch {
    reportParseFailure(source, 'matched a ```json fence but JSON.parse failed', block);
    return null;
  }
}

/**
 * Finds the first balanced `{...}` object that contains the given key and
 * returns its raw substring (for use when the model omits the markdown fence).
 * Returns null if no such balanced object can be located.
 */
export function extractBalancedJsonContaining(text: string, key: string): string | null {
  const keyToken = `"${key}"`;
  const keyIdx = text.indexOf(keyToken);
  if (keyIdx === -1) return null;

  const open = text.lastIndexOf('{', keyIdx);
  if (open === -1) return null;

  let depth = 1;
  let i = open + 1;
  while (i < text.length && depth > 0) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return text.substring(open, i);
}

/**
 * Coerce an arbitrary array of LLM-emitted objects into valid ParsedFindings:
 * keep only entries with string severity + description, clamp severity to the
 * known set (defaulting to 'minor'), and drop empty descriptions.
 */
export function normalizeFindingArray(arr: unknown): ParsedFinding[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(
      (f): f is { severity: string; description: string; location?: unknown } =>
        !!f &&
        typeof (f as { severity?: unknown }).severity === 'string' &&
        typeof (f as { description?: unknown }).description === 'string'
    )
    .map((f) => {
      const sev = String(f.severity).toLowerCase();
      return {
        severity: (VALID_SEVERITIES as readonly string[]).includes(sev)
          ? (sev as FindingSeverity)
          : 'minor',
        location: typeof f.location === 'string' ? f.location : undefined,
        description: String(f.description).trim(),
      };
    })
    .filter((f) => f.description.length > 0);
}

/**
 * Parse a `{ "findings": [...] }` object from a model response. Tries the
 * markdown fence first, then a balanced `{...}` object containing "findings".
 * Returns the normalized findings, or null if neither strategy yields an array
 * (reported, unless the input was blank).
 */
export function parseFindingsResponse(
  responseText: string,
  source = 'parseFindingsResponse'
): ParsedFinding[] | null {
  if (!responseText?.trim()) return null;

  const block = extractJsonBlock(responseText);
  if (block !== null) {
    try {
      const parsed = JSON.parse(block) as { findings?: unknown };
      if (Array.isArray(parsed?.findings)) return normalizeFindingArray(parsed.findings);
    } catch {
      // fall through to the balanced-object strategy
    }
  }

  const slice = extractBalancedJsonContaining(responseText, 'findings');
  if (slice !== null) {
    try {
      const parsed = JSON.parse(slice) as { findings?: unknown };
      if (Array.isArray(parsed?.findings)) return normalizeFindingArray(parsed.findings);
    } catch {
      // fall through to reported failure
    }
  }

  reportParseFailure(source, 'no parseable "findings" array found', responseText);
  return null;
}

/**
 * Parse a batch comparison response of the shape
 * `{ byDocument: { [name]: Finding[] }, crossDocumentFindings: Finding[] }`.
 * Always returns the container; on parse failure both members are empty and the
 * failure is reported (unless the input was blank).
 */
export function parseBatchFindingsResponse(
  responseText: string,
  source = 'parseBatchFindingsResponse'
): {
  byDocument: Record<string, ParsedFinding[]>;
  crossDocumentFindings: ParsedFinding[];
} {
  const byDocument: Record<string, ParsedFinding[]> = {};
  let crossDocumentFindings: ParsedFinding[] = [];

  if (!responseText?.trim()) return { byDocument, crossDocumentFindings };

  const block = extractJsonBlock(responseText);
  if (block === null) {
    reportParseFailure(source, 'no ```json fence found', responseText);
    return { byDocument, crossDocumentFindings };
  }

  try {
    const parsed = JSON.parse(block) as {
      byDocument?: Record<string, unknown>;
      crossDocumentFindings?: unknown;
    };
    if (parsed.byDocument && typeof parsed.byDocument === 'object') {
      for (const [name, findings] of Object.entries(parsed.byDocument)) {
        byDocument[name] = normalizeFindingArray(findings);
      }
    }
    if (Array.isArray(parsed.crossDocumentFindings)) {
      crossDocumentFindings = normalizeFindingArray(parsed.crossDocumentFindings);
    }
  } catch {
    reportParseFailure(source, 'matched a ```json fence but JSON.parse failed', block);
  }

  return { byDocument, crossDocumentFindings };
}

/**
 * Parses the standard web-search currency response shape returned by LLM calls in
 * revisionChecker and kbCurrencyChecker:
 *   { latestRevision, isCurrent, summary }
 *
 * Falls back to safe defaults if the block is missing or malformed.
 */
export function parseCurrencyResponse(response: string): {
  latestRevision: string;
  isCurrent: boolean | null;
  summary: string;
} {
  const parsed = extractJsonFromMarkdown<{
    latestRevision?: string;
    isCurrent?: boolean | null;
    summary?: string;
  }>(response, 'parseCurrencyResponse');

  if (parsed) {
    return {
      latestRevision: parsed.latestRevision ?? 'Unable to determine',
      isCurrent:
        parsed.isCurrent === null || parsed.isCurrent === undefined
          ? null
          : Boolean(parsed.isCurrent),
      summary: parsed.summary ?? 'No details available',
    };
  }

  if (response?.trim()) {
    reportParseFailure('parseCurrencyResponse', 'no parseable currency JSON found', response);
  }

  return {
    latestRevision: 'Unable to determine',
    isCurrent: null,
    summary: 'Could not parse the search results.',
  };
}
