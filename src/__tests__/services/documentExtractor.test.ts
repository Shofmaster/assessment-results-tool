import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

vi.mock('../../services/claudeProxy', () => ({
  createClaudeMessage: vi.fn(),
}));

import { createClaudeMessage } from '../../services/claudeProxy';
import { getDocument } from 'pdfjs-dist';
import { DocumentExtractor } from '../../services/documentExtractor';

describe('DocumentExtractor metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns OCR backend metadata for image extraction', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [{ type: 'text', text: 'recognized text' }],
    });

    const extractor = new DocumentExtractor();
    const buffer = new Uint8Array([137, 80, 78, 71, 13, 10]).buffer;
    const result = await extractor.extractTextWithMetadata(buffer, 'sample.png', 'image/png');

    expect(result.text).toContain('recognized text');
    expect(result.metadata.backend).toBe('claude_vision');
  });
});

function mockPdf(firstPageItems: Array<{ str: string }>) {
  const pdf = {
    numPages: 1,
    getPage: vi.fn().mockResolvedValue({
      getTextContent: vi.fn().mockResolvedValue({ items: firstPageItems }),
    }),
  };
  (getDocument as any).mockReturnValue({ promise: Promise.resolve(pdf) });
  return pdf;
}

describe('DocumentExtractor.extractPeekText (classification peek)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('reads only the first page text layer of a PDF and never OCRs', async () => {
    const pdf = mockPdf([{ str: 'ILLUSTRATED' }, { str: 'PARTS' }, { str: 'CATALOG' }]);
    const extractor = new DocumentExtractor();
    const text = await extractor.extractPeekText(new Uint8Array([1, 2, 3]).buffer, 'doc.pdf', 'application/pdf');

    expect(text).toBe('ILLUSTRATED PARTS CATALOG');
    expect(pdf.getPage).toHaveBeenCalledTimes(1);
    expect(pdf.getPage).toHaveBeenCalledWith(1);
    expect(createClaudeMessage).not.toHaveBeenCalled();
  });

  it('returns "" for a scanned PDF (no text layer) without falling back to Vision OCR', async () => {
    mockPdf([]);
    const extractor = new DocumentExtractor();
    const text = await extractor.extractPeekText(new Uint8Array([1, 2, 3]).buffer, 'scan.pdf', 'application/pdf');

    expect(text).toBe('');
    expect(createClaudeMessage).not.toHaveBeenCalled();
  });

  it('returns "" for images (a peek would require OCR)', async () => {
    const extractor = new DocumentExtractor();
    const text = await extractor.extractPeekText(new Uint8Array([137, 80, 78, 71]).buffer, 'photo.png', 'image/png');

    expect(text).toBe('');
    expect(createClaudeMessage).not.toHaveBeenCalled();
  });
});
