/** Library tabs a batch can be auto-sorted into (no Library tab exists for wiring diagrams). */
export type SortablePublicationType = 'maintenance_manual' | 'parts_catalog' | 'logbook_scan';

interface PublicationTypeRule {
  pattern: RegExp;
  type: SortablePublicationType;
}

/**
 * Ordered rules mapping a normalized name/text to a technical-publication bucket.
 * Shared so the same patterns classify by filename (path) and by a content peek.
 * Order matters: parts catalogs (IPC/IPL) before logbooks before maintenance manuals.
 */
export const PUBLICATION_TYPE_RULES: PublicationTypeRule[] = [
  { pattern: /\b(ipc|ipl|illustrated parts|parts? (catalog(ue)?s?|lists?|manuals?|books?))\b/, type: 'parts_catalog' },
  { pattern: /\b(log ?books?|(airframe|engine|propeller|prop|avionics) logs?)\b/, type: 'logbook_scan' },
  { pattern: /\b(amm|gmm|cmm|srm|mm|(maintenance|overhaul|service|repair) manuals?|structural repair)\b/, type: 'maintenance_manual' },
];

/** Normalize a path for matching: drop extension, treat separators as spaces ("208b_ipc.pdf" → "208b ipc"). */
function normalizePathForMatch(path: string): string {
  return path.toLowerCase().replace(/\.[^/.]+$/, '').replace(/[-_./\\]+/g, ' ');
}

/**
 * Classify a manual by its file name/path so a mixed batch (e.g. registered from a
 * customer manuals server) lands in the right Library bucket: IPC/IPL → parts catalog,
 * logbook scans → logbook, MM/GMM/AMM/CMM/SRM → maintenance manual. Returns undefined
 * when the path gives no signal — callers fall back to the tab the batch came from.
 */
export function inferPublicationTypeFromPath(path: string): SortablePublicationType | undefined {
  const n = normalizePathForMatch(path);
  for (const rule of PUBLICATION_TYPE_RULES) {
    if (rule.pattern.test(n)) return rule.type;
  }
  return undefined;
}

/**
 * Same buckets as {@link inferPublicationTypeFromPath} but matched against a snippet of
 * extracted document text (a "content peek"). Used for files whose name gives no signal.
 */
export function inferPublicationTypeFromText(text: string): SortablePublicationType | undefined {
  const n = text.toLowerCase().replace(/\s+/g, ' ');
  for (const rule of PUBLICATION_TYPE_RULES) {
    if (rule.pattern.test(n)) return rule.type;
  }
  return undefined;
}

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

/** Human-readable labels for the fine-grained reference doc types (review UI dropdown). */
export const KNOWN_REFERENCE_DOC_TYPE_LABELS: Record<KnownReferenceDocType, string> = {
  'part-145-manual': 'Part 145 Repair Station Manual',
  'gmm': 'General Maintenance Manual (GMM)',
  'part-135-manual': 'Part 135 Manual',
  'ops-specs': 'Operations Specifications',
  'mel': 'Minimum Equipment List (MEL)',
  'training-program': 'Training Program',
  'qcm': 'Quality Control Manual (QCM)',
  'sms-manual': 'SMS Manual',
  'ipm': 'Inspection Procedures Manual (IPM)',
  'part-121-manual': 'Part 121 Manual',
  'part-91-manual': 'Part 91 Manual',
  'hazmat-manual': 'HazMat / Dangerous Goods Manual',
  'tool-calibration': 'Tool Control / Calibration Manual',
  'isbao-standards': 'IS-BAO Standards',
  'supplier-quality-plan': 'Supplier Quality Assurance Plan',
  'counterfeit-parts-procedure': 'Counterfeit / Unapproved Parts Procedure',
  'special-process-procedure': 'Special Process Procedure',
  'process-control-plan': 'Process Control Plan',
  'quality-management-plan': 'Quality Management Plan (AS9100/9110)',
  'first-article-inspection': 'First Article Inspection Report (FAIR)',
  'certification-plan': 'Type Certification Plan',
  'ica-document': 'Instructions for Continued Airworthiness (ICA)',
  'psac': 'Plan for Software Aspects of Certification (PSAC)',
  'software-lifecycle-data': 'Software Lifecycle Data',
  'phac': 'Plan for Hardware Aspects of Certification (PHAC)',
  'hardware-design-records': 'Hardware Design Lifecycle Records',
  'system-safety-plan': 'System Safety Program Plan',
  'hazard-analysis': 'Hazard Analysis (FTA/FMEA/FMECA)',
  'qualification-test-plan': 'Qualification Test Plan',
  'qualification-test-report': 'Qualification Test Report',
  'space-quality-plan': 'Space / Launch Vehicle Quality Plan',
  'cybersecurity-plan': 'Cybersecurity Management Plan',
  'conops-document': 'Concept of Operations (ConOps)',
  'calibration-procedures': 'Calibration Procedures Manual',
  'uncertainty-budget': 'Measurement Uncertainty Budget',
  'am-process-specification': 'Additive Manufacturing Process Spec',
  'powder-qualification': 'AM Powder Qualification Records',
  'other': 'Other / Unclassified',
};

