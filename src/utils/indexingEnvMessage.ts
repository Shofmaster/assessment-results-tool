/** User-facing guidance when Convex document indexing is misconfigured or failing. */

export const INDEXING_UNAVAILABLE_PREFIX = 'INDEXING_UNAVAILABLE';

export function indexingUnavailableToast(): string {
  return (
    'Search indexing is unavailable because no embedding API key is configured. ' +
    'A company admin can add one under Settings → AI Keys.'
  );
}

export function indexingStallHint(): string {
  return (
    'Check that an embedding API key is set under Settings → AI Keys, or look in the Convex ' +
    'logs for documentChunks.indexDocument errors.'
  );
}

export function isIndexingUnavailableError(message: string): boolean {
  // The env-var pattern is kept for messages raised before keys moved into the
  // database (an older Convex deployment can still emit them).
  return message.includes(INDEXING_UNAVAILABLE_PREFIX) || /VOYAGE_API_KEY|OPENAI_API_KEY/i.test(message);
}
