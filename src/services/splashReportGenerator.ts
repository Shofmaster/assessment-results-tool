import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import { stripMarkdownForPdf } from '../utils/exportPlainTextPdf';

export type SplashReportEntry = {
  question: string;
  answerBody: string;
  sources: string[];
  manuals: { name: string; category: string }[];
  agents: string[];
  partNumbers: { partNumber: string; description?: string }[];
  actions: { title: string }[];
};

export type SplashReportInput = {
  title: string;
  companyName?: string;
  modeLabel: string;
  generatedAt: Date;
  entries: SplashReportEntry[];
};

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

function formatCategory(category: string): string {
  const trimmed = (category || '').trim();
  if (!trimmed) return 'Other';
  return trimmed
    .split(/[_\s]+/)
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(' ');
}

export async function downloadSplashReportPdf(input: SplashReportInput): Promise<void> {
  const { title, companyName, modeLabel, generatedAt, entries } = input;

  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const LEFT = 50;
  const RIGHT = PAGE_W - 50;
  const MAX_TEXT_W = RIGHT - LEFT;
  const LINE_H = 14;
  const BOTTOM_MARGIN = 60;

  const NAVY = rgb(0.04, 0.1, 0.16);
  const SKY = rgb(0.48, 0.74, 0.99);
  const BODY = rgb(0.1, 0.1, 0.12);
  const MUTED = rgb(0.4, 0.4, 0.44);

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 42;

  const ensureSpace = (needed: number) => {
    if (y - needed < BOTTOM_MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 42;
    }
  };

  const drawText = (text: string, x: number, size: number, font: PDFFont, color = BODY) => {
    page.drawText(text, { x, y, size, font, color });
    y -= size + 4;
  };

  const drawWrapped = (
    text: string,
    x: number,
    maxW: number,
    size: number,
    font: PDFFont,
    color = BODY,
  ): void => {
    const paragraphs = text.split('\n');
    for (const paragraph of paragraphs) {
      if (paragraph.trim() === '') {
        y -= LINE_H;
        ensureSpace(LINE_H);
        continue;
      }
      const words = paragraph.split(' ');
      let line = '';
      for (const word of words) {
        const test = line + word + ' ';
        const w = font.widthOfTextAtSize(test, size);
        if (w > maxW && line !== '') {
          ensureSpace(LINE_H);
          page.drawText(line.trim(), { x, y, size, font, color });
          y -= LINE_H;
          line = word + ' ';
        } else {
          line = test;
        }
      }
      if (line.trim()) {
        ensureSpace(LINE_H);
        page.drawText(line.trim(), { x, y, size, font, color });
        y -= LINE_H;
      }
    }
  };

  const sectionLabel = (label: string) => {
    ensureSpace(28);
    y -= 6;
    drawText(label, LEFT, 11, helveticaBold, NAVY);
  };

  // ── COVER HEADER ──────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - 92, width: PAGE_W, height: 92, color: NAVY });
  y = PAGE_H - 37;
  drawText(title, LEFT, 22, helveticaBold, rgb(1, 1, 1));
  y = PAGE_H - 64;
  drawText('Search & reference report', LEFT, 12, helvetica, SKY);

  y = PAGE_H - 124;
  if (companyName) drawText(`Company: ${companyName}`, LEFT, 13, helveticaBold);
  drawText(`Mode: ${modeLabel}`, LEFT, 11, helvetica, MUTED);
  drawText(`Generated: ${generatedAt.toLocaleString()}`, LEFT, 11, helvetica, MUTED);
  drawText(
    `Entries: ${entries.length} ${entries.length === 1 ? 'question' : 'questions'}`,
    LEFT,
    11,
    helvetica,
    MUTED,
  );
  y -= 6;

  // ── ENTRIES ───────────────────────────────────────────────
  entries.forEach((entry, idx) => {
    ensureSpace(60);
    y -= 10;
    page.drawRectangle({ x: LEFT, y: y + 4, width: MAX_TEXT_W, height: 1, color: rgb(0.78, 0.82, 0.88) });
    y -= 10;

    drawWrapped(`Q${idx + 1}. ${entry.question}`, LEFT, MAX_TEXT_W, 13, helveticaBold, NAVY);
    y -= 4;

    sectionLabel('Answer');
    const answer = stripMarkdownForPdf(entry.answerBody) || '(no answer text)';
    drawWrapped(answer, LEFT, MAX_TEXT_W, 10, helvetica, BODY);

    if (entry.partNumbers.length > 0) {
      sectionLabel('Part Numbers');
      for (const pn of entry.partNumbers) {
        const line = pn.description ? `${pn.partNumber} — ${pn.description}` : pn.partNumber;
        drawWrapped(line, LEFT + 8, MAX_TEXT_W - 8, 10, helvetica, BODY);
      }
    }

    if (entry.actions.length > 0) {
      sectionLabel('Recommended Actions');
      for (const action of entry.actions) {
        drawWrapped(`[ ]  ${action.title}`, LEFT + 8, MAX_TEXT_W - 8, 10, helvetica, BODY);
        y -= 2;
      }
    }

    const hasReferences =
      entry.sources.length > 0 || entry.manuals.length > 0 || entry.agents.length > 0;
    if (hasReferences) {
      sectionLabel('References');

      if (entry.sources.length > 0) {
        drawText('Sources', LEFT + 8, 10, helveticaBold, MUTED);
        for (const src of entry.sources) {
          drawWrapped(`• ${src}`, LEFT + 14, MAX_TEXT_W - 14, 10, helvetica, BODY);
        }
      }

      if (entry.manuals.length > 0) {
        y -= 2;
        drawText('Manuals used', LEFT + 8, 10, helveticaBold, MUTED);
        const byCategory = new Map<string, string[]>();
        for (const manual of entry.manuals) {
          const key = formatCategory(manual.category);
          if (!byCategory.has(key)) byCategory.set(key, []);
          byCategory.get(key)!.push(manual.name);
        }
        for (const [category, names] of byCategory) {
          drawWrapped(`${category}: ${names.join(', ')}`, LEFT + 14, MAX_TEXT_W - 14, 10, helvetica, BODY);
        }
      }

      if (entry.agents.length > 0) {
        y -= 2;
        drawText('Experts consulted', LEFT + 8, 10, helveticaBold, MUTED);
        drawWrapped(entry.agents.join(', '), LEFT + 14, MAX_TEXT_W - 14, 10, helvetica, BODY);
      }
    }

    y -= 8;
  });

  // ── PAGE NUMBERS ──────────────────────────────────────────
  const pages = pdfDoc.getPages();
  for (let i = 0; i < pages.length; i++) {
    pages[i].drawText(`Page ${i + 1} of ${pages.length}`, {
      x: 270,
      y: 30,
      size: 9,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const bytes = await pdfDoc.save();
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const date = generatedAt.toISOString().slice(0, 10);
  downloadBlob(new Blob([copy], { type: 'application/pdf' }), `aerogap-report-${date}.pdf`);
}
