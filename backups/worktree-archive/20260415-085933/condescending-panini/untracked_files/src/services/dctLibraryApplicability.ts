/**
 * DCT Library Applicability Engine
 *
 * Runs applicability scoring against the platform-wide DCT catalog using only
 * metadata (peerGroupLabel, specialtyLabel, mlfLabel, purpose) — no XML download needed.
 *
 * Produces three buckets:
 *   applicable   — confident match for this entity's regulatory profile
 *   uncertain    — some signals match but not enough to be definitive; user reviews
 *   not_applicable — definitively excluded by peer group, rating, or OpSpec mismatch
 *
 * Expected count ranges are based on FAA SAS statistics for typical Part 145 stations.
 */

import type { RegulatoryProfile } from './dctApplicabilityEngine';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Slim catalog entry from platformDctLibrary table (metadata only). */
export interface CatalogEntry {
  _id: string;
  fileName: string;
  standardDctId?: string;
  peerGroupLabel?: string;
  assessmentTypeLabel?: string;
  specialtyLabel?: string;
  mlfLabel?: string;
  purpose?: string;
  dctVersionNumber?: string;
  dctVersionDate?: string;
  questionCount: number;
  storageId?: string;
  contentHash: string;
}

export type ApplicabilityCategory = 'applicable' | 'uncertain' | 'not_applicable';

export interface CatalogApplicabilityResult {
  entry: CatalogEntry;
  category: ApplicabilityCategory;
  /** 0.0–1.0 */
  confidence: number;
  reasons: string[];
}

export interface LibraryApplicabilityReport {
  applicable: CatalogApplicabilityResult[];
  uncertain: CatalogApplicabilityResult[];
  notApplicable: CatalogApplicabilityResult[];
  totalCatalogSize: number;
  expectedRange: { min: number; max: number; label: string };
  /** Whether the applicable count falls in the expected range */
  countValidation: 'ok' | 'low' | 'high' | 'profile_incomplete';
}

// ── Expected count ranges ─────────────────────────────────────────────────────

const EXPECTED_RANGES: Record<string, { min: number; max: number; label: string }> = {
  F: { min: 50, max: 95,  label: 'Peer Group F (Domestic US)' },
  G: { min: 60, max: 105, label: 'Peer Group G (International, no BASA)' },
  H: { min: 70, max: 115, label: 'Peer Group H (International, BASA/MIP)' },
};

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Score every catalog entry against the entity's regulatory profile.
 * Returns separated buckets + count validation.
 */
export function runLibraryApplicability(
  profile: RegulatoryProfile,
  catalog: CatalogEntry[],
): LibraryApplicabilityReport {
  const isProfileComplete =
    profile.peerGroup != null ||
    profile.classRatings.length > 0 ||
    profile.opSpecs.filter((s) => s.isActive).length > 0;

  const applicable: CatalogApplicabilityResult[] = [];
  const uncertain: CatalogApplicabilityResult[] = [];
  const notApplicable: CatalogApplicabilityResult[] = [];

  for (const entry of catalog) {
    const { applicable: isApplicable, confidence, reasons } = scoreEntry(
      profile,
      entry,
      isProfileComplete,
    );

    let category: ApplicabilityCategory;
    if (!isApplicable) {
      category = 'not_applicable';
    } else if (confidence >= 0.75) {
      category = 'applicable';
    } else {
      category = 'uncertain';
    }

    const result: CatalogApplicabilityResult = { entry, category, confidence, reasons };
    if (category === 'applicable') applicable.push(result);
    else if (category === 'uncertain') uncertain.push(result);
    else notApplicable.push(result);
  }

  const peerGroup = profile.peerGroup ?? 'F';
  const expectedRange = EXPECTED_RANGES[peerGroup] ?? EXPECTED_RANGES['F'];

  let countValidation: LibraryApplicabilityReport['countValidation'];
  if (!isProfileComplete) {
    countValidation = 'profile_incomplete';
  } else if (applicable.length < expectedRange.min) {
    countValidation = 'low';
  } else if (applicable.length > expectedRange.max) {
    countValidation = 'high';
  } else {
    countValidation = 'ok';
  }

  return {
    applicable,
    uncertain,
    notApplicable,
    totalCatalogSize: catalog.length,
    expectedRange,
    countValidation,
  };
}

// ── Scoring ───────────────────────────────────────────────────────────────────

