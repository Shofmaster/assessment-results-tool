import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';

/** Feature keys that can have an optional model override in user settings. */
export type LLMFeature = 'analysis' | 'auditSim' | 'paperworkReview' | 'default';

/** Minimal user settings shape used for model resolution (e.g. from Convex userSettings). */
export interface UserSettingsForModel {
  claudeModel?: string;
  auditSimModel?: string;
  paperworkReviewModel?: string;
}

/**
 * Resolve the Claude model id for a given feature and user settings.
 * - 'default' / 'analysis': default model (general analysis, document extraction, revision check).
 * - 'auditSim': audit simulation (and discrepancy extraction, comparison synthesis); falls back to default.
 * - 'paperworkReview': paperwork review; falls back to default.
 */
export function resolveModel(
  feature: LLMFeature,
  userSettings: UserSettingsForModel | null | undefined
): string {
  const defaultModel = userSettings?.claudeModel ?? DEFAULT_CLAUDE_MODEL;
  if (feature === 'default' || feature === 'analysis') {
    return defaultModel;
  }
  if (feature === 'auditSim') {
    return userSettings?.auditSimModel ?? userSettings?.claudeModel ?? DEFAULT_CLAUDE_MODEL;
  }
  if (feature === 'paperworkReview') {
    return userSettings?.paperworkReviewModel ?? userSettings?.claudeModel ?? DEFAULT_CLAUDE_MODEL;
  }
  return defaultModel;
}
