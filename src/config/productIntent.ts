/**
 * Canonical AeroGap product intent: audience, outcomes, and human-in-the-loop framing.
 * Reuse on landing, login shell, and any unauthenticated surface so messaging stays aligned.
 */

export const PRODUCT_INTENT_BRAND_SUBTITLE = 'Assistive Intelligence' as const;

export const PRODUCT_INTENT_NOT_AI_LINE = 'Not artificial intelligence.' as const;

/** Hero / primary paragraph: who it is for + what the product does. */
export const PRODUCT_INTENT_VALUE_LINE =
  'Built for aviation quality and audit teams—chief inspectors, QMs, DOM/safety leaders, and auditors. AeroGap speeds human-led compliance work: organized evidence, traceable findings, and export-ready checklists and reports.';

/** Single line: human accountability vs automation. */
export const PRODUCT_INTENT_HUMAN_LOOP_LINE =
  'AI supports your judgment; you review, accept, or reject every output.';

/** Login card: audience (first line). */
export const PRODUCT_INTENT_LOGIN_AUDIENCE_LINE =
  'For quality managers, chief inspectors, DOM/safety leaders, and audit teams in maintenance and operations.';

/** Login card: outcomes + frameworks (second line). */
export const PRODUCT_INTENT_LOGIN_OUTCOME_LINE =
  'Faster evidence review, traceable findings, and export-ready actions—Part 145, EASA, AS9100, IS-BAO & SMS.';

/** Features section supporting line (aligned with intent). */
export const PRODUCT_INTENT_FEATURES_INTRO =
  'One workflow from evidence to findings to exports—always under your team’s control.';

/** Closing CTA supporting line (landing). */
export const PRODUCT_INTENT_FINAL_CTA_LINE =
  'Join teams using AeroGap for human-led compliance—evidence through export, on your terms.';
