/**
 * FAA authorization-document catalog: OpSpecs, MSpecs, TSpecs, and LOAs.
 *
 * Sources:
 *   - FAA Order 8900.1 Vol 2 Ch 3 (Part 145 OpSpecs)
 *   - FAA Order 8900.1 Vol 3 (Part 119/121/135/125 OpSpecs)
 *   - FAA Notice N 8900.368 (OpSpec/MSpec/TSpec/LOA A025)
 *   - FAA Notice N 8900.341 (OpSpec A001/A002/A004 for Part 145)
 *   - Current template Tables of Contents as issued via WebOPSS
 *
 * Paragraph keys (e.g. "A025", "D107", "B036") mirror the WebOPSS template
 * paragraph identifiers. Paragraph meaning varies by certificate part, so
 * consumers MUST discriminate by `certPart` when persisting or looking up.
 */

/** What kind of FAA authorization document the paragraph belongs to. */
export type FaaAuthDocType = "opspec" | "mspec" | "tspec" | "loa";

/** Certificate type / regulatory part the paragraph is issued under. */
export type FaaCertPart =
  | "145"
  | "121"
  | "125"
  | "129"
  | "133"
  | "135"
  | "137"
  | "141"
  | "142"
  | "147"
  | "91K"
  | "91LOA";

export type FaaAuthEntry = {
  /** WebOPSS paragraph identifier (e.g. "A025", "D107", "B036", "RVSM"). */
  paragraph: string;
  title: string;
  helpText?: string;
  /** If true, render this entry under a collapsed "Show all" section. */
  rarelyUsed?: boolean;
};

