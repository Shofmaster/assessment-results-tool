import { describe, expect, it } from 'vitest';
import { retainValid, retainValidKeys } from '../retainValid';

describe('retainValid', () => {
  it('drops ids that are no longer available', () => {
    const result = retainValid(new Set(['a', 'b', 'c']), new Set(['a', 'c']));
    expect([...result].sort()).toEqual(['a', 'c']);
  });

  it('returns the same set when everything is still valid', () => {
    // Identity matters: callers feed this into memo dependencies, and a fresh Set
    // every render would defeat them.
    const selected = new Set(['a', 'b']);
    expect(retainValid(selected, new Set(['a', 'b', 'c']))).toBe(selected);
  });

  it('returns an empty set when nothing survives', () => {
    const result = retainValid(new Set(['a', 'b']), new Set<string>());
    expect(result.size).toBe(0);
  });

  it('handles an empty selection', () => {
    const selected = new Set<string>();
    expect(retainValid(selected, new Set(['a']))).toBe(selected);
  });

  it('does not mutate the input', () => {
    const selected = new Set(['a', 'b']);
    retainValid(selected, new Set(['a']));
    expect([...selected].sort()).toEqual(['a', 'b']);
  });
});

describe('retainValidKeys', () => {
  it('drops entries whose key is no longer available', () => {
    const result = retainValidKeys({ a: 1, b: 2, c: 3 }, new Set(['a', 'c']));
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it('returns the same object when every key is still valid', () => {
    const record = { a: 1, b: 2 };
    expect(retainValidKeys(record, new Set(['a', 'b', 'c']))).toBe(record);
  });

  it('preserves values, not just keys', () => {
    const phase = { phase: 'indexing', message: 'working' };
    const result = retainValidKeys({ doc1: phase, doc2: { phase: 'idle' } }, new Set(['doc1']));
    expect(result).toEqual({ doc1: phase });
    expect(result.doc1).toBe(phase);
  });

  it('handles an empty record', () => {
    const record = {};
    expect(retainValidKeys(record, new Set(['a']))).toBe(record);
  });

  it('does not mutate the input', () => {
    const record = { a: 1, b: 2 };
    retainValidKeys(record, new Set(['a']));
    expect(record).toEqual({ a: 1, b: 2 });
  });
});
