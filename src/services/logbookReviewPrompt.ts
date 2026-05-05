/**
 * Catalog of aviation maintenance-record standards that the Logbook Entry
 * Review page can apply against a single entry. Each standard has:
 *  - a stable id (persisted in app state)
 *  - a display label
 *  - a region bucket (used to render the selector)
 *  - an authority ('FAA' | 'EASA' | 'UK' | 'TCCA' | 'ICAO' | 'Industry')
 *  - a prompt body that teaches the model which citations to use
 *  - optional certPart mapping used to filter company OpSpecs for context
 */
export type LogbookReviewRegion = 'us' | 'europe' | 'uk' | 'canada' | 'icao' | 'industry';

export type LogbookReviewAuthority = 'FAA' | 'EASA' | 'UK' | 'TCCA' | 'ICAO' | 'Industry';

export type LogbookReviewStandard =
  // United States — FAA
  | 'part_43_general'
  | 'part_91'
  | 'part_121'
  | 'part_125'
  | 'part_129'
  | 'part_133'
  | 'part_135'
  | 'part_137'
  | 'part_145'
  | 'part_65'
  // Europe — EASA
  | 'easa_part_m'
  | 'easa_part_ml'
  | 'easa_part_145'
  | 'easa_part_66'
  | 'easa_part_camo'
  | 'easa_part_cao'
  | 'easa_part_21'
  // United Kingdom — CAA
  | 'uk_part_145'
  | 'uk_part_m'
  | 'uk_part_66'
  // Canada — Transport Canada
  | 'car_571'
  | 'car_605'
  | 'car_706'
  | 'car_573'
  // ICAO / international
  | 'icao_annex_8'
  | 'icao_annex_6'
  // Industry / quality
  | 'as9100'
  | 'nas410_ndt'
  | 'iso_9001';

export interface LogbookReviewStandardMeta {
  id: LogbookReviewStandard;
  label: string;
  shortLabel: string;
  region: LogbookReviewRegion;
  authority: LogbookReviewAuthority;
  certPart?: string;
  body: string;
}

