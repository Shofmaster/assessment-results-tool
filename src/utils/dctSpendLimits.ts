/**
 * Centralized spend-control limits for DCT AI runs (traceability + document
 * check).
 *
 * Every value here bounds how much text we send and how many API calls a single
 * run can incur, which directly governs Claude API token spend. They were
 * previously inline magic numbers duplicated across `useDctTraceabilityRun` and
 * `useDctDocumentCheck`; centralizing them makes the spend envelope auditable in
 * one place and any change shows up as an obvious diff here.
 *
 * `dctSpendLimits.test.ts` pins each value, so an accidental bump (e.g. raising
 * the doc cap or per-doc char limit) fails CI rather than silently increasing
 * spend. Treat changes to this file as spend-policy changes.
 */

/**
 * Max company documents fed into a single AI run. Applied in both the
 * traceability run (`useDctTraceabilityRun`) and document check
 * (`useDctDocumentCheck`) before any text resolution / API calls happen.
 */
export const DCT_MAX_COMPANY_DOCS = 40;

/**
 * Max extracted-text characters sent per document (document check). Longer
 * documents are truncated to this length before being included in the prompt.
 */
export const DCT_MAX_DOC_TEXT_CHARS = 50_000;

/**
 * Minimum extracted-text characters required for a document to be worth sending.
 * Docs below this are skipped (near-empty extractions waste tokens).
 */
export const DCT_MIN_DOC_TEXT_CHARS = 80;

/**
 * Questions per Claude API batch for the document check engine. Caps tokens per
 * request and bounds the blast radius of any single failed/over-long call.
 */
export const DCT_DOCUMENT_CHECK_BATCH_SIZE = 10;

/**
 * Concurrency used when resolving extracted text across the capped doc slice
 * (document check). Limits simultaneous in-flight Convex/storage reads.
 */
export const DCT_DOC_TEXT_RESOLVE_CONCURRENCY = 6;
