/** Default Claude model when user has not selected one in settings. Latest recommended: Claude Sonnet 4.6. */
export const DEFAULT_CLAUDE_MODEL = 'claude-sonnet-4-6';

/**
 * Model IDs that support extended thinking (Claude only, select models).
 * Used to gate thinking in Analysis, Audit Sim, and Guided Audit when the selected model supports it.
 * Keep in sync with api/claude-models.ts supportsThinking.
 */
export const MODELS_SUPPORTING_THINKING = new Set([
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-5-20251101',
  'claude-opus-4-1-20250805',
  'claude-sonnet-4-20250514',
  'claude-3-7-sonnet-20250219',
  'claude-opus-4-20250514',
]);
