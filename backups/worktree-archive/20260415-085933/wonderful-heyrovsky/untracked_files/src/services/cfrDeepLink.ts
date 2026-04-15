/**
 * Maps regulatory citations to deep-linkable URLs for eCFR (FAA) and EUR-Lex (EASA).
 */

// ── FAA eCFR ─────────────────────────────────────────────────────────────────

/**
 * Maps a citation like "14 CFR 43.9(a)" to an eCFR.gov deep link.
 *
 * Supported patterns:
 * - "14 CFR 43.9(a)(1)" → https://www.ecfr.gov/current/title-14/section-43.9#p-43.9(a)(1)
 * - "14 CFR Part 91.409(b)" → https://www.ecfr.gov/current/title-14/section-91.409#p-91.409(b)
 * - "AC 43-9C" → https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/22978
 */
function faaDeepLink(citation: string): string | null {
  // "14 CFR 43.9(a)(1)" pattern
  const cfrMatch = citation.match(
    /14\s*CFR\s*(?:Part\s*)?(\d+)\.(\d+[a-z]?)\s*(\([^)]*\)(?:\([^)]*\))*)?/i,
  );
  if (cfrMatch) {
    const [, part, section, paragraph] = cfrMatch;
    const sectionRef = `${part}.${section}`;
    const base = `https://www.ecfr.gov/current/title-14/section-${sectionRef}`;
    if (paragraph) {
      return `${base}#p-${sectionRef}${paragraph}`;
    }
    return base;
  }

  // "AC 43-9C" — known ACs
  const acMatch = citation.match(/AC\s*43[-–]9C/i);
  if (acMatch) {
    return 'https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/22978';
  }

  return null;
}

// ── EASA ─────────────────────────────────────────────────────────────────────

/**
 * Maps EASA citations to EUR-Lex or EASA regulation pages.
 *
 * Supported patterns:
 * - "M.A.305(a)" → EASA Part-M page
 * - "145.A.50" → EASA Part-145 page
 */
function easaDeepLink(citation: string): string | null {
  if (/M\.A\.\d/i.test(citation)) {
    return 'https://www.easa.europa.eu/en/document-library/easy-access-rules/easy-access-rules-continuing-airworthiness';
  }
  if (/145\.A\.\d/i.test(citation)) {
    return 'https://www.easa.europa.eu/en/document-library/easy-access-rules/easy-access-rules-maintenance-organisations';
  }
  return null;
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Given a regulatory citation string, return a URL if one can be derived.
 * Returns null for unrecognized patterns.
 */
export function getCitationLink(citation: string): string | null {
  return faaDeepLink(citation) ?? easaDeepLink(citation) ?? null;
}

/**
 * Wrap citation text in an anchor tag if a deep link is available.
 * Returns the original text unchanged if no link is found.
 */
export function formatCitationWithLink(citation: string): { text: string; href: string | null } {
  return { text: citation, href: getCitationLink(citation) };
}
