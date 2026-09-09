import { describe, it, expect } from 'vitest';
import {
  validateLicenseKey,
  normalizeLicenseKey,
  formatLicenseKey,
  buildLicenseKey,
  _internals,
} from '../../services/licenseKey';

/**
 * A customer types this off an invoice, or reads it down a phone line.
 *
 * The tests below are mostly about mistakes rather than correctness: the
 * difference between "check the key, one character looks wrong" and a failed
 * round trip that reads as "you sold me a bad key" is entirely in whether these
 * cases are handled.
 */
const VALID = buildLicenseKey('AG7K2M9P4QR3TVW');

describe('a valid key', () => {
  it('round-trips through build and validate', () => {
    const result = validateLicenseKey(VALID);
    expect(result.ok).toBe(true);
    expect(result.normalized).toBe(VALID);
  });

  it('is 16 characters and starts with AG', () => {
    expect(VALID).toHaveLength(16);
    expect(VALID.startsWith('AG')).toBe(true);
  });

  it('formats into readable groups of four', () => {
    expect(formatLicenseKey(VALID)).toMatch(/^AG\w{2}-\w{4}-\w{4}-\w{4}$/);
  });
});

describe('how people actually enter it', () => {
  it.each([
    ['with the dashes we printed', formatLicenseKey(VALID)],
    ['with no dashes at all', VALID],
    ['in lower case', VALID.toLowerCase()],
    ['with spaces instead of dashes', (VALID.match(/.{1,4}/g) || []).join(' ')],
    ['with stray whitespace', `  ${formatLicenseKey(VALID)}  `],
    ['with dashes in the wrong places', (VALID.match(/.{1,3}/g) || []).join('-')],
  ])('accepts a key %s', (_label, input) => {
    expect(validateLicenseKey(input).ok).toBe(true);
  });

  it('repairs the characters people reliably confuse', () => {
    // Read down a phone line, O becomes zero and I or L becomes one. Rejecting
    // these would be technically correct and commercially stupid.
    expect(normalizeLicenseKey('O')).toBe('0');
    expect(normalizeLicenseKey('I')).toBe('1');
    expect(normalizeLicenseKey('L')).toBe('1');
  });

  it('never puts an ambiguous character IN a key it generates', () => {
    // The repair above only works because the alphabet never legitimately
    // contains these to begin with.
    for (const char of 'ILOU') {
      expect(_internals.ALPHABET).not.toContain(char);
    }
  });
});

describe('catching a typo before the server sees it', () => {
  it('rejects a single mistyped character', () => {
    const chars = VALID.split('');
    // Change one payload character to a different valid one.
    chars[5] = chars[5] === '2' ? '3' : '2';
    const result = validateLicenseKey(chars.join(''));
    expect(result.ok).toBe(false);
    expect(result.problem).toBe('checksum');
  });

  it('rejects a transposition', () => {
    // The reason the checksum is position-weighted. An unweighted sum gives the
    // same answer for a swapped pair, so this case would sail through.
    const chars = VALID.split('');
    [chars[4], chars[5]] = [chars[5], chars[4]];
    // Only meaningful if the swap actually changed the string.
    if (chars.join('') !== VALID) {
      expect(validateLicenseKey(chars.join('')).ok).toBe(false);
    }
  });

  it('catches transpositions across many random keys', () => {
    // One example proves little; a weighted checksum should catch essentially
    // all adjacent swaps.
    let caught = 0;
    let attempted = 0;
    for (let n = 0; n < 200; n += 1) {
      let payload = 'AG';
      for (let i = 0; i < 13; i += 1) {
        payload += _internals.ALPHABET[(n * 7 + i * 13) % _internals.ALPHABET.length];
      }
      const key = buildLicenseKey(payload);
      const chars = key.split('');
      const i = 3 + (n % 10);
      if (chars[i] === chars[i + 1]) continue;
      [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
      attempted += 1;
      if (!validateLicenseKey(chars.join('')).ok) caught += 1;
    }
    expect(attempted).toBeGreaterThan(100);
    expect(caught).toBe(attempted);
  });

  it.each([
    ['nothing', '', 'empty'],
    ['only whitespace', '   ', 'empty'],
    ['a key for another product', 'XY7K-2M9P-4QR3-TVWA', 'wrong-prefix'],
    ['a truncated key', VALID.slice(0, 12), 'wrong-length'],
    ['a key with extra characters', `${VALID}77`, 'wrong-length'],
  ])('rejects %s', (_label, input, problem) => {
    const result = validateLicenseKey(input);
    expect(result.ok).toBe(false);
    expect(result.problem).toBe(problem);
  });

  it('explains every rejection in terms the key-holder can act on', () => {
    // A message that only makes sense to us generates a support ticket.
    for (const input of ['', 'XY123', VALID.slice(0, 10), `${VALID}ZZ`]) {
      const result = validateLicenseKey(input);
      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
      expect(result.message!.length).toBeGreaterThan(10);
      // No internal vocabulary leaking into customer-facing copy.
      expect(result.message).not.toMatch(/checksum|payload|regex|null|undefined/i);
    }
  });
});

describe('generating keys', () => {
  it('refuses a payload of the wrong length', () => {
    expect(() => buildLicenseKey('AG123')).toThrow(/15 characters/);
  });

  it('refuses a payload without the product prefix', () => {
    expect(() => buildLicenseKey('XY7K2M9P4QR3TVW')).toThrow(/AG/);
  });

  it('refuses a payload containing an excluded character', () => {
    // 'I' normalises to '1', so use a character with no repair mapping.
    expect(() => buildLicenseKey('AG7K2M9P4QR3TV!')).toThrow();
  });

  it('is deterministic', () => {
    expect(buildLicenseKey('AG7K2M9P4QR3TVW')).toBe(buildLicenseKey('AG7K2M9P4QR3TVW'));
  });

  it('produces different check characters for different payloads', () => {
    const a = buildLicenseKey('AG7K2M9P4QR3TVW');
    const b = buildLicenseKey('AG7K2M9P4QR3TVX');
    expect(a).not.toBe(b);
  });
});

describe('what this file does NOT decide', () => {
  it('validates shape only, never entitlement', () => {
    // A well-formed key proves it was typed correctly and nothing else. If this
    // ever started returning tier or expiry, anyone could edit the answer -
    // client-side code is not where a paywall can live.
    const result = validateLicenseKey(VALID);
    expect(result).not.toHaveProperty('tier');
    expect(result).not.toHaveProperty('expiresAt');
    expect(result).not.toHaveProperty('features');
  });
});
