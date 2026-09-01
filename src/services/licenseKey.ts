/**
 * License key format.
 *
 * WHAT THIS IS FOR
 * A customer types this by hand, usually off an invoice, an email, or a PDF
 * someone printed. So the format is chosen for the human, not for us:
 *
 *   AGXX-XXXX-XXXX-XXXXC
 *
 * - Crockford base32, which OMITS I, L, O and U. Nobody has to decide whether
 *   that character is a one or an ell, and U is dropped so the alphabet cannot
 *   accidentally spell things.
 * - Case-insensitive, and I/L normalise to 1 while O normalises to 0 - so a key
 *   read aloud over the phone still works.
 * - Dashes are cosmetic. Paste with them, without them, or with the wrong ones.
 * - The last character is a CHECKSUM.
 *
 * WHY THE CHECKSUM MATTERS MORE THAN IT LOOKS
 * Without it, a mistyped key is indistinguishable from an invalid one. The app
 * would send it, wait for a round trip, and report "activation failed" - which
 * a customer reads as "you sold me a bad key", and which generates a support
 * ticket we cannot resolve without asking them to read 20 characters back to
 * us. With it, a typo is caught locally and instantly, and the message can say
 * "check the key" rather than "the server said no".
 *
 * The checksum is position-weighted, so it catches transposition (the most
 * common typing error after substitution) and not just wrong characters.
 *
 * THIS FILE VALIDATES SHAPE, NOT ENTITLEMENT. A well-formed key proves only
 * that it was typed correctly. Whether it is real, paid, and current is decided
 * by the licensing server - never here, where anyone could edit the answer.
 */

/** Crockford base32: no I, L, O or U. */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Characters people substitute, mapped to what they meant. */
const AMBIGUOUS: Record<string, string> = { I: '1', L: '1', O: '0', U: 'V' };

/** Payload characters, excluding the trailing checksum. */
const PAYLOAD_LENGTH = 15;
const TOTAL_LENGTH = PAYLOAD_LENGTH + 1;

/** The prefix every key carries, so a wrong string is rejected immediately. */
const PREFIX = 'AG';

export type LicenseKeyProblem =
  | 'empty'
  | 'wrong-prefix'
  | 'wrong-length'
  | 'invalid-characters'
  | 'checksum';

export interface LicenseKeyResult {
  ok: boolean;
  /** Canonical, dash-grouped, uppercase form. Present when ok. */
  formatted?: string;
  /** Compact form to send to the server. Present when ok. */
  normalized?: string;
  problem?: LicenseKeyProblem;
  message?: string;
}

/**
 * Strip formatting and repair the characters people reliably mistype.
 * Exported because the input field normalises as the user types.
 */
export function normalizeLicenseKey(input: string): string {
  const upper = (input || '').toUpperCase();
  let out = '';
  for (const char of upper) {
    // Dashes, spaces and anything else cosmetic is dropped rather than
    // rejected - a pasted key often carries whatever the invoice used.
    if (!/[A-Z0-9]/.test(char)) continue;
    out += AMBIGUOUS[char] ?? char;
  }
  return out;
}

/**
 * Position-weighted checksum over the payload.
 *
 * Weighting by position is what makes a transposition detectable: an unweighted
 * sum gives the same answer for "AB" and "BA", and swapping two characters is
 * the second most common way a person mistypes a code.
 */
function checksumChar(payload: string): string {
  let total = 0;
  for (let i = 0; i < payload.length; i += 1) {
    const value = ALPHABET.indexOf(payload[i]);
    if (value < 0) return '';
    total += value * (i + 2);
  }
  return ALPHABET[total % ALPHABET.length];
}

/** Group as AGXX-XXXX-XXXX-XXXXC for display. */
export function formatLicenseKey(normalized: string): string {
  return (normalized.match(/.{1,4}/g) || []).join('-');
}

/**
 * Validate a typed key.
 *
 * Every rejection carries a message aimed at the person holding the key, not at
 * us reading a log. "This key is 15 characters; a license key has 16" is
 * actionable; "invalid license" is not.
 */
export function validateLicenseKey(input: string): LicenseKeyResult {
  const normalized = normalizeLicenseKey(input);

  if (!normalized) {
    return { ok: false, problem: 'empty', message: 'Enter your license key.' };
  }

  if (!normalized.startsWith(PREFIX)) {
    return {
      ok: false,
      problem: 'wrong-prefix',
      message: `An AeroGap license key begins with "${PREFIX}". Check that you pasted the whole key.`,
    };
  }

  if (normalized.length !== TOTAL_LENGTH) {
    return {
      ok: false,
      problem: 'wrong-length',
      message:
        `This key has ${normalized.length} characters; an AeroGap license key has ${TOTAL_LENGTH}. ` +
        (normalized.length < TOTAL_LENGTH ? 'Some may be missing.' : 'There may be extra characters.'),
    };
  }

  for (const char of normalized) {
    if (!ALPHABET.includes(char)) {
      return {
        ok: false,
        problem: 'invalid-characters',
        message: `"${char}" is not part of a license key. Check for a mistyped character.`,
      };
    }
  }

  const payload = normalized.slice(0, PAYLOAD_LENGTH);
  const expected = checksumChar(payload);
  if (expected !== normalized[PAYLOAD_LENGTH]) {
    return {
      ok: false,
      problem: 'checksum',
      message:
        'That key does not look right - one character is probably mistyped. ' +
        'Check it against your invoice before trying again.',
    };
  }

  return { ok: true, normalized, formatted: formatLicenseKey(normalized) };
}

/**
 * Build a valid key from 15 payload characters.
 *
 * Lives here rather than only on the server so the format has ONE definition.
 * Two implementations of a checksum drift, and the failure is keys that
 * validate in one place and not the other - discovered by a paying customer.
 */
export function buildLicenseKey(payload: string): string {
  const normalized = normalizeLicenseKey(payload);
  if (normalized.length !== PAYLOAD_LENGTH) {
    throw new Error(`License key payload must be ${PAYLOAD_LENGTH} characters, got ${normalized.length}`);
  }
  if (!normalized.startsWith(PREFIX)) {
    throw new Error(`License key payload must begin with "${PREFIX}"`);
  }
  for (const char of normalized) {
    if (!ALPHABET.includes(char)) throw new Error(`"${char}" is not in the license alphabet`);
  }
  return normalized + checksumChar(normalized);
}

export const _internals = { ALPHABET, PAYLOAD_LENGTH, TOTAL_LENGTH, PREFIX, checksumChar };
