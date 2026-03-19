/**
 * Regulatory rule pack definitions for the compliance engine.
 *
 * Each rule is a deterministic check with a unique ruleId, tied to a specific
 * CFR section, and versioned so historical logbook entries are evaluated
 * against the rule version that was effective at the time.
 *
 * Pack: part43  — seeded in complianceRules.seedPart43And91 (already implemented)
 * Pack: part91  — seeded in complianceRules.seedPart43And91 (already implemented)
 * Pack: part145 — below
 * Pack: part121 — below
 * Pack: part135 — below
 */

export interface RulePackEntry {
  ruleId: string;
  cfrPart: string;
  cfrSection: string;
  title: string;
  description: string;
  requiredFields: string[];
  checkType: string;
  severity: string;
  citation: string;
  effectiveDate?: string;
  regulatoryPack: string;
  version: number;
}

export const PART_145_RULES: RulePackEntry[] = [
  {
    ruleId: '145.219-a-recordkeeping',
    cfrPart: '145',
    cfrSection: '145.219',
    title: 'Repair Station Work Record',
    description: 'A certificated repair station must maintain records of each article (airframe, powerplant, propeller, appliance) maintained, including a description of work performed, date of completion, and signature of authorized personnel.',
    requiredFields: ['workPerformed', 'entryDate', 'signerName', 'signerCertNumber'],
    checkType: 'required_field',
    severity: 'critical',
    citation: '14 CFR §145.219(a)',
    regulatoryPack: 'part145',
    version: 1,
  },
  {
    ruleId: '145.219-b-work-order',
    cfrPart: '145',
    cfrSection: '145.219',
    title: 'Work Order Documentation',
    description: 'Repair station must maintain a record of each article received for maintenance including customer identity, work requested, article identification, and work performed.',
    requiredFields: ['workPerformed'],
    checkType: 'record_content',
    severity: 'major',
    citation: '14 CFR §145.219(b)',
    regulatoryPack: 'part145',
    version: 1,
  },
  {
    ruleId: '145.201-a-rts-privileges',
    cfrPart: '145',
    cfrSection: '145.201',
    title: 'Return to Service — Privileges',
    description: 'Work performed by a repair station must be approved for return to service by authorized personnel as defined in the station\'s operations specifications and capability list.',
    requiredFields: ['hasReturnToService', 'signerName', 'signerCertNumber'],
    checkType: 'signoff_completeness',
    severity: 'critical',
    citation: '14 CFR §145.201(a)',
    regulatoryPack: 'part145',
    version: 1,
  },
  {
    ruleId: '145.163-training-records',
    cfrPart: '145',
    cfrSection: '145.163',
    title: 'Training Requirements Documentation',
    description: 'The repair station must ensure maintenance personnel are trained and the training is documented. Training records must be maintained.',
    requiredFields: [],
    checkType: 'record_content',
    severity: 'major',
    citation: '14 CFR §145.163',
    regulatoryPack: 'part145',
    version: 1,
  },
  {
    ruleId: '145.221-sdr-reporting',
    cfrPart: '145',
    cfrSection: '145.221',
    title: 'Service Difficulty Report',
    description: 'Repair stations must report failures, malfunctions, and defects per SDR requirements within 96 hours of discovery.',
    requiredFields: [],
    checkType: 'record_content',
    severity: 'major',
    citation: '14 CFR §145.221',
    regulatoryPack: 'part145',
    version: 1,
  },
];

