/**
 * Canonical AeroGap product intent: audience, outcomes, and human-in-the-loop framing.
 * Reuse on landing, login shell, and any unauthenticated surface so messaging stays aligned.
 */

export const PRODUCT_INTENT_BRAND_SUBTITLE = 'Assistive Intelligence' as const;

export const PRODUCT_INTENT_NOT_AI_LINE = 'Not artificial intelligence.' as const;

/** Hero / primary paragraph: ease + who it is for + what the product does (assistive, human-led). */
export const PRODUCT_INTENT_VALUE_LINE =
  'Compliance does not have to eat your week. AeroGap helps aviation quality leaders—chief inspectors, QMs, DOM/safety leaders, manual program owners, and auditors—run human-led compliance with less friction: organize evidence, align FAA-accepted manuals and programs with applicable rules, and produce traceable outputs you can review and export.';

/** Hero: explicit callout for FAA manual maintainers (Parts 91 / 121 / 135 / 145). */
export const PRODUCT_INTENT_FAA_MANUALS_LINE =
  'Especially useful if you maintain FAA-accepted or FAA-approved manuals and programs under 14 CFR Parts 91, 121, 135, or 145—GOM, training, MEL, maintenance programs, and repair station documentation.';

/** Hero: time back for revenue-driving work (after regulatory context). */
export const PRODUCT_INTENT_BUSINESS_VALUE_LINE =
  'When manuals, evidence, and checks move faster, inspectors, certificate holders, and DOMs get time back for the work that actually makes you money—operations, customers, and growth—while you still own every compliance decision.';

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
  'Easier day-to-day compliance and manual workflows—so leaders get time back for the operation. Hub, lifecycle support, and export-ready actions across Parts 91–145, EASA, AS9100, IS-BAO & SMS.';

/** Features section headline (landing). */
export const PRODUCT_INTENT_FEATURES_SECTION_HEADLINE =
  'Everything your quality leaders need';

/** Features section supporting line (aligned with intent). */
export const PRODUCT_INTENT_FEATURES_INTRO =
  'Streamlined evidence and manuals mean less time on compliance overhead—then layer structured review when you need it.';

/** Trust section: extra bullet (time / business value). */
export const PRODUCT_INTENT_TRUST_TIME_BULLET = {
  label: 'Time for higher-value work',
  desc: 'Smoother compliance admin helps leaders focus on running the business, not chasing paperwork.',
} as const;

/** Closing CTA headline (landing). */
export const PRODUCT_INTENT_FINAL_CTA_HEADLINE =
  'Ready for easier compliance—and more time for the work that pays?';

/** Closing CTA supporting line (landing). */
export const PRODUCT_INTENT_FINAL_CTA_LINE =
  'Join teams using AeroGap to lighten the compliance load and keep human-led control from evidence through export.';
