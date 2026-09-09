/**
 * Citation faithfulness: score claim ↔ excerpt overlap and demote weak [S#] tags.
 * Cheap lexical Jaccard on significant tokens — no model call.
 */

import {
  ASK_CITATION_TAG_RE,
  type AskSource,
  segmentAnswerWithCitations,
} from '../types/askSources';

const STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'is', 'are', 'was',
  'be', 'as', 'by', 'at', 'it', 'this', 'that', 'with', 'from', 'not', 'may', 'must',
  'shall', 'will', 'can', 'if', 'any', 'all', 'per', 'via', 'into', 'than', 'then',
]);

/** Minimum token-overlap score to keep a citation chip. */
export const ASK_CITATION_FAITHFULNESS_MIN = 0.12;

/** Lower bar for trailing tags on numbered/bullet steps (short AMM/MEL lines). */
export const ASK_CITATION_FAITHFULNESS_LIST_MIN = 0.06;

export function tokenizeForFaithfulness(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().match(/[a-z0-9][a-z0-9./-]{1,}/g) || []) {
    if (STOP.has(raw) || raw.length < 2) continue;
    out.add(raw);
  }
  return out;
}

/** Jaccard overlap of significant tokens; 0–1. Empty sides → 0. */
export function scoreClaimExcerptOverlap(claim: string, excerpt: string): number {
  const a = tokenizeForFaithfulness(claim);
  const b = tokenizeForFaithfulness(excerpt);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) {
    if (b.has(t)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Extract the claim text immediately before a citation tag at `tagIndex`
 * (index of '[' in the answer). Uses the prior sentence/clause window.
 */
export function claimWindowBeforeTag(answer: string, tagIndex: number): string {
  const before = answer.slice(0, tagIndex);
  // Prefer last sentence; fall back to last ~220 chars.
  const sentenceBreak = Math.max(
    before.lastIndexOf('. '),
    before.lastIndexOf('.\n'),
    before.lastIndexOf('! '),
    before.lastIndexOf('? '),
  );
  const start = sentenceBreak >= 0 ? sentenceBreak + 2 : Math.max(0, before.length - 220);
  return before.slice(start).replace(/\s+/g, ' ').trim();
}

/**
 * When a tag sits at the end of a list item, score the whole step line instead
 * of only the prior sentence fragment (short AMM/MEL steps lose Jaccard otherwise).
 */
export function listItemClaimWindow(answer: string, tagIndex: number): string | null {
  const lineStart = answer.lastIndexOf('\n', tagIndex - 1) + 1;
  const line = answer.slice(lineStart, tagIndex).trimEnd();
  if (!/^\s*(?:\d+\.|[-*])\s+/.test(line)) return null;
  // Tag should trail the step (allow punctuation/whitespace before EOL).
  const after = answer.slice(tagIndex).match(/^\[S[1-9]\d{0,2}\][\s.,;:!?]*(?:\r?\n|$)/);
  if (!after) return null;
  return line.replace(/^\s*(?:\d+\.|[-*])\s+/, '').replace(/\s+/g, ' ').trim();
}

export type FaithfulnessResult = {
  /** Answer with weak citation tags stripped. */
  content: string;
  /** Sources still valid for rendering (includes uncited searched passages). */
  sources: AskSource[];
  demotedTags: string[];
  /** True when grounded sources existed but none remain faithfully cited. */
  underCited: boolean;
  citedCount: number;
  groundedSourceCount: number;
};

function sourceExcerpt(source: AskSource): string {
  if (source.kind === 'chunk') return source.excerpt || '';
  if (source.kind === 'document') return `${source.docName} ${source.category}`;
  if (source.kind === 'record') return source.label;
  return '';
}

function sourceDocName(source: AskSource): string {
  if (source.kind === 'record') return source.label;
  return source.docName || '';
}

/** Keep the tag when the step names the same document or an ATA-like token from the excerpt. */
function stepNamesSourceAnchor(claim: string, source: AskSource): boolean {
  const claimLower = claim.toLowerCase();
  const docName = sourceDocName(source).toLowerCase().trim();
  if (docName) {
    const significant = docName
      .split(/[^a-z0-9]+/i)
      .filter((t) => t.length >= 3 && !STOP.has(t));
    if (significant.some((t) => claimLower.includes(t))) return true;
  }
  const excerpt = sourceExcerpt(source);
  const ataHits = excerpt.match(/\b\d{2}(?:-\d{2}){1,3}\b/g) || [];
  return ataHits.some((ata) => claimLower.includes(ata.toLowerCase()));
}

/**
 * Score each cited [S#] against its excerpt; strip tags that fail the threshold.
 * Record sources are kept (structured rows aren't free-text excerpts).
 * Document sources use doc name tokens as a weak proxy.
 * Trailing list-item tags use the whole step line and a lower threshold.
 */
export function applyCitationFaithfulness(
  answer: string,
  sources: AskSource[],
  minScore: number = ASK_CITATION_FAITHFULNESS_MIN,
): FaithfulnessResult {
  const grounded = sources.filter((s) => s.kind === 'chunk' || s.kind === 'document');
  if (sources.length === 0) {
    return {
      content: answer,
      sources,
      demotedTags: [],
      underCited: false,
      citedCount: 0,
      groundedSourceCount: 0,
    };
  }

  const byTag = new Map(sources.map((s) => [s.tag, s]));
  const demoted = new Set<string>();
  const re = new RegExp(ASK_CITATION_TAG_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(answer)) !== null) {
    const tag = `S${match[1]}`;
    const source = byTag.get(tag);
    if (!source) continue;
    if (source.kind === 'record') continue; // structured — trust the tool row
    const listClaim = listItemClaimWindow(answer, match.index);
    const claim = listClaim ?? claimWindowBeforeTag(answer, match.index);
    const excerpt = sourceExcerpt(source);
    const threshold = listClaim ? ASK_CITATION_FAITHFULNESS_LIST_MIN : minScore;
    const score = scoreClaimExcerptOverlap(claim, excerpt);
    if (score >= threshold) continue;
    if (listClaim && stepNamesSourceAnchor(claim, source)) continue;
    demoted.add(tag);
  }

  let content = answer;
  if (demoted.size > 0) {
    content = answer.replace(new RegExp(ASK_CITATION_TAG_RE.source, 'g'), (full, num: string) => {
      const tag = `S${num}`;
      return demoted.has(tag) ? '' : full;
    });
    // Clean doubled spaces left by stripped tags
    content = content.replace(/[ \t]{2,}/g, ' ').replace(/ +([.,;:!?])/g, '$1');
  }

  const { citedTags } = segmentAnswerWithCitations(content, sources);
  const citedCount = citedTags.length;
  const underCited = grounded.length > 0 && citedCount === 0;

  return {
    content,
    sources,
    demotedTags: [...demoted],
    underCited,
    citedCount,
    groundedSourceCount: grounded.length,
  };
}