export type FaaAuthCatalog = {
  certPart: FaaCertPart;
  docType: FaaAuthDocType;
  /** Short label shown as the section header. */
  label: string;
  /** Regulation base cited in the UI tooltip. */
  regBase: string;
  /** Longer descriptive subtitle for the section header. */
  description?: string;
  paragraphs: FaaAuthEntry[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Part 145 — Repair Station Operations Specifications
// ─────────────────────────────────────────────────────────────────────────────
const PART_145: FaaAuthEntry[] = [
  { paragraph: "A001", title: "Issuance and applicability", helpText: "Certificate issuance, repair-station name/address, effective date." },
  { paragraph: "A002", title: "Definitions and abbreviations", helpText: "Defines terms used in this OpSpec." },
  { paragraph: "A003", title: "Ratings and limitations", helpText: "Authorized class/limited/specialized-services ratings and limitations." },
  { paragraph: "A004", title: "Summary of special authorizations and limitations", helpText: "Roll-up of all other authorizations and prohibitions." },
  { paragraph: "A005", title: "Exemptions, deviations, and waivers", helpText: "Authorized exemption/deviation/waiver references, if any." },
  { paragraph: "A007", title: "Designated persons", helpText: "Persons authorized to apply for and receive OpSpecs; InFO recipients." },
  { paragraph: "A015", title: "Aviation Safety Action Program (ASAP)", rarelyUsed: true },
  { paragraph: "A025", title: "Electronic/digital recordkeeping system, electronic/digital signature, and electronic media", helpText: "Authorization to use electronic recordkeeping, e-signatures, and electronic manuals (AC 120-78B)." },
  { paragraph: "A049", title: "Hazardous materials training program", rarelyUsed: true, helpText: "Part 145 hazmat training program per 49 CFR 172 subpart H, when applicable." },
  { paragraph: "A060", title: "Ratings for repair stations located outside the United States under a BASA with maintenance provisions", helpText: "FRS BASA/MAG-based ratings (e.g. EASA Part 145, Transport Canada AMO)." },
  { paragraph: "A061", title: "Approved procedures for repair stations located outside the United States", rarelyUsed: true },
  { paragraph: "A064", title: "Authorization to use a maintenance management software program", rarelyUsed: true },
  { paragraph: "A100", title: "Additional business names (d/b/a)", helpText: "Additional names under which the certificate holder does business." },
  { paragraph: "A101", title: "Additional fixed locations", helpText: "Authorized permanent facilities other than the primary fixed location." },
  { paragraph: "A103", title: "Continuous operations at locations other than the primary fixed location", rarelyUsed: true },
  { paragraph: "A110", title: "Geographic authorization (foreign repair station)", rarelyUsed: true, helpText: "FRS authorization to support a specific U.S. air carrier at a location away from the primary fixed location." },
  { paragraph: "A449", title: "Antidrug and alcohol misuse prevention program", helpText: "Required when performing safety-sensitive maintenance for Part 121/135 certificate holders." },
  { paragraph: "D070", title: "Continuing Analysis and Surveillance System (CASS) coordination", rarelyUsed: true, helpText: "Required when supporting a Part 121 air carrier's CASS." },
  { paragraph: "D091", title: "RVSM maintenance authorization", rarelyUsed: true },
  { paragraph: "D100", title: "Maintenance for certificate holders away from fixed location", helpText: "Line / away-from-base maintenance support for Part 121/125/129/135 operators." },
  { paragraph: "D107", title: "Line maintenance authorization for 14 CFR Part 121, 129, and 135 air carriers", helpText: "Line maintenance for named carriers at listed stations (replaces older D101)." },
  { paragraph: "D301", title: "Teardown / restricted-purpose maintenance authorization", rarelyUsed: true },
  { paragraph: "D431", title: "Special flight permit — continuous authorization", rarelyUsed: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Part 121 — Scheduled Air Carrier Operations Specifications
// ─────────────────────────────────────────────────────────────────────────────
const PART_121: FaaAuthEntry[] = [
  { paragraph: "A001", title: "Issuance and applicability" },
  { paragraph: "A002", title: "Definitions and abbreviations" },
  { paragraph: "A003", title: "Airplane authorizations, airman authorizations, and airworthiness information" },
  { paragraph: "A004", title: "Summary of special authorizations and limitations" },
  { paragraph: "A005", title: "Exemptions, deviations, and waivers" },
  { paragraph: "A006", title: "Management personnel", helpText: "Accountable Manager, Director of Operations, Chief Pilot, DOM, etc." },
  { paragraph: "A007", title: "Designated persons" },
  { paragraph: "A008", title: "Operational control", helpText: "Operational-control procedures and responsible personnel." },
  { paragraph: "A009", title: "Airplane authorizations", rarelyUsed: true },
  { paragraph: "A010", title: "Aviation weather information", rarelyUsed: true },
  { paragraph: "A011", title: "Airman qualification programs", rarelyUsed: true },
  { paragraph: "A012", title: "Airplane flight manual, pilot's operating handbook, or equivalent" },
  { paragraph: "A015", title: "Aviation Safety Action Program (ASAP)", rarelyUsed: true },
  { paragraph: "A021", title: "Flight Operational Quality Assurance (FOQA) program", rarelyUsed: true },
  { paragraph: "A025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "A031", title: "Authorization for a SMS", helpText: "FAA-accepted Safety Management System per Part 5." },
  { paragraph: "A039", title: "Extended-range operations with two-engine airplanes (ETOPS)", rarelyUsed: true },
  { paragraph: "A049", title: "Carriage of hazardous materials (will carry / will not carry)" },
  { paragraph: "A201", title: "Cabin safety and cabin-crew training", rarelyUsed: true },
  { paragraph: "A206", title: "Aging airplane program", rarelyUsed: true },
  { paragraph: "A449", title: "Antidrug and alcohol misuse prevention program" },
  { paragraph: "B031", title: "IFR class I navigation using area or long-range navigation systems" },
  { paragraph: "B034", title: "IFR class II navigation using GNSS (e.g. RNP-10, RNP-4)", rarelyUsed: true },
  { paragraph: "B036", title: "Operations in North Atlantic High Level Airspace (NAT-HLA / MNPS)", rarelyUsed: true },
  { paragraph: "B037", title: "Operations in RNP-10 airspace", rarelyUsed: true },
  { paragraph: "B039", title: "Operations in areas of magnetic unreliability", rarelyUsed: true },
  { paragraph: "B040", title: "Oceanic and remote continental airspace — data-link position reporting", rarelyUsed: true },
  { paragraph: "B046", title: "Reduced vertical separation minimums (RVSM)" },
  { paragraph: "B050", title: "Special airports — pilot qualifications", rarelyUsed: true },
  { paragraph: "C052", title: "Straight-in instrument approach — higher than standard minimums", rarelyUsed: true },
  { paragraph: "C055", title: "Alternate airport IFR weather minimums", rarelyUsed: true },
  { paragraph: "C060", title: "Takeoff minimums — standard and lower than standard" },
  { paragraph: "C070", title: "Airport authorizations and limitations" },
  { paragraph: "C078", title: "CAT II/III instrument approach and landing operations", rarelyUsed: true },
  { paragraph: "C079", title: "CAT II instrument approach and landing — general", rarelyUsed: true },
  { paragraph: "D070", title: "Continuing Analysis and Surveillance System (CASS)" },
  { paragraph: "D072", title: "Aircraft maintenance program" },
  { paragraph: "D082", title: "Short-term escalation of maintenance tasks", rarelyUsed: true },
  { paragraph: "D085", title: "Aircraft inspection program", rarelyUsed: true },
  { paragraph: "D091", title: "RVSM maintenance program" },
  { paragraph: "D095", title: "Minimum Equipment List (MEL) authorization" },
  { paragraph: "D100", title: "Maintenance performed at line stations / away from main base" },
  { paragraph: "D107", title: "Contract maintenance — line maintenance providers" },
  { paragraph: "E095", title: "Weight and balance control program" },
  { paragraph: "E096", title: "Use of average passenger and bag weights", rarelyUsed: true },
  { paragraph: "H101", title: "Training program — FAA-approved curricula" },
  { paragraph: "H110", title: "Advanced qualification program (AQP)", rarelyUsed: true },
  { paragraph: "N410", title: "Airplane-specific exemptions and deviations", rarelyUsed: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Part 125 — Large-airplane non-common-carriage Operations Specifications
// ─────────────────────────────────────────────────────────────────────────────
const PART_125: FaaAuthEntry[] = [
  { paragraph: "A001", title: "Issuance and applicability" },
  { paragraph: "A002", title: "Definitions and abbreviations" },
  { paragraph: "A003", title: "Airplane authorizations" },
  { paragraph: "A004", title: "Summary of special authorizations and limitations" },
  { paragraph: "A005", title: "Exemptions, deviations, and waivers" },
  { paragraph: "A006", title: "Management personnel" },
  { paragraph: "A007", title: "Designated persons" },
  { paragraph: "A008", title: "Operational control" },
  { paragraph: "A025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "A031", title: "Authorization for a SMS", rarelyUsed: true },
  { paragraph: "A049", title: "Carriage of hazardous materials", rarelyUsed: true },
  { paragraph: "A449", title: "Antidrug and alcohol misuse prevention program" },
  { paragraph: "B031", title: "Area navigation (RNAV) / long-range navigation authorization", rarelyUsed: true },
  { paragraph: "B046", title: "Reduced vertical separation minimums (RVSM)" },
  { paragraph: "C060", title: "Takeoff minimums", rarelyUsed: true },
  { paragraph: "C070", title: "Airport authorizations and limitations", rarelyUsed: true },
  { paragraph: "D072", title: "Aircraft maintenance program" },
  { paragraph: "D091", title: "RVSM maintenance program", rarelyUsed: true },
  { paragraph: "D095", title: "Minimum Equipment List (MEL) authorization" },
  { paragraph: "D100", title: "Maintenance performed away from main base", rarelyUsed: true },
  { paragraph: "E095", title: "Weight and balance control program" },
  { paragraph: "H101", title: "Training program — FAA-approved curricula" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Part 129 — Foreign Air Carrier Operations Specifications
// ─────────────────────────────────────────────────────────────────────────────
const PART_129: FaaAuthEntry[] = [
  { paragraph: "A001", title: "Issuance and applicability" },
  { paragraph: "A002", title: "Definitions and abbreviations" },
  { paragraph: "A003", title: "Airplane authorizations" },
  { paragraph: "A004", title: "Summary of special authorizations and limitations" },
  { paragraph: "A005", title: "Exemptions, deviations, and waivers", rarelyUsed: true },
  { paragraph: "A008", title: "Operational control" },
  { paragraph: "A025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "A031", title: "Safety Management System (SMS)", rarelyUsed: true },
  { paragraph: "A049", title: "Carriage of hazardous materials", rarelyUsed: true },
  { paragraph: "A060", title: "Ratings under a BASA with maintenance provisions", rarelyUsed: true },
  { paragraph: "A449", title: "Antidrug and alcohol misuse prevention program", rarelyUsed: true, helpText: "Applicable only to Part 129 operators that employ U.S.-based safety-sensitive personnel." },
  { paragraph: "B031", title: "IFR area / long-range navigation authorization", rarelyUsed: true },
  { paragraph: "B036", title: "NAT-HLA / MNPS authorization", rarelyUsed: true },
  { paragraph: "B046", title: "RVSM authorization", rarelyUsed: true },
  { paragraph: "C070", title: "Airport authorizations and limitations", rarelyUsed: true },
  { paragraph: "D091", title: "RVSM maintenance requirements", rarelyUsed: true },
  { paragraph: "D095", title: "Minimum Equipment List (MEL) recognition", rarelyUsed: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Part 133 — Rotorcraft External-Load Operations Specifications
// ─────────────────────────────────────────────────────────────────────────────
const PART_133: FaaAuthEntry[] = [
  { paragraph: "A001", title: "Issuance and applicability" },
  { paragraph: "A002", title: "Definitions and abbreviations" },
  { paragraph: "A003", title: "Rotorcraft authorizations and external-load classes", helpText: "Class A, B, C, D external-load authorizations." },
  { paragraph: "A004", title: "Summary of special authorizations and limitations" },
  { paragraph: "A005", title: "Exemptions, deviations, and waivers", rarelyUsed: true },
  { paragraph: "A006", title: "Management personnel" },
  { paragraph: "A025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "A035", title: "Human external cargo (HEC) / personnel carrying device system (PCDS)", rarelyUsed: true },
  { paragraph: "A036", title: "Night external-load operations", rarelyUsed: true },
  { paragraph: "A037", title: "Congested-area plan", rarelyUsed: true },
  { paragraph: "A449", title: "Antidrug and alcohol misuse prevention program" },
  { paragraph: "B050", title: "Special-use airspace and areas of operation", rarelyUsed: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Part 135 — Commuter and On-Demand Operations Specifications
// ─────────────────────────────────────────────────────────────────────────────
const PART_135: FaaAuthEntry[] = [
  { paragraph: "A001", title: "Issuance and applicability" },
  { paragraph: "A002", title: "Definitions and abbreviations" },
  { paragraph: "A003", title: "Aircraft authorizations and airman authorizations" },
  { paragraph: "A004", title: "Summary of special authorizations and limitations" },
  { paragraph: "A005", title: "Exemptions, deviations, and waivers" },
  { paragraph: "A006", title: "Management personnel" },
  { paragraph: "A007", title: "Designated persons" },
  { paragraph: "A008", title: "Operational control" },
  { paragraph: "A015", title: "Aviation Safety Action Program (ASAP)", rarelyUsed: true },
  { paragraph: "A021", title: "Flight Operational Quality Assurance (FOQA) program", rarelyUsed: true },
  { paragraph: "A024", title: "Helicopter air ambulance (HAA) operations", rarelyUsed: true },
  { paragraph: "A025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "A031", title: "Safety Management System (SMS)", helpText: "Required for all Part 135 certificate holders per Part 5." },
  { paragraph: "A039", title: "ETOPS / long-range over-water authorization", rarelyUsed: true },
  { paragraph: "A049", title: "Carriage of hazardous materials (will carry / will not carry)" },
  { paragraph: "A449", title: "Antidrug and alcohol misuse prevention program" },
  { paragraph: "B031", title: "IFR area or long-range navigation authorization" },
  { paragraph: "B034", title: "IFR class II navigation using GNSS", rarelyUsed: true },
  { paragraph: "B036", title: "NAT-HLA / MNPS authorization", rarelyUsed: true },
  { paragraph: "B046", title: "Reduced vertical separation minimums (RVSM)" },
  { paragraph: "B050", title: "Special airports — pilot qualifications", rarelyUsed: true },
  { paragraph: "C052", title: "Straight-in instrument approach — higher than standard minimums", rarelyUsed: true },
  { paragraph: "C055", title: "IFR alternate-airport minimums", rarelyUsed: true },
  { paragraph: "C070", title: "Airport authorizations and limitations" },
  { paragraph: "C078", title: "CAT II/III operations", rarelyUsed: true },
  { paragraph: "D070", title: "Continuing Analysis and Surveillance System (CASS)", rarelyUsed: true },
  { paragraph: "D072", title: "Aircraft maintenance program" },
  { paragraph: "D085", title: "Aircraft inspection program (AAIP / progressive / manufacturer's)" },
  { paragraph: "D091", title: "RVSM maintenance program" },
  { paragraph: "D095", title: "Minimum Equipment List (MEL) authorization" },
  { paragraph: "D100", title: "Maintenance performed away from main base" },
  { paragraph: "D107", title: "Contract maintenance — line maintenance providers" },
  { paragraph: "E095", title: "Weight and balance control program" },
  { paragraph: "H101", title: "Training program — FAA-approved curricula" },
  { paragraph: "N410", title: "Airplane-specific exemptions and deviations", rarelyUsed: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Part 137 — Agricultural Aircraft Operations Specifications
// ─────────────────────────────────────────────────────────────────────────────
const PART_137: FaaAuthEntry[] = [
  { paragraph: "A001", title: "Issuance and applicability" },
  { paragraph: "A002", title: "Definitions and abbreviations" },
  { paragraph: "A003", title: "Aircraft authorizations" },
  { paragraph: "A004", title: "Summary of special authorizations and limitations" },
  { paragraph: "A005", title: "Exemptions, deviations, and waivers", rarelyUsed: true },
  { paragraph: "A025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "A033", title: "Dispensing of economic poisons (restricted-category dispensing)", rarelyUsed: true },
  { paragraph: "A034", title: "Night agricultural operations", rarelyUsed: true },
  { paragraph: "A037", title: "Operations over congested areas", rarelyUsed: true },
  { paragraph: "A449", title: "Antidrug and alcohol misuse prevention program", rarelyUsed: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Part 141 — Pilot School Operations Specifications
// ─────────────────────────────────────────────────────────────────────────────
const PART_141: FaaAuthEntry[] = [
  { paragraph: "A001", title: "Issuance and applicability" },
  { paragraph: "A002", title: "Definitions and abbreviations" },
  { paragraph: "A003", title: "Approved courses of training", helpText: "Courses listed per Appendices A–M of Part 141." },
  { paragraph: "A004", title: "Summary of special authorizations and limitations" },
  { paragraph: "A005", title: "Exemptions, deviations, and waivers", rarelyUsed: true },
  { paragraph: "A006", title: "Management personnel (Chief Instructor / Assistant Chief)" },
  { paragraph: "A007", title: "Designated persons" },
  { paragraph: "A025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "A081", title: "Examining authority", rarelyUsed: true, helpText: "Authorization to act as examining authority under §141.63." },
  { paragraph: "A101", title: "Additional fixed-base locations / satellite operations", rarelyUsed: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Part 142 — Training Center Training Specifications (TSpecs)
// ─────────────────────────────────────────────────────────────────────────────
const PART_142: FaaAuthEntry[] = [
  { paragraph: "T001", title: "Issuance and applicability" },
  { paragraph: "T002", title: "Definitions and abbreviations" },
  { paragraph: "T003", title: "Authorized training courses (core / specialty / test)" },
  { paragraph: "T004", title: "Summary of special authorizations and limitations" },
  { paragraph: "T005", title: "Exemptions, deviations, and waivers", rarelyUsed: true },
  { paragraph: "T007", title: "Designated persons" },
  { paragraph: "T025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "T040", title: "Approved training curricula", helpText: "Per-airplane-type curricula and approved courseware." },
  { paragraph: "T050", title: "Flight simulation training device (FSTD) qualification", rarelyUsed: true },
  { paragraph: "T060", title: "Training center satellite locations", rarelyUsed: true },
  { paragraph: "T080", title: "Advanced Qualification Program (AQP) training-center authorization", rarelyUsed: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// Part 147 — AMT School Training Specifications
// ─────────────────────────────────────────────────────────────────────────────
const PART_147: FaaAuthEntry[] = [
  { paragraph: "T001", title: "Issuance and applicability" },
  { paragraph: "T002", title: "Definitions and abbreviations" },
  { paragraph: "T003", title: "Authorized ratings (Airframe / Powerplant)" },
  { paragraph: "T004", title: "Summary of special authorizations and limitations" },
  { paragraph: "T025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "T040", title: "Approved curriculum subjects and hours" },
  { paragraph: "T060", title: "Satellite campus authorization", rarelyUsed: true },
  { paragraph: "T070", title: "Distance learning / online training authorization", rarelyUsed: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// 14 CFR 91 Subpart K — Fractional Ownership Management Specifications (MSpecs)
// ─────────────────────────────────────────────────────────────────────────────
const PART_91K: FaaAuthEntry[] = [
  { paragraph: "MA001", title: "Issuance and applicability" },
  { paragraph: "MA002", title: "Definitions and abbreviations" },
  { paragraph: "MA003", title: "Program manager authorizations" },
  { paragraph: "MA004", title: "Summary of special authorizations and limitations" },
  { paragraph: "MA005", title: "Exemptions, deviations, and waivers", rarelyUsed: true },
  { paragraph: "MA006", title: "Management personnel" },
  { paragraph: "MA007", title: "Designated persons" },
  { paragraph: "MA025", title: "Electronic/digital recordkeeping, electronic signature, and electronic media" },
  { paragraph: "MA031", title: "Safety Management System (SMS)", rarelyUsed: true },
  { paragraph: "MA039", title: "ETOPS / long-range over-water authorization", rarelyUsed: true },
  { paragraph: "MA049", title: "Carriage of hazardous materials", rarelyUsed: true },
  { paragraph: "MA449", title: "Antidrug and alcohol misuse prevention program" },
  { paragraph: "MB031", title: "IFR area / long-range navigation authorization" },
  { paragraph: "MB036", title: "NAT-HLA / MNPS authorization", rarelyUsed: true },
  { paragraph: "MB046", title: "Reduced vertical separation minimums (RVSM)" },
  { paragraph: "MC070", title: "Airport authorizations and limitations" },
  { paragraph: "MD072", title: "Aircraft inspection program" },
  { paragraph: "MD091", title: "RVSM maintenance program" },
  { paragraph: "MD095", title: "Minimum Equipment List (MEL) authorization" },
  { paragraph: "ME095", title: "Weight and balance control program" },
  { paragraph: "MH101", title: "Training program — FAA-approved curricula" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 14 CFR Part 91 — Letters of Authorization (LOAs)
// ─────────────────────────────────────────────────────────────────────────────
const PART_91_LOAS: FaaAuthEntry[] = [
  { paragraph: "A056", title: "Data-link Mandate (FANS-1/A or CPDLC) authorization", rarelyUsed: true },
  { paragraph: "A061", title: "Use of Electronic Flight Bag (EFB) — Part 91 operator", helpText: "AC 120-76 EFB authorization for Part 91." },
  { paragraph: "B034", title: "Oceanic RNP-10 authorization", rarelyUsed: true },
  { paragraph: "B036", title: "NAT-HLA / MNPS authorization" },
  { paragraph: "B039", title: "RNP-4 oceanic authorization", rarelyUsed: true },
  { paragraph: "B040", title: "CPDLC / ADS-C in oceanic airspace", rarelyUsed: true },
  { paragraph: "B046", title: "RVSM authorization" },
  { paragraph: "B054", title: "Polar operations authorization", rarelyUsed: true },
  { paragraph: "C052", title: "Special authorization — Category I, II, III (SA CAT)", rarelyUsed: true },
  { paragraph: "C063", title: "IFR flight using Localizer Performance with Vertical (LPV)", rarelyUsed: true },
  { paragraph: "C384", title: "RNP-AR (RNP authorization required) approach operations", rarelyUsed: true },
  { paragraph: "H110", title: "Alternative helicopter training — night vision imaging systems", rarelyUsed: true },
  { paragraph: "B345", title: "Data-link communications (FANS / CPDLC) — domestic", rarelyUsed: true },
  { paragraph: "ADSB-OUT", title: "ADS-B Out deviation / authorization", rarelyUsed: true },
];

export const FAA_AUTH_CATALOGS: FaaAuthCatalog[] = [
  {
    certPart: "145",
    docType: "opspec",
    label: "Part 145 — Repair Station OpSpecs",
    regBase: "14 CFR Part 145",
    description: "Operations Specifications for FAA-certificated repair stations.",
    paragraphs: PART_145,
  },
  {
    certPart: "121",
    docType: "opspec",
    label: "Part 121 — Scheduled Air Carrier OpSpecs",
    regBase: "14 CFR Part 121",
    description: "Domestic, flag, and supplemental air carrier Operations Specifications.",
    paragraphs: PART_121,
  },
  {
    certPart: "125",
    docType: "opspec",
    label: "Part 125 — Large-Airplane Non-Common Carriage OpSpecs",
    regBase: "14 CFR Part 125",
    paragraphs: PART_125,
  },
  {
    certPart: "129",
    docType: "opspec",
    label: "Part 129 — Foreign Air Carrier OpSpecs",
    regBase: "14 CFR Part 129",
    paragraphs: PART_129,
  },
  {
    certPart: "133",
    docType: "opspec",
    label: "Part 133 — Rotorcraft External-Load OpSpecs",
    regBase: "14 CFR Part 133",
    paragraphs: PART_133,
  },
  {
    certPart: "135",
    docType: "opspec",
    label: "Part 135 — Commuter & On-Demand OpSpecs",
    regBase: "14 CFR Part 135",
    paragraphs: PART_135,
  },
  {
    certPart: "137",
    docType: "opspec",
    label: "Part 137 — Agricultural Aircraft OpSpecs",
    regBase: "14 CFR Part 137",
    paragraphs: PART_137,
  },
  {
    certPart: "141",
    docType: "opspec",
    label: "Part 141 — Pilot School OpSpecs",
    regBase: "14 CFR Part 141",
    paragraphs: PART_141,
  },
  {
    certPart: "142",
    docType: "tspec",
    label: "Part 142 — Training Center TSpecs",
    regBase: "14 CFR Part 142",
    paragraphs: PART_142,
  },
  {
    certPart: "147",
    docType: "tspec",
    label: "Part 147 — AMT School TSpecs",
    regBase: "14 CFR Part 147",
    paragraphs: PART_147,
  },
  {
    certPart: "91K",
    docType: "mspec",
    label: "Part 91K — Fractional Ownership MSpecs",
    regBase: "14 CFR 91 Subpart K",
    description: "Management Specifications for fractional-ownership program managers.",
    paragraphs: PART_91K,
  },
  {
    certPart: "91LOA",
    docType: "loa",
    label: "Part 91 — Letters of Authorization",
    regBase: "14 CFR Part 91",
    description: "Operator-specific FAA Letters of Authorization (RVSM, RNP, EFB, etc.).",
    paragraphs: PART_91_LOAS,
  },
];

/** O(1) lookup of a catalog by certificate part. */
export const FAA_AUTH_CATALOG_BY_PART: Record<FaaCertPart, FaaAuthCatalog> =
  FAA_AUTH_CATALOGS.reduce((acc, catalog) => {
    acc[catalog.certPart] = catalog;
    return acc;
  }, {} as Record<FaaCertPart, FaaAuthCatalog>);

/** Resolve the canonical title for a (certPart, paragraph) pair, if known. */
export function faaAuthTitleFor(certPart: FaaCertPart, paragraph: string): string | undefined {
  const catalog = FAA_AUTH_CATALOG_BY_PART[certPart];
  if (!catalog) return undefined;
  return catalog.paragraphs.find((p) => p.paragraph === paragraph.trim())?.title;
}

/** Ordered list of cert parts, used by UI for stable section ordering. */
export const FAA_CERT_PARTS: FaaCertPart[] = FAA_AUTH_CATALOGS.map((c) => c.certPart);

/** Human-friendly short label for a cert part, used in checkbox lists and selects. */
export const FAA_CERT_PART_SHORT_LABEL: Record<FaaCertPart, string> = {
  "145": "Part 145 (Repair Station)",
  "121": "Part 121 (Air Carrier)",
  "125": "Part 125 (Large Airplane)",
  "129": "Part 129 (Foreign Carrier)",
  "133": "Part 133 (Rotorcraft Ext. Load)",
  "135": "Part 135 (Commuter / On-Demand)",
  "137": "Part 137 (Agricultural)",
  "141": "Part 141 (Pilot School)",
  "142": "Part 142 (Training Center)",
  "147": "Part 147 (AMT School)",
  "91K": "Part 91K (Fractional)",
  "91LOA": "Part 91 LOAs",
};

// ─────────────────────────────────────────────────────────────────────────────
// Legacy exports — retained for backward compatibility with callers that
// haven't migrated to `FAA_AUTH_CATALOGS` yet.
// ─────────────────────────────────────────────────────────────────────────────
/** @deprecated Prefer `FAA_AUTH_CATALOG_BY_PART["145"].paragraphs`. */
export type FaaOpSpecEntry = FaaAuthEntry;

/** @deprecated Prefer `FAA_AUTH_CATALOG_BY_PART["145"].paragraphs`. */
export const FAA_PART145_OPSPECS: FaaAuthEntry[] = PART_145;

/**
 * @deprecated The app now renders per-paragraph 121/135 checklists driven by
 * `FAA_AUTH_CATALOGS`; the old letter-series shim remains only for any
 * non-UI consumer that still expects it.
 */
export const FAA_PART121_135_OPSPEC_SERIES: FaaAuthEntry[] = [
  { paragraph: "Series A", title: "General (121/135)" },
  { paragraph: "Series B", title: "En route (121/135)" },
  { paragraph: "Series C", title: "Airports / heliports (121/135)" },
  { paragraph: "Series D", title: "Maintenance (121/135)" },
  { paragraph: "Series E", title: "Weight and balance (121/135)" },
  { paragraph: "Series H", title: "Training (121/135)" },
  { paragraph: "Series N", title: "Airplane exemptions (121/135)" },
];