export const LOGBOOK_REVIEW_STANDARDS: LogbookReviewStandardMeta[] = [
  // ── United States ────────────────────────────────────────────────────────
  {
    id: 'part_43_general',
    label: '14 CFR Part 43 — Maintenance, preventive maintenance, rebuilding & alteration',
    shortLabel: 'FAA Part 43',
    region: 'us',
    authority: 'FAA',
    body: `14 CFR 43.9(a) verbatim: "Each person who maintains, performs preventive maintenance, rebuilds, or alters an aircraft, airframe, aircraft engine, propeller, appliance, or component part shall make an entry in the maintenance record of that equipment containing the following information: (1) A description (or reference to data acceptable to the Administrator) of work performed; (2) The date of completion of the work performed; (3) The name of the person performing the work (if other than the person specified in paragraph (a)(4) of this section); and (4) If the work performed on the aircraft, airframe, aircraft engine, propeller, appliance, or component part has been approved for return to service, the signature, the certificate number, and kind of certificate held by the person approving the work."
14 CFR 43.11(a): Annual/100-hour inspection entries require: type of inspection, date, aircraft total time in service, certification statement, signature, certificate number, certificate type.
43.9(c) / 43.5: Major repair or major alteration requires FAA Form 337 and the record must reference it.
AC 43-9C: adequacy of work description, acceptable abbreviations, legibility.`,
  },
  {
    id: 'part_91',
    label: '14 CFR Part 91 — Inspection & maintenance requirements (operator)',
    shortLabel: 'FAA Part 91',
    region: 'us',
    authority: 'FAA',
    body: `14 CFR 91.403 operator responsibility for airworthiness.
14 CFR 91.405/409 annual/100-hour inspection currency; 91.409(e) inspection programs for large/turbine aircraft.
14 CFR 91.417 maintenance records: content, retention (1 year & until transferred), and status of AD compliance.
91.411/91.413 transponder & altimeter biennial checks — records content (date, max altitude tested, shop name, cert no.).`,
  },
  {
    id: 'part_121',
    label: '14 CFR Part 121 — Scheduled air carrier maintenance records',
    shortLabel: 'FAA Part 121',
    region: 'us',
    authority: 'FAA',
    certPart: '121',
    body: `14 CFR 121.369 (CASS/maintenance manual) & 121.380 recordkeeping: total time, time since overhaul, current status of life-limited parts, time since last inspection, AD status, identification/status of major alterations & repairs.
Work should reference operator's GMM/MPM procedures, MEL/CDL, and CASS data collection. Check for CAT/RNP-related maintenance task references (OpSpec D091, B-series).`,
  },
  {
    id: 'part_125',
    label: '14 CFR Part 125 — Large airplane operator maintenance records',
    shortLabel: 'FAA Part 125',
    region: 'us',
    authority: 'FAA',
    certPart: '125',
    body: `14 CFR 125.247 inspection program; 125.409 records (status of LLPs, AD compliance, major repairs/alterations, inspection cycle).
RVSM and MEL references must trace to OpSpec authorizations. Validate signer is authorized on the operator's inspector list.`,
  },
  {
    id: 'part_129',
    label: '14 CFR Part 129 — Foreign air carrier operations to the US',
    shortLabel: 'FAA Part 129',
    region: 'us',
    authority: 'FAA',
    certPart: '129',
    body: `Part 129 operations specifications recognition of foreign state airworthiness. Entries should cite the state-of-registry regulation for the maintenance release and, when applicable, FAA OpSpec authorizations (A060, B046, etc.).`,
  },
  {
    id: 'part_133',
    label: '14 CFR Part 133 — Rotorcraft external-load operations',
    shortLabel: 'FAA Part 133',
    region: 'us',
    authority: 'FAA',
    certPart: '133',
    body: `133.43 recordkeeping for external-load operations; external-load device inspections. Verify class rating and HEC/PCDS authorization in entry language.`,
  },
  {
    id: 'part_135',
    label: '14 CFR Part 135 — On-demand air carrier maintenance records',
    shortLabel: 'FAA Part 135',
    region: 'us',
    authority: 'FAA',
    certPart: '135',
    body: `14 CFR 135.439 records: total time in service, life-limited part status, time since overhaul, AD status, current inspection status, major alteration/repair identification.
135.411 aircraft inspections — 9-seat-and-below (Part 91 rules) vs. 10-seat-and-above (approved AAIP/continuous). Entry must name the inspection program.`,
  },
  {
    id: 'part_137',
    label: '14 CFR Part 137 — Agricultural aircraft operations',
    shortLabel: 'FAA Part 137',
    region: 'us',
    authority: 'FAA',
    certPart: '137',
    body: `Part 137 operational maintenance: dispensing system cleaning, calibration, and records per 137.77/137.79.`,
  },
  {
    id: 'part_145',
    label: '14 CFR Part 145 — Repair station maintenance record & return-to-service',
    shortLabel: 'FAA Part 145',
    region: 'us',
    authority: 'FAA',
    certPart: '145',
    body: `14 CFR 145.219 records of maintenance, preventive maintenance, alterations; retention 2 years. Approval for return to service per 145.213: certificate number of repair station, signature/name of authorized individual, date, article description, work performed, reference to technical data.
Check scope vs repair station capability list and OpSpec D100 (line maintenance away from primary fixed location).`,
  },
  {
    id: 'part_65',
    label: '14 CFR Part 65 — Airmen other than flight crew (A&P / IA / Repairman)',
    shortLabel: 'FAA Part 65',
    region: 'us',
    authority: 'FAA',
    body: `Privileges/limitations per 65.81 (mechanic), 65.85/87 (airframe/powerplant), 65.95 (inspection authorization), 65.101/103 (repairman). Verify the named signer holds the privilege required by the work being released.`,
  },

  // ── Europe — EASA ────────────────────────────────────────────────────────
  {
    id: 'easa_part_m',
    label: 'EASA Part-M — Continuing airworthiness (complex aircraft)',
    shortLabel: 'EASA Part-M',
    region: 'europe',
    authority: 'EASA',
    body: `M.A.305 Aircraft continuing airworthiness record system. M.A.401 approved maintenance data. M.A.801 certificate of release to service (CRS) for non-Part-145 maintenance: date, description, reference to data, identification of certifying person & approval. M.A.803 pilot-owner authorization (scope/limitations).`,
  },
  {
    id: 'easa_part_ml',
    label: 'EASA Part-ML — Continuing airworthiness (light aircraft)',
    shortLabel: 'EASA Part-ML',
    region: 'europe',
    authority: 'EASA',
    body: `ML.A.301 continuing-airworthiness tasks. ML.A.801 CRS: date, description, reference to data, signature/approval of certifying person. ML.A.803 pilot-owner maintenance scope.`,
  },
  {
    id: 'easa_part_145',
    label: 'EASA Part-145 — Approved maintenance organisation',
    shortLabel: 'EASA Part-145',
    region: 'europe',
    authority: 'EASA',
    body: `145.A.50 Certification of maintenance: CRS contains reference to maintenance data used, task performed, date, identification of AMO, approval reference, and authorised person signature. 145.A.35 certifying staff authorization scope must cover the work. 145.A.45 maintenance data is current and approved.`,
  },
  {
    id: 'easa_part_66',
    label: 'EASA Part-66 — Certifying staff licence scope (B1/B2/C)',
    shortLabel: 'EASA Part-66',
    region: 'europe',
    authority: 'EASA',
    body: `66.A.20 B1 (mechanical) / B2 (avionic) / B3 (piston ≤2000 kg) / C (base maintenance) privileges. Licence must have the aircraft type rating to certify the work type performed.`,
  },
  {
    id: 'easa_part_camo',
    label: 'EASA Part-CAMO — Continuing airworthiness management',
    shortLabel: 'EASA Part-CAMO',
    region: 'europe',
    authority: 'EASA',
    body: `CAMO.A.305/315 records, airworthiness review, maintenance program compliance; CAMO is responsible for tracking AD/SB compliance and ensuring the CRS entry aligns with the approved maintenance program.`,
  },
  {
    id: 'easa_part_cao',
    label: 'EASA Part-CAO — Combined airworthiness organisation',
    shortLabel: 'EASA Part-CAO',
    region: 'europe',
    authority: 'EASA',
    body: `Combined organisation privileges for non-complex airworthiness management and Part-ML / limited Part-145 maintenance; CRS requirements equivalent to ML.A.801.`,
  },
  {
    id: 'easa_part_21',
    label: 'EASA Part-21 — Design / production (alterations, repairs, EPA parts)',
    shortLabel: 'EASA Part-21',
    region: 'europe',
    authority: 'EASA',
    body: `21.A Subpart M (repairs) / Subpart E (STCs): entries for major repairs and major changes must reference approved design data (DOA / STC / EPA / minor change acceptance).`,
  },

  // ── United Kingdom — CAA ─────────────────────────────────────────────────
  {
    id: 'uk_part_145',
    label: 'UK CAA Part-145 — Approved maintenance organisation (post-Brexit)',
    shortLabel: 'UK Part-145',
    region: 'uk',
    authority: 'UK',
    body: `UK Part-145 mirrors EASA 145.A.50 CRS content. CAA approval number replaces the EASA approval number; Form 1 entries must reference UK.145 and current UK-approved maintenance data.`,
  },
  {
    id: 'uk_part_m',
    label: 'UK CAA Part-M — Continuing airworthiness',
    shortLabel: 'UK Part-M',
    region: 'uk',
    authority: 'UK',
    body: `UK Part-M equivalent of EASA M.A.305/401/801 with UK CAA oversight. Check references to CAA AD supplements and UK national requirements.`,
  },
  {
    id: 'uk_part_66',
    label: 'UK CAA Part-66 — Licensed engineer privileges',
    shortLabel: 'UK Part-66',
    region: 'uk',
    authority: 'UK',
    body: `UK Part-66 B1/B2/B3/C licences; same privilege limitations as EASA Part-66 but issued under UK CAA.`,
  },

  // ── Canada — TCCA ────────────────────────────────────────────────────────
  {
    id: 'car_571',
    label: 'Canadian CAR 571 — Maintenance & elementary work',
    shortLabel: 'CAR 571',
    region: 'canada',
    authority: 'TCCA',
    body: `CAR 571.03 performance rules. 571.10 maintenance release: date, aircraft/component identification, description of work, reference to applicable methods/techniques, name and signature of person signing (AME licence number), and the certifying statement "The described maintenance has been performed in accordance with the applicable airworthiness requirements."
Standard 571 Appendix A defines elementary work allowed without AME signature.`,
  },
  {
    id: 'car_605',
    label: 'Canadian CAR 605 — Aircraft requirements (technical records)',
    shortLabel: 'CAR 605',
    region: 'canada',
    authority: 'TCCA',
    body: `CAR 605.92–605.96 technical records: journey log, airframe/engine/propeller logs, retention. 605.94 entries: date, name/signature of person making the entry, maintenance release (cross-ref to CAR 571), air time and cycles where required.`,
  },
  {
    id: 'car_573',
    label: 'Canadian CAR 573 — Approved Maintenance Organization (AMO)',
    shortLabel: 'CAR 573',
    region: 'canada',
    authority: 'TCCA',
    body: `CAR 573 AMO certification, rating categories, and MPM requirements. AMO number must appear on maintenance release; certifying staff must be authorized within the AMO's ratings/limitations.`,
  },
  {
    id: 'car_706',
    label: 'Canadian CAR 706 — Air operator maintenance (airline/commercial)',
    shortLabel: 'CAR 706',
    region: 'canada',
    authority: 'TCCA',
    body: `CAR 706 Maintenance Control System (MCM), approved maintenance schedule, defect control, evaluation program (CAR 706.07). Entries must reference the MCM task cards and approved data.`,
  },

  // ── ICAO ─────────────────────────────────────────────────────────────────
  {
    id: 'icao_annex_8',
    label: 'ICAO Annex 8 — Airworthiness of aircraft',
    shortLabel: 'ICAO Annex 8',
    region: 'icao',
    authority: 'ICAO',
    body: `ICAO Annex 8 Part II Chapter 4 continuing airworthiness: maintenance records must be preserved, updated, and contain evidence that inspections and maintenance have been carried out by approved persons/organizations.`,
  },
  {
    id: 'icao_annex_6',
    label: 'ICAO Annex 6 — Operation of aircraft (maintenance record items)',
    shortLabel: 'ICAO Annex 6',
    region: 'icao',
    authority: 'ICAO',
    body: `Annex 6 Part I Chapter 8: operator maintenance control manual, maintenance release content, defect deferral, tech log; Annex 6 Part II for general aviation.`,
  },

  // ── Industry / quality ───────────────────────────────────────────────────
  {
    id: 'as9100',
    label: 'AS9100 — Aerospace quality management',
    shortLabel: 'AS9100',
    region: 'industry',
    authority: 'Industry',
    body: `AS9100 §8.5.2 identification and traceability, §8.5.4 preservation, §8.6 release of products/services: records must permit traceability of materials/personnel/tools used for the work performed.`,
  },
  {
    id: 'nas410_ndt',
    label: 'NAS 410 — NDT personnel qualification',
    shortLabel: 'NAS 410',
    region: 'industry',
    authority: 'Industry',
    body: `NAS 410 Level I/II/III NDT qualification. Any NDT result referenced in the entry must be signed by qualified personnel at the correct level for the method used (PT, MT, UT, RT, ET).`,
  },
  {
    id: 'iso_9001',
    label: 'ISO 9001 — Quality management system records',
    shortLabel: 'ISO 9001',
    region: 'industry',
    authority: 'Industry',
    body: `ISO 9001 §7.5 documented information control, §8.5.2 identification/traceability, §8.5.6 control of changes.`,
  },
];

