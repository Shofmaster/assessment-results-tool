import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderLightMarkdown } from '../../components/ask/AskMarkdown';
import type { AskChunkSource } from '../../types/askSources';

function chunk(tag: string): AskChunkSource {
  return {
    tag,
    kind: 'chunk',
    documentId: 'd1',
    chunkId: 'c1',
    docName: 'MEL',
    category: 'mel',
    chunkIndex: 0,
    totalChunks: 1,
    startChar: 0,
    endChar: 10,
    score: 1,
    excerpt: 'MEL item text',
  };
}

describe('renderLightMarkdown lists', () => {
  it('renders numbered steps as an ordered list with citation chips', () => {
    const html = renderToStaticMarkup(
      renderLightMarkdown('1. Verify MEL relief [S1].\n2. Reset CB.', {
        byTag: new Map([['S1', chunk('S1')]]),
        onOpen: () => {},
        markUncitedSteps: true,
      }),
    );
    expect(html).toContain('<ol');
    expect(html).not.toMatch(/<ul[^>]*class="[^"]*list-decimal/);
    expect(html).toMatch(/aria-label="Source 1:/);
    expect(html).toMatch(/no source/i);
  });

  it('renders bullets as an unordered list', () => {
    const html = renderToStaticMarkup(renderLightMarkdown('- Alpha\n- Beta'));
    expect(html).toContain('<ul');
    expect(html).toContain('list-disc');
  });
});
