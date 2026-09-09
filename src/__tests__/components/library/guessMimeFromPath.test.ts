import { beforeAll, describe, expect, it, vi } from 'vitest';

// driveManualsScan imports DocumentExtractor (pdfjs). Stub heavy deps so this
// unit test only exercises guessMimeFromPath.
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: { workerSrc: '' },
  getDocument: vi.fn(),
}));
vi.mock('../../../services/claudeProxy', () => ({
  createClaudeMessage: vi.fn(),
}));

describe('guessMimeFromPath', () => {
  let guessMimeFromPath: (name: string) => string;

  beforeAll(async () => {
    ({ guessMimeFromPath } = await import('../../../components/library/driveManualsScan'));
  });

  it('maps Company Library allowlisted extensions used after desktop folder walk', () => {
    expect(guessMimeFromPath('scan-oxygen.png')).toBe('image/png');
    expect(guessMimeFromPath('flap.jpeg')).toBe('image/jpeg');
    expect(guessMimeFromPath('photo.jpg')).toBe('image/jpeg');
    expect(guessMimeFromPath('05-10-00.xml')).toBe('application/xml');
    expect(guessMimeFromPath('05-10-00-in_xml.js')).toBe('application/javascript');
    expect(guessMimeFromPath('AMM.pdf')).toBe('application/pdf');
    expect(guessMimeFromPath('memo.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(guessMimeFromPath('notes.txt')).toBe('text/plain');
  });

  it('returns octet-stream for unknown extensions', () => {
    expect(guessMimeFromPath('archive.zip')).toBe('application/octet-stream');
    expect(guessMimeFromPath('readme')).toBe('application/octet-stream');
  });

  it('uses the leaf extension of a nested path', () => {
    expect(guessMimeFromPath('GV/AMM/scan.png')).toBe('image/png');
    expect(guessMimeFromPath('GV\\chapter.xml')).toBe('application/xml');
  });
});