export const LOGBOOK_REVIEW_STANDARD_MAP: Record<LogbookReviewStandard, LogbookReviewStandardMeta> =
  LOGBOOK_REVIEW_STANDARDS.reduce((acc, meta) => {
    acc[meta.id] = meta;
    return acc;
  }, {} as Record<LogbookReviewStandard, LogbookReviewStandardMeta>);

export const LOGBOOK_REVIEW_REGIONS: Array<{ id: LogbookReviewRegion; label: string }> = [
  { id: 'us', label: 'United States (FAA)' },
  { id: 'europe', label: 'Europe (EASA)' },
  { id: 'uk', label: 'United Kingdom (CAA)' },
  { id: 'canada', label: 'Canada (TCCA)' },
  { id: 'icao', label: 'ICAO (international)' },
  { id: 'industry', label: 'Industry / quality' },
];

/** Quick-pick presets the user can load with one click. */
export const LOGBOOK_REVIEW_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  standards: LogbookReviewStandard[];
}> = [
  {
    id: 'us_repair_station',
    label: 'US repair station (Part 145)',
    description: 'Part 43 + Part 145 with Part 65 certifying-staff checks',
    standards: ['part_43_general', 'part_145', 'part_65'],
  },
  {
    id: 'us_part_91',
    label: 'US general aviation (Part 91)',
    description: 'Part 43 + Part 91 inspection, records & operator requirements',
    standards: ['part_43_general', 'part_91', 'part_65'],
  },
  {
    id: 'us_part_135',
    label: 'US on-demand (Part 135)',
    description: 'Part 43 + Part 135 operator context',
    standards: ['part_43_general', 'part_135', 'part_65'],
  },
  {
    id: 'us_part_121',
    label: 'US airline (Part 121)',
    description: 'Part 43 + Part 121 CASS / records',
    standards: ['part_43_general', 'part_121', 'part_145'],
  },
  {
    id: 'easa_complex',
    label: 'EASA complex fleet',
    description: 'Part-M + Part-145 with Part-66 certifier scope',
    standards: ['easa_part_m', 'easa_part_145', 'easa_part_66'],
  },
  {
    id: 'easa_light',
    label: 'EASA light aircraft',
    description: 'Part-ML + Part-CAO',
    standards: ['easa_part_ml', 'easa_part_cao'],
  },
  {
    id: 'uk_post_brexit',
    label: 'UK CAA',
    description: 'UK Part-145 + UK Part-M + UK Part-66',
    standards: ['uk_part_145', 'uk_part_m', 'uk_part_66'],
  },
  {
    id: 'canada_amo',
    label: 'Canada AMO',
    description: 'CAR 571 + CAR 573 + CAR 605',
    standards: ['car_571', 'car_573', 'car_605'],
  },
  {
    id: 'canada_airline',
    label: 'Canada airline (706)',
    description: 'CAR 571 + CAR 605 + CAR 706',
    standards: ['car_571', 'car_605', 'car_706'],
  },
  {
    id: 'bilateral_faa_easa',
    label: 'Bilateral FAA ↔ EASA',
    description: 'Dual-release entries (Part 43/145 + EASA Part-145)',
    standards: ['part_43_general', 'part_145', 'easa_part_145'],
  },
  {
    id: 'quality_aerospace',
    label: 'Industry quality',
    description: 'AS9100 + NAS 410 (NDT) + ISO 9001',
    standards: ['as9100', 'nas410_ndt', 'iso_9001'],
  },
];