export function getKnownReferenceDocTypeLabel(t?: string): string {
  if (!t) return 'Other / Unclassified';
  return KNOWN_REFERENCE_DOC_TYPE_LABELS[t as KnownReferenceDocType] ?? t.replace(/-/g, ' ');
}

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

interface DocTypeRule {
  pattern: RegExp;
  type: KnownReferenceDocType;
}

/**
 * Ordered rules mapping a normalized name/text to a fine-grained reference document type.
 * Shared so the same patterns drive both filename classification ({@link inferDocType})
 * and a content peek ({@link inferDocTypeFromText}). Order is significant — the first
 * matching rule wins, so broader/higher-priority types are listed first.
 */
export const DOC_TYPE_RULES: DocTypeRule[] = [
  // ── Core aviation maintenance ─────────────────────────────────────────
  { pattern: /\b(145|part\s*145|repair\s*station|rsm)\b/, type: 'part-145-manual' },
  { pattern: /\b(gmm|general\s*maintenance)\b/, type: 'gmm' },
  { pattern: /\b(qcm|quality\s*control|qc\s*manual)\b/, type: 'qcm' },
  { pattern: /\b(sms|safety\s*management)\b/, type: 'sms-manual' },
  { pattern: /\b(training|training\s*program)\b/, type: 'training-program' },
  { pattern: /\b(ipm|inspection\s*procedure)\b/, type: 'ipm' },
  { pattern: /\b(isbao|is-bao)\b/, type: 'isbao-standards' },
  { pattern: /\b(135|part\s*135)\b/, type: 'part-135-manual' },
  { pattern: /\b(121|part\s*121)\b/, type: 'part-121-manual' },
  { pattern: /\b(91|part\s*91)\b/, type: 'part-91-manual' },
  { pattern: /\b(mel|mnel|minimum\s*equipment)\b/, type: 'mel' },
  { pattern: /\b(hazmat|dangerous\s*goods)\b/, type: 'hazmat-manual' },
  { pattern: /\b(calibration|tool\s*control|cal\s*manual)\b/, type: 'tool-calibration' },
  { pattern: /\b(ops\s*spec|operations\s*spec)\b/, type: 'ops-specs' },
  // ── Supply chain & special processes ─────────────────────────────────
  { pattern: /\b(supplier\s*quality|sqap|approved\s*supplier|asl)\b/, type: 'supplier-quality-plan' },
  { pattern: /\b(counterfeit|suspect.*unapproved|cup\s*parts|as5553|as6174)\b/, type: 'counterfeit-parts-procedure' },
  { pattern: /\b(special\s*process|weld.*procedure|ndt.*procedure|plating.*procedure|heat\s*treat.*procedure)\b/, type: 'special-process-procedure' },
  { pattern: /\b(process\s*control\s*plan|pcp|flow\s*chart.*process)\b/, type: 'process-control-plan' },
  // ── Defense & airworthiness ───────────────────────────────────────────
  { pattern: /\b(quality\s*management\s*plan|qmp|as9100.*plan|as9110.*plan)\b/, type: 'quality-management-plan' },
  { pattern: /\b(first\s*article|fair|as9102|fai\s*report)\b/, type: 'first-article-inspection' },
  { pattern: /\b(certification\s*plan|type\s*cert|tc\s*basis|means\s*of\s*compliance|moc)\b/, type: 'certification-plan' },
  { pattern: /\b(ica|instructions.*continued\s*airworthiness|continued\s*airworthiness)\b/, type: 'ica-document' },
  // ── Software & hardware assurance ─────────────────────────────────────
  { pattern: /\b(psac|plan.*software.*certification|software.*aspects.*certification)\b/, type: 'psac' },
  { pattern: /\b(sdp|svp|scmp|sqap|software.*plan|software.*lifecycle)\b/, type: 'software-lifecycle-data' },
  { pattern: /\b(phac|plan.*hardware.*certification|hardware.*aspects.*certification)\b/, type: 'phac' },
  { pattern: /\b(hardware.*design.*record|hap|had|hvp|hardware.*plan)\b/, type: 'hardware-design-records' },
  // ── Systems safety & environmental testing ────────────────────────────
  { pattern: /\b(sspp|system\s*safety\s*plan|fha|pssa|ssa|safety\s*assessment)\b/, type: 'system-safety-plan' },
  { pattern: /\b(fta|fmea|fmeca|hazard\s*analysis|fault\s*tree)\b/, type: 'hazard-analysis' },
  { pattern: /\b(qual.*test.*plan|qtc|do-?160.*plan|mil.*std.*810.*plan|test\s*plan.*env)\b/, type: 'qualification-test-plan' },
  { pattern: /\b(qual.*test.*report|qtr|do-?160.*report|mil.*std.*810.*report|test\s*report)\b/, type: 'qualification-test-report' },
  // ── Space, cyber, UAS, lab, AM ────────────────────────────────────────
  { pattern: /\b(space.*quality|sqap.*space|msfc|ecss|launch.*quality)\b/, type: 'space-quality-plan' },
  { pattern: /\b(cyber.*plan|ssp|cmmc.*plan|nist.*plan|security.*plan)\b/, type: 'cybersecurity-plan' },
  { pattern: /\b(conops|concept\s*of\s*operations|operational\s*concept)\b/, type: 'conops-document' },
  { pattern: /\b(calibration\s*procedure|scope.*accreditation|17025)\b/, type: 'calibration-procedures' },
  { pattern: /\b(uncertainty\s*budget|measurement\s*uncertainty|mbu)\b/, type: 'uncertainty-budget' },
  { pattern: /\b(am\s*process\s*spec|additive.*spec|build\s*traveler|lpbf.*spec|ded.*spec)\b/, type: 'am-process-specification' },
  { pattern: /\b(powder\s*qual|powder\s*cert|powder\s*lot|am\s*powder)\b/, type: 'powder-qualification' },
];

