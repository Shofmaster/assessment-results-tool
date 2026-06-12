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

/**
 * Normalize an Airworthiness Directive number for matching: strips "AD"
 * prefixes and punctuation noise, so "AD 2026-04-05", "2026-04-05R1", and
 * "ad2026-04-05" all compare equal on the base number. Returns "" when no
 * AD-shaped number is present. Shared by the adWatch cross-reference and the
 * client service (imported from src/ — keep dependency-free).
 */
export function normalizeAdNumber(raw: string): string {
  const m = /(\d{2,4})-(\d{2})-(\d{1,2})/.exec(String(raw));
  if (!m) return "";
  const year = m[1].length === 2 ? (Number(m[1]) > 50 ? `19${m[1]}` : `20${m[1]}`) : m[1];
  return `${year}-${m[2]}-${m[3].padStart(2, "0")}`;
}
