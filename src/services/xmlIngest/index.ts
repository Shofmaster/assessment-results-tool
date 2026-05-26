/**
 * XML ingest entry point.
 *
 * The pipeline:
 *   raw text → unwrap (e.g. Gulfstream JS shell) → detect family → family parser → result
 *
 * Each layer can short-circuit to the generic strip-tags fallback so any
 * `.xml` file the system accepts is at least searchable, even when the OEM
 * dialect has no dedicated parser yet.
 *
 * Adding a new OEM is a small change:
 *   - If the OEM uses standard ATA iSpec or S1000D, no code is needed — the
 *     family parser handles it and `inferOemFromModels` adds the manufacturer
 *     label from the applicable model names.
 *   - If the OEM ships its own wrapper (like Gulfstream's `XmlProc.Source`),
 *     add an unwrapper in `unwrap.ts` and call it from `detectAndUnwrap()` below.
 */

import type { XmlDetectionResult, XmlIngestResult, XmlOem } from './types';
import { looksJsWrapped, unwrapGulfstreamXml } from './unwrap';
import { looksAtaIspec, parseAtaIspec } from './ataIspec';
import { looksS1000D, parseS1000D } from './s1000d';
import { genericXmlFallback } from './generic';
import { oemDisplayName } from './oem';

export * from './types';
export { oemDisplayName, inferOemFromModels, detectOemFromModel } from './oem';

/**
 * File extensions that may contain XML the ingest pipeline can handle.
 * Used by upload filters and dropzone accept maps.
 */
export const XML_INGEST_EXTENSIONS = ['.xml', '.js'];

/** MIME types that may contain XML the ingest pipeline can handle. */
export const XML_INGEST_MIME_TYPES = [
  'application/xml',
  'text/xml',
  'application/javascript',
  'text/javascript',
];

/**
 * True if the file (by name or MIME) is something the XML ingest pipeline
 * should attempt to consume.
 */
export function isXmlIngestCandidate(fileName: string, mimeType?: string): boolean {
  const name = (fileName || '').toLowerCase();
  for (const ext of XML_INGEST_EXTENSIONS) {
    if (name.endsWith(ext)) return true;
  }
  if (mimeType) {
    const lower = mimeType.toLowerCase();
    if (XML_INGEST_MIME_TYPES.includes(lower)) return true;
    if (lower.endsWith('+xml')) return true;
  }
  return false;
}

function looksLikeXml(text: string): boolean {
  const head = text.slice(0, 256).trim();
  if (!head) return false;
  if (head.startsWith('<?xml')) return true;
  if (head.startsWith('<')) {
    // Cheap structural check: opening tag followed eventually by a close tag.
    return /<\/?[A-Za-z]/.test(head);
  }
  return false;
}

/**
 * Decide which family parser to run and unwrap the payload if needed.
 * Detection is purely text-based — no DOM required at this stage.
 */
export function detectAndUnwrap(rawText: string, fileName: string): XmlDetectionResult {
  // Step 1: handle the JS-wrapped shell (Gulfstream). The unwrapper returns null
  // for anything that isn't its specific format, so this is safe for all files.
  let xml = rawText;
  let wrapperFilename: string | undefined;
  let oemFromWrapper: XmlOem | undefined;

  if (looksJsWrapped(rawText)) {
    const unwrapped = unwrapGulfstreamXml(rawText);
    if (unwrapped) {
      xml = unwrapped.xml;
      wrapperFilename = unwrapped.filename;
      oemFromWrapper = 'gulfstream';
    }
  }

  if (!looksLikeXml(xml)) {
    return {
      family: 'unrecognized',
      oem: oemFromWrapper,
      confidence: 0,
      xml,
      wrapperFilename,
      notices: [
        {
          level: 'warning',
          message: `${fileName} does not look like an XML payload after unwrapping.`,
        },
      ],
    };
  }

  // Step 2: identify the XML family.
  if (looksS1000D(xml)) {
    return {
      family: 's1000d',
      oem: oemFromWrapper,
      confidence: 0.9,
      xml,
      wrapperFilename,
    };
  }
  if (looksAtaIspec(xml)) {
    return {
      family: 'ata_ispec',
      oem: oemFromWrapper,
      confidence: 0.9,
      xml,
      wrapperFilename,
    };
  }

  return {
    family: 'unrecognized',
    oem: oemFromWrapper,
    confidence: 0.3,
    xml,
    wrapperFilename,
    notices: [
      {
        level: 'info',
        message:
          'XML payload did not match S1000D or ATA iSpec heuristics — extracting plain text.',
      },
    ],
  };
}

/**
 * Run the full ingest pipeline on raw file text and return a normalized result.
 * Always succeeds: unknown formats get the strip-tags fallback so the file is
 * still searchable.
 */
export function ingestXmlText(rawText: string, fileName: string): XmlIngestResult {
  const detection = detectAndUnwrap(rawText, fileName);

  let result: XmlIngestResult;
  switch (detection.family) {
    case 'ata_ispec':
      result = parseAtaIspec(detection.xml);
      break;
    case 's1000d':
      result = parseS1000D(detection.xml);
      break;
    default:
      result = genericXmlFallback(detection.xml, 'unrecognized', detection.oem);
      break;
  }

  // Preserve OEM inferred from the wrapper if the family parser couldn't infer
  // one from the document body.
  if (detection.oem && !result.format.oem) {
    result.format.oem = detection.oem;
  }
  if (detection.oem && !result.metadata.manufacturer) {
    result.metadata.manufacturer = oemDisplayName(detection.oem);
  }

  if (detection.notices && detection.notices.length > 0) {
    result.notices = [...(result.notices ?? []), ...detection.notices];
  }
  return result;
}

/**
 * Convenience entry point: takes an ArrayBuffer (the shape produced by file
 * inputs and read() helpers) and returns the ingest result.
 */
export function ingestXmlBuffer(buffer: ArrayBuffer, fileName: string): XmlIngestResult {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  return ingestXmlText(text, fileName);
}
