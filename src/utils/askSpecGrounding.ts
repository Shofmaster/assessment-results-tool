/**
 * Ask an Expert — aircraft-spec grounding.
 *
 * Aircraft-specific technical data (grease, torque, PN, intervals, AMM/CMM
 * steps) must never be invented from general knowledge. Those claims require
 * a retrieved manual citation; otherwise we refuse and never name a value.
 */

import {
  ASK_CITATION_TAG_RE,
  type AskSource,
  segmentAnswerWithCitations,
} from '../types/askSources';
import { claimWindowBeforeTag } from './askCitationFaithfulness';

/** Fixed refusal — must not echo any invented product or number. */
export const ASK_SPEC_REFUSAL =
  'I could not find that aircraft-specific specification in your retrieved manuals, so I will not name a product, part number, torque, interval, or procedure from general knowledge. Check the applicable AMM, CMM, IPC, or SRM (or add the manual to your Library and ask again). AeroGap will not guess maintenance data.';

/** When Drive was skipped, append a recovery hint without inventing a value. */
export const ASK_SPEC_REFUSAL_DRIVE_HINT =
  ' Linked reference manuals could not be searched for this question — open Settings to test Drive, or Library for search coverage, then try again.';

/**
 * Shared system-prompt rule for Splash and AskPanel (must stay identical).
 * General regulatory/process questions may still use industry knowledge.
 */
export const ASK_SPEC_GROUNDING_RULE = [
  'AIRCRAFT-SPEC GROUNDING (hard rule): Do not invent grease, oil, hydraulic fluid, lubricant product names (including MIL-PRF / AMS / MIL-G designations), torque values, part numbers, alternates, PMA substitutions, inspection/overhaul/life-limit intervals for a specific aircraft or component, temperature/pressure/clearance limits, or AMM/CMM/IPC/SRM task steps from general knowledge.',
  'If the retrieved company document passages do not contain that fact, say clearly that the manuals do not contain it and stop. Do not name a product, part number, or numeric limit.',
  'General regulatory or process questions (e.g. what 14 CFR §145.51 requires, how to document a CAR, SMS/QMS process) may still use industry/regulatory knowledge; name the FAR/AC or standard in the prose when specific.',
].join(' ');

/**
 * Shared Splash + AskPanel rule: every action step must carry a citation tag
 * (or an explicit general-practice marker). Keep identical on both surfaces.
 */
export const ASK_STEP_CITATION_RULE = [
  'ACTION STEPS (hard rule when sources are provided): Put clear action steps in a numbered list (1. 2. 3.).',
  'Every step that relies on a retrieved excerpt MUST end with that excerpt\'s bracket tag, e.g. "1. Verify MEL relief for the item [S2]."',
  'If a step is general practice with no matching excerpt, end it with "(general practice — not in retrieved manuals)" and do NOT invent a tag.',
  'Only use tags that appear in the provided sources or tool results.',
].join(' ');

/** Query patterns that ask for aircraft-specific technical data. */
const SPEC_QUERY_PATTERNS: RegExp[] = [
  /\bgrease\b/i,
  /\blubricant\b/i,
  /\blube\b/i,
  /\boil\s+type\b/i,
  /\bwhat\s+oil\b/i,
  /\bwhich\s+oil\b/i,
  /\bhydraulic\s+fluid\b/i,
  /\bwhat\s+fluid\b/i,
  /\bwhich\s+fluid\b/i,
  /\btorque\b/i,
  /\bft[-\s]?lb\b/i,
  /\bin[-\s]?lb\b/i,
  /\bN[·.]?m\b/i,
  /\bpart\s*numbers?\b/i,
  /\bP\/?N\b/i,
  /\balternate\s+(?:part|pn)\b/i,
  /\bPMA\b/i,
  /\bsubstitut(?:e|ion)\b/i,
  /\bTBO\b/i,
  /\blife[-\s]?limit/i,
  /\boverhaul\s+interval\b/i,
  /\binspection\s+interval\b/i,
  /\btime\s+between\s+overhaul\b/i,
  /\bAMM\b/i,
  /\bCMM\b/i,
  /\bIPC\b/i,
  /\bSRM\b/i,
  /\bclearance\b/i,
  /\btemperatures?\s+(?:limit|range|spec)\b/i,
  /\bpressure\s+(?:limit|range|spec)\b/i,
  /\bwhat\s+(?:grease|oil|fluid|torque|part)\b/i,
  /\bwhich\s+(?:grease|oil|fluid|torque|part)\b/i,
  /\brecommended\s+(?:grease|oil|fluid|lubricant|torque)\b/i,
  /\bspec(?:ification)?\s+for\b/i,
];

/**
 * True when the user is asking for aircraft-specific technical data that must
 * come from a manual. Conservative: over-refusing a grease question is safer
 * than under-refusing.
 */
export function isAircraftSpecQuery(question: string): boolean {
  const q = question.trim();
  if (!q) return false;
  return SPEC_QUERY_PATTERNS.some((re) => re.test(q));
}

