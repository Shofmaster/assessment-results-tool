import type { JSX } from 'react';
import { ASK_CITATION_TAG_RE, type AskSource, segmentAnswerWithCitations } from '../../types/askSources';

/**
 * Shared Ask an Expert rendering: light markdown with verifiable [S#]
 * citation chips, plus the per-answer sources panel. Used by the splash chat
 * and the embedded AskPanel (Library / Fleet).
 *
 * Styling is intentionally dark-fixed: every Ask surface renders answers
 * inside a dark navy bubble in both themes.
 */

/** Per-turn citation rendering context: resolves [S#] tags to sources and opens the viewer. */
export type CiteContext = {
  byTag: Map<string, AskSource>;
  onOpen: (source: AskSource) => void;
  /** When true, list items without a valid [S#] get a muted "no source" marker. */
  markUncitedSteps?: boolean;
};

export function categoryLabel(category: unknown): string {
  switch (category) {
    case 'entity':
      return 'company manual/library';
    case 'regulatory':
      return 'regulatory reference';
    case 'mel':
      return 'MEL/MMEL';
    case 'reference':
      return 'reference library';
    case 'maintenance_manual':
      return 'maintenance manual';
    case 'uploaded':
      return 'uploaded file';
    case 'logbook':
      return 'logbook entry';
    default:
      return typeof category === 'string' && category ? category : 'document';
  }
}

function lineHasValidCitation(line: string, cite?: CiteContext): boolean {
  if (!cite || cite.byTag.size === 0) return false;
  const re = new RegExp(ASK_CITATION_TAG_RE.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    if (cite.byTag.has(`S${match[1]}`)) return true;
  }
  return false;
}

function renderListItemContent(line: string, cite: CiteContext | undefined, key: string): JSX.Element {
  const nodes = renderInlineMarkdown(line, cite);
  const showNoSource =
    Boolean(cite?.markUncitedSteps && cite.byTag.size > 0) && !lineHasValidCitation(line, cite);
  return (
    <>
      {nodes}
      {showNoSource ? (
        <span
          key={`${key}-nosrc`}
          className="ml-1.5 inline-flex items-center rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/45"
        >
          no source
        </span>
      ) : null}
    </>
  );
}

