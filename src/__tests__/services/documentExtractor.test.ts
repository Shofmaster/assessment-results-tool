import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));

vi.mock('../../services/claudeProxy', () => ({
  createClaudeMessage: vi.fn(),
}));

import { createClaudeMessage } from '../../services/claudeProxy';
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
