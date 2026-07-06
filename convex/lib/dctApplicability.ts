/**
 * Server-side mirror of `src/utils/dctApplicability.ts`.
 *
 * Convex cannot import from `src/`, so the pure classifier is duplicated here.
 * If you change logic, change both files.
 */

export type EntityProfileLike = {
  repairStationType?: string;
  operationsScope?: string;
  certifications?: string[];
  hasSms?: boolean;
  smsMaturity?: string;
  faaCertTypesHeld?: string[];
};

export type ApplicabilitySettings = {
  showAllDcts?: boolean;
  includedPeerGroupSubstrings?: string[];
  excludedPeerGroupSubstrings?: string[];
  applicabilityMode?: "heuristics_only" | "structured_preferred";
};

export type StructuredApplicabilityInput = {
  selectedRatings?: Array<{
    normalizedTokens?: string[];
    category?: string;
    classNumber?: number;
    authority?: string;
  }>;
  selectedCapabilities?: Array<{
    normalizedTokens?: string[];
    articleDescription?: string;
    authority?: string;
  }>;
};

export type DctApplicabilityState = "applicable" | "unsure" | "not_applicable";

const MAX_QUESTION_HAYSTACK_CHARS = 1500;

type DctHaystackDoc = {
  mlfName?: string | null;
  purpose?: string | null;
  objective?: string | null;
};

type DctHaystackQuestion = {
  text?: string | null;
  safetyAttribute?: string | null;
  /** FAA SAS scoping attribute — the field the FAA itself uses to scope questions. */
  scopingAttribute?: string | null;
  noteToUser?: string | null;
  references?: Array<{ label?: string | null } | null | undefined> | null;
};

/** Mirror of `src/utils/dctApplicability.ts#buildDctHaystack`. Keep in sync. */
export function buildDctHaystack(
  doc: DctHaystackDoc | null | undefined,
  question?: DctHaystackQuestion | null,
): string | undefined {
  const parts: string[] = [];
  if (doc?.mlfName) parts.push(doc.mlfName);
  if (doc?.purpose) parts.push(doc.purpose);
  if (doc?.objective) parts.push(doc.objective);
  if (question) {
    if (question.text) parts.push(question.text);
    if (question.safetyAttribute) parts.push(question.safetyAttribute);
    if (question.scopingAttribute) parts.push(question.scopingAttribute);
    if (question.noteToUser) parts.push(question.noteToUser);
    for (const ref of question.references ?? []) {
      if (ref?.label) parts.push(ref.label);
    }
  }
  if (parts.length === 0) return undefined;
  const joined = parts.join(" | ");
  return joined.length > MAX_QUESTION_HAYSTACK_CHARS
    ? joined.slice(0, MAX_QUESTION_HAYSTACK_CHARS)
    : joined;
}

function addPartAndSmsTokensFromRaw(raw: string, tokens: Set<string>, smsFromProfileOnly?: boolean) {
  if (/\b145\b|part\s*145|repair\s*station/i.test(raw)) tokens.add("145");
  if (/\b121\b|part\s*121/i.test(raw)) tokens.add("121");
  if (/\b135\b|part\s*135/i.test(raw)) tokens.add("135");
  if (/\b141\b|part\s*141/i.test(raw)) tokens.add("141");
  if (/\b142\b|part\s*142/i.test(raw)) tokens.add("142");
  if (/\b147\b|part\s*147/i.test(raw)) tokens.add("147");
  if (/outside\s+the\s+u\.?s\.?|international|foreign/i.test(raw)) tokens.add("145G");
  if (/within\s+the\s+u\.?s\.?|domestic|united\s+states/i.test(raw) && tokens.has("145")) tokens.add("145F");
  if (!smsFromProfileOnly && /\bsms\b|smsvp|safety\s+management/i.test(raw)) tokens.add("SMS");
}

