/**
 * Extracts and parses a JSON block from a markdown code fence (```json ... ```).
 * Returns null if no valid JSON block is found or parsing fails.
 */
export function extractJsonFromMarkdown<T>(response: string): T | null {
  const match = response.match(/```json\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as T;
  } catch {
    return null;
  }
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
  }>(response);

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

  return {
    latestRevision: 'Unable to determine',
    isCurrent: null,
    summary: 'Could not parse the search results.',
  };
}
