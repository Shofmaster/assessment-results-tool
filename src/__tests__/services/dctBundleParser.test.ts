import { describe, it, expect } from 'vitest';
import { parseDctBundleJson, normalizeParsedDctDocument } from '../../services/dctBundleParser';

describe('parseDctBundleJson', () => {
  it('accepts bare array of documents', () => {
    const json = JSON.stringify([
      {
        fileName: 'a.xml',
        questions: [{ questionId: 'Q1', text: 'Hello?', references: [], responses: [] }],
      },
    ]);
    const { documents, errors } = parseDctBundleJson(json);
    expect(errors).toEqual([]);
    expect(documents).toHaveLength(1);
    expect(documents[0].fileName).toBe('a.xml');
    expect(documents[0].questions[0].questionId).toBe('Q1');
    expect(documents[0].contentHash).toBeTruthy();
  });

  it('accepts { documents: [...] } wrapper', () => {
    const json = JSON.stringify({
      documents: [
        {
          fileName: 'b.xml',
          contentHash: 'deadbeef',
          questions: [{ questionId: '1', text: 'T', references: [], responses: ['yes'] }],
        },
      ],
    });
    const { documents, errors } = parseDctBundleJson(json);
    expect(errors).toEqual([]);
    expect(documents[0].contentHash).toBe('deadbeef');
    expect(documents[0].questions[0].responses).toEqual(['yes']);
  });

  it('rejects invalid JSON', () => {
    const { documents, errors } = parseDctBundleJson('not json');
    expect(documents).toEqual([]);
    expect(errors).toContain('Invalid JSON');
  });

  it('rejects wrong root shape', () => {
    const { documents, errors } = parseDctBundleJson('{"foo":[]}');
    expect(documents).toEqual([]);
    expect(errors.some((e) => e.includes('Expected'))).toBe(true);
  });

  it('collects per-document errors and still returns valid rows', () => {
    const json = JSON.stringify([
      { fileName: 'ok.xml', questions: [{ questionId: '1', text: 'x', references: [], responses: [] }] },
      { questions: [] },
    ]);
    const { documents, errors } = parseDctBundleJson(json);
    expect(documents).toHaveLength(1);
    expect(errors.length).toBeGreaterThan(0);
  });
});

describe('normalizeParsedDctDocument', () => {
  it('fills contentHash when missing (stable for same payload)', () => {
    const payload = {
      fileName: 'c.xml',
      questions: [{ questionId: 'Q', text: '?', references: [], responses: [] }],
    };
    const r = normalizeParsedDctDocument(payload, 0);
    expect('doc' in r).toBe(true);
    if ('doc' in r) {
      expect(r.doc.contentHash.length).toBeGreaterThan(0);
      const again = normalizeParsedDctDocument(payload, 0);
      if ('doc' in again) expect(again.doc.contentHash).toBe(r.doc.contentHash);
    }
  });
});
