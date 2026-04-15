/**
 * FAA Part 145 DCT Applicability Engine
 *
 * Replicates the FAA SAS "Certificate Holder Operating Profile" (CHOP) scoping logic
 * using structured regulatory data (class ratings, OpSpecs, peer group) to determine
 * which DCT documents are applicable to a specific repair station.
 *
 * Increment CURRENT_ENGINE_VERSION when applicability rules change — this busts the
 * server-side cache in dctApplicabilityProfiles.
 */

export const CURRENT_ENGINE_VERSION = 1;

// ── Types ─────────────────────────────────────────────────────────────────────

export type RatingCategory =
  | "airframe"
  | "powerplant"
  | "propeller"
  | "radio"
  | "instrument"
  | "accessory";

export type PeerGroup = "F" | "G" | "H";

export interface ClassRating {
  category: RatingCategory;
  classNumber: 1 | 2 | 3 | 4;
  limitations?: string;
}

export interface OpSpec {
  paragraph: string; // "A001", "D100", "A449", etc.
  isActive: boolean;
}

export interface LimitedRating {
  ratingType: string;
  articleDescription: string;
  make?: string;
  model?: string;
  authorizedFunctions: string[];
}

/** The full structured regulatory profile for a repair station. */
export interface RegulatoryProfile {
  peerGroup?: PeerGroup;
  d100Authorized?: boolean;
  a449Enrolled?: boolean;
  a050Authorized?: boolean;
  hasLimitedRatings?: boolean;
  classRatings: ClassRating[];
  opSpecs: OpSpec[];
  limitedRatings?: LimitedRating[];
}

/** A DCT document row (minimal shape needed for applicability evaluation). */
export interface DctDocForApplicability {
  _id: string;
  peerGroupLabel?: string;
  specialtyLabel?: string;
  mlfLabel?: string;
  assessmentTypeLabel?: string;
  title?: string;
  systemNumber?: number;
  subsystemNumber?: number;
  elementNumber?: number;
}

/** Result for a single DCT document. */
export interface ApplicabilityResult {
  applicable: boolean;
  /** 1.0 = definitive match, 0.7 = keyword match, 0.5 = partial, 0.0 = excluded */
  confidence: number;
  reasons: string[];
  missingConditions: string[];
}

// ── Applicability Mapping Rules ───────────────────────────────────────────────

type ApplicabilityCondition = {
  alwaysApplicable?: true;
  requiredPeerGroups?: PeerGroup[];
  requiredRatingCategories?: RatingCategory[];
  requiredOpSpecs?: string[];
  /** If any one of the sub-conditions is met, the rule is satisfied. */
  anyOf?: {
    requiredRatingCategories?: RatingCategory[];
    requiredOpSpecs?: string[];
  }[];
};

type MappingRule = {
  /** Regex pattern matched against specialtyLabel, mlfLabel, or title. */
  pattern: RegExp;
  /** Human-readable description for the reasons array. */
  label: string;
  condition: ApplicabilityCondition;
};

/**
 * Static mapping: DCT label patterns → required regulatory conditions.
 * Based on FAA Order 8900.1 and Part 145 SAS CHOP scoping documentation.
 */
