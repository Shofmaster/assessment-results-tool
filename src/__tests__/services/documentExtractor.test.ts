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
import { DocumentExtractor, resolvePeekKind } from '../../services/documentExtractor';

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

  it('routes empty MIME + .png extension to vision OCR (desktop walk hole)', async () => {
    (createClaudeMessage as any).mockResolvedValue({
      content: [{ type: 'text', text: 'oxygen bottle placard' }],
    });

    const extractor = new DocumentExtractor();
    const buffer = new Uint8Array([137, 80, 78, 71, 13, 10]).buffer;
    const result = await extractor.extractTextWithMetadata(buffer, 'scan-oxygen.png', '');

    expect(result.text).toContain('oxygen bottle placard');
    expect(result.metadata.backend).toBe('claude_vision');
    expect(createClaudeMessage).toHaveBeenCalled();
  });
});

describe('DocumentExtractor XML ingest routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('extracts readingText from generic XML and uses xml_generic backend', async () => {
    const xml = `<?xml version="1.0"?>
<manual>
  <title>Time Limits</title>
  <para>The Time Limits Section provides manufacturer recommended time limits.</para>
</manual>`;
    const buffer = new TextEncoder().encode(xml).buffer;
    const extractor = new DocumentExtractor();
    const result = await extractor.extractTextWithMetadata(buffer, '05-10-00.xml', 'application/xml');

    expect(result.metadata.backend).toBe('xml_generic');
    expect(result.text).toMatch(/Time Limits/i);
    expect(result.text).not.toMatch(/<para>/);
    expect(result.xmlIngest).toBeDefined();
  });

  it('routes empty MIME + .xml extension to XML ingest (desktop walk hole)', async () => {
    const xml = `<?xml version="1.0"?><doc><para>Hydraulic reservoir servicing.</para></doc>`;
    const buffer = new TextEncoder().encode(xml).buffer;
    const extractor = new DocumentExtractor();
    const result = await extractor.extractTextWithMetadata(buffer, 'AMM-29.xml', '');

    expect(result.metadata.backend).toMatch(/^xml_/);
    expect(result.text).toMatch(/Hydraulic reservoir/i);
    expect(createClaudeMessage).not.toHaveBeenCalled();
  });

  it('unwraps Gulfstream JS-wrapped XML and returns ata_ispec readingText', async () => {
    const jsWrapped = `XmlProc.Source["05-10-00-in_xml.js"] = '\\
<?xml version="1.0" encoding="iso-8859-1"?>\\
<printgroup><?REVNBR 60?><?REVDATE January 31/26?><?ATATITLE TIME LIMITS?><?ATANBR 05-10-00?>\\
  <inpgblk chapnbr="05" key="a" pgblknbr="00" sectnbr="10" subjnbr="00">\\
    <intro key="a1" id="idm1">\\
      <meta><ataref manual="AMM" model="G550"/></meta>\\
      <title>Time Limits</title>\\
      <topic id="t1">\\
        <title>Introduction</title>\\
        <para>The Time Limits Section provides manufacturer recommended time limits.</para>\\
      </topic>\\
    </intro>\\
  </inpgblk>\\
</printgroup>\\
';`;
    const buffer = new TextEncoder().encode(jsWrapped).buffer;
    const extractor = new DocumentExtractor();
    const result = await extractor.extractTextWithMetadata(
      buffer,
      '05-10-00-in_xml.js',
      'application/javascript',
    );

    expect(result.metadata.backend).toBe('xml_ata_ispec');
    expect(result.text).toMatch(/Time Limits/i);
    expect(result.text).not.toMatch(/XmlProc\.Source/);
    expect(result.xmlIngest?.format.family).toBe('ata_ispec');
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

describe('resolvePeekKind', () => {
  it('classifies pdf/docx as full-file peeks and txt/csv/xml as head-only text peeks', () => {
    expect(resolvePeekKind('manual.pdf', 'application/pdf')).toBe('pdf');
    expect(resolvePeekKind('memo.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
    expect(resolvePeekKind('notes.txt', 'text/plain')).toBe('text');
    expect(resolvePeekKind('list.csv', 'text/csv')).toBe('text');
    expect(resolvePeekKind('chapter.xml', 'application/xml')).toBe('text');
  });

  it('falls back to the extension when the MIME type is generic', () => {
    expect(resolvePeekKind('manual.pdf', 'application/octet-stream')).toBe('pdf');
    expect(resolvePeekKind('manual.pdf', '')).toBe('pdf');
  });

  it('returns null for files a peek cannot read (images, unknown, Google-native)', () => {
    expect(resolvePeekKind('photo.png', 'image/png')).toBeNull();
    expect(resolvePeekKind('archive.zip', 'application/zip')).toBeNull();
    expect(resolvePeekKind('Doc', 'application/vnd.google-apps.document')).toBeNull();
  });
});
