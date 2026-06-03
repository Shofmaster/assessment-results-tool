import { describe, it, expect } from 'vitest';
import {
  DCT_MAX_COMPANY_DOCS,
  DCT_MAX_DOC_TEXT_CHARS,
  DCT_MIN_DOC_TEXT_CHARS,
  DCT_DOCUMENT_CHECK_BATCH_SIZE,
  DCT_DOC_TEXT_RESOLVE_CONCURRENCY,
} from '../../utils/dctSpendLimits';

/**
 * These constants govern Claude API token spend on the DCT traceability /
 * document-check paths. The exact-value assertions are intentional: bumping any
 * of them increases spend, so a change must be a deliberate edit to BOTH the
 * constant and this test, making it impossible to raise the spend envelope by
 * accident.
 */
describe('dctSpendLimits', () => {
  it('pins the per-run document cap', () => {
    expect(DCT_MAX_COMPANY_DOCS).toBe(40);
  });

  it('pins the per-document text caps', () => {
    expect(DCT_MAX_DOC_TEXT_CHARS).toBe(50_000);
    expect(DCT_MIN_DOC_TEXT_CHARS).toBe(80);
  });

  it('pins the document-check batch size', () => {
    expect(DCT_DOCUMENT_CHECK_BATCH_SIZE).toBe(10);
  });

  it('pins the text-resolve concurrency', () => {
    expect(DCT_DOC_TEXT_RESOLVE_CONCURRENCY).toBe(6);
  });

  it('keeps every limit a positive integer (no NaN / fractional / negative drift)', () => {
    for (const v of [
      DCT_MAX_COMPANY_DOCS,
      DCT_MAX_DOC_TEXT_CHARS,
      DCT_MIN_DOC_TEXT_CHARS,
      DCT_DOCUMENT_CHECK_BATCH_SIZE,
      DCT_DOC_TEXT_RESOLVE_CONCURRENCY,
    ]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });

  it('keeps the min text floor below the max text cap', () => {
    expect(DCT_MIN_DOC_TEXT_CHARS).toBeLessThan(DCT_MAX_DOC_TEXT_CHARS);
  });
});