/**
 * Map the upload category hints (`regulatory`/`sms`) onto the rules they reinforce, so a
 * known category can stand in for a missing name signal — preserving the original
 * precedence of `inferDocType` (regulatory → part-145-manual, sms → sms-manual).
 */
const CATEGORY_HINT_FOR_DOC_TYPE: Partial<Record<KnownReferenceDocType, string>> = {
  'part-145-manual': 'regulatory',
  'sms-manual': 'sms',
};

export function inferDocType(name: string, category?: string): KnownReferenceDocType {
  const n = name.toLowerCase();
  for (const rule of DOC_TYPE_RULES) {
    if (rule.pattern.test(n)) return rule.type;
    const hint = CATEGORY_HINT_FOR_DOC_TYPE[rule.type];
    if (hint && category === hint) return rule.type;
  }
  return 'other';
}

/**
 * Classify a reference document by a snippet of its extracted text (a "content peek").
 * Returns undefined when the text gives no signal — distinct from `inferDocType`'s
 * `'other'` so callers can tell "scanned/ambiguous" apart from a positive match.
 */
export function inferDocTypeFromText(text: string): KnownReferenceDocType | undefined {
  const n = text.toLowerCase().replace(/\s+/g, ' ');
  for (const rule of DOC_TYPE_RULES) {
    if (rule.pattern.test(n)) return rule.type;
  }
  return undefined;
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
