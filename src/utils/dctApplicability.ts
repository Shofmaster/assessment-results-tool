/**
 * Heuristic applicability: map entity profile + manual corpus + user overrides to DCT peer group / part markers.
 */

export type EntityProfileLike = {
  repairStationType?: string;
  operationsScope?: string;
  certifications?: string[];
  hasSms?: boolean;
  smsMaturity?: string;
};

export type ApplicabilitySettings = {
  showAllDcts?: boolean;
  includedPeerGroupSubstrings?: string[];
  excludedPeerGroupSubstrings?: string[];
  applicabilityMode?: 'heuristics_only' | 'structured_preferred';
};

export type StructuredApplicabilityInput = {
  selectedRatings?: Array<{
    normalizedTokens?: string[];
    category?: string;
    classNumber?: number;
    /** When set to easa/other, rows are ignored for US Part 145 DCT token matching. */
    authority?: string;
  }>;
  selectedCapabilities?: Array<{
    normalizedTokens?: string[];
    articleDescription?: string;
    authority?: string;
  }>;
};

export type DctApplicabilityState = 'applicable' | 'unsure' | 'not_applicable';

/** Max chars scanned from concatenated manual extracted text (performance). */
export const MAX_MANUAL_CORPUS_CHARS = 120_000;

function addPartAndSmsTokensFromRaw(raw: string, tokens: Set<string>, smsFromProfileOnly?: boolean) {
  if (/\b145\b|part\s*145|repair\s*station/i.test(raw)) tokens.add('145');
  if (/\b121\b|part\s*121/i.test(raw)) tokens.add('121');
  if (/\b135\b|part\s*135/i.test(raw)) tokens.add('135');
  if (/\b141\b|part\s*141/i.test(raw)) tokens.add('141');
  if (/\b142\b|part\s*142/i.test(raw)) tokens.add('142');
  if (/\b147\b|part\s*147/i.test(raw)) tokens.add('147');
  if (/outside\s+the\s+u\.?s\.?|international|foreign/i.test(raw)) tokens.add('145G');
  if (/within\s+the\s+u\.?s\.?|domestic|united\s+states/i.test(raw) && tokens.has('145')) tokens.add('145F');
  if (!smsFromProfileOnly && /\bsms\b|smsvp|safety\s+management/i.test(raw)) tokens.add('SMS');
}

