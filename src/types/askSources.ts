/**
 * Verifiable citation sources for Ask an Expert answers.
 *
 * Each retrieved passage/document gets a per-turn tag ("S1", "S2", …) that the
 * model cites inline as [S1]. Rendering resolves tags against the turn's
 * AskSource[] — unknown tags are stripped, so a hallucinated citation can never
 * render as a link. Tags are scoped to a single assistant turn: each question
 * re-tags from S1 and only that turn's sources validate its citations.
 */

/** A retrieved passage chunk — clickable through to a highlighted span. */
export interface AskChunkSource {
  tag: string;
  kind: 'chunk';
  documentId: string;
  chunkId: string;
  docName: string;
  category: string;
  chunkIndex: number;
  totalChunks: number;
  startChar: number;
  endChar: number;
  score: number;
  /** First ~200 chars of the chunk, for the sources panel row. */
  excerpt: string;
}

/**
 * A whole document included via full-document grounding mode — no span to
 * highlight, the viewer opens at the top. (Phase 2 adds kind: 'record'.)
 */
export interface AskDocumentSource {
  tag: string;
  kind: 'document';
  documentId: string;
  docName: string;
  category: string;
}

export type AskSource = AskChunkSource | AskDocumentSource;

export const ASK_SOURCE_EXCERPT_CHARS = 200;

/** Matches inline citation tags like [S1] or [S12] (not [S01]; no nesting). */
export const ASK_CITATION_TAG_RE = /\[S([1-9]\d{0,2})\]/g;

export function makeExcerpt(text: string, max = ASK_SOURCE_EXCERPT_CHARS): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Split answer text into literal segments and citation references, resolving
 * tags against `sources`. Unknown tags are dropped (anti-hallucination guard).
 */
export type AnswerSegment =
  | { type: 'text'; text: string }
  | { type: 'citation'; source: AskSource };

export function segmentAnswerWithCitations(
  answer: string,
  sources: AskSource[],
): { segments: AnswerSegment[]; citedTags: string[]; strippedTags: string[] } {
  const byTag = new Map(sources.map((s) => [s.tag, s]));
  const segments: AnswerSegment[] = [];
  const citedTags: string[] = [];
  const strippedTags: string[] = [];
  let lastIndex = 0;
  const re = new RegExp(ASK_CITATION_TAG_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(answer)) !== null) {
    const tag = `S${match[1]}`;
    const source = byTag.get(tag);
    if (match.index > lastIndex) {
      segments.push({ type: 'text', text: answer.slice(lastIndex, match.index) });
    }
    if (source) {
      segments.push({ type: 'citation', source });
      if (!citedTags.includes(tag)) citedTags.push(tag);
    } else if (!strippedTags.includes(tag)) {
      strippedTags.push(tag);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < answer.length) {
    segments.push({ type: 'text', text: answer.slice(lastIndex) });
  }
  return { segments, citedTags, strippedTags };
}
