/** User-facing guidance when Convex document indexing is misconfigured or failing. */

export const INDEXING_UNAVAILABLE_PREFIX = 'INDEXING_UNAVAILABLE';

export function indexingUnavailableToast(): string {
  return (
    'Search indexing is disabled in Convex. Set EMBEDDING_PROVIDER (voyage or openai) and the matching API key ' +
    '(VOYAGE_API_KEY or OPENAI_API_KEY), plus EMBEDDING_DIMENSIONS=512 for Voyage.'
  );
}

export function indexingStallHint(): string {
  return (
    'Check Convex logs for documentChunks.indexDocument errors, or verify EMBEDDING_PROVIDER and ' +
    'VOYAGE_API_KEY / OPENAI_API_KEY in the Convex dashboard.'
  );
}

export function isIndexingUnavailableError(message: string): boolean {
  return message.includes(INDEXING_UNAVAILABLE_PREFIX) || /VOYAGE_API_KEY|OPENAI_API_KEY/i.test(message);
}
