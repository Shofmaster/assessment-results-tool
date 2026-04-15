/**
 * Bundled default compliance rules keyed by {framework, operatorType}.
 * Single source of truth — the Convex rule seeder should import from here.
 */

import type { ComplianceRule } from '../types/logbook';

type OperatorType = 'part91_owner' | 'part135' | 'part145' | 'ia_inspector' | 'other';

/** Minimal rule shape without Convex metadata — just what the engine needs. */
type BundledRule = Omit<ComplianceRule, '_id' | 'createdAt' | 'version'> & {
  _id: string;
  version: number;
  createdAt: string;
};

// ── FAA base rules (14 CFR Part 43) ──────────────────────────────────────────

const FAA_BASE: BundledRule[] = [
  {
    _id: 'faa-43.9a-work-description',
    ruleId: 'FAA-43.9A-WORK',
    cfrPart: '43',
    cfrSection: '43.9(a)(1)',
    title: 'Work description required',
    description: 'Each maintenance record entry must contain a description (or reference to data acceptable to the Administrator) of work performed.',
    requiredFields: ['workPerformed'],
    checkType: 'required_field',
    severity: 'critical',
    citation: '14 CFR 43.9(a)(1)',
    regulatoryPack: 'faa_part43',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    _id: 'faa-43.9a-date',
    ruleId: 'FAA-43.9A-DATE',
    cfrPart: '43',
    cfrSection: '43.9(a)(2)',
    title: 'Date of completion required',
    description: 'Each entry must include the date of completion of the work performed.',
    requiredFields: ['entryDate'],
    checkType: 'required_field',
    severity: 'critical',
    citation: '14 CFR 43.9(a)(2)',
    regulatoryPack: 'faa_part43',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    _id: 'faa-43.9a-signer',
    ruleId: 'FAA-43.9A-SIGNER',
    cfrPart: '43',
    cfrSection: '43.9(a)(4)',
    title: 'Approval for return to service signature',
    description: 'If the work is approved for RTS, the entry must include the signature, certificate number, and kind of certificate held by the person approving the work.',
    requiredFields: ['signerName', 'signerCertNumber', 'signerCertType'],
    checkType: 'signoff_completeness',
    severity: 'critical',
    citation: '14 CFR 43.9(a)(4)',
    regulatoryPack: 'faa_part43',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    _id: 'faa-43.9a-rts',
    ruleId: 'FAA-43.9A-RTS',
    cfrPart: '43',
    cfrSection: '43.9(a)(4)',
    title: 'Return to service statement',
    description: 'Entry should contain a return-to-service statement or approval indication when work is completed.',
    requiredFields: ['returnToServiceStatement'],
    checkType: 'required_field',
    severity: 'major',
    citation: '14 CFR 43.9(a)(4)',
    regulatoryPack: 'faa_part43',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    _id: 'faa-43.11-inspection',
    ruleId: 'FAA-43.11-INSPECT',
    cfrPart: '43',
    cfrSection: '43.11(a)',
    title: 'Annual/100-hour inspection record content',
    description: 'Annual and 100-hour inspection entries must include: type of inspection, date, aircraft total time in service, certification statement, and signoff.',
    requiredFields: ['entryDate', 'totalTimeAtEntry', 'signerName', 'signerCertNumber'],
    checkType: 'record_content',
    severity: 'critical',
    citation: '14 CFR 43.11(a)',
    regulatoryPack: 'faa_part43',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
  },
];

// ── Additional rules for Part 135 operators ──────────────────────────────────

const FAA_PART135_EXTRA: BundledRule[] = [
  {
    _id: 'faa-135.439-maint-records',
    ruleId: 'FAA-135.439-MAINT',
    cfrPart: '135',
    cfrSection: '135.439',
    title: 'Part 135 maintenance record requirements',
    description: 'Part 135 operators must maintain records per 135.439 including total time in service, current status of life-limited parts, time since last overhaul, current inspection status, and current status of ADs.',
    requiredFields: ['totalTimeAtEntry'],
    checkType: 'record_content',
    severity: 'major',
    citation: '14 CFR 135.439',
    regulatoryPack: 'faa_part135',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
  },
];

// ── Additional rules for Part 145 repair stations ────────────────────────────

const FAA_PART145_EXTRA: BundledRule[] = [
  {
    _id: 'faa-145.201-records',
    ruleId: 'FAA-145.201-REC',
    cfrPart: '145',
    cfrSection: '145.201',
    title: 'Part 145 repair station record requirements',
    description: 'Part 145 repair stations must maintain records per 145.201 including work orders, technical data used, and personnel performing/supervising work.',
    requiredFields: ['workPerformed', 'signerName'],
    checkType: 'record_content',
    severity: 'major',
    citation: '14 CFR 145.201',
    regulatoryPack: 'faa_part145',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
  },
];

// ── EASA base rules ──────────────────────────────────────────────────────────

const EASA_BASE: BundledRule[] = [
  {
    _id: 'easa-ma305-record',
    ruleId: 'EASA-MA305-REC',
    cfrPart: 'M.A',
    cfrSection: 'M.A.305(a)',
    title: 'Continuing airworthiness records',
    description: 'Aircraft continuing airworthiness record must include component details, date, description, and identity of maintenance org or certifying staff.',
    requiredFields: ['entryDate', 'workPerformed', 'signerName'],
    checkType: 'required_field',
    severity: 'critical',
    citation: 'EASA Part-M M.A.305(a)',
    regulatoryPack: 'easa_partm',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
  },
  {
    _id: 'easa-145a50-crs',
    ruleId: 'EASA-145A50-CRS',
    cfrPart: '145.A',
    cfrSection: '145.A.50',
    title: 'Certificate of Release to Service',
    description: 'Part-145.A.50 requires a Certificate of Release to Service (CRS) with task ref, date, approval number, authorised person signature.',
    requiredFields: ['entryDate', 'workPerformed', 'signerName', 'returnToServiceStatement'],
    checkType: 'signoff_completeness',
    severity: 'critical',
    citation: 'EASA Part-145 145.A.50',
    regulatoryPack: 'easa_part145',
    version: 1,
    createdAt: '2024-01-01T00:00:00Z',
  },
];

/** Get the bundled rules for a given framework + operator type. */
export function getDefaultRules(
  framework: 'FAA' | 'EASA',
  operatorType?: OperatorType,
): ComplianceRule[] {
  if (framework === 'EASA') {
    return EASA_BASE as ComplianceRule[];
  }
  const rules: BundledRule[] = [...FAA_BASE];
  if (operatorType === 'part135') rules.push(...FAA_PART135_EXTRA);
  if (operatorType === 'part145') rules.push(...FAA_PART145_EXTRA);
  // IA inspectors get all base rules plus Part 145 context
  if (operatorType === 'ia_inspector') rules.push(...FAA_PART145_EXTRA);
  return rules as ComplianceRule[];
}
