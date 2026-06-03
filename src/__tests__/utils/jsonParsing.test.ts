import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractJsonBlock,
  extractJsonFromMarkdown,
  extractBalancedJsonContaining,
  normalizeFindingArray,
  parseFindingsResponse,
  parseBatchFindingsResponse,
  parseCurrencyResponse,
  reportParseFailure,
} from '../../utils/jsonParsing';

describe('extractJsonBlock', () => {
  it('extracts content from a ```json fence', () => {
    const text = 'prose\n```json\n{"a":1}\n```\nmore';
    expect(extractJsonBlock(text)).toBe('{"a":1}');
  });

  it('is case-insensitive and tolerant of whitespace', () => {
    expect(extractJsonBlock('```JSON   {"a":1}   ```')).toBe('{"a":1}');
  });

  it('returns null when no fence is present', () => {
    expect(extractJsonBlock('no fence here {"a":1}')).toBeNull();
  });

  it('returns only the first fence', () => {
    const text = '```json\n{"a":1}\n```\n```json\n{"b":2}\n```';
    expect(extractJsonBlock(text)).toBe('{"a":1}');
  });
});

describe('extractJsonFromMarkdown', () => {
  it('parses a valid fenced object', () => {
    expect(extractJsonFromMarkdown<{ a: number }>('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('parses a fenced array', () => {
    expect(extractJsonFromMarkdown<number[]>('```json\n[1,2,3]\n```')).toEqual([1, 2, 3]);
  });

  it('returns null silently when no fence present', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractJsonFromMarkdown('plain text')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports and returns null when a fence contains invalid JSON', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(extractJsonFromMarkdown('```json\n{ not valid }\n```')).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe('extractBalancedJsonContaining', () => {
  it('extracts a balanced object containing the key', () => {
    const text = 'noise {"findings":[{"x":1}]} trailing';
    expect(extractBalancedJsonContaining(text, 'findings')).toBe('{"findings":[{"x":1}]}');
  });

  it('handles nested braces correctly', () => {
    const text = 'x {"findings":[{"nested":{"deep":true}}]} y';
    expect(extractBalancedJsonContaining(text, 'findings')).toBe(
      '{"findings":[{"nested":{"deep":true}}]}'
    );
  });

  it('returns null when key absent', () => {
    expect(extractBalancedJsonContaining('{"other":1}', 'findings')).toBeNull();
  });

  it('returns null when braces are unbalanced', () => {
    expect(extractBalancedJsonContaining('{"findings":[1,2', 'findings')).toBeNull();
  });
});

describe('normalizeFindingArray', () => {
  it('keeps valid findings and clamps unknown severities to minor', () => {
    const result = normalizeFindingArray([
      { severity: 'CRITICAL', location: 'Sec 1', description: 'bad' },
      { severity: 'bogus', description: 'unknown sev' },
    ]);
    expect(result).toEqual([
      { severity: 'critical', location: 'Sec 1', description: 'bad' },
      { severity: 'minor', location: undefined, description: 'unknown sev' },
    ]);
  });

  it('drops entries missing severity or description, and empty descriptions', () => {
    const result = normalizeFindingArray([
      { severity: 'major' },
      { description: 'no sev' },
      { severity: 'major', description: '   ' },
      { severity: 'minor', description: 'kept' },
    ]);
    expect(result).toEqual([{ severity: 'minor', location: undefined, description: 'kept' }]);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeFindingArray(null)).toEqual([]);
    expect(normalizeFindingArray(undefined)).toEqual([]);
    expect(normalizeFindingArray('nope')).toEqual([]);
  });

  it('ignores non-string location', () => {
    const result = normalizeFindingArray([{ severity: 'minor', location: 5, description: 'x' }]);
    expect(result[0].location).toBeUndefined();
  });
});

describe('parseFindingsResponse', () => {
  it('parses findings from a ```json fence', () => {
    const text = '```json\n{"findings":[{"severity":"major","description":"d"}]}\n```';
    expect(parseFindingsResponse(text)).toEqual([
      { severity: 'major', location: undefined, description: 'd' },
    ]);
  });

  it('falls back to a balanced object when no fence is present', () => {
    const text = 'Here you go: {"findings":[{"severity":"minor","description":"d2"}]}';
    expect(parseFindingsResponse(text)).toEqual([
      { severity: 'minor', location: undefined, description: 'd2' },
    ]);
  });

  it('returns null silently for blank input', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseFindingsResponse('   ')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports and returns null when no findings array can be parsed', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseFindingsResponse('totally unparseable response')).toBeNull();
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe('parseBatchFindingsResponse', () => {
  it('parses byDocument and crossDocumentFindings', () => {
    const text =
      '```json\n' +
      JSON.stringify({
        byDocument: { 'Doc A': [{ severity: 'major', description: 'a' }] },
        crossDocumentFindings: [{ severity: 'observation', description: 'x' }],
      }) +
      '\n```';
    const result = parseBatchFindingsResponse(text);
    expect(result.byDocument['Doc A']).toEqual([
      { severity: 'major', location: undefined, description: 'a' },
    ]);
    expect(result.crossDocumentFindings).toEqual([
      { severity: 'observation', location: undefined, description: 'x' },
    ]);
  });

  it('returns empty container without reporting for blank input', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseBatchFindingsResponse('')).toEqual({ byDocument: {}, crossDocumentFindings: [] });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports when no fence is present', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseBatchFindingsResponse('no json here');
    expect(result).toEqual({ byDocument: {}, crossDocumentFindings: [] });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });

  it('reports when the fence holds invalid JSON', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parseBatchFindingsResponse('```json\n{ broken \n```');
    expect(result).toEqual({ byDocument: {}, crossDocumentFindings: [] });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe('parseCurrencyResponse', () => {
  it('parses a well-formed currency block', () => {
    const text = '```json\n{"latestRevision":"Rev C","isCurrent":true,"summary":"ok"}\n```';
    expect(parseCurrencyResponse(text)).toEqual({
      latestRevision: 'Rev C',
      isCurrent: true,
      summary: 'ok',
    });
  });

  it('coerces missing fields to safe defaults', () => {
    const text = '```json\n{"isCurrent":null}\n```';
    expect(parseCurrencyResponse(text)).toEqual({
      latestRevision: 'Unable to determine',
      isCurrent: null,
      summary: 'No details available',
    });
  });

  it('reports and returns defaults for unparseable non-empty input', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseCurrencyResponse('no json')).toEqual({
      latestRevision: 'Unable to determine',
      isCurrent: null,
      summary: 'Could not parse the search results.',
    });
    expect(spy).toHaveBeenCalledOnce();
    spy.mockRestore();
  });
});

describe('reportParseFailure', () => {
  let spy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
  });

  it('logs a prefixed structured warning with a truncated sample', () => {
    reportParseFailure('mySource', 'something failed', 'x'.repeat(500));
    expect(spy).toHaveBeenCalledWith('[llm-parse] mySource: something failed', {
      sample: 'x'.repeat(300),
    });
  });

  it('omits the sample object when none is provided', () => {
    reportParseFailure('mySource', 'no sample');
    expect(spy).toHaveBeenCalledWith('[llm-parse] mySource: no sample', undefined);
  });
});