function scoreEntry(
  profile: RegulatoryProfile,
  entry: CatalogEntry,
  isProfileComplete: boolean,
): { applicable: boolean; confidence: number; reasons: string[] } {
  if (!isProfileComplete) {
    return {
      applicable: true,
      confidence: 0.5,
      reasons: ['Profile incomplete — showing all DCTs until regulatory data is entered'],
    };
  }

  const reasons: string[] = [];
  let applicable = true;
  let confidence = 0.5;

  // ── Peer group filter ─────────────────────────────────────────────────────
  if (entry.peerGroupLabel && profile.peerGroup) {
    const entryGroups = entry.peerGroupLabel
      .split(/[,\s\/|]+/)
      .map((g) => g.trim().toUpperCase())
      .filter(Boolean);
    if (entryGroups.length > 0 && !entryGroups.includes('ALL') && !entryGroups.includes('F,G,H')) {
      if (!entryGroups.includes(profile.peerGroup.toUpperCase())) {
        return {
          applicable: false,
          confidence: 0.95,
          reasons: [
            `Peer group mismatch: DCT is for ${entry.peerGroupLabel}, entity is Peer Group ${profile.peerGroup}`,
          ],
        };
      }
      reasons.push(`Peer group match (${profile.peerGroup})`);
      confidence = Math.max(confidence, 0.8);
    }
  }

  // ── Specialty / class rating filter ──────────────────────────────────────
  const specText = (entry.specialtyLabel ?? '').toLowerCase();
  const hasAnyRating = profile.classRatings.length > 0 || (profile.hasLimitedRatings ?? false);

  if (specText) {
    const ratingChecks: Array<{
      pattern: RegExp;
      categories: string[];
      label: string;
    }> = [
      { pattern: /airframe/i,               categories: ['airframe'],   label: 'Airframe' },
      { pattern: /powerplant|engine/i,       categories: ['powerplant'], label: 'Powerplant' },
      { pattern: /propeller/i,               categories: ['propeller'],  label: 'Propeller' },
      { pattern: /radio|avionics/i,          categories: ['radio'],      label: 'Radio/Avionics' },
      { pattern: /instrument/i,              categories: ['instrument'],  label: 'Instrument' },
      { pattern: /accessory/i,               categories: ['accessory'],  label: 'Accessory' },
      { pattern: /limited/i,                 categories: ['limited'],     label: 'Limited rating' },
    ];

    for (const check of ratingChecks) {
      if (!check.pattern.test(specText)) continue;
      const hasRequired =
        check.categories[0] === 'limited'
          ? profile.hasLimitedRatings ?? false
          : profile.classRatings.some((r) => check.categories.includes(r.category));

      if (hasAnyRating && !hasRequired) {
        return {
          applicable: false,
          confidence: 0.9,
          reasons: [`No ${check.label} rating — DCT specialty is "${entry.specialtyLabel}"`],
        };
      }
      if (hasRequired) {
        reasons.push(`${check.label} rating match`);
        confidence = Math.max(confidence, 0.85);
      }
    }
  }

  // ── OpSpec-specific DCTs ──────────────────────────────────────────────────
  const purposeText = `${entry.purpose ?? ''} ${entry.mlfLabel ?? ''}`.toLowerCase();

  if (/d100|away\s+from\s+fixed/i.test(purposeText)) {
    if (!profile.d100Authorized) {
      return { applicable: false, confidence: 0.88, reasons: ['D100 (work away from fixed location) not authorized'] };
    }
    reasons.push('D100 authorized'); confidence = Math.max(confidence, 0.87);
  }
  if (/a449|drug.*alcohol|alcohol.*drug/i.test(purposeText)) {
    if (!profile.a449Enrolled) {
      return { applicable: false, confidence: 0.85, reasons: ['A449 drug & alcohol program not enrolled'] };
    }
    reasons.push('A449 enrolled'); confidence = Math.max(confidence, 0.85);
  }
  if (/a050|deviation\s+authority/i.test(purposeText)) {
    if (!profile.a050Authorized) {
      return { applicable: false, confidence: 0.85, reasons: ['A050 deviation authority not held'] };
    }
    reasons.push('A050 deviation authority'); confidence = Math.max(confidence, 0.85);
  }

  // ── Always-applicable categories ─────────────────────────────────────────
  const alwaysApplicablePatterns: RegExp[] = [
    /quality\s*control|quality\s*system/i,
    /organizational\s*management|station\s*management/i,
    /training\s*program|personnel\s*training/i,
    /technical\s*data|airworthiness\s*data/i,
    /tools?\s*(and|&)\s*equipment|test\s*equipment/i,
    /materials?\s*(and|&)\s*parts?|incoming\s*inspection/i,
    /record[\s-]*keeping|maintenance\s*records?/i,
    /contract.*maintenance|vendor\s*control/i,
    /facility|housekeeping/i,
    /safety\s*management|sms/i,
  ];
  const mlf = (entry.mlfLabel ?? '').toLowerCase();
  for (const pat of alwaysApplicablePatterns) {
    if (pat.test(mlf) || pat.test(purposeText) || pat.test(specText)) {
      reasons.push('Core quality/safety management requirement (always applicable)');
      confidence = Math.max(confidence, 0.8);
      break;
    }
  }

  // ── Default: no exclusion rules fired ────────────────────────────────────
  if (reasons.length === 0) {
    reasons.push('No specific exclusion rule matched — included by default');
    confidence = 0.5;
  }

  return { applicable, confidence, reasons };
}