export function inferApplicabilityTokens(profile: EntityProfileLike | null | undefined): string[] {
  const raw = [
    profile?.repairStationType,
    profile?.operationsScope,
    ...(profile?.certifications ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const tokens = new Set<string>();
  addPartAndSmsTokensFromRaw(raw, tokens, true);
  if (profile?.hasSms === true || /\bsms\b|smsvp|safety\s+management/i.test(raw)) tokens.add("SMS");
  // Authoritative structured cert-types override/supplement regex heuristics.
  for (const part of profile?.faaCertTypesHeld ?? []) tokens.add(part);
  return [...tokens];
}

function normalize(s: string): string {
  return s.toLowerCase();
}

// Short cert-part tokens handled by regex patterns above; anything else uses
// direct substring matching (e.g. opspec title phrases like "digital signature").
const CERT_PART_TOKENS = new Set([
  "145F", "145G", "145", "121", "125", "129", "133", "135",
  "137", "141", "142", "147", "91K", "91LOA", "SMS",
]);

/** WebOPSS paragraph identifiers like A025, B036, D107, MA025, T025. Length 3–5. */
const OPSPEC_PARAGRAPH_TOKEN = /^[a-z]{1,3}\d{2,4}$/;

function isOpspecParagraphToken(t: string): boolean {
  return OPSPEC_PARAGRAPH_TOKEN.test(t);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-boundary match so "a025" hits "Op Spec A025" but not "JA025X". */
function haystackContainsParagraph(hay: string, token: string): boolean {
  return new RegExp(`\\b${escapeRegex(token.toLowerCase())}\\b`).test(hay);
}

/** Part-number tokens usable for the peer-group gate (location refinements 145F/145G excluded). */
const PART_NUMBER_TOKENS = new Set([
  "145", "121", "125", "129", "133", "135", "137", "141", "142", "147",
]);

/**
 * Extract the part-number markers a DCT's own labels carry (peer group / MLF /
 * specialty). SAS peer groups: A = 121, B–E = 135 variants, F/G/H = 145.
 */
function extractDctPartMarkers(labelText: string): Set<string> {
  const out = new Set<string>();
  if (/\b145[fgh]?\b|part\s*145|repair\s*station/.test(labelText)) out.add("145");
  if (/\b121\b|part\s*121/.test(labelText)) out.add("121");
  if (/\b135\b|part\s*135/.test(labelText)) out.add("135");
  if (/\b141\b|part\s*141/.test(labelText)) out.add("141");
  if (/\b142\b|part\s*142/.test(labelText)) out.add("142");
  if (/\b147\b|part\s*147/.test(labelText)) out.add("147");
  return out;
}

/**
 * Conditional elements — functions that per the FAA operating-profile model
 * (configuration data + OpSpecs) only apply when the certificate holder is
 * actually authorized for / performs them. `pattern` identifies the element in
 * DCT text; `evidence` (profile free text) or `tokens` (entity tokens, e.g.
 * opspec paragraph ids) confirm the function.
 */
type ConditionalElementRule = {
  id: string;
  pattern: RegExp;
  evidence: RegExp;
  tokens?: string[];
};

const CONDITIONAL_ELEMENT_RULES: ConditionalElementRule[] = [
  {
    id: "sms",
    pattern: /\bsms\b|safety management system|smsvp/,
    evidence: /\bsms\b|safety management system|smsvp/,
    tokens: ["SMS"],
  },
  {
    id: "line-maintenance",
    // OpSpec D107 authorizes Part 145 line maintenance.
    pattern: /line maintenance/,
    evidence: /line maintenance/,
    tokens: ["d107"],
  },
  {
    id: "contract-maintenance",
    pattern: /contract(ed)? maintenance|maintenance provider|outsourc/,
    evidence: /contract(ed)? maintenance|outsourc/,
  },
  {
    id: "hazmat",
    pattern: /hazmat|hazardous material|dangerous goods|49 cfr part 17\d/,
    evidence: /hazmat|hazardous material|dangerous goods/,
  },
  {
    id: "drug-alcohol",
    pattern: /antidrug|anti-drug|drug and alcohol|drug abatement|part 120/,
    evidence: /drug|alcohol/,
  },
  {
    id: "capability-list",
    pattern: /capability list/,
    evidence: /capability list/,
  },
  {
    id: "intl-agreement",
    pattern: /\bbasa\b|bilateral aviation safety|maintenance annex guidance|\beasa\b/,
    evidence: /\bbasa\b|\beasa\b|bilateral|maintenance annex/,
  },
  {
    id: "work-away",
    pattern: /work away from|away from (its )?fixed location/,
    evidence: /work away|away from (its )?fixed location|line station/,
  },
];

/**
 * Universal core elements — requirements every certificate holder in the peer
 * group carries regardless of configuration (14 CFR part 145 subparts C–E
 * vocabulary: housing/facilities, personnel, training, manuals, QC, records).
 */
const UNIVERSAL_ELEMENT_RE =
  /housing|facilit|equipment|tool(s|ing)?\b|calibrat|personnel|roster|training program|technical data|repair station manual|quality control|quality manual|inspection (system|procedures|program)|recordkeeping|maintenance records|records? (system|retention)|certificate requirements|operations specifications|privileges and limitations|service difficulty|malfunction or defect/;

function profileFreeText(profile: EntityProfileLike | null | undefined): string {
  return [
    profile?.repairStationType,
    profile?.operationsScope,
    ...(profile?.certifications ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
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

export function classifyDctApplicability(
  peerGroupLabel: string | undefined,
  mlfLabel: string | undefined,
  specialtyLabel: string | undefined,
  profile: EntityProfileLike | null | undefined,
  settings: ApplicabilitySettings | null | undefined,
  extraTokens?: string[] | null,
  structured?: StructuredApplicabilityInput | null,
  /** Additional descriptive text from the DCT (mlfName, purpose, objective)
   * that opspec free-text tokens should be allowed to match against — many
   * FAA SAS DCTs leave mlfLabel empty and put the descriptive name in mlfName. */
  extraHaystack?: string,
): { state: DctApplicabilityState; confidence: number } {
  if (settings?.showAllDcts) return { state: "applicable", confidence: 1 };

  const hay = normalize(
    [peerGroupLabel, mlfLabel, specialtyLabel, extraHaystack].filter(Boolean).join(" | "),
  );

  const manualInclude = settings?.includedPeerGroupSubstrings?.filter(Boolean) ?? [];
  if (manualInclude.length) {
    const hit = manualInclude.some((x) => hay.includes(normalize(x)));
    if (!hit) return { state: "not_applicable", confidence: 0.95 };
  }

  const manualExclude = settings?.excludedPeerGroupSubstrings?.filter(Boolean) ?? [];
  if (manualExclude.some((x) => hay.includes(normalize(x)))) {
    return { state: "not_applicable", confidence: 0.95 };
  }

  if (settings?.applicabilityMode !== "heuristics_only") {
    const structuredTokens = collectStructuredTokens(structured);
    if (structuredTokens.length > 0) {
      if (matchesStructuredTokens(hay, structuredTokens)) {
        return { state: "applicable", confidence: 0.95 };
      }
      // Opspec-derived tokens (e.g. A025 paragraph id, "digital signature" phrase) represent
      // authorisation decisions that apply regardless of class rating selection.
      // Check them before giving the structured-path "not applicable" verdict.
      for (const t of extraTokens ?? []) {
        if (CERT_PART_TOKENS.has(t)) continue;
        if (isOpspecParagraphToken(t)) {
          if (haystackContainsParagraph(hay, t)) {
            return { state: "applicable", confidence: 0.8 };
          }
          continue;
        }
        if (t.length > 4 && hay.includes(t.toLowerCase())) {
          return { state: "applicable", confidence: 0.8 };
        }
      }
      return { state: "not_applicable", confidence: 0.9 };
    }
  }

  const profileTokens = inferApplicabilityTokens(profile);
  const merged =
    extraTokens && extraTokens.length
      ? [...new Set([...profileTokens, ...extraTokens])]
      : profileTokens;

  if (merged.length === 0) return { state: "unsure", confidence: 0.4 };
  const mergedSet = new Set(merged);

  // --- Gate 1: peer group. Per the FAA SAS model (peer group + configuration
  // data → scoped DCTs), a part-number match is NECESSARY but not SUFFICIENT:
  // it only proves the DCT belongs to the entity's peer group. A mismatch is a
  // confident exclusion; a match falls through to function-level evidence.
  const labelText = normalize(
    [peerGroupLabel, mlfLabel, specialtyLabel].filter(Boolean).join(" | "),
  );
  const dctParts = extractDctPartMarkers(labelText);
  const entityParts = new Set(merged.filter((t) => PART_NUMBER_TOKENS.has(t)));
  if (dctParts.size > 0 && entityParts.size > 0) {
    let intersects = false;
    for (const p of dctParts) {
      if (entityParts.has(p)) {
        intersects = true;
        break;
      }
    }
    if (!intersects) return { state: "not_applicable", confidence: 0.9 };
  }
  // Peer group F vs G/H: a domestic-only repair station doesn't get the
  // "outside the U.S." DCT variants.
  const dctIntl145 = /\b145\s*[gh]\b|outside\s+the\s+u\.?s/.test(labelText);
  const entityDomesticOnly145 = mergedSet.has("145F") && !mergedSet.has("145G");
  if (dctParts.has("145") && dctIntl145 && entityDomesticOnly145) {
    return { state: "not_applicable", confidence: 0.85 };
  }

  // --- Gate 2: positive function-level evidence — opspec paragraph ids
  // (A025, D107, …) and authorization title phrases from the entity's actual
  // configuration. These mirror the OpSpecs selections that drive scoping in
  // the SAS External Portal.
  for (const t of merged) {
    if (CERT_PART_TOKENS.has(t)) continue;
    if (isOpspecParagraphToken(t)) {
      if (haystackContainsParagraph(hay, t)) {
        return { state: "applicable", confidence: 0.85 };
      }
      continue;
    }
    if (t.length > 4 && hay.includes(t.toLowerCase())) {
      return { state: "applicable", confidence: 0.8 };
    }
  }

  // --- Gate 3: conditional elements — apply only when the entity performs /
  // is authorized for the function. Evidence present → applicable; provably
  // absent (SMS declined, domestic-only vs BASA) → not applicable; otherwise
  // leave in the unsure pool for human triage.
  const profileRaw = profileFreeText(profile);
  for (const rule of CONDITIONAL_ELEMENT_RULES) {
    if (!rule.pattern.test(hay)) continue;
    const tokenHit = (rule.tokens ?? []).some((tok) => mergedSet.has(tok));
    const evidenceHit =
      tokenHit || (profileRaw.length > 0 && rule.evidence.test(profileRaw));
    if (evidenceHit) return { state: "applicable", confidence: 0.75 };
    if (rule.id === "sms" && profile?.hasSms === false) {
      return { state: "not_applicable", confidence: 0.85 };
    }
    if (rule.id === "intl-agreement" && entityDomesticOnly145) {
      return { state: "not_applicable", confidence: 0.8 };
    }
    return { state: "unsure", confidence: 0.6 };
  }

  // --- Gate 4: universal core elements every certificate holder in the peer
  // group must satisfy (housing, personnel, training, manuals, QC, records…).
  if (UNIVERSAL_ELEMENT_RE.test(hay)) {
    return { state: "applicable", confidence: 0.7 };
  }

  // Same peer group but no function-level evidence either way: this is
  // exactly what the unsure triage pool is for. The old behavior (bare part
  // number match → applicable) is what produced the "100% applicable" symptom.
  return { state: "unsure", confidence: 0.5 };
}
