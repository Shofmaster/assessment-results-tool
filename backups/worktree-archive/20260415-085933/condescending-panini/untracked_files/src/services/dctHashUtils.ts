/**
 * Canonical hash for DCT documents — deterministic regardless of XML formatting or upload path.
 * Avoids circular deps by not importing from dctXmlParser.ts.
 */

/** Minimal fields required for canonical hashing. */
type DctHashInput = {
  standardDctId?: string;
  standardDctDetailId?: string;
  dctVersionNumber?: string;
  dctVersionDate?: string;
  questions: Array<{
    questionId: string;
    text: string;
    references: Array<{ label: string }>;
    responses: string[];
  }>;
};

/** FNV-1a 32-bit (duplicate of dctXmlParser.hashDctContent to avoid circular import). */
function fnv1a32(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Canonical hash for a DCT document.
 * Keys: versioning fields + sorted question content (no fileName — same DCT may have different names across upload paths).
 */
export function canonicalDctHash(doc: DctHashInput): string {
  const payload = JSON.stringify({
    standardDctId: doc.standardDctId ?? null,
    standardDctDetailId: doc.standardDctDetailId ?? null,
    dctVersionNumber: doc.dctVersionNumber ?? null,
    dctVersionDate: doc.dctVersionDate ?? null,
    questions: [...doc.questions]
      .sort((a, b) => a.questionId.localeCompare(b.questionId))
      .map((q) => ({
        questionId: q.questionId,
        text: q.text,
        references: [...q.references].sort((a, b) => a.label.localeCompare(b.label)).map((r) => r.label),
        responses: [...q.responses].sort(),
      })),
  });
  return fnv1a32(payload);
}
