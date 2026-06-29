/**
 * Dependency-light helpers shared by the Drive index builder. Kept separate
 * from driveIndexBuilder.ts so they can be imported (and unit-tested) without
 * pulling in DocumentExtractor's heavy pdfjs/mammoth runtime deps. The backend
 * type is imported as a TYPE only, so no runtime import of documentExtractor
 * occurs here.
 */
import type { OcrExtractionMetadata } from './documentExtractor';

/** Extraction backends that mean text came from OCR — char offsets aren't reproducible. */
const OCR_BACKENDS: ReadonlySet<OcrExtractionMetadata['backend']> = new Set([
  'claude_vision',
  'external_ocr',
]);

export function isScannedBackend(backend: OcrExtractionMetadata['backend']): boolean {
  return OCR_BACKENDS.has(backend);
}

/** SHA-256 hex of a string (browser / Node WebCrypto). */
export async function hashText(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
