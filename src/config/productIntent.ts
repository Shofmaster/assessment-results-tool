/**
 * Canonical AeroGap Technologies product intent: audience, outcomes, and human-in-the-loop framing.
 * Reuse on landing, login shell, splash hub, and any unauthenticated surface so messaging stays aligned.
 */

export const PRODUCT_INTENT_COMPANY_NAME = 'AeroGap Technologies' as const;

export const PRODUCT_INTENT_COMPANY_SITE_URL = 'https://www.aerogaptechnologies.com' as const;

export const PRODUCT_INTENT_BRAND_SUBTITLE = 'Assistive Intelligence' as const;

export const PRODUCT_INTENT_NOT_AI_LINE =
  'Not artificial intelligence — you stay in control of every compliance decision.' as const;

/** Short line for tight UI (login, badges). */
export const PRODUCT_INTENT_ASSISTIVE_SHORT = 'Assistive intelligence, not autopilot.' as const;

/** Primary hero headline (outcome-first, company-facing). */
export const PRODUCT_INTENT_HERO_HEADLINE =
  'Run compliance like an operation—not a last-minute scramble.' as const;

/** Hero supporting sentence: who + concrete help. */
export const PRODUCT_INTENT_VALUE_LINE =
  'AeroGap gives repair stations, charter operators, and quality teams one place for manuals, evidence, findings, and audit prep—so you know where you stand before the inspector asks.' as const;

/** Concrete company outcomes (landing “how we help”). */
export const PRODUCT_INTENT_COMPANY_OUTCOMES: readonly { title: string; body: string }[] = [
  {
    title: 'See readiness before audit week',
    body: 'Open issues, inspections, and program gaps in one command view—so leadership and quality are not surprised in the closing meeting.',
  },
  {
    title: 'Keep manuals and evidence together',
    body: 'Revision-controlled manuals, records, and regulatory references live in one library instead of binders, shared drives, and email threads.',
  },
  {
    title: 'Close findings with a trail you own',
    body: 'Track CARs and corrective work with citations and human sign-off. Assistive review helps draft; your team decides what ships.',
  },
] as const;

/** Three pillars (compact; aligned with company outcomes). */
export const PRODUCT_INTENT_PILLARS: readonly { title: string; body: string }[] = [
  {
    title: 'Faster path to compliant',
    body: 'Structured workflows and library context cut rework so manuals and evidence keep pace with the operation.',
  },
  {
    title: 'Assistive intelligence',
    body: 'Models and agents support judgment; you review, accept, or reject every output. Compliance stays yours.',
  },
  {
    title: 'Track and pass audits',
    body: 'Walk into FAA, EASA, customer, or SMS audits with a defensible trail from requirement to record.',
  },
] as const;

/** Single line: human accountability vs automation. */
export const PRODUCT_INTENT_HUMAN_LOOP_LINE =
  'Every suggestion is reviewable: accept it, edit it, or discard it. The accountable signatory is always your team.' as const;

/** Login card: primary story (one sentence). */
export const PRODUCT_INTENT_LOGIN_PRIMARY_LINE =
  'AeroGap Technologies helps aviation organizations run faster, sharper compliance on FAA- and EASA-style manuals—so you can track readiness and pass audits with evidence you own.';

/** Login card: assistive framing. */
export const PRODUCT_INTENT_LOGIN_ASSISTIVE_LINE = PRODUCT_INTENT_NOT_AI_LINE;

/** Login card: audience hint. */
export const PRODUCT_INTENT_LOGIN_AUDIENCE_LINE =
  'For quality leaders, manual owners, and audit stakeholders at repair stations, charters, operators, and supporting programs.';

/** Login card: product surface hint. */
export const PRODUCT_INTENT_LOGIN_OUTCOME_LINE =
  'Command center, library, guided audits, checklists, paperwork review, and export-friendly outputs—one workspace from day-to-day compliance through audit week.';

/** Features section headline (landing). */
export const PRODUCT_INTENT_FEATURES_SECTION_HEADLINE = 'What your team gets' as const;

/** Features section supporting line. */
export const PRODUCT_INTENT_FEATURES_INTRO =
  'The work that used to scatter across binders, inboxes, and spreadsheets—organized for day-to-day compliance and audit week.' as const;

/** Trust section: extra bullet (time / business value). */
export const PRODUCT_INTENT_TRUST_TIME_BULLET = {
  label: 'Time back for the operation',
  desc: 'Less compliance drag means more capacity for flying customers, maintaining aircraft, and growing the shop—without handing off accountability.',
} as const;

/** Closing CTA headline (landing). */
export const PRODUCT_INTENT_FINAL_CTA_HEADLINE = 'Bring your next audit into focus' as const;

/** Closing CTA supporting line (landing). */
export const PRODUCT_INTENT_FINAL_CTA_LINE =
  'Start free, or talk with us about your repair station, charter, or quality program. Human-led control from the first upload to the closing meeting.' as const;

/** @deprecated Prefer PRODUCT_INTENT_VALUE_LINE; kept for any residual imports. */
export const PRODUCT_INTENT_BUSINESS_VALUE_LINE = PRODUCT_INTENT_TRUST_TIME_BULLET.desc;

/** @deprecated Hero badge removed from landing; kept for residual imports. */
export const PRODUCT_INTENT_HERO_BADGE = 'Aviation compliance · Human-led · Audit-ready' as const;
