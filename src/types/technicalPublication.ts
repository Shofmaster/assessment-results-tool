/** Publication kinds stored in `technicalPublications.publicationType`. */
export type PublicationType =
  | 'maintenance_manual'
  | 'parts_catalog'
  | 'wiring_diagram'
  | 'logbook_scan'
  | 'other';

export const PUBLICATION_TYPE_LABELS: Record<PublicationType, string> = {
  maintenance_manual: 'Maintenance manual',
  parts_catalog: 'Parts catalog (IPC)',
  wiring_diagram: 'Wiring diagram',
  logbook_scan: 'Logbook scan',
  other: 'Other',
};

export function getPublicationTypeLabel(t?: string): string {
  if (!t) return 'Other';
  return PUBLICATION_TYPE_LABELS[t as PublicationType] ?? t.replace(/_/g, ' ');
}

/** Convex `technicalPublications` row (client shape). */
export interface TechnicalPublication {
  _id: string;
  companyId: string;
  projectId: string;
  documentId: string;
  title: string;
  publicationType: PublicationType;
  makeModel?: string;
  manufacturer?: string;
  partNumber?: string;
  revisionNumber?: string;
  revisionDate?: string;
  effectiveDate?: string;
  aircraftIds?: string[];
  uploadedBy: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/** Input for `publicationSections.replaceAll` / `bulkInsert`. */
export interface PublicationSectionInput {
  ataChapter: string;
  ataSection?: string;
  title: string;
  startPage: number;
  endPage: number;
  depth: number;
  chunkIds?: string[];
  parentSectionId?: string;
}

/** Parsed TOC row from `manualIngestion` before sending to Convex. */
export interface ParsedPublicationSection extends PublicationSectionInput {}

/** Physical logbook volume filter (optional on logbook entries). */
export type LogbookBookVolume =
  | 'airframe'
  | 'engine_1'
  | 'engine_2'
  | 'prop_1'
  | 'prop_2'
  | 'apu'
  | 'other';

export const LOGBOOK_BOOK_VOLUME_LABELS: Record<LogbookBookVolume, string> = {
  airframe: 'Airframe',
  engine_1: 'Engine 1',
  engine_2: 'Engine 2',
  prop_1: 'Propeller 1',
  prop_2: 'Propeller 2',
  apu: 'APU',
  other: 'Other',
};

export function getLogbookBookVolumeLabel(v?: string): string {
  if (!v || v === 'airframe') return LOGBOOK_BOOK_VOLUME_LABELS.airframe;
  const key = v as LogbookBookVolume;
  return LOGBOOK_BOOK_VOLUME_LABELS[key] ?? v.replace(/_/g, ' ');
}