/** Product / mil-spec style tokens that look like invented maintenance data. */
const SPEC_CLAIM_PATTERNS: RegExp[] = [
  /\bAeroshell\b/i,
  /\bMobil\s*(?:grease|avion|jet|oil)?\b/i,
  /\bRoyco\b/i,
  /\bNYCO\b/i,
  /\bBrayco\b/i,
  /\bCastrol\b/i,
  /\bExxon\b/i,
  /\bShell\s+(?:grease|oil|aviation)\b/i,
  /\bMIL[- ]?(?:G|PRF|H|L)[- ]?\d/i,
  /\bAMS\s*\d{3,}/i,
  // "use/apply/recommend <BrandOrProduct>" — brand-like token (letter + digit, or known-style)
  /\b(?:use|apply|recommend(?:ed)?)\s+(?:Aeroshell|Mobil|Royco|NYCO|Brayco|Castrol|Exxon|Shell)\b/i,
  /\b(?:use|apply|recommend(?:ed)?)\s+[A-Z][A-Za-z]*\d[A-Za-z0-9./-]*/,
  /\b\d+(?:\.\d+)?\s*(?:ft[-\s]?lb|in[-\s]?lb|N[·.]?m|psi|bar|°[CF]|deg(?:rees)?\s*[CF])\b/i,
  /\bP\/?N\s*[A-Z0-9][A-Z0-9./-]{2,}/i,
  /\bpart\s*(?:number|#)\s*[A-Z0-9][A-Z0-9./-]{2,}/i,
];

function sourceTextForOverlap(source: AskSource): string {
  if (source.kind === 'chunk') return `${source.docName} ${source.excerpt || ''}`;
  if (source.kind === 'document') return `${source.docName} ${source.category}`;
  if (source.kind === 'record') return source.label;
  return '';
}

function claimOverlapsCitedSource(claim: string, sources: AskSource[], citedTags: string[]): boolean {
  if (citedTags.length === 0) return false;
  const byTag = new Map(sources.map((s) => [s.tag, s]));
  const claimLower = claim.toLowerCase();
  for (const tag of citedTags) {
    const source = byTag.get(tag);
    if (!source) continue;
    const excerpt = sourceTextForOverlap(source).toLowerCase();
    if (!excerpt) continue;
    // Require at least one significant token from the claim to appear in the source.
    const tokens = claimLower.match(/[a-z0-9][a-z0-9./-]{2,}/g) || [];
    const hits = tokens.filter((t) => excerpt.includes(t));
    if (hits.length >= 1) return true;
  }
  return false;
}

/**
 * Find citation tags that appear in the same sentence / immediately after a
 * claim window ending at `endIndex`.
 */
function tagsNearClaim(answer: string, claimStart: number, claimEnd: number): string[] {
  const windowEnd = Math.min(answer.length, claimEnd + 40);
  const slice = answer.slice(claimStart, windowEnd);
  const tags: string[] = [];
  const re = new RegExp(ASK_CITATION_TAG_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(slice)) !== null) {
    tags.push(`S${m[1]}`);
  }
  return tags;
}

/**
 * True when the answer contains an aircraft-spec claim that is not backed by a
 * remaining faithful citation. FAR/process prose without product names passes.
 */
export function answerContainsUncitedSpecClaim(
  answer: string,
  sources: AskSource[],
): boolean {
  const text = answer.trim();
  if (!text) return false;

  const { citedTags } = segmentAnswerWithCitations(text, sources);
  const citedSet = citedTags;

  for (const pattern of SPEC_CLAIM_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      // Prefer the sentence/clause before any trailing citation on this claim.
      const claim =
        claimWindowBeforeTag(text, end) ||
        text.slice(Math.max(0, start - 80), end).trim();
      const nearbyTags = tagsNearClaim(text, Math.max(0, start - 120), end);
      const effectiveTags = nearbyTags.length > 0 ? nearbyTags.filter((t) => citedSet.includes(t)) : [];
      // Also accept any cited tag if the claim tokens overlap a cited excerpt
      // (model may put [S1] slightly after the product name).
      const tagsToCheck = effectiveTags.length > 0 ? effectiveTags : citedSet;
      if (!claimOverlapsCitedSource(claim + ' ' + match[0], sources, tagsToCheck)) {
        return true;
      }
    }
  }
  return false;
}

/** Build the user-facing refusal, optionally noting Drive was not searched. */
export function buildSpecRefusal(opts?: { driveUnavailable?: boolean }): string {
  if (opts?.driveUnavailable) {
    return ASK_SPEC_REFUSAL + ASK_SPEC_REFUSAL_DRIVE_HINT;
  }
  return ASK_SPEC_REFUSAL;
}

/**
 * After faithfulness: if the answer still has an uncited spec claim, replace
 * with the canned refusal (never leave the invented value on screen).
 */
export function applySpecGroundingGuard(
  answer: string,
  sources: AskSource[],
  opts?: { driveUnavailable?: boolean },
): { content: string; blocked: boolean; sources: AskSource[] } {
  if (!answerContainsUncitedSpecClaim(answer, sources)) {
    return { content: answer, blocked: false, sources };
  }
  return {
    content: buildSpecRefusal({ driveUnavailable: opts?.driveUnavailable }),
    blocked: true,
    sources: [],
  };
}
