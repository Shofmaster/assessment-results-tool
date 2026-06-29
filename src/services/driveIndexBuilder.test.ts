import { describe, it, expect } from 'vitest';
import { hashText, isScannedBackend } from './indexTextUtils';

describe('hashText', () => {
  it('is deterministic and 64 hex chars (SHA-256)', async () => {
    const a = await hashText('hello manual');
    const b = await hashText('hello manual');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('differs for different input', async () => {
    expect(await hashText('rev A')).not.toBe(await hashText('rev B'));
  });
});

describe('isScannedBackend', () => {
  it('treats OCR backends as scanned (offsets not reproducible)', () => {
    expect(isScannedBackend('claude_vision')).toBe(true);
    expect(isScannedBackend('external_ocr')).toBe(true);
  });

  it('treats deterministic text backends as not scanned', () => {
    expect(isScannedBackend('pdfjs_text')).toBe(false);
    expect(isScannedBackend('mammoth')).toBe(false);
    expect(isScannedBackend('plain_text')).toBe(false);
    expect(isScannedBackend('xml_s1000d')).toBe(false);
  });
});