const DCT_ELEMENT_APPLICABILITY_RULES: MappingRule[] = [
  // ── Always applicable for any Part 145 ──────────────────────────────────────
  {
    pattern: /organizational\s*management|general\s*cert|certificate\s*info|organizational\s*mgt/i,
    label: "Organizational Management (always applicable)",
    condition: { alwaysApplicable: true },
  },
  {
    pattern: /quality\s*control|quality\s*system|qcs|qcm/i,
    label: "Quality Control System (always applicable)",
    condition: { alwaysApplicable: true },
  },
  {
    pattern: /repair\s*station\s*management|rsm|station\s*management/i,
    label: "Repair Station Management (always applicable)",
    condition: { alwaysApplicable: true },
  },
  {
    pattern: /training\s*program|personnel\s*training|training\s*&\s*qualif/i,
    label: "Training Program (always applicable)",
    condition: { alwaysApplicable: true },
  },
  {
    pattern: /\btechnical\s*data\b|tech\s*data|csd|airworthiness\s*data/i,
    label: "Technical Data (always applicable)",
    condition: { alwaysApplicable: true },
  },
  {
    pattern: /tools?\s*(?:&|and)\s*equipment|test\s*equipment|ground\s*support/i,
    label: "Tools & Equipment (always applicable)",
    condition: { alwaysApplicable: true },
  },
  {
    pattern: /materials?\s*(?:&|and)\s*parts?|incoming\s*inspection|receiving\s*inspection/i,
    label: "Materials & Parts (always applicable)",
    condition: { alwaysApplicable: true },
  },
  {
    pattern: /record[\s-]*keeping|maintenance\s*records?|work\s*order/i,
    label: "Record Keeping (always applicable)",
    condition: { alwaysApplicable: true },
  },
  {
    pattern: /contract(?:ors?|ed)?\s*maintenance|outside\s*vendor|vendor\s*control/i,
    label: "Contracted Maintenance (always applicable)",
    condition: { alwaysApplicable: true },
  },
  {
    pattern: /housekeeping|facility\s*maintenance|facility\s*inspection/i,
    label: "Facility & Housekeeping (always applicable)",
    condition: { alwaysApplicable: true },
  },

  // ── Airframe ratings ────────────────────────────────────────────────────────
  {
    pattern: /airframe\s*maintenance|sheet\s*metal|structural\s*repair|composite\s*repair/i,
    label: "Airframe maintenance functions",
    condition: { requiredRatingCategories: ["airframe"] },
  },
  {
    pattern: /\bairframe\b/i,
    label: "Airframe rating required",
    condition: { requiredRatingCategories: ["airframe"] },
  },

  // ── Powerplant / engine ratings ─────────────────────────────────────────────
  {
    pattern: /powerplant|engine\s*(?:overhaul|repair|maint)|turbine\s*engine|reciprocating\s*engine/i,
    label: "Powerplant rating required",
    condition: { requiredRatingCategories: ["powerplant"] },
  },

  // ── Propeller ratings ────────────────────────────────────────────────────────
  {
    pattern: /propeller\s*(?:overhaul|repair|maint|balance)/i,
    label: "Propeller rating required",
    condition: { requiredRatingCategories: ["propeller"] },
  },

  // ── Radio / avionics ratings ─────────────────────────────────────────────────
  {
    pattern: /radio\s*(?:repair|maint)|avionics|communication\s*equipment/i,
    label: "Radio/Avionics rating required",
    condition: { anyOf: [
      { requiredRatingCategories: ["radio"] },
      { requiredRatingCategories: ["accessory"] },
    ]},
  },

  // ── Instrument ratings ───────────────────────────────────────────────────────
  {
    pattern: /instrument\s*(?:overhaul|repair|maint|shop)|pitot[\s-]*static|altimeter/i,
    label: "Instrument rating required",
    condition: { requiredRatingCategories: ["instrument"] },
  },

  // ── Accessory ratings ────────────────────────────────────────────────────────
  {
    pattern: /accessory\s*(?:overhaul|repair|maint|shop)|hydraulic\s*(?:component|assembly)|fuel\s*control/i,
    label: "Accessory rating required",
    condition: { requiredRatingCategories: ["accessory"] },
  },

  // ── OpSpec D100 — Work away from fixed location ──────────────────────────────
  {
    pattern: /work\s*(?:performed\s*)?away\s*from|mobile\s*(?:team|unit|maintenance)|off[\s-]?site\s*maint|line\s*maint(?:enance)?\s*away/i,
    label: "OpSpec D100 (work away from fixed location) required",
    condition: { requiredOpSpecs: ["D100"] },
  },

  // ── OpSpec A449 — Drug & Alcohol ─────────────────────────────────────────────
  {
    pattern: /drug\s*(?:&|and)\s*alcohol|substance\s*abuse|a449/i,
    label: "OpSpec A449 (Drug & Alcohol program) required",
    condition: { requiredOpSpecs: ["A449"] },
  },

  // ── OpSpec A050 — Deviation authority ────────────────────────────────────────
  {
    pattern: /deviation\s*authority|a050|exemption\s*from/i,
    label: "OpSpec A050 (Deviation authority) required",
    condition: { requiredOpSpecs: ["A050"] },
  },

  // ── Peer Group F (domestic US) ────────────────────────────────────────────────
  {
    pattern: /\b145\s*f\b|domestic\s*(?:repair\s*station|145)|within\s*the\s*u\.?s\.?/i,
    label: "Peer Group F (domestic US)",
    condition: { requiredPeerGroups: ["F"] },
  },

  // ── Peer Group G (international, no BASA) ─────────────────────────────────────
  {
    pattern: /\b145\s*g\b|international.*no\s*(?:basa|agreement)/i,
    label: "Peer Group G (international, no BASA)",
    condition: { requiredPeerGroups: ["G"] },
  },

  // ── Peer Group H (international, BASA/MIP) ────────────────────────────────────
  {
    pattern: /\b145\s*h\b|basa|bilateral.*agreement|mip\b|maintenance\s*implementation\s*proc/i,
    label: "Peer Group H (international, BASA/MIP)",
    condition: { requiredPeerGroups: ["H"] },
  },

  // ── SMS / Safety Management System ───────────────────────────────────────────
  {
    pattern: /safety\s*management\s*system|\bsms\b|smsvp|safety\s*risk\s*management/i,
    label: "SMS program",
    condition: { alwaysApplicable: true }, // applicable if they have SMS (evaluated separately below)
  },
];