export function renderInlineMarkdown(text: string, cite?: CiteContext): Array<string | JSX.Element> {
  const nodes: Array<string | JSX.Element> = [];
  const tokenRegex = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|\[S([1-9]\d{0,2})\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    if (match[7]) {
      // [S#] citation tag. With a cite context: known tag → chip, unknown tag →
      // stripped (a hallucinated tag must never render). Without one (user turns,
      // pre-citation answers) the literal text passes through untouched.
      if (!cite) {
        nodes.push(match[0]);
      } else {
        const source = cite.byTag.get(`S${match[7]}`);
        if (source) {
          const sourceName = source.kind === 'record' ? source.label : source.docName;
          nodes.push(
            <sup key={`cite-${match.index}`} className="ml-0.5">
              <button
                type="button"
                onClick={() => cite.onOpen(source)}
                aria-label={`Source ${match[7]}: ${sourceName}`}
                title={sourceName}
                className="inline-flex h-4 min-w-4 items-center justify-center rounded bg-sky/25 px-1 text-[10px] font-bold text-sky-200 transition-colors hover:bg-sky/45 hover:text-white"
              >
                {match[7]}
              </button>
            </sup>
          );
        }
      }
    } else if (match[2] && match[3]) {
      nodes.push(
        <a
          key={`link-${match.index}`}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
        >
          {match[2]}
        </a>
      );
    } else if (match[4]) {
      nodes.push(<strong key={`strong-${match.index}`} className="font-semibold text-white">{match[4]}</strong>);
    } else if (match[5]) {
      nodes.push(
        <code key={`code-${match.index}`} className="rounded bg-white/10 px-1 py-0.5 text-xs text-white">
          {match[5]}
        </code>
      );
    } else if (match[6]) {
      nodes.push(<em key={`em-${match.index}`} className="italic text-white/95">{match[6]}</em>);
    }
    lastIndex = tokenRegex.lastIndex;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

type ListBuffer = { kind: 'ul' | 'ol'; lines: string[] };

export function renderLightMarkdown(text: string, cite?: CiteContext): JSX.Element {
  const lines = text.split('\n');
  const blocks: JSX.Element[] = [];
  let listBuf: ListBuffer | null = null;

  const flushList = (keySuffix: number) => {
    if (!listBuf || listBuf.lines.length === 0) {
      listBuf = null;
      return;
    }
    const { kind, lines: items } = listBuf;
    const Tag = kind === 'ol' ? 'ol' : 'ul';
    const listClass =
      kind === 'ol'
        ? 'mb-3 list-decimal space-y-1.5 pl-5 text-sm text-white/90'
        : 'mb-3 list-disc space-y-1 pl-5 text-sm text-white/90';
    blocks.push(
      <Tag key={`${kind}-${keySuffix}`} className={listClass}>
        {items.map((line, idx) => (
          <li key={`li-${keySuffix}-${idx}`}>{renderListItemContent(line, cite, `li-${keySuffix}-${idx}`)}</li>
        ))}
      </Tag>
    );
    listBuf = null;
  };

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) {
      flushList(idx);
      return;
    }

    const numbered = line.match(/^\d+\.\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (numbered) {
      if (listBuf && listBuf.kind !== 'ol') flushList(idx);
      if (!listBuf) listBuf = { kind: 'ol', lines: [] };
      listBuf.lines.push(numbered[1]);
      return;
    }
    if (bullet) {
      if (listBuf && listBuf.kind !== 'ul') flushList(idx);
      if (!listBuf) listBuf = { kind: 'ul', lines: [] };
      listBuf.lines.push(bullet[1]);
      return;
    }

    flushList(idx);

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      const cls =
        level === 1 ? 'text-lg font-semibold text-white' : level === 2 ? 'text-base font-semibold text-white' : 'text-sm font-semibold text-white/95';
      blocks.push(
        <p key={`h-${idx}`} className={`mb-2 mt-1 ${cls}`}>
          {renderInlineMarkdown(heading[2], cite)}
        </p>
      );
      return;
    }

    blocks.push(
      <p key={`p-${idx}`} className="mb-2 text-sm leading-7 text-white/90">
        {renderInlineMarkdown(line, cite)}
      </p>
    );
  });

  flushList(lines.length + 1);
  return <div>{blocks}</div>;
}

/** Sources panel under an assistant answer: cited rows, uncited count, or the general-guidance notice. */
export function AskSourcesPanel({
  content,
  sources,
  onOpenSource,
}: {
  content: string;
  sources: AskSource[] | undefined;
  onOpenSource: (source: AskSource) => void;
}) {
  const all = sources || [];
  if (all.length === 0) return null;
  const { citedTags } = segmentAnswerWithCitations(content, all);
  const cited = all.filter((s) => citedTags.includes(s.tag));
  const uncitedCount = all.length - cited.length;

  if (cited.length === 0) {
    return (
      <p className="mt-2 rounded-md border border-amber-400/35 bg-amber-500/10 px-2.5 py-2 text-[11px] font-medium text-amber-100/95">
        This answer does not cite your documents — treat every claim as unverified until you check the manuals yourself.
      </p>
    );
  }

  return (
    <div className="mt-2 border-t border-white/10 pt-2">
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-white/45">Sources</p>
      <ul className="space-y-1">
        {cited.map((source) => (
          <li key={source.tag}>
            <button
              type="button"
              onClick={() => onOpenSource(source)}
              className="group flex w-full items-baseline gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/5"
            >
              <span className="inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded bg-sky/25 px-1 text-[10px] font-bold text-sky-200">
                {source.tag.slice(1)}
              </span>
              <span className="min-w-0">
                <span className="text-[11px] font-medium text-sky-200 group-hover:underline">
                  {source.kind === 'record' ? source.label : source.docName}
                </span>
                <span className="ml-1.5 text-[10px] uppercase tracking-wide text-white/35">
                  {source.kind === 'record' ? 'record' : categoryLabel(source.category)}
                </span>
                {source.kind === 'chunk' && source.excerpt ? (
                  <span className="block truncate text-[11px] text-white/50">{source.excerpt}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {uncitedCount > 0 ? (
        <p className="mt-1 px-1.5 text-[10px] text-white/35">
          Also searched: {uncitedCount} more passage{uncitedCount === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
