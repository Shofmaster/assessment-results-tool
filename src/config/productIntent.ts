/**
 * Canonical AeroGap Technologies product intent: audience, outcomes, and human-in-the-loop framing.
 * Reuse on landing, login shell, splash hub, and any unauthenticated surface so messaging stays aligned.
 */

export const PRODUCT_INTENT_COMPANY_NAME = 'AeroGap Technologies' as const;

export const PRODUCT_INTENT_COMPANY_SITE_URL = 'https://www.aerogaptechnologies.com' as const;

export const PRODUCT_INTENT_BRAND_SUBTITLE = 'Assistive Intelligence' as const;

export const PRODUCT_INTENT_NOT_AI_LINE = 'Not artificial intelligence — you stay in control of every compliance decision.' as const;

/** Short line for tight UI (login, badges). */
export const PRODUCT_INTENT_ASSISTIVE_SHORT = 'Assistive intelligence, not autopilot.' as const;

/** Hero eyebrow / pill. */
export const PRODUCT_INTENT_HERO_BADGE = 'Aviation compliance · Human-led · Audit-ready' as const;

/** Primary hero headline (outcome-first). */
export const PRODUCT_INTENT_HERO_HEADLINE = 'Better, faster, more defensible compliance for aviation.' as const;

/** Hero paragraph: who + what (FAA/EASA-style manuals, segments). */
export const PRODUCT_INTENT_VALUE_LINE =
  'AeroGap helps repair stations, charter operators, air carriers, and any team that lives in FAA- or EASA-style manuals turn compliance into a clear system: evidence, manuals, and checks in one place—so you move quicker without lowering the bar.';

/** Speed + business outcome after regulatory context. */
export const PRODUCT_INTENT_BUSINESS_VALUE_LINE =
  'When alignment and paperwork take less calendar time, leaders get hours back for flying customers, maintaining aircraft, and growing the operation—while the compliance record stays traceable.';

/** Three pillars (landing + splash). */
export const PRODUCT_INTENT_PILLARS: readonly { title: string; body: string }[] = [
  {
    title: 'Faster path to compliant',
    body: 'Structured workflows, library context, and guided checks reduce rework so manuals and evidence keep pace with the operation.',
  },
  {
    title: 'Assistive intelligence',
    body: 'Models and agents support your judgment; you review, accept, or reject every output. Compliance stays yours—not the software’s.',
  },
  {
    title: 'Track and pass audits',
    body: 'See readiness, close gaps, and walk into FAA, EASA, customer, or SMS audits with a defensible trail from requirement to record.',
  },
] as const;

/** Single line: human accountability vs automation. */
export const PRODUCT_INTENT_HUMAN_LOOP_LINE =
  'Every suggestion is reviewable: accept it, edit it, or discard it. The accountable signatory is always your team.';

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
export const PRODUCT_INTENT_FEATURES_SECTION_HEADLINE = 'How teams use AeroGap' as const;

/** Features section supporting line. */
export const PRODUCT_INTENT_FEATURES_INTRO =
  'One hub for the work that used to scatter across binders, inboxes, and spreadsheets—plus assistive help when you want it, on your terms.';

/** Trust section: extra bullet (time / business value). */
export const PRODUCT_INTENT_TRUST_TIME_BULLET = {
  label: 'Time back for the operation',
  desc: 'Less compliance drag means more capacity for revenue work—without handing off accountability.',
} as const;

/** Closing CTA headline (landing). */
export const PRODUCT_INTENT_FINAL_CTA_HEADLINE = 'Bring your next audit into focus' as const;

/** Closing CTA supporting line (landing). */
export const PRODUCT_INTENT_FINAL_CTA_LINE =
  'Start free or talk with us. Keep human-led control from the first upload to the closing meeting.';
