/**
 * Centralized spend-control limits for Ask an Expert turns.
 * Mirror DCT: pin values in tests so accidental bumps fail CI.
 */

/** Max record-tool round-trips per Ask turn (also enforced in askRecordTools). */
export const ASK_MAX_TOOL_ROUNDS = 6;

/** Soft cap on characters returned across all tool results in one turn. */
export const ASK_MAX_TOOL_RESULT_CHARS = 48_000;

/** Max completion tokens requested from Claude per Ask call. */
export const ASK_MAX_OUTPUT_TOKENS = 3000;

/** Cap grounded passage characters injected into the system prompt. */
export const ASK_MAX_PASSAGE_CONTEXT_CHARS = 36_000;

/**
 * When company-scoped Drive search would fan out across many projects, only
 * refresh/search this many (most recently touched projects first when available).
 */
export const ASK_MAX_COMPANY_DRIVE_PROJECTS = 12;
