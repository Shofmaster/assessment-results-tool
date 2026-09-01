import { describe, it, expect } from 'vitest';
import {
  SERVICE_TOKEN_ENV,
  SERVICE_TOKEN_HEADER,
  timingSafeEqualStr,
  verifyServiceToken,
} from '../../../convex/lib/serviceToken';

/**
 * This token is the only thing standing between a browser and a route that
 * returns plaintext customer API keys. The two properties that matter are that
 * an unset expected value never matches, and that comparison does not leak the
 * position of the first mismatching character through timing.
 */
describe('timingSafeEqualStr', () => {
  it('matches identical strings', () => {
    expect(timingSafeEqualStr('abc123', 'abc123')).toBe(true);
  });

  it.each([
    ['different content', 'abc123', 'abc124'],
    ['different length', 'abc', 'abcd'],
    ['prefix of the other', 'abcdef', 'abc'],
    ['empty vs non-empty', '', 'a'],
  ])('rejects %s', (_label, a, b) => {
    expect(timingSafeEqualStr(a, b)).toBe(false);
  });

  it('matches two empty strings', () => {
    expect(timingSafeEqualStr('', '')).toBe(true);
  });

  it('compares every character regardless of where the first difference is', () => {
    // A mismatch at position 0 and one at the last position must both be
    // rejected without short-circuiting - that is the timing property. We can
    // assert the observable half of it: correctness is independent of position.
    const token = 'a'.repeat(43);
    const firstCharWrong = 'b' + 'a'.repeat(42);
    const lastCharWrong = 'a'.repeat(42) + 'b';
    expect(timingSafeEqualStr(firstCharWrong, token)).toBe(false);
    expect(timingSafeEqualStr(lastCharWrong, token)).toBe(false);
  });

  it('handles non-ASCII without throwing', () => {
    expect(timingSafeEqualStr('tökén', 'tökén')).toBe(true);
    expect(timingSafeEqualStr('tökén', 'token')).toBe(false);
  });
});

describe('verifyServiceToken', () => {
  it('accepts the configured token', () => {
    expect(verifyServiceToken('secret-value', 'secret-value')).toBe(true);
  });

  it('rejects a wrong token', () => {
    expect(verifyServiceToken('nope', 'secret-value')).toBe(false);
  });

  it.each([
    ['expected unset', 'anything', undefined],
    ['expected null', 'anything', null],
    ['expected blank', 'anything', '   '],
    ['expected empty', 'anything', ''],
  ])('never matches when %s', (_label, provided, expected) => {
    // A deployment that forgot to configure the token must reject every
    // request, not accept every request.
    expect(verifyServiceToken(provided, expected as string | null | undefined)).toBe(false);
  });

  it.each([
    ['provided missing', undefined],
    ['provided null', null],
    ['provided blank', '  '],
  ])('rejects when %s', (_label, provided) => {
    expect(verifyServiceToken(provided as string | null | undefined, 'secret-value')).toBe(false);
  });

  it('ignores surrounding whitespace on both sides', () => {
    // Header values and .env lines both pick up stray spaces.
    expect(verifyServiceToken('  secret-value  ', 'secret-value')).toBe(true);
    expect(verifyServiceToken('secret-value', '  secret-value\n')).toBe(true);
  });
});

describe('shared constants', () => {
  it('pins the header and env names both runtimes agree on', () => {
    // The api/ runtime sends this header; convex/http.ts reads it. A rename on
    // one side only would fail closed at runtime with a 401 and no explanation.
    expect(SERVICE_TOKEN_HEADER).toBe('x-aerogap-service-token');
    expect(SERVICE_TOKEN_ENV).toBe('AI_CREDENTIAL_SERVICE_TOKEN');
  });

  it('uses a lowercase header name, as Node normalises incoming headers', () => {
    expect(SERVICE_TOKEN_HEADER).toBe(SERVICE_TOKEN_HEADER.toLowerCase());
  });
});
