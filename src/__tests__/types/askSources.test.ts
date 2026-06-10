import { describe, it, expect } from 'vitest';
import {
  segmentAnswerWithCitations,
  makeExcerpt,
  type AskSource,
  type AnswerSegment,
} from '../../types/askSources';

function chunkSource(tag: string, overrides: Partial<Extract<AskSource, { kind: 'chunk' }>> = {}): AskSource {
  return {
    tag,
    kind: 'chunk',
    documentId: 'doc1',
    chunkId: 'chunk1',
    docName: 'General Maintenance Manual',
    category: 'maintenance_manual',
    chunkIndex: 3,
    totalChunks: 20,
    startChar: 1200,
    endChar: 2400,
    score: 0.82,
    excerpt: 'Tooling shall be calibrated…',
    ...overrides,
  };
}

function textOf(segments: AnswerSegment[]): string {
  return segments.map((s) => (s.type === 'text' ? s.text : `<${s.source.tag}>`)).join('');
}

describe('segmentAnswerWithCitations', () => {
  it('resolves known tags to citation segments', () => {
    const sources = [chunkSource('S1'), chunkSource('S2', { documentId: 'doc2' })];
    const { segments, citedTags, strippedTags } = segmentAnswerWithCitations(
      'Calibrate annually [S1]. Records retained two years [S2].',
      sources,
    );
    expect(citedTags).toEqual(['S1', 'S2']);
    expect(strippedTags).toEqual([]);
    expect(textOf(segments)).toBe('Calibrate annually <S1>. Records retained two years <S2>.');
  });

  it('strips unknown tags silently (anti-hallucination guard)', () => {
    const { segments, citedTags, strippedTags } = segmentAnswerWithCitations(
      'Per the manual [S1], and per nothing [S9].',
      [chunkSource('S1')],
    );
    expect(citedTags).toEqual(['S1']);
    expect(strippedTags).toEqual(['S9']);
    expect(textOf(segments)).toBe('Per the manual <S1>, and per nothing .');
  });

  it('handles adjacent tags', () => {
    const sources = [chunkSource('S1'), chunkSource('S3')];
    const { segments, citedTags } = segmentAnswerWithCitations('Required [S1][S3].', sources);
    expect(citedTags).toEqual(['S1', 'S3']);
    expect(textOf(segments)).toBe('Required <S1><S3>.');
  });

  it('counts a repeated tag once in citedTags', () => {
    const { citedTags, segments } = segmentAnswerWithCitations('A [S1]. B [S1].', [chunkSource('S1')]);
    expect(citedTags).toEqual(['S1']);
    expect(segments.filter((s) => s.type === 'citation')).toHaveLength(2);
  });

  it('ignores malformed tags', () => {
    const { segments, citedTags, strippedTags } = segmentAnswerWithCitations(
      'Zero [S0], padded [S01], huge [S1000], bare S1, ok [S1].',
      [chunkSource('S1')],
    );
    expect(citedTags).toEqual(['S1']);
    expect(strippedTags).toEqual([]);
    expect(textOf(segments)).toBe('Zero [S0], padded [S01], huge [S1000], bare S1, ok <S1>.');
  });

  it('returns the whole answer as one text segment when there are no tags', () => {
    const { segments, citedTags } = segmentAnswerWithCitations('No citations here.', [chunkSource('S1')]);
    expect(citedTags).toEqual([]);
    expect(segments).toEqual([{ type: 'text', text: 'No citations here.' }]);
  });

  it('works with empty sources (everything stripped)', () => {
    const { segments, strippedTags } = segmentAnswerWithCitations('Claim [S1].', []);
    expect(strippedTags).toEqual(['S1']);
    expect(textOf(segments)).toBe('Claim .');
  });

  it('matches three-digit tags', () => {
    const { citedTags } = segmentAnswerWithCitations('Deep cut [S100].', [chunkSource('S100')]);
    expect(citedTags).toEqual(['S100']);
  });
});

describe('makeExcerpt', () => {
  it('returns short text unchanged (whitespace collapsed)', () => {
    expect(makeExcerpt('Tooling  shall\nbe calibrated.')).toBe('Tooling shall be calibrated.');
  });

  it('truncates long text with an ellipsis within the cap', () => {
    const out = makeExcerpt('x'.repeat(500));
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith('…')).toBe(true);
  });

  it('respects a custom max length', () => {
    const out = makeExcerpt('word '.repeat(50), 40);
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('…')).toBe(true);
  });
});
