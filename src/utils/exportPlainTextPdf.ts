import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont, type RGB } from 'pdf-lib';

const PAGE_SIZE: [number, number] = [612, 792];
const MARGIN = 50;
const MAX_WIDTH = 612 - MARGIN * 2;
const LINE_HEIGHT = 14;

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Lightweight markdown stripping for PDF body text (no renderer). */
export function stripMarkdownForPdf(markdown: string): string {
  let s = markdown;
  s = s.replace(/\r\n/g, '\n');
  s = s.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  s = s.replace(/\*\*([^*]+)\*\*/g, '$1');
  s = s.replace(/`([^`]+)`/g, '$1');
  s = s.replace(/\*([^*]+)\*/g, '$1');
  s = s.replace(/^#{1,6}\s+/gm, '');
  s = s.replace(/^[-*]\s+/gm, '• ');
  s = s.replace(/^\d+\.\s+/gm, '');
  return s.trim();
}

function drawWrappedLine(
  pdfDoc: PDFDocument,
  pageRef: { page: PDFPage; y: number },
  text: string,
  size: number,
  font: PDFFont,
  color: RGB
): void {
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > MAX_WIDTH && line) {
      if (pageRef.y < 56) {
        pageRef.page = pdfDoc.addPage(PAGE_SIZE);
        pageRef.y = 750;
      }
      pageRef.page.drawText(line, { x: MARGIN, y: pageRef.y, size, font, color });
      pageRef.y -= LINE_HEIGHT;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    if (pageRef.y < 56) {
      pageRef.page = pdfDoc.addPage(PAGE_SIZE);
      pageRef.y = 750;
    }
    pageRef.page.drawText(line, { x: MARGIN, y: pageRef.y, size, font, color });
    pageRef.y -= LINE_HEIGHT;
  }
}

export async function downloadPlainTextPdf(params: {
  filename: string;
  title: string;
  query: string;
  bodyMarkdown: string;
  modeLabel: string;
}): Promise<void> {
  const { filename, title, query, bodyMarkdown, modeLabel } = params;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdfDoc.addPage(PAGE_SIZE);
  const ref = { page, y: 750 };

  const heading = (t: string, sz = 14) => {
    if (ref.y < 80) {
      ref.page = pdfDoc.addPage(PAGE_SIZE);
      ref.y = 750;
    }
    ref.page.drawText(t, { x: MARGIN, y: ref.y, size: sz, font: bold, color: rgb(0.08, 0.12, 0.2) });
    ref.y -= LINE_HEIGHT + 4;
  };

  const meta = (t: string) => {
    drawWrappedLine(pdfDoc, ref, t, 9, font, rgb(0.35, 0.35, 0.38));
    ref.y -= 4;
  };

  heading(title, 16);
  meta(`Mode: ${modeLabel}`);
  meta(`Exported: ${new Date().toLocaleString()}`);
  ref.y -= 6;
  heading('Question', 12);
  drawWrappedLine(pdfDoc, ref, query, 11, font, rgb(0, 0, 0));
  ref.y -= 8;
  heading('Answer', 12);

  const plain = stripMarkdownForPdf(bodyMarkdown);
  const lines = plain.split('\n');
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) {
      ref.y -= 8;
      continue;
    }
    drawWrappedLine(pdfDoc, ref, line, 10, font, rgb(0.08, 0.08, 0.1));
  }

  const bytes = await pdfDoc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  downloadBlob(new Blob([copy], { type: 'application/pdf' }), filename);
}
