/**
 * Canonical AeroGap product intent: audience, outcomes, and human-in-the-loop framing.
 * Reuse on landing, login shell, and any unauthenticated surface so messaging stays aligned.
 */

export const PRODUCT_INTENT_BRAND_SUBTITLE = 'Assistive Intelligence' as const;

export const PRODUCT_INTENT_NOT_AI_LINE = 'Not artificial intelligence.' as const;

/** Hero / primary paragraph: who it is for + what the product does. */
export const PRODUCT_INTENT_VALUE_LINE =
  'Built for aviation quality teams—chief inspectors, QMs, DOM/safety leaders, manual program owners, and auditors. AeroGap helps you run human-led compliance work: organize evidence, align FAA-accepted manuals and programs with applicable rules, and produce traceable outputs you can review and export.';

/** Hero: explicit callout for FAA manual maintainers (Parts 91 / 121 / 135 / 145). */
export const PRODUCT_INTENT_FAA_MANUALS_LINE =
  'Especially useful if you maintain FAA-accepted or FAA-approved manuals and programs under 14 CFR Parts 91, 121, 135, or 145—GOM, training, MEL, maintenance programs, and repair station documentation.';

/** Trust strip labels (landing); product assists alignment—does not replace regulatory approval. */
export const PRODUCT_INTENT_COMPLIANCE_STRIP_ITEMS: readonly string[] = [
  '14 CFR Parts 91, 121, 135 & 145',
  'Manuals, programs & OpSpecs alignment',
  'EASA Part-145',
  'AS9100 Rev D',
  'IS-BAO',
  'SMS / ICAO Annex 19',
] as const;

/** Single line: human accountability vs automation. */
export const PRODUCT_INTENT_HUMAN_LOOP_LINE =
  'AI supports your judgment; you review, accept, or reject every output.';

/** Login card: audience (first line). */
export const PRODUCT_INTENT_LOGIN_AUDIENCE_LINE =
  'For quality teams, manual program owners, and audit stakeholders across Part 91, 121, 135, and 145 operations and repair stations.';

/** Login card: outcomes + frameworks (second line). */
export const PRODUCT_INTENT_LOGIN_OUTCOME_LINE =
  'Compliance hub, manual lifecycle support, and export-ready actions—aligned with Parts 91–145, EASA, AS9100, IS-BAO & SMS.';

/** Features section supporting line (aligned with intent). */
export const PRODUCT_INTENT_FEATURES_INTRO =
  'Start from your compliance command center and manuals—then layer library, evidence, and structured review when you need it.';

/** Closing CTA headline (landing). */
export const PRODUCT_INTENT_FINAL_CTA_HEADLINE =
  'Ready to strengthen your manuals and compliance program?';

/** Closing CTA supporting line (landing). */
export const PRODUCT_INTENT_FINAL_CTA_LINE =
  'Join teams using AeroGap for human-led compliance—evidence through export, on your terms.';
