export const KNOWN_REFERENCE_DOC_TYPES = [
  // ── Core aviation maintenance ─────────────────────────────────────────
  'part-145-manual',
  'gmm',
  'part-135-manual',
  'ops-specs',
  'mel',
  'training-program',
  'qcm',
  'sms-manual',
  'ipm',
  'part-121-manual',
  'part-91-manual',
  'hazmat-manual',
  'tool-calibration',
  'isbao-standards',
  // ── Supply chain & special processes (Wave 1) ─────────────────────────
  'supplier-quality-plan',       // Supplier Quality Assurance Plan / ASL
  'counterfeit-parts-procedure', // Counterfeit / Suspect Unapproved Parts Procedure
  'special-process-procedure',   // Special Process Procedure (welding, NDT, heat treat, plating)
  'process-control-plan',        // Process Control Plan / Flow Chart
  // ── Defense & airworthiness (Wave 1) ──────────────────────────────────
  'quality-management-plan',     // AS9100/AS9110 Quality Management Plan
  'first-article-inspection',    // First Article Inspection Report (FAIR / AS9102)
  'certification-plan',          // Type Certification Plan / Certification Basis
  'ica-document',                // Instructions for Continued Airworthiness (ICA)
  // ── Software & hardware assurance (Wave 2) ────────────────────────────
  'psac',                        // Plan for Software Aspects of Certification
  'software-lifecycle-data',     // Software Plans & Lifecycle Data (SDP/SVP/SCMP/SQAP)
  'phac',                        // Plan for Hardware Aspects of Certification
  'hardware-design-records',     // Hardware Design Lifecycle Records (HAP/HAD/HVP)
  // ── Systems safety & environmental testing (Wave 2) ───────────────────
  'system-safety-plan',          // System Safety Program Plan (SSPP / FHA / PSSA / SSA)
  'hazard-analysis',             // Hazard Analysis Records (FTA / FMEA / FMECA)
  'qualification-test-plan',     // Environmental Qualification Test Plan (DO-160G / MIL-STD-810H)
  'qualification-test-report',   // Qualification Test Report / Test Data Package
  // ── Space, cyber, UAS, lab, and AM (Wave 3) ───────────────────────────
  'space-quality-plan',          // Space Vehicle / Launch Vehicle Quality Plan
  'cybersecurity-plan',          // Cybersecurity Management Plan / System Security Plan (SSP)
  'conops-document',             // Concept of Operations (ConOps) Document
  'calibration-procedures',      // Calibration Procedures Manual / Scope of Accreditation
  'uncertainty-budget',          // Measurement Uncertainty Budget
  'am-process-specification',    // Additive Manufacturing Process Specification / Build Traveler
  'powder-qualification',        // AM Powder Qualification Records / Lot Certifications
  // ── Catch-all ──────────────────────────────────────────────────────────
  'other',
] as const;

export type KnownReferenceDocType = (typeof KNOWN_REFERENCE_DOC_TYPES)[number];

export type UploadCategory = 'regulatory' | 'entity' | 'sms' | 'reference' | 'uploaded';

export interface ResolvableDocument {
  id: string;
  name: string;
  category?: string;
  documentType?: string;
}

export interface DocumentTypeResolution {
  docType: KnownReferenceDocType;
  ambiguous: boolean;
}

