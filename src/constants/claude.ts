/** Default Claude model when user has not selected one in settings: the current Opus. */
export const DEFAULT_CLAUDE_MODEL = 'claude-opus-5';

/**
 * Model used for vision OCR (scanned PDFs and images). Deliberately NOT the
 * user's chat model: OCR is a transcription task, one request per page, and the
 * reasoning model is pure overhead there. Haiku 4.5 is ~3x cheaper per page than
 * Sonnet 4.6 on both input and output tokens. Must stay in the api/claude-models.ts
 * allowlist or the /api/claude proxy will reject it.
 */
export const OCR_CLAUDE_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Known model IDs that support extended thinking. Keep in sync with the
 * fallback list in api/_lib/modelCatalog.ts. Models released after this list
 * are covered by modelSupportsThinking(); the /api/claude proxy then converts
 * the request to whatever thinking mode the model actually accepts.
 */
export const MODELS_SUPPORTING_THINKING = new Set([
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-opus-4-8',
  'claude-opus-4-7',
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-opus-4-5-20251101',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929',
]);

/**
 * Whether to request thinking for this model. Every Claude model from the 4
 * generation on supports it, so new releases from the live model list are
 * gated in without a code change. A false positive is harmless: the proxy
 * drops thinking for a model that has none.
 */
export function modelSupportsThinking(modelId: string): boolean {
  if (MODELS_SUPPORTING_THINKING.has(modelId)) return true;
  const match = /^claude-[a-z]+-(\d+)/.exec(modelId);
  return match !== null && Number(match[1]) >= 4;
}
