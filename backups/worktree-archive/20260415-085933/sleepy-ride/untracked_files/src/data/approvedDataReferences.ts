/**
 * Approved Data Reference Library for FAA Form 337
 *
 * Common approved data sources referenced on Form 337s, organized by type.
 * Used for autocomplete suggestions and format validation.
 */

import type { ApprovedDataType } from '../services/form337Service';

export interface ReferenceEntry {
  type: ApprovedDataType;
  identifier: string;
  title: string;
  /** Optional sub-items for drill-down (e.g., AC chapters) */
  sections?: { identifier: string; title: string }[];
}

/* ── Advisory Circulars commonly used on Form 337s ───────────────────── */

export const AC_REFERENCES: ReferenceEntry[] = [
  {
    type: 'AC',
    identifier: 'AC 43.13-1B',
    title: 'Acceptable Methods, Techniques, and Practices — Aircraft Inspection and Repair',
    sections: [
      { identifier: 'AC 43.13-1B, Ch 1', title: 'Wood Structures' },
      { identifier: 'AC 43.13-1B, Ch 2', title: 'Fabric Covering' },
      { identifier: 'AC 43.13-1B, Ch 3', title: 'Metal Structures — Riveted/Bolted' },
      { identifier: 'AC 43.13-1B, Ch 4', title: 'Metal Structures — Welded' },
      { identifier: 'AC 43.13-1B, Ch 5', title: 'Transparent Plastics' },
      { identifier: 'AC 43.13-1B, Ch 6', title: 'Control Cables and Turnbuckles' },
      { identifier: 'AC 43.13-1B, Ch 7', title: 'Aircraft Hardware, Close Tolerance Bolts, and Rivets' },
      { identifier: 'AC 43.13-1B, Ch 8', title: 'Fluid Lines and Fittings' },
      { identifier: 'AC 43.13-1B, Ch 9', title: 'Electrical Systems and Wiring' },
      { identifier: 'AC 43.13-1B, Ch 10', title: 'Weight and Balance' },
      { identifier: 'AC 43.13-1B, Ch 11', title: 'Airframe Corrosion' },
    ],
  },
  {
    type: 'AC',
    identifier: 'AC 43.13-2B',
    title: 'Acceptable Methods, Techniques, and Practices — Aircraft Alterations',
    sections: [
      { identifier: 'AC 43.13-2B, Ch 1', title: 'Structural Data' },
      { identifier: 'AC 43.13-2B, Ch 2', title: 'Airframe Alterations' },
      { identifier: 'AC 43.13-2B, Ch 3', title: 'Powerplant Alterations' },
      { identifier: 'AC 43.13-2B, Ch 4', title: 'Instrument/Navigation/Communication Equipment' },
    ],
  },
  {
    type: 'AC',
    identifier: 'AC 43-210A',
    title: 'Standardized Procedures for Requesting Field Approval of Data',
  },
  {
    type: 'AC',
    identifier: 'AC 43.9-1G',
    title: 'Instructions for Completion of FAA Form 337',
  },
];

/* ── Format validation patterns ──────────────────────────────────────── */

/** STC format: SA (airframe), SE (engine), SP (propeller) followed by numbers and optional suffix */
export const STC_FORMAT_REGEX = /^S[AEP]\d{3,6}[A-Z]{0,3}$/i;
export const STC_FORMAT_HINT = 'STC format: SA (airframe), SE (engine), or SP (propeller) + digits (e.g., SA01234AT)';

/** AD number format examples: 2024-15-06, AD 2024-15-06 */
export const AD_FORMAT_REGEX = /^(?:AD\s*)?(\d{4})-(\d{2})-(\d{2})(?:R\d)?$/i;
export const AD_FORMAT_HINT = 'AD format: YYYY-NN-NN (e.g., 2024-15-06 or AD 2024-15-06R1)';

/** Service Bulletin usually has manufacturer prefix + numeric */
export const SB_FORMAT_HINT = 'Format: Manufacturer name + SB number (e.g., Cessna SEB-26-4 or Lycoming SB-388E)';

/** DER approved data: FAA Form 8110-3 */
export const DER_FORMAT_HINT = 'Reference FAA Form 8110-3 number or DER approval letter number';

/** TCDS format: e.g., A00009SE, H2SW, P-202 */
export const TCDS_FORMAT_HINT = 'Type Certificate Data Sheet number (e.g., A00009SE, H2SW)';

/* ── Type labels and descriptions ────────────────────────────────────── */

export const APPROVED_DATA_TYPE_INFO: Record<ApprovedDataType, { label: string; description: string; hint: string }> = {
  STC: {
    label: 'Supplemental Type Certificate',
    description: 'FAA-approved design change to an existing type certificate',
    hint: STC_FORMAT_HINT,
  },
  AC: {
    label: 'Advisory Circular',
    description: 'FAA guidance document (e.g., AC 43.13-1B for repairs, AC 43.13-2B for alterations)',
    hint: 'Include chapter, section, page, and paragraph (e.g., AC 43.13-1B, Ch 4, Sec 2, p. 4-5)',
  },
  AD: {
    label: 'Airworthiness Directive',
    description: 'Mandatory corrective action issued by the FAA',
    hint: AD_FORMAT_HINT,
  },
  SB: {
    label: 'Service Bulletin',
    description: 'Manufacturer-issued maintenance/modification guidance',
    hint: SB_FORMAT_HINT,
  },
  DER: {
    label: 'DER-Approved Data',
    description: 'Data approved by a Designated Engineering Representative (FAA Form 8110-3)',
    hint: DER_FORMAT_HINT,
  },
  TCDS: {
    label: 'Type Certificate Data Sheet',
    description: 'FAA document defining type design and limitations',
    hint: TCDS_FORMAT_HINT,
  },
  manufacturer: {
    label: 'Manufacturer Data',
    description: 'OEM maintenance manual, service instructions, or installation kit instructions',
    hint: 'Include manufacturer name, document number, and revision (e.g., Cessna Service Manual Rev. 15)',
  },
  other: {
    label: 'Other Approved Data',
    description: 'Previously field-approved Form 337, military specs, or other FAA-approved data',
    hint: 'Describe the data source and any approval reference number',
  },
};

/* ── Quick-pick commonly referenced items ────────────────────────────── */

export const QUICK_PICK_REFERENCES: { type: ApprovedDataType; identifier: string; label: string }[] = [
  { type: 'AC', identifier: 'AC 43.13-1B', label: 'AC 43.13-1B — Inspection & Repair Methods' },
  { type: 'AC', identifier: 'AC 43.13-2B', label: 'AC 43.13-2B — Aircraft Alterations' },
  { type: 'AC', identifier: 'AC 43-210A', label: 'AC 43-210A — Field Approval Procedures' },
];
