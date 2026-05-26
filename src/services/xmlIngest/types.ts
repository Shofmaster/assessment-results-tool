/**
 * Public types for the XML ingest pipeline.
 *
 * Pipeline: detector → family parser → optional OEM adapter → normalized result.
 * A normalized result feeds the existing TechnicalPublication / publicationSections
 * flow without any Convex schema changes.
 */

export type XmlFamily = 's1000d' | 'ata_ispec' | 'unrecognized';

/** Known OEM dialects. New OEMs can be added with a thin adapter (see adapters/). */
export type XmlOem =
  | 'gulfstream'
  | 'boeing'
  | 'airbus'
  | 'embraer'
  | 'bombardier'
  | 'cessna'
  | 'beechcraft'
  | 'cirrus'
  | 'pilatus'
  | 'daher'
  | 'piper'
  | 'sikorsky'
  | 'bell'
  | 'leonardo'
  | 'robinson'
  | 'ge'
  | 'pw'
  | 'rollsroyce'
  | 'honeywell'
  | 'williams'
  | 'collins'
  | 'garmin'
  | 'thales'
  | 'unknown';

export interface XmlIngestSection {
  ataChapter: string;
  ataSection?: string;
  title: string;
  depth: number;
  /** Synthetic ordinal (1-indexed); the schema requires a numeric page range. */
  startPage: number;
  endPage: number;
}

export interface XmlIngestNotice {
  level: 'info' | 'warning';
  message: string;
}

export interface XmlIngestMetadata {
  title?: string;
  ataNbr?: string;
  ataChapter?: string;
  ataSection?: string;
  ataSubject?: string;
  revisionNumber?: string;
  revisionDate?: string;
  applicableModels?: string[];
  manufacturer?: string;
  manualType?: string;
}

export interface XmlIngestResult {
  readingText: string;
  format: {
    family: XmlFamily;
    oem?: XmlOem;
    confidence: number;
  };
  metadata: XmlIngestMetadata;
  sections: XmlIngestSection[];
  notices?: XmlIngestNotice[];
}

/**
 * Pre-parse detection result. The dispatcher uses this to pick a family parser
 * and to know whether the raw text needs to be unwrapped from a JS shell first.
 */
export interface XmlDetectionResult {
  family: XmlFamily;
  oem?: XmlOem;
  confidence: number;
  /** XML payload after any unwrapping. May equal the input. */
  xml: string;
  /** Filename hint captured from the wrapper, if any. */
  wrapperFilename?: string;
  notices?: XmlIngestNotice[];
}