export function inferDocType(name: string, category?: string): KnownReferenceDocType {
  const n = name.toLowerCase();
  // ── Core aviation maintenance ─────────────────────────────────────────
  if (/\b(145|part\s*145|repair\s*station|rsm)\b/.test(n) || category === 'regulatory') return 'part-145-manual';
  if (/\b(gmm|general\s*maintenance)\b/.test(n)) return 'gmm';
  if (/\b(qcm|quality\s*control|qc\s*manual)\b/.test(n)) return 'qcm';
  if (/\b(sms|safety\s*management)\b/.test(n) || category === 'sms') return 'sms-manual';
  if (/\b(training|training\s*program)\b/.test(n)) return 'training-program';
  if (/\b(ipm|inspection\s*procedure)\b/.test(n)) return 'ipm';
  if (/\b(isbao|is-bao)\b/.test(n)) return 'isbao-standards';
  if (/\b(135|part\s*135)\b/.test(n)) return 'part-135-manual';
  if (/\b(121|part\s*121)\b/.test(n)) return 'part-121-manual';
  if (/\b(91|part\s*91)\b/.test(n)) return 'part-91-manual';
  if (/\b(mel|mnel|minimum\s*equipment)\b/.test(n)) return 'mel';
  if (/\b(hazmat|dangerous\s*goods)\b/.test(n)) return 'hazmat-manual';
  if (/\b(calibration|tool\s*control|cal\s*manual)\b/.test(n)) return 'tool-calibration';
  if (/\b(ops\s*spec|operations\s*spec)\b/.test(n)) return 'ops-specs';
  // ── Supply chain & special processes ─────────────────────────────────
  if (/\b(supplier\s*quality|sqap|approved\s*supplier|asl)\b/.test(n)) return 'supplier-quality-plan';
  if (/\b(counterfeit|suspect.*unapproved|cup\s*parts|as5553|as6174)\b/.test(n)) return 'counterfeit-parts-procedure';
  if (/\b(special\s*process|weld.*procedure|ndt.*procedure|plating.*procedure|heat\s*treat.*procedure)\b/.test(n)) return 'special-process-procedure';
  if (/\b(process\s*control\s*plan|pcp|flow\s*chart.*process)\b/.test(n)) return 'process-control-plan';
  // ── Defense & airworthiness ───────────────────────────────────────────
  if (/\b(quality\s*management\s*plan|qmp|as9100.*plan|as9110.*plan)\b/.test(n)) return 'quality-management-plan';
  if (/\b(first\s*article|fair|as9102|fai\s*report)\b/.test(n)) return 'first-article-inspection';
  if (/\b(certification\s*plan|type\s*cert|tc\s*basis|means\s*of\s*compliance|moc)\b/.test(n)) return 'certification-plan';
  if (/\b(ica|instructions.*continued\s*airworthiness|continued\s*airworthiness)\b/.test(n)) return 'ica-document';
  // ── Software & hardware assurance ─────────────────────────────────────
  if (/\b(psac|plan.*software.*certification|software.*aspects.*certification)\b/.test(n)) return 'psac';
  if (/\b(sdp|svp|scmp|sqap|software.*plan|software.*lifecycle)\b/.test(n)) return 'software-lifecycle-data';
  if (/\b(phac|plan.*hardware.*certification|hardware.*aspects.*certification)\b/.test(n)) return 'phac';
  if (/\b(hardware.*design.*record|hap|had|hvp|hardware.*plan)\b/.test(n)) return 'hardware-design-records';
  // ── Systems safety & environmental testing ────────────────────────────
  if (/\b(sspp|system\s*safety\s*plan|fha|pssa|ssa|safety\s*assessment)\b/.test(n)) return 'system-safety-plan';
  if (/\b(fta|fmea|fmeca|hazard\s*analysis|fault\s*tree)\b/.test(n)) return 'hazard-analysis';
  if (/\b(qual.*test.*plan|qtc|do-?160.*plan|mil.*std.*810.*plan|test\s*plan.*env)\b/.test(n)) return 'qualification-test-plan';
  if (/\b(qual.*test.*report|qtr|do-?160.*report|mil.*std.*810.*report|test\s*report)\b/.test(n)) return 'qualification-test-report';
  // ── Space, cyber, UAS, lab, AM ────────────────────────────────────────
  if (/\b(space.*quality|sqap.*space|msfc|ecss|launch.*quality)\b/.test(n)) return 'space-quality-plan';
  if (/\b(cyber.*plan|ssp|cmmc.*plan|nist.*plan|security.*plan)\b/.test(n)) return 'cybersecurity-plan';
  if (/\b(conops|concept\s*of\s*operations|operational\s*concept)\b/.test(n)) return 'conops-document';
  if (/\b(calibration\s*procedure|scope.*accreditation|17025)\b/.test(n)) return 'calibration-procedures';
  if (/\b(uncertainty\s*budget|measurement\s*uncertainty|mbu)\b/.test(n)) return 'uncertainty-budget';
  if (/\b(am\s*process\s*spec|additive.*spec|build\s*traveler|lpbf.*spec|ded.*spec)\b/.test(n)) return 'am-process-specification';
  if (/\b(powder\s*qual|powder\s*cert|powder\s*lot|am\s*powder)\b/.test(n)) return 'powder-qualification';
  return 'other';
}

export function resolveDocumentType(
  doc: ResolvableDocument,
  explicitOverrides?: Record<string, KnownReferenceDocType>
): DocumentTypeResolution {
  const overridden = explicitOverrides?.[doc.id];
  if (overridden) {
    return { docType: overridden, ambiguous: false };
  }

  const explicitType = doc.documentType;
  if (explicitType && KNOWN_REFERENCE_DOC_TYPES.includes(explicitType as KnownReferenceDocType)) {
    return {
      docType: explicitType as KnownReferenceDocType,
      ambiguous: explicitType === 'other',
    };
  }

  const inferred = inferDocType(doc.name, doc.category);
  return { docType: inferred, ambiguous: inferred === 'other' };
}

export function suggestUploadCategoryForDocType(docType: KnownReferenceDocType): UploadCategory {
  if (docType === 'sms-manual' || docType === 'system-safety-plan' || docType === 'hazard-analysis') return 'sms';
  if (
    docType === 'isbao-standards' ||
    docType === 'part-121-manual' || docType === 'part-135-manual' || docType === 'part-91-manual' ||
    docType === 'certification-plan' || docType === 'ica-document' ||
    docType === 'psac' || docType === 'phac' ||
    docType === 'cybersecurity-plan' || docType === 'conops-document' ||
    docType === 'space-quality-plan'
  ) {
    return 'regulatory';
  }
  return 'reference';
}
