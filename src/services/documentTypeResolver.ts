export const KNOWN_REFERENCE_DOC_TYPES = [
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
  if (/\b(145|part\s*145|repair\s*station|rsm)\b/.test(n) || category === 'regulatory') return 'part-145-manual';
  if (/\b(gmm|general\s*maintenance)\b/.test(n)) return 'gmm';
  if (/\b(qcm|quality\s*control|qc\s*manual)\b/.test(n)) return 'qcm';
  if (/\b(sms|safety\s*management)\b/.test(n) || category === 'sms') return 'sms-manual';
  if (/\b(training|training\s*program)\b/.test(n)) return 'training-program';
  if (/\b(ipm|inspection\s*procedure)\b/.test(n)) return 'ipm';
  if (/\b(calibration|tool\s*control)\b/.test(n)) return 'tool-calibration';
  if (/\b(isbao|is-bao)\b/.test(n)) return 'isbao-standards';
  if (/\b(135|part\s*135|ops)\b/.test(n)) return 'part-135-manual';
  if (/\b(121|part\s*121)\b/.test(n)) return 'part-121-manual';
  if (/\b(91|part\s*91)\b/.test(n)) return 'part-91-manual';
  if (/\b(mel|mnel|minimum\s*equipment)\b/.test(n)) return 'mel';
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
  if (docType === 'sms-manual') return 'sms';
  if (docType === 'isbao-standards' || docType === 'part-121-manual' || docType === 'part-135-manual' || docType === 'part-91-manual') {
    return 'regulatory';
  }
  return 'reference';
}
