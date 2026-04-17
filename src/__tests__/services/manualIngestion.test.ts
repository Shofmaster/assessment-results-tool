import { describe, it, expect } from 'vitest';
import { parsePublicationTocResponse } from '../../services/manualIngestion';

describe('parsePublicationTocResponse', () => {
  it('parses fenced JSON array', () => {
    const raw = 'Here you go:\n```json\n[{"ataChapter":"5","title":"Time limits","startPage":1,"endPage":20,"depth":1}]\n```';
    const rows = parsePublicationTocResponse(raw);
    expect(rows).toHaveLength(1);
    expect(rows[0].ataChapter).toBe('05');
    expect(rows[0].title).toBe('Time limits');
    expect(rows[0].startPage).toBe(1);
    expect(rows[0].endPage).toBe(20);
  });

  it('returns empty on invalid JSON', () => {
    expect(parsePublicationTocResponse('not json')).toEqual([]);
  });
});