// ── Engine ────────────────────────────────────────────────────────────────────

function profileHasCategory(profile: RegulatoryProfile, category: RatingCategory): boolean {
  return profile.classRatings.some((r) => r.category === category) ||
    (profile.limitedRatings ?? []).some((r) => r.ratingType === category);
}

function profileHasOpSpec(profile: RegulatoryProfile, paragraph: string): boolean {
  // First check the boolean shortcuts
  if (paragraph === "D100" && profile.d100Authorized) return true;
  if (paragraph === "A449" && profile.a449Enrolled) return true;
  if (paragraph === "A050" && profile.a050Authorized) return true;
  // Then check the full opSpecs list
  return profile.opSpecs.some((s) => s.paragraph === paragraph && s.isActive);
}

function evaluateCondition(
  condition: ApplicabilityCondition,
  profile: RegulatoryProfile,
  peerGroup: PeerGroup,
): { met: boolean; missing: string[] } {
  if (condition.alwaysApplicable) return { met: true, missing: [] };

  const missing: string[] = [];

  if (condition.requiredPeerGroups && condition.requiredPeerGroups.length > 0) {
    if (!condition.requiredPeerGroups.includes(peerGroup)) {
      missing.push(`Peer Group ${condition.requiredPeerGroups.join(" or ")} required (station is ${peerGroup})`);
      return { met: false, missing };
    }
  }

  if (condition.requiredRatingCategories && condition.requiredRatingCategories.length > 0) {
    const unmet = condition.requiredRatingCategories.filter(
      (cat) => !profileHasCategory(profile, cat)
    );
    if (unmet.length > 0) {
      missing.push(...unmet.map((cat) => `${capitalize(cat)} rating not held`));
      return { met: false, missing };
    }
  }

  if (condition.requiredOpSpecs && condition.requiredOpSpecs.length > 0) {
    const unmet = condition.requiredOpSpecs.filter((p) => !profileHasOpSpec(profile, p));
    if (unmet.length > 0) {
      missing.push(...unmet.map((p) => `OpSpec ${p} not authorized`));
      return { met: false, missing };
    }
  }

  if (condition.anyOf && condition.anyOf.length > 0) {
    const anyMet = condition.anyOf.some((sub) => {
      if (sub.requiredRatingCategories) {
        return sub.requiredRatingCategories.every((cat) => profileHasCategory(profile, cat));
      }
      if (sub.requiredOpSpecs) {
        return sub.requiredOpSpecs.every((p) => profileHasOpSpec(profile, p));
      }
      return false;
    });
    if (!anyMet) {
      const categories = condition.anyOf
        .flatMap((s) => s.requiredRatingCategories ?? s.requiredOpSpecs ?? [])
        .join(" or ");
      missing.push(`Requires one of: ${categories}`);
      return { met: false, missing };
    }
  }

  return { met: true, missing };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Concatenate all searchable text fields of a DCT document for pattern matching. */
function dctSearchText(doc: DctDocForApplicability): string {
  return [doc.peerGroupLabel, doc.specialtyLabel, doc.mlfLabel, doc.assessmentTypeLabel, doc.title]
    .filter(Boolean)
    .join(" | ");
}

/**
 * Compute applicability for a list of DCT documents against a regulatory profile.
 *
 * Returns a Map<docId, ApplicabilityResult>.
 *
 * Rules evaluated in priority order:
 * 1. If profile has zero class ratings AND zero active OpSpecs → treat as "profile incomplete",
 *    return applicable=true for all (don't filter until data is entered).
 * 2. For each DCT, test ALL matching rules. If any matched rule fails its condition → not applicable.
 * 3. Documents with no matching rules at all are assumed always applicable (conservative default).
 */
export function computeApplicability(
  profile: RegulatoryProfile,
  dctDocs: DctDocForApplicability[],
): Map<string, ApplicabilityResult> {
  const results = new Map<string, ApplicabilityResult>();

  const peerGroup = profile.peerGroup ?? "F";
  const profileIsEmpty =
    profile.classRatings.length === 0 &&
    profile.opSpecs.filter((s) => s.isActive).length === 0;

  for (const doc of dctDocs) {
    if (profileIsEmpty) {
      results.set(doc._id, {
        applicable: true,
        confidence: 0.5,
        reasons: ["Profile incomplete — all DCTs shown until regulatory data is entered"],
        missingConditions: [],
      });
      continue;
    }

    const text = dctSearchText(doc);
    const matchedRules = DCT_ELEMENT_APPLICABILITY_RULES.filter((rule) => rule.pattern.test(text));

    if (matchedRules.length === 0) {
      // No rules match → conservative default: applicable
      results.set(doc._id, {
        applicable: true,
        confidence: 0.5,
        reasons: ["No specific scoping rule matched — included by default"],
        missingConditions: [],
      });
      continue;
    }

    const reasons: string[] = [];
    const allMissing: string[] = [];
    let applicable = true;
    let maxConfidence = 0;

    for (const rule of matchedRules) {
      const { met, missing } = evaluateCondition(rule.condition, profile, peerGroup);
      if (met) {
        reasons.push(rule.label);
        maxConfidence = Math.max(maxConfidence, rule.condition.alwaysApplicable ? 1.0 : 0.85);
      } else {
        // A failing peer-group rule is definitive exclusion
        if (rule.condition.requiredPeerGroups) {
          applicable = false;
          allMissing.push(...missing);
          maxConfidence = 0;
          break;
        }
        // Other failing rules: exclude unless another rule positively includes
        applicable = false;
        allMissing.push(...missing);
      }
    }

    // Re-check: if ANY rule positively matched (reasons.length > 0) AND no peer-group exclusion, include
    if (reasons.length > 0 && !allMissing.some((m) => m.includes("Peer Group"))) {
      applicable = true;
      maxConfidence = Math.max(maxConfidence, 0.7);
    }

    results.set(doc._id, {
      applicable,
      confidence: applicable ? Math.max(maxConfidence, 0.5) : 0,
      reasons: reasons.length > 0 ? reasons : ["Excluded by applicability rules"],
      missingConditions: applicable ? [] : allMissing,
    });
  }

  return results;
}

/**
 * Summarize an applicability map for display (e.g., in ApplicabilityPreview).
 */
export function summarizeApplicability(
  results: Map<string, ApplicabilityResult>,
  peerGroup: PeerGroup = "F",
): {
  total: number;
  applicable: number;
  notApplicable: number;
  uncertain: number;
  peerGroup: PeerGroup;
} {
  let applicable = 0;
  let notApplicable = 0;
  let uncertain = 0;

  for (const r of results.values()) {
    if (!r.applicable) {
      notApplicable++;
    } else if (r.confidence < 0.7) {
      uncertain++;
    } else {
      applicable++;
    }
  }

  return {
    total: results.size,
    applicable,
    notApplicable,
    uncertain,
    peerGroup,
  };
}

/**
 * Serialize the applicability results to a compact rationale JSON string
 * suitable for storage in dctApplicabilityProfiles.rationale.
 */
export function serializeRationale(results: Map<string, ApplicabilityResult>): string {
  const obj: Record<string, { applicable: boolean; confidence: number; reasons: string[] }> = {};
  for (const [id, r] of results.entries()) {
    obj[id] = { applicable: r.applicable, confidence: r.confidence, reasons: r.reasons.slice(0, 2) };
  }
  return JSON.stringify(obj);
}
