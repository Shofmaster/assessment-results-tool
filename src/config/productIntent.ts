/**
 * Canonical AeroGap Technologies product intent: audience, outcomes, and human-in-the-loop framing.
 * Reuse on landing, login shell, splash hub, and any unauthenticated surface so messaging stays aligned.
 */

export const PRODUCT_INTENT_COMPANY_NAME = 'AeroGap Technologies' as const;

export const PRODUCT_INTENT_COMPANY_SITE_URL = 'https://www.aerogaptechnologies.com' as const;

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

/** Single line: human accountability vs automation. */
export const PRODUCT_INTENT_HUMAN_LOOP_LINE =
  'Every suggestion is reviewable: accept it, edit it, or discard it. The accountable signatory is always your team.' as const;

/** Features section headline (landing). */
export const PRODUCT_INTENT_FEATURES_SECTION_HEADLINE = 'What your team gets' as const;

/** Features section supporting line. */
export const PRODUCT_INTENT_FEATURES_INTRO =
  'The work that used to scatter across binders, inboxes, and spreadsheets—organized for day-to-day compliance and audit week.' as const;

/** Closing CTA headline (landing). */
export const PRODUCT_INTENT_FINAL_CTA_HEADLINE = 'Bring your next audit into focus' as const;

/** Closing CTA supporting line (landing). */
export const PRODUCT_INTENT_FINAL_CTA_LINE =
  'Start free, or talk with us about your repair station, charter, or quality program. Human-led control from the first upload to the closing meeting.' as const;
