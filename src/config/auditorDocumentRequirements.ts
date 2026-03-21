import type { AuditAgent } from '../types/auditSimulation';
import type { KnownReferenceDocType } from '../services/documentTypeResolver';

export type AuditorCoverageAgentId = Exclude<AuditAgent['id'], 'audit-host'>;

export interface AuditorDocumentRequirementSet {
  coreShared: KnownReferenceDocType[];
  requiredSpecific: KnownReferenceDocType[];
  optionalSupporting: KnownReferenceDocType[];
}

export const DOC_TYPE_LABELS: Record<KnownReferenceDocType, string> = {
  'part-145-manual': 'Part 145 Repair Station Manual',
  'gmm': 'General Maintenance Manual (GMM)',
  'part-135-manual': 'Part 135 Operations Manual',
  'ops-specs': 'Operations Specifications',
  'mel': 'Minimum Equipment List',
  'training-program': 'Training Program Manual',
  'qcm': 'Quality Control Manual',
  'sms-manual': 'SMS Manual',
  'ipm': 'Inspection Procedures Manual',
  'part-121-manual': 'Part 121 Operations Manual',
  'part-91-manual': 'Part 91 Operations Manual',
  'hazmat-manual': 'Hazmat Manual',
  'tool-calibration': 'Tool Calibration Manual',
  'isbao-standards': 'IS-BAO Standards',
  other: 'Other Reference',
};

export const AUDITOR_DOCUMENT_REQUIREMENTS: Record<AuditorCoverageAgentId, AuditorDocumentRequirementSet> = {
  'faa-inspector': {
    coreShared: ['part-145-manual', 'gmm', 'qcm', 'training-program'],
    requiredSpecific: ['ops-specs', 'ipm', 'tool-calibration'],
    optionalSupporting: ['mel', 'hazmat-manual', 'part-121-manual', 'part-135-manual'],
  },
  'shop-owner': {
    coreShared: ['part-145-manual', 'gmm', 'qcm'],
    requiredSpecific: ['training-program'],
    optionalSupporting: ['sms-manual', 'tool-calibration', 'ipm'],
  },
  'dom-maintenance-manager': {
    coreShared: ['part-145-manual', 'gmm', 'qcm'],
    requiredSpecific: ['ipm', 'tool-calibration'],
    optionalSupporting: ['training-program', 'mel', 'ops-specs'],
  },
  'chief-inspector-quality-manager': {
    coreShared: ['part-145-manual', 'qcm', 'gmm'],
    requiredSpecific: ['ipm', 'training-program'],
    optionalSupporting: ['ops-specs', 'tool-calibration', 'mel'],
  },
  'entity-safety-manager': {
    coreShared: ['sms-manual', 'training-program', 'qcm'],
    requiredSpecific: ['hazmat-manual'],
    optionalSupporting: ['gmm', 'isbao-standards', 'ops-specs'],
  },
  'general-manager': {
    coreShared: ['part-145-manual', 'qcm', 'sms-manual'],
    requiredSpecific: ['training-program'],
    optionalSupporting: ['ops-specs', 'gmm'],
  },
  'isbao-auditor': {
    coreShared: ['isbao-standards', 'sms-manual', 'training-program'],
    requiredSpecific: ['part-91-manual'],
    optionalSupporting: ['gmm', 'qcm', 'ops-specs'],
  },
  'easa-inspector': {
    coreShared: ['gmm', 'qcm', 'training-program'],
    requiredSpecific: ['part-145-manual', 'ipm'],
    optionalSupporting: ['ops-specs', 'mel', 'sms-manual'],
  },
  'as9100-auditor': {
    coreShared: ['qcm', 'training-program', 'gmm'],
    requiredSpecific: ['ipm', 'tool-calibration'],
    optionalSupporting: ['sms-manual', 'ops-specs', 'part-145-manual'],
  },
  'sms-consultant': {
    coreShared: ['sms-manual', 'training-program', 'qcm'],
    requiredSpecific: ['isbao-standards'],
    optionalSupporting: ['gmm', 'hazmat-manual', 'ops-specs'],
  },
  'safety-auditor': {
    coreShared: ['sms-manual', 'training-program', 'ops-specs'],
    requiredSpecific: ['mel'],
    optionalSupporting: ['qcm', 'gmm', 'part-135-manual', 'part-91-manual'],
  },
  'audit-intelligence-analyst': {
    coreShared: ['qcm', 'sms-manual', 'training-program'],
    requiredSpecific: ['other'],
    optionalSupporting: ['part-145-manual', 'gmm', 'isbao-standards'],
  },
  'public-use-auditor': {
    coreShared: ['sms-manual', 'training-program', 'other'],
    requiredSpecific: ['part-91-manual'],
    optionalSupporting: ['ops-specs', 'gmm', 'qcm'],
  },
};

export const CORE_SHARED_DOC_TYPES: KnownReferenceDocType[] = [
  'part-145-manual',
  'gmm',
  'qcm',
  'training-program',
  'sms-manual',
];

export const REGULATORY_BASELINE_DOC_TYPES: KnownReferenceDocType[] = [
  'ops-specs',
  'mel',
  'part-121-manual',
  'part-135-manual',
  'part-91-manual',
  'isbao-standards',
];
