/**
 * Embedding vector size shared by the schema's vectorIndex and the runtime
 * embedding calls in documentChunks.ts. The two MUST agree — vectors whose
 * length differs from the index dimension are silently excluded from vector
 * search — so this constant is the single source of truth. Do not reintroduce
 * a per-deployment env override for it.
 *
 * 256 (down from 512, 2026-06): halves vector-index storage and the byte size
 * of every chunk row read/written, with negligible retrieval-quality loss at
 * this corpus size. Changing this value requires a full re-embed:
 *   npx convex run migrationsBandwidth:reindexAllEmbeddings '{"dryRun": true}'
 *   npx convex run migrationsBandwidth:reindexAllEmbeddings '{}'
 */
export const EMBEDDING_DIMENSIONS = 256;
