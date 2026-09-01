/**
 * Cheap pre-embed query expansion for aviation compliance search.
 * Appends synonyms / expansions so hybrid + vector recall improves without
 * a model call. Shared by Ask, Global Search content, and Library search
 * (applied once in the federated search entry points).
 */

const ACRONYM_EXPANSIONS: Array<{ re: RegExp; expand: string }> = [
  { re: /\bIPC\b/i, expand: 'illustrated parts catalog' },
  { re: /\bAMM\b/i, expand: 'aircraft maintenance manual' },
  { re: /\bCMM\b/i, expand: 'component maintenance manual' },
  { re: /\bSRM\b/i, expand: 'structural repair manual' },
  { re: /\bGMM\b/i, expand: 'general maintenance manual' },
  { re: /\bQCM\b/i, expand: 'quality control manual' },
  { re: /\bRSM\b/i, expand: 'repair station manual' },
  { re: /\bMEL\b/i, expand: 'minimum equipment list' },
  { re: /\bMMEL\b/i, expand: 'master minimum equipment list' },
  { re: /\bSMS\b/i, expand: 'safety management system' },
  { re: /\bAD\b(?=[\s-]|$)/i, expand: 'airworthiness directive' },
  { re: /\bSB\b(?=[\s-]|$)/i, expand: 'service bulletin' },
  { re: /\bSL\b(?=[\s-]|$)/i, expand: 'service letter' },
  { re: /\bTCDS\b/i, expand: 'type certificate data sheet' },
  { re: /\bSTC\b/i, expand: 'supplemental type certificate' },
  { re: /\bOEM\b/i, expand: 'original equipment manufacturer' },
  { re: /\bCFR\b/i, expand: 'code of federal regulations' },
  { re: /\bAC\b(?=[\s-]?\d)/i, expand: 'advisory circular' },
];

const SYNONYM_PHRASES: Array<{ re: RegExp; expand: string }> = [
  { re: /\bcoming\s+due\b/i, expand: 'inspection due overdue forecast' },
  { re: /\btime\s+change\b/i, expand: 'life limited part LLP' },
  { re: /\bhard\s+time\b/i, expand: 'life limited overhaul interval' },
  { re: /\bon\s+condition\b/i, expand: 'condition monitoring' },
  { re: /\bops\s*specs?\b/i, expand: 'operations specifications' },
  { re: /\bform\s*337\b/i, expand: 'major repair alteration' },
];

/** Normalize ATA chapter mentions so "ata 32" and "chapter 32" share tokens. */
function expandAtaMentions(query: string): string[] {
  const extras: string[] = [];
  const ata = query.match(/\bATA\s*[-.]?\s*(\d{2})(?:[-.]?\d{0,2})?\b/i);
  if (ata) {
    extras.push(`ATA chapter ${ata[1]}`, `chapter ${ata[1]}`);
  }
  const chapterOnly = query.match(/\b(?:chapter|ch\.?)\s*(\d{2})\b/i);
  if (chapterOnly && !ata) {
    extras.push(`ATA ${chapterOnly[1]}`, `ATA chapter ${chapterOnly[1]}`);
  }
  return extras;
}

/** Surface part-number / AD-number tokens without inventing new IDs. */
function expandIdLikeTokens(query: string): string[] {
  const extras: string[] = [];
  if (/\bP\/?N\b/i.test(query) || /\bpart\s*number\b/i.test(query)) {
    extras.push('part number PN');
  }
  if (/\bS\/?N\b/i.test(query) || /\bserial\s*number\b/i.test(query)) {
    extras.push('serial number SN');
  }
  // FAA-style AD numbers: 2024-12-01 or AD-2024-12-01
  if (/\b(?:AD[-\s]?)?\d{4}-\d{1,2}-\d{1,2}\b/i.test(query)) {
    extras.push('airworthiness directive AD');
  }
  return extras;
}

/**
 * Returns an expanded query string for retrieval. Original phrasing is preserved
 * first; expansions append so lexical/keyword ranks still favor exact matches.
 */
export function expandAviationQuery(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return trimmed;

  const extras: string[] = [];
  for (const { re, expand } of ACRONYM_EXPANSIONS) {
    if (re.test(trimmed) && !trimmed.toLowerCase().includes(expand.toLowerCase())) {
      extras.push(expand);
    }
  }
  for (const { re, expand } of SYNONYM_PHRASES) {
    if (re.test(trimmed)) extras.push(expand);
  }
  extras.push(...expandAtaMentions(trimmed), ...expandIdLikeTokens(trimmed));

  if (extras.length === 0) return trimmed;

  // Dedupe while preserving order
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const e of extras) {
    const key = e.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(e);
  }
  return `${trimmed} ${unique.join(' ')}`.trim();
}
