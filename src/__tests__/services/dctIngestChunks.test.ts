import { describe, expect, it } from 'vitest';
import { filterXmlFilesFromFileList, parallelMap } from '../../services/dctIngestChunks';

describe('filterXmlFilesFromFileList', () => {
  it('keeps only .xml files', () => {
    const files = [
      new File([''], 'a.xml', { type: 'application/xml' }),
      new File([''], 'b.txt', { type: 'text/plain' }),
      new File([''], 'c.XML', { type: 'application/xml' }),
    ];
    const out = filterXmlFilesFromFileList(files);
    expect(out.map((f) => f.name)).toEqual(['a.xml', 'c.XML']);
  });
});

describe('parallelMap', () => {
  it('runs all items with bounded concurrency', async () => {
    const items = [1, 2, 3, 4, 5];
    const out = await parallelMap(items, 2, async (n) => n * 2);
    expect(out).toEqual([2, 4, 6, 8, 10]);
  });

  it('returns empty array for empty input', async () => {
    expect(await parallelMap([], 4, async () => 1)).toEqual([]);
  });
});
