/**
 * App-wide embedding configuration shared by the browser embedding client
 * (src/services/embeddingClient.ts), the in-browser vector search
 * (src/services/localVectorSearch.ts), and the Drive-hosted vector index
 * (src/services/driveVectorIndex.ts).
 *
 * The vector DIMENSION stays defined in convex/lib/embeddingConfig.ts (the
 * single source of truth, also used by the legacy Convex index) and is
 * re-exported here so the browser side never drifts from it.
 *
 * The /api/embed proxy keeps its own copy of the caps/model names (it is the
 * authority that enforces them); the values below must stay in sync with it.
 */
export { EMBEDDING_DIMENSIONS } from '../../convex/lib/embeddingConfig';

/** Default Voyage embedding model. Must support the configured output dimension. */
export const VOYAGE_EMBEDDING_MODEL = 'voyage-3.5-lite';
/** Default OpenAI embedding model (used when EMBEDDING_PROVIDER=openai server-side). */
export const OPENAI_EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Chunking parameters. These MUST match the values the index was built with:
 * a chunk's startChar/endChar offsets are resolved back against the same
 * normalized text on re-fetch, so changing these invalidates existing offsets.
 * Ported from the original server chunker (convex/documentChunks.ts).
 */
export const CHUNK_SIZE_CHARS = 1200;
export const CHUNK_OVERLAP_CHARS = 200;

/**
 * Per-request caps the /api/embed proxy enforces. The client batches document
 * embedding to MAX_TEXTS_PER_REQUEST and never sends a single text larger than
 * MAX_CHARS_PER_TEXT (chunks are well under this, but queries are clamped).
 */
export const EMBED_MAX_TEXTS_PER_REQUEST = 128;
export const EMBED_MAX_CHARS_PER_TEXT = 8_000;
export const EMBED_MAX_TOTAL_CHARS = 600_000;
