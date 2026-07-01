import type { ReactNode } from 'react';

/**
 * Highlight query terms in plain text (case-insensitive substring match).
 */
export function highlightSearchTerms(text: string, query: string): ReactNode {
  const q = query.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const needle = q.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded bg-amber-400/25 px-0.5 text-inherit">{text.slice(idx, idx + q.length)}</mark>
      {highlightSearchTerms(text.slice(idx + q.length), query)}
    </>
  );
}

export function matchTypeLabel(matchType?: string): string {
  switch (matchType) {
    case 'both':
      return 'Keyword + semantic';
    case 'keyword':
      return 'Keyword';
    case 'semantic':
      return 'Semantic';
    default:
      return 'Match';
  }
}

export function formatSearchScore(score: number, rerankScore?: number): string {
  const value = typeof rerankScore === 'number' ? rerankScore : score;
  return value.toFixed(3);
}