export const PART_121_RULES: RulePackEntry[] = [
  {
    ruleId: '121.709-record-requirements',
    cfrPart: '121',
    cfrSection: '121.709',
    title: 'Maintenance Record Requirements',
    description: 'Certificate holder must keep records of maintenance, preventive maintenance, and alteration required by 14 CFR Part 43, including total time in service, time since last overhaul, and current inspection status.',
    requiredFields: ['workPerformed', 'entryDate', 'totalTimeAtEntry'],
    checkType: 'required_field',
    severity: 'critical',
    citation: '14 CFR §121.709',
    regulatoryPack: 'part121',
    version: 1,
  },
  {
    ruleId: '121.380a-maintenance-log',
    cfrPart: '121',
    cfrSection: '121.380a',
    title: 'Maintenance Log Requirements',
    description: 'The certificate holder shall keep a maintenance log that includes the name and certificate number of the person performing maintenance and the type of work performed.',
    requiredFields: ['workPerformed', 'signerName', 'signerCertNumber', 'entryDate'],
    checkType: 'required_field',
    severity: 'critical',
    citation: '14 CFR §121.380a',
    regulatoryPack: 'part121',
    version: 1,
  },
  {
    ruleId: '121.707-ad-compliance',
    cfrPart: '121',
    cfrSection: '121.707',
    title: 'AD Compliance Records',
    description: 'Certificate holder must maintain current records of compliance with applicable airworthiness directives.',
    requiredFields: ['adSbReferences'],
    checkType: 'record_content',
    severity: 'critical',
    citation: '14 CFR §121.707',
    regulatoryPack: 'part121',
    version: 1,
  },
  {
    ruleId: '121.368-inspection-program',
    cfrPart: '121',
    cfrSection: '121.368',
    title: 'Continuous Airworthiness Maintenance Program Inspections',
    description: 'Each certificate holder must have an inspection program and maintain records of each inspection required by the program.',
    requiredFields: ['entryType', 'entryDate', 'signerCertNumber'],
    checkType: 'signoff_completeness',
    severity: 'critical',
    citation: '14 CFR §121.368',
    regulatoryPack: 'part121',
    version: 1,
  },
];

export const PART_135_RULES: RulePackEntry[] = [
  {
    ruleId: '135.439-record-requirements',
    cfrPart: '135',
    cfrSection: '135.439',
    title: 'Maintenance Record Requirements',
    description: 'Each certificate holder must keep records containing a description of work performed, the date of completion, and the signature of the person approving the aircraft for return to service.',
    requiredFields: ['workPerformed', 'entryDate', 'signerName', 'hasReturnToService'],
    checkType: 'required_field',
    severity: 'critical',
    citation: '14 CFR §135.439',
    regulatoryPack: 'part135',
    version: 1,
  },
  {
    ruleId: '135.421-inspection-program',
    cfrPart: '135',
    cfrSection: '135.421',
    title: 'Additional Maintenance Requirements',
    description: 'Each certificate holder who operates a multiengine aircraft must comply with maintenance program requirements and keep records of compliance.',
    requiredFields: ['workPerformed', 'entryDate', 'signerCertNumber'],
    checkType: 'signoff_completeness',
    severity: 'critical',
    citation: '14 CFR §135.421',
    regulatoryPack: 'part135',
    version: 1,
  },
  {
    ruleId: '135.411-a1-ad-compliance',
    cfrPart: '135',
    cfrSection: '135.411',
    title: 'AD Compliance Records',
    description: 'Certificate holder must maintain current records of compliance status for all applicable airworthiness directives.',
    requiredFields: ['adSbReferences'],
    checkType: 'record_content',
    severity: 'critical',
    citation: '14 CFR §135.411(a)(1)',
    regulatoryPack: 'part135',
    version: 1,
  },
];

export const ALL_RULE_PACKS: Record<string, RulePackEntry[]> = {
  part145: PART_145_RULES,
  part121: PART_121_RULES,
  part135: PART_135_RULES,
};

export const RULE_PACK_LABELS: Record<string, string> = {
  part43: '14 CFR Part 43 — Maintenance Records',
  part91: '14 CFR Part 91 — Owner/Operator Records',
  part145: '14 CFR Part 145 — Repair Station Records',
  part121: '14 CFR Part 121 — Operator Maintenance Records',
  part135: '14 CFR Part 135 — Commuter/On-Demand Records',
};
