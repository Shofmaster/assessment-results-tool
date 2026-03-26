import type { AuditAgent } from '../types/auditSimulation';
import type { KnownReferenceDocType } from '../services/documentTypeResolver';

export type AuditorCoverageAgentId = Exclude<AuditAgent['id'], 'audit-host'>;

export interface AuditorDocumentRequirementSet {
  coreShared: KnownReferenceDocType[];
  requiredSpecific: KnownReferenceDocType[];
  optionalSupporting: KnownReferenceDocType[];
}

export const DOC_TYPE_LABELS: Record<KnownReferenceDocType, string> = {
  // ── Core aviation maintenance ─────────────────────────────────────────
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
  'hazmat-manual': 'Hazmat / Dangerous Goods Manual',
  'tool-calibration': 'Tool Calibration Manual',
  'isbao-standards': 'IS-BAO Standards',
  // ── Supply chain & special processes ─────────────────────────────────
  'supplier-quality-plan': 'Supplier Quality Assurance Plan (SQAP / ASL)',
  'counterfeit-parts-procedure': 'Counterfeit / Suspect Unapproved Parts Procedure',
  'special-process-procedure': 'Special Process Procedure (Welding / NDT / Heat Treat / Plating)',
  'process-control-plan': 'Process Control Plan',
  // ── Defense & airworthiness ───────────────────────────────────────────
  'quality-management-plan': 'Quality Management Plan (AS9100 QMP)',
  'first-article-inspection': 'First Article Inspection Report (FAIR / AS9102)',
  'certification-plan': 'Certification Plan / Type Certification Basis',
  'ica-document': 'Instructions for Continued Airworthiness (ICA)',
  // ── Software & hardware assurance ─────────────────────────────────────
  'psac': 'Plan for Software Aspects of Certification (PSAC)',
  'software-lifecycle-data': 'Software Lifecycle Plans (SDP / SVP / SCMP / SQAP)',
  'phac': 'Plan for Hardware Aspects of Certification (PHAC)',
  'hardware-design-records': 'Hardware Design Lifecycle Records (HAP / HAD / HVP)',
  // ── Systems safety & environmental testing ────────────────────────────
  'system-safety-plan': 'System Safety Program Plan (SSPP / FHA / PSSA / SSA)',
  'hazard-analysis': 'Hazard Analysis Records (FTA / FMEA / FMECA)',
  'qualification-test-plan': 'Environmental Qualification Test Plan (DO-160G / MIL-STD-810H)',
  'qualification-test-report': 'Qualification Test Report / Test Data Package',
  // ── Space, cyber, UAS, lab, AM ────────────────────────────────────────
  'space-quality-plan': 'Space Vehicle Quality Plan (SQAP / ECSS / MSFC)',
  'cybersecurity-plan': 'Cybersecurity Management Plan / System Security Plan (SSP)',
  'conops-document': 'Concept of Operations (ConOps)',
  'calibration-procedures': 'Calibration Procedures Manual / Scope of Accreditation',
  'uncertainty-budget': 'Measurement Uncertainty Budget',
  'am-process-specification': 'Additive Manufacturing Process Specification / Build Traveler',
  'powder-qualification': 'AM Powder Qualification Records / Lot Certifications',
  // ── Catch-all ──────────────────────────────────────────────────────────
  other: 'Other Reference',
};

export const AUDITOR_DOCUMENT_REQUIREMENTS: Record<AuditorCoverageAgentId, AuditorDocumentRequirementSet> = {
  'faa-inspector': {
    coreShared: ['part-145-manual', 'gmm', 'qcm', 'training-program'],
    requiredSpecific: ['ops-specs', 'ipm', 'tool-calibration'],
    optionalSupporting: ['mel', 'hazmat-manual', 'part-121-manual', 'part-135-manual'],
  },
  'nasa-auditor': {
    coreShared: ['qcm', 'training-program', 'sms-manual'],
    requiredSpecific: ['other'],
    optionalSupporting: ['gmm', 'ipm', 'tool-calibration'],
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
  // ── Wave 1 ──
  'supply-chain-auditor': {
    coreShared: ['qcm', 'training-program', 'gmm'],
    requiredSpecific: ['supplier-quality-plan', 'counterfeit-parts-procedure'],
    optionalSupporting: ['tool-calibration', 'ipm', 'part-145-manual'],
  },
  'nadcap-auditor': {
    coreShared: ['qcm', 'training-program', 'ipm'],
    requiredSpecific: ['special-process-procedure', 'process-control-plan'],
    optionalSupporting: ['gmm', 'tool-calibration', 'quality-management-plan'],
  },
  'defense-auditor': {
    coreShared: ['qcm', 'training-program', 'gmm'],
    requiredSpecific: ['quality-management-plan', 'first-article-inspection'],
    optionalSupporting: ['tool-calibration', 'ops-specs', 'supplier-quality-plan'],
  },
  'airworthiness-auditor': {
    coreShared: ['qcm', 'gmm', 'training-program'],
    requiredSpecific: ['certification-plan', 'ica-document'],
    optionalSupporting: ['ops-specs', 'part-145-manual', 'ipm'],
  },
  // ── Wave 2 ──
  'do178c-auditor': {
    coreShared: ['qcm', 'training-program'],
    requiredSpecific: ['psac', 'software-lifecycle-data'],
    optionalSupporting: ['sms-manual', 'system-safety-plan'],
  },
  'do254-auditor': {
    coreShared: ['qcm', 'training-program'],
    requiredSpecific: ['phac', 'hardware-design-records'],
    optionalSupporting: ['sms-manual', 'system-safety-plan'],
  },
  'systems-safety-auditor': {
    coreShared: ['qcm', 'sms-manual', 'training-program'],
    requiredSpecific: ['system-safety-plan', 'hazard-analysis'],
    optionalSupporting: ['gmm', 'psac', 'phac'],
  },
  'do160-auditor': {
    coreShared: ['qcm', 'training-program', 'tool-calibration'],
    requiredSpecific: ['qualification-test-plan', 'qualification-test-report'],
    optionalSupporting: ['ipm', 'certification-plan'],
  },
  // ── Wave 3 ──
  'space-systems-auditor': {
    coreShared: ['qcm', 'training-program', 'sms-manual'],
    requiredSpecific: ['space-quality-plan', 'system-safety-plan'],
    optionalSupporting: ['tool-calibration', 'hazard-analysis', 'qualification-test-report'],
  },
  'cybersecurity-auditor': {
    coreShared: ['qcm', 'training-program'],
    requiredSpecific: ['cybersecurity-plan'],
    optionalSupporting: ['sms-manual', 'ops-specs', 'system-safety-plan'],
  },
  'uas-evtol-auditor': {
    coreShared: ['qcm', 'training-program', 'sms-manual'],
    requiredSpecific: ['conops-document', 'certification-plan'],
    optionalSupporting: ['ops-specs', 'gmm', 'system-safety-plan'],
  },
  'laboratory-auditor': {
    coreShared: ['qcm', 'training-program', 'tool-calibration'],
    requiredSpecific: ['calibration-procedures', 'uncertainty-budget'],
    optionalSupporting: ['ipm', 'quality-management-plan'],
  },
  'additive-mfg-auditor': {
    coreShared: ['qcm', 'training-program'],
    requiredSpecific: ['am-process-specification', 'powder-qualification'],
    optionalSupporting: ['tool-calibration', 'gmm', 'qualification-test-report'],
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
