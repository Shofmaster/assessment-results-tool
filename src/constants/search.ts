/**
 * Shared retrieval sizing for document search across every surface, so "how many
 * passages back an answer" is consistent and intentional rather than a scatter of
 * magic numbers. The federated search layer (driveSearchIntegration) clamps any
 * caller-supplied topK to [1, MAX_TOP_K] and defaults to DEFAULT_TOP_K.
 *
 * Per-surface values differ deliberately — documented here, not buried in JSX:
 *   - ASK: the Ask-an-Expert answer path. Enough evidence for a cited answer
 *     without bloating the prompt.
 *   - AUDIT_AGENT: per agent, per round in the multi-agent sim — kept small
 *     because the cost multiplies by (agents × rounds).
 *   - LIBRARY_SEARCH: raw "Library search" browse tab — wider recall, results are
 *     shown as a list (not fed to a model), so more is fine.
 *   - LOGBOOK_SEARCH: logbook browse tab — same rationale as audit-agent scoping.
 */
export const DEFAULT_TOP_K = 12;
export const MAX_TOP_K = 64;

/** Candidates passed to cross-encoder reranking after hybrid fusion. */
export const RERANK_CANDIDATES = 40;
/** RRF constant — keep in sync with convex/lib/hybridSearchFusion.ts */
export const RRF_K = 60;

export const ASK_TOP_K = 16;
export const AUDIT_AGENT_TOP_K = 10;
export const LIBRARY_SEARCH_TOP_K = 32;
export const LOGBOOK_SEARCH_TOP_K = 10;