/** Extract likely Part / peer tokens from free-text profile fields. */
export function inferApplicabilityTokens(profile: EntityProfileLike | null | undefined): string[] {
  const raw = [
    profile?.repairStationType,
    profile?.operationsScope,
    ...(profile?.certifications ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const tokens = new Set<string>();
  addPartAndSmsTokensFromRaw(raw, tokens, true);
  if (profile?.hasSms === true || /\bsms\b|smsvp|safety\s+management/i.test(raw)) tokens.add('SMS');
  return [...tokens];
}

/**
 * Same heuristics as profile, applied to entity/regulatory manual text (no structured profile).
 */
export function inferApplicabilityTokensFromManualCorpus(corpus: string | undefined | null): string[] {
  const raw = (corpus ?? '').slice(0, MAX_MANUAL_CORPUS_CHARS).toLowerCase();
  const tokens = new Set<string>();
  addPartAndSmsTokensFromRaw(raw, tokens, false);
  return [...tokens];
}

/** Profile tokens first, then manual-derived, deduped. */
export function mergeApplicabilityTokens(
  profile: EntityProfileLike | null | undefined,
  manualCorpus: string | undefined | null,
): string[] {
  const merged = new Set<string>([
    ...inferApplicabilityTokens(profile),
    ...inferApplicabilityTokensFromManualCorpus(manualCorpus),
  ]);
  return [...merged];
}

function normalize(s: string): string {
  return s.toLowerCase();
}

function matchesHaystackWithTokens(
  hay: string,
  tokens: string[],
): boolean {
  for (const t of tokens) {
    if (t === '145F' && /145\s*f|within\s+the\s+u\.?s/i.test(hay)) return true;
    if (t === '145G' && /145\s*g|outside\s+the\s+u\.?s/i.test(hay)) return true;
    if (t === '145' && /\b145\b/.test(hay)) return true;
    if (t === '121' && /\b121\b/.test(hay)) return true;
    if (t === '135' && /\b135\b/.test(hay)) return true;
    if (t === '141' && /\b141\b/.test(hay)) return true;
    if (t === '142' && /\b142\b/.test(hay)) return true;
    if (t === '147' && /\b147\b/.test(hay)) return true;
    if (t === 'SMS' && /sms|smsvp|safety\s+risk|safety\s+assurance/i.test(hay)) return true;
  }
  return false;
}

function collectStructuredTokens(input: StructuredApplicabilityInput | null | undefined): string[] {
  const out = new Set<string>();
  const ratings = input?.selectedRatings ?? [];
  for (const row of ratings) {
    const auth = row.authority ?? "faa";
    if (auth !== "faa") continue;
    for (const token of row.normalizedTokens ?? []) {
      const normalized = normalize(token);
      if (normalized) out.add(normalized);
    }
    if (row.category) out.add(normalize(row.category));
    if (row.category && row.classNumber != null) {
      out.add(normalize(`${row.category} class ${row.classNumber}`));
    }
  }
  const capabilities = input?.selectedCapabilities ?? [];
  for (const row of capabilities) {
    const auth = row.authority ?? "faa";
    if (auth !== "faa") continue;
    for (const token of row.normalizedTokens ?? []) {
      const normalized = normalize(token);
      if (normalized) out.add(normalized);
    }
    if (row.articleDescription) out.add(normalize(row.articleDescription));
  }
  return [...out];
}

function matchesStructuredTokens(hay: string, tokens: string[]): boolean {
  for (const token of tokens) {
    if (!token) continue;
    if (hay.includes(token)) return true;
    const compact = token.replace(/\s+/g, " ");
    if (compact && hay.includes(compact)) return true;
  }
  return false;
}

/**
 * Returns true if this DCT row should appear in "applicable only" mode.
 * @param extraTokens — optional tokens from manual corpus (merged with profile inside when provided is redundant; pass only manual tokens OR use merged list and empty profile tokens via passing full merged as extraTokens with profile null — simpler: pass `extraTokens` as manual-only additions)
 *
 * When `extraTokens` is provided, applicability uses **union** of `inferApplicabilityTokens(profile)` and `extraTokens`.
 */
export function isDctApplicable(
  peerGroupLabel: string | undefined,
  mlfLabel: string | undefined,
  specialtyLabel: string | undefined,
  profile: EntityProfileLike | null | undefined,
  settings: ApplicabilitySettings | null | undefined,
  extraTokens?: string[] | null,
  structured?: StructuredApplicabilityInput | null,
): boolean {
  return classifyDctApplicability(
    peerGroupLabel,
    mlfLabel,
    specialtyLabel,
    profile,
    settings,
    extraTokens,
    structured,
  ).state !== 'not_applicable';
}

export function classifyDctApplicability(
  peerGroupLabel: string | undefined,
  mlfLabel: string | undefined,
  specialtyLabel: string | undefined,
  profile: EntityProfileLike | null | undefined,
  settings: ApplicabilitySettings | null | undefined,
  extraTokens?: string[] | null,
  structured?: StructuredApplicabilityInput | null,
): { state: DctApplicabilityState; confidence: number } {
  if (settings?.showAllDcts) return { state: 'applicable', confidence: 1 };

  const hay = normalize([peerGroupLabel, mlfLabel, specialtyLabel].filter(Boolean).join(' | '));

  const manualInclude = settings?.includedPeerGroupSubstrings?.filter(Boolean) ?? [];
  if (manualInclude.length) {
    const hit = manualInclude.some((x) => hay.includes(normalize(x)));
    if (!hit) return { state: 'not_applicable', confidence: 0.95 };
  }

  const manualExclude = settings?.excludedPeerGroupSubstrings?.filter(Boolean) ?? [];
  if (manualExclude.some((x) => hay.includes(normalize(x)))) return { state: 'not_applicable', confidence: 0.95 };

  if (settings?.applicabilityMode !== 'heuristics_only') {
    const structuredTokens = collectStructuredTokens(structured);
    if (structuredTokens.length > 0) {
      if (matchesStructuredTokens(hay, structuredTokens)) {
        return { state: 'applicable', confidence: 0.95 };
      }
      return { state: 'not_applicable', confidence: 0.92 };
    }
  }

  const profileTokens = inferApplicabilityTokens(profile);
  const merged =
    extraTokens && extraTokens.length
      ? [...new Set([...profileTokens, ...extraTokens])]
      : profileTokens;

  if (merged.length === 0) return { state: 'unsure', confidence: 0.4 };

  if (matchesHaystackWithTokens(hay, merged)) return { state: 'applicable', confidence: 0.85 };
  return { state: 'not_applicable', confidence: 0.8 };
}
