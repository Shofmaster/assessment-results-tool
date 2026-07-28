/**
 * Google-native Drive types (Docs/Sheets/Slides) and the formats we export them
 * to. These files have no bytes to stream — `alt=media` returns 403 — so they
 * must go through the Drive `export` endpoint first.
 *
 * Shared deliberately: googleDrive.ts uses the map to pick an export target, and
 * documentExtractor.ts uses it to normalize the stored Drive mimeType onto the
 * format the exported bytes are actually in. If only one side knew, exported
 * bytes would arrive as .docx while the extractor still saw
 * `application/vnd.google-apps.document` and rejected them.
 *
 * Kept dependency-free so neither importer pulls in the other's runtime.
 */

/** Google-native mimeType -> the mimeType its exported bytes will be in. */
export const GOOGLE_NATIVE_EXPORT_MIME: Record<string, string> = {
  'application/vnd.google-apps.document':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
  // Slides has no text-bearing export the extractor parses directly; PDF gives
  // us the text layer (and OCR fallback) that the PDF path already handles.
  'application/vnd.google-apps.presentation': 'application/pdf',
};

export function isGoogleNativeMime(mimeType: string): boolean {
  return mimeType.startsWith('application/vnd.google-apps.');
}

/**
 * True for Google-native types we can turn into readable bytes. Folders and
 * exotic types (forms, shortcuts, sites) are native but not exportable.
 */
export function isExportableGoogleNativeMime(mimeType: string): boolean {
  return mimeType in GOOGLE_NATIVE_EXPORT_MIME;
}
