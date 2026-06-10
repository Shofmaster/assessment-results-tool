/**
 * Canonical text normalization for document indexing and citation slicing.
 *
 * documentChunks.indexDocument computes chunk startChar/endChar offsets against
 * THIS normalized form, and documents.getTextSlice resolves those offsets back
 * into highlight spans — both must use the same function or highlights drift.
 */
export function normalizeText(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\t/g, " ").replace(/[ ]{2,}/g, " ").trim();
}
