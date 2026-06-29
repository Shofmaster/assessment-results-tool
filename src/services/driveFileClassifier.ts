/**
 * Unified classifier for files picked from Google Drive (or a customer manuals server)
 * before they are filed into the Company Library. Two-level result:
 *  - `publicationType` + `category` drive the routing bucket / Library tab.
 *  - `documentType` is the fine-grained reference type (full taxonomy) stored as
 *    document metadata so regulatory docs get a precise label, not just a tab.
 *
 * Classification proceeds filename-first; callers run a bounded content peek only for
 * files the name can't resolve (see `classifyByContent`). No bytes are persisted by this
 * module — peek text is read transiently upstream and discarded.
 */
import {
  inferPublicationTypeFromPath,
  inferPublicationTypeFromText,
  inferDocType,
  inferDocTypeFromText,
  type SortablePublicationType,
  type KnownReferenceDocType,
} from './documentTypeResolver';

export type ClassificationConfidence = 'high' | 'medium' | 'low';
export type ClassificationSignal = 'filename' | 'content' | 'fallback';

export interface LibraryClassification {
  /** Routing bucket — a document category string that drives the Library tab. */
  category: string;
  /** Technical-publication kind (manual / parts / logbook) that the bucket maps to. */
  publicationType: SortablePublicationType;
  /** Fine-grained reference type (full taxonomy); undefined when the name/text gave none. */
  documentType?: KnownReferenceDocType;
  confidence: ClassificationConfidence;
  signal: ClassificationSignal;
  /** Human-readable explanation of the match, surfaced in the review UI. */
  reason: string;
}

export const PUBLICATION_TYPE_TO_CATEGORY: Record<SortablePublicationType, string> = {
  maintenance_manual: 'maintenance_manual',
  parts_catalog: 'parts_catalog',
  logbook_scan: 'logbook_scan',
};

/**
 * Last path segment with the extension dropped and separators flattened to spaces
 * ("RSM_rev3.pdf" → "rsm rev3"), so the `\b`-anchored fine-grained rules match terms
 * that are glued to neighbours by `_`/`-`/`.` (all word characters under `\b`).
 */
function normalizedBaseName(path: string): string {
  const base = path.split(/[/\\]/).filter(Boolean).pop() ?? path;
  return base.replace(/\.[^/.]+$/, '').replace(/[-_./\\]+/g, ' ');
}

/**
 * Stage A — classify from the file name/path alone. `fallbackType` is the bucket the
 * batch was registered from (the active Library tab); used when the name gives no signal.
 * A result with `signal: 'fallback'` means the caller should attempt a content peek.
 */
export function classifyByName(
  path: string,
  fallbackType: SortablePublicationType,
): LibraryClassification {
  const pub = inferPublicationTypeFromPath(path);
  const doc = inferDocType(normalizedBaseName(path));
  const fineType = doc === 'other' ? undefined : doc;

  if (pub) {
    return {
      category: PUBLICATION_TYPE_TO_CATEGORY[pub],
      publicationType: pub,
      documentType: fineType,
      confidence: 'high',
      signal: 'filename',
      reason: `File name matched ${pub.replace(/_/g, ' ')}`,
    };
  }

  if (fineType) {
    // Recognized a regulatory/reference doc by name but no technical-pub bucket. Keep the
    // fine type and leave routing on the batch's bucket — the user can re-route in review.
    return {
      category: PUBLICATION_TYPE_TO_CATEGORY[fallbackType],
      publicationType: fallbackType,
      documentType: fineType,
      confidence: 'high',
      signal: 'filename',
      reason: `File name matched ${fineType.replace(/-/g, ' ')}`,
    };
  }

  return {
    category: PUBLICATION_TYPE_TO_CATEGORY[fallbackType],
    publicationType: fallbackType,
    documentType: undefined,
    confidence: 'low',
    signal: 'fallback',
    reason: 'No signal from file name — needs review',
  };
}

/**
 * Stage B — refine a `fallback` result using a snippet of extracted document text.
 * Returns `base` unchanged when the text yields nothing (e.g. a scanned page with no
 * text layer), so the file stays low-confidence for the review screen.
 */
export function classifyByContent(text: string, base: LibraryClassification): LibraryClassification {
  if (!text.trim()) return base;
  const pub = inferPublicationTypeFromText(text);
  const doc = inferDocTypeFromText(text);

  if (pub) {
    return {
      category: PUBLICATION_TYPE_TO_CATEGORY[pub],
      publicationType: pub,
      documentType: doc,
      confidence: 'medium',
      signal: 'content',
      reason: `Content matched ${pub.replace(/_/g, ' ')}`,
    };
  }

  if (doc) {
    return {
      ...base,
      documentType: doc,
      confidence: 'medium',
      signal: 'content',
      reason: `Content matched ${doc.replace(/-/g, ' ')}`,
    };
  }

  return base;
}

/** True when Stage A produced no usable signal and a content peek is worth attempting. */
export function needsContentPeek(c: LibraryClassification): boolean {
  return c.signal === 'fallback';
}