export interface CompanyContextPacket {
  repairStation?: {
    companyName?: string;
    certNumber?: string;
    certTypesHeld?: string[];
    easaApprovalRef?: string;
    operationsScope?: string;
  };
  opSpecs?: Array<{
    certPart?: string;
    paragraph?: string;
    title?: string;
    notes?: string;
    isActive?: boolean;
  }>;
  capabilityList?: Array<{
    clNumber?: string;
    articleDescription: string;
    make?: string;
    model?: string;
    partNumber?: string;
    authorizedFunctions?: string[];
    isActive?: boolean;
  }>;
  roster?: Array<{
    fullName: string;
    roleTitle?: string;
    certificateNumber?: string;
    capabilities?: string[];
    isActive?: boolean;
  }>;
  manuals?: Array<{
    title: string;
    currentRevision?: string;
    manualType?: string;
  }>;
  sharedReferences?: Array<{
    name: string;
    documentType?: string;
    source?: string;
  }>;
}

const MAX_ITEMS_PER_SECTION = 40;
const MAX_STRING = 240;

function trimString(s: unknown, max = MAX_STRING): string | undefined {
  if (typeof s !== 'string') return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function trimStringArray(values: unknown, maxItems = 8, maxChars = 64): string[] | undefined {
  if (!Array.isArray(values)) return undefined;
  const out = values
    .map((v) => trimString(v, maxChars))
    .filter((v): v is string => Boolean(v))
    .slice(0, maxItems);
  return out.length ? out : undefined;
}

/** Union of OpSpec certParts relevant to the selected standards. */
function relevantCertParts(standards: LogbookReviewStandard[]): Set<string> {
  const parts = new Set<string>();
  for (const id of standards) {
    const meta = LOGBOOK_REVIEW_STANDARD_MAP[id];
    if (meta?.certPart) parts.add(meta.certPart);
  }
  return parts;
}

export function compactCompanyContext(
  input: CompanyContextPacket | null | undefined,
  standards: LogbookReviewStandard[] | LogbookReviewStandard,
): CompanyContextPacket {
  if (!input) return {};
  const list = Array.isArray(standards) ? standards : [standards];
  const parts = relevantCertParts(list);
  const opSpecs = (input.opSpecs ?? [])
    .filter((row) => (parts.size > 0 ? parts.has(String(row.certPart ?? '').trim()) : true))
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((row) => ({
      certPart: trimString(row.certPart, 12),
      paragraph: trimString(row.paragraph, 24),
      title: trimString(row.title, 140),
      notes: trimString(row.notes, 140),
      isActive: row.isActive !== false,
    }));

  const capabilityList = (input.capabilityList ?? [])
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((row) => ({
      clNumber: trimString(row.clNumber, 32),
      articleDescription: trimString(row.articleDescription, 140) ?? 'Unspecified article',
      make: trimString(row.make, 64),
      model: trimString(row.model, 64),
      partNumber: trimString(row.partNumber, 64),
      authorizedFunctions: trimStringArray(row.authorizedFunctions, 8, 64),
      isActive: row.isActive !== false,
    }));

  const roster = (input.roster ?? [])
    .filter((row) => row.isActive !== false)
    .slice(0, MAX_ITEMS_PER_SECTION)
    .map((row) => ({
      fullName: trimString(row.fullName, 80) ?? 'Unknown person',
      roleTitle: trimString(row.roleTitle, 64),
      certificateNumber: trimString(row.certificateNumber, 48),
      capabilities: trimStringArray(row.capabilities, 10, 48),
      isActive: true,
    }));

  const manuals = (input.manuals ?? [])
    .slice(0, 20)
    .map((row) => ({
      title: trimString(row.title, 120) ?? 'Untitled',
      currentRevision: trimString(row.currentRevision, 32),
      manualType: trimString(row.manualType, 48),
    }));

  const sharedReferences = (input.sharedReferences ?? [])
    .slice(0, 25)
    .map((row) => ({
      name: trimString(row.name, 120) ?? 'Unnamed reference',
      documentType: trimString(row.documentType, 40),
      source: trimString(row.source, 40),
    }));

  return {
    repairStation: input.repairStation
      ? {
          companyName: trimString(input.repairStation.companyName, 120),
          certNumber: trimString(input.repairStation.certNumber, 48),
          certTypesHeld: trimStringArray(input.repairStation.certTypesHeld, 12, 12),
          easaApprovalRef: trimString(input.repairStation.easaApprovalRef, 48),
          operationsScope: trimString(input.repairStation.operationsScope, 180),
        }
      : undefined,
    opSpecs,
    capabilityList,
    roster,
    manuals,
    sharedReferences,
  };
}

function authorityFrameworkHint(standards: LogbookReviewStandard[]): string {
  const authorities = new Set(
    standards.map((id) => LOGBOOK_REVIEW_STANDARD_MAP[id]?.authority ?? 'FAA'),
  );
  if (authorities.size === 1) {
    const only = [...authorities][0];
    if (only === 'FAA') return '"FAA"';
    if (only === 'EASA') return '"EASA"';
    if (only === 'UK') return '"UK"';
    if (only === 'TCCA') return '"TCCA"';
    if (only === 'ICAO') return '"ICAO"';
    return '"Industry"';
  }
  return '"Multi"';
}

function formatStandardsBody(standards: LogbookReviewStandard[]): string {
  const valid = standards
    .map((id) => LOGBOOK_REVIEW_STANDARD_MAP[id])
    .filter((meta): meta is LogbookReviewStandardMeta => Boolean(meta));
  if (valid.length === 0) {
    return LOGBOOK_REVIEW_STANDARD_MAP.part_43_general.body;
  }
  return valid
    .map((meta, idx) => `[${idx + 1}] ${meta.shortLabel} — ${meta.label}\n${meta.body}`)
    .join('\n\n');
}

export interface BuildSystemArgs {
  /** New API: one or more standards. A single string is still accepted for backward compat. */
  standards?: LogbookReviewStandard[] | LogbookReviewStandard;
  /** Legacy alias, accepted for one release; prefer `standards`. */
  standard?: LogbookReviewStandard;
}

function normalizeStandards(args: BuildSystemArgs): LogbookReviewStandard[] {
  if (Array.isArray(args.standards)) return args.standards;
  if (typeof args.standards === 'string') return [args.standards];
  if (typeof args.standard === 'string') return [args.standard];
  return ['part_43_general'];
}

export function buildLogbookReviewSystem(args: BuildSystemArgs): string {
  const standards = normalizeStandards(args);
  const framework = authorityFrameworkHint(standards);
  const standardsBody = formatStandardsBody(standards);
  return `You are an expert aviation maintenance records auditor with deep cross-jurisdictional knowledge of FAA, EASA, UK CAA, Transport Canada, ICAO, and aerospace industry quality standards.

The user has selected the following standards for this review. Evaluate the entry against EACH of them; a finding should cite which standard it relates to in the "citation" field.

${standardsBody}

Always cross-check the entry against the provided company context (repair station profile, OpSpecs, capability list, roster, manuals). Specifically look for:
- Roster mismatch: signer name or certificate number not present on the approved roster.
- Capability scope: work performed on an article/function not covered by the capability list or class/limited ratings.
- OpSpec / approval scope: work not authorized by the operator's OpSpec or AMO approval schedule.
- Inadequate work description, missing data reference, or missing return-to-service signoff required by the cited standard.

Respond ONLY with a JSON object (no markdown, no preamble) matching this exact schema:
{
  "overallCompliance": "compliant" | "minor_issues" | "major_issues" | "non_compliant",
  "complianceScore": <integer 0-100>,
  "regulatoryFramework": ${framework},
  "standardsApplied": ["<standard-id>", ...],
  "findings": [
    {
      "severity": "critical" | "major" | "advisory",
      "category": "missing_field" | "inadequate_description" | "signoff_deficiency" | "regulatory_gap" | "best_practice" | "roster_mismatch" | "capability_scope" | "opspec_scope",
      "standard": "<one of the selected standard ids>",
      "field": "<field name if applicable>",
      "citation": "<exact regulatory/company cite>",
      "issue": "<clear description>",
      "suggestedText": "<optional improved text>"
    }
  ],
  "crossChecks": {
    "rosterMatch": "matched" | "not_found" | "ambiguous" | "not_applicable",
    "capabilityScope": "within_scope" | "outside_scope" | "unclear" | "not_applicable",
    "opSpecScope": "within_scope" | "outside_scope" | "unclear" | "not_applicable"
  },
  "suggestedWorkPerformed": "<optional improved work description>",
  "suggestedRts": "<optional improved return-to-service statement>"
}

Scoring guidance: 100 fully compliant, 85-99 advisory only, 70-84 minor issues, 50-69 major issues, 0-49 non-compliant.`;
}

export interface BuildUserArgs {
  mode: 'text' | 'image';
  entryText?: string;
  /** New API: one or more standards. */
  standards?: LogbookReviewStandard[] | LogbookReviewStandard;
  /** Legacy alias. */
  standard?: LogbookReviewStandard;
  companyContext: CompanyContextPacket;
}

export function buildLogbookReviewUser(args: BuildUserArgs): string {
  const standards = normalizeStandards(args);
  const context = compactCompanyContext(args.companyContext, standards);
  const entryText = args.entryText?.trim();
  const intro =
    args.mode === 'image'
      ? 'Review the logbook entry shown in the attached image.'
      : 'Review the following logbook entry text.';
  const entryBlock = entryText ? `\n\nEntry text:\n---\n${entryText}\n---` : '';
  return `${intro}
Selected standards: ${standards.join(', ')}

Company context JSON:
${JSON.stringify(context, null, 2)}${entryBlock}

Evaluate against every selected standard and the company context. Respond with JSON only.`;
}
