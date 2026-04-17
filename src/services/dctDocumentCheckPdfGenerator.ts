import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';

/** One finding row for export (paperwork-review-style severity + narrative body). */
export interface DctDocumentCheckFindingForPdf {
  severity: string;
  traceStatus?: string;
  dctFileName?: string;
  questionText: string;
  /** Full narrative: question, rationale, evidence, human status — already composed by caller. */
  description: string;
  humanStatus?: string;
}

export interface DctDocumentCheckTotalsForPdf {
  questions: number;
  critical: number;
  major: number;
  minor: number;
  observation: number;
  aligned: number;
  gap: number;
  mismatch: number;
  pending: number;
}

/** Single document-check session (one run or edited session). */
export interface DctDocumentCheckSessionForPdf {
  projectName?: string;
  sessionTitle?: string;
  status: string;
  verdict?: string;
  scope?: string;
  notes?: string;
  perspectiveLabel?: string;
  model?: string;
  totals?: DctDocumentCheckTotalsForPdf;
  findings: DctDocumentCheckFindingForPdf[];
  startedAt?: string;
  completedAt?: string;
  exportedAt: string;
}

const NAVY = rgb(0.06, 0.09, 0.16);
const NAVY_MID = rgb(0.09, 0.13, 0.22);
const ACCENT_SKY = rgb(0.22, 0.58, 0.92);
const ACCENT_GOLD = rgb(0.87, 0.72, 0.25);
const WHITE = rgb(1, 1, 1);
const LIGHT_GRAY = rgb(0.94, 0.95, 0.96);
const MID_GRAY = rgb(0.6, 0.62, 0.66);
const DARK_TEXT = rgb(0.15, 0.15, 0.18);
const SUBTLE_TEXT = rgb(0.45, 0.47, 0.52);

const SEVERITY_COLORS: Record<string, { bg: RGB; text: RGB; label: string }> = {
  critical: { bg: rgb(0.92, 0.22, 0.22), text: WHITE, label: 'CRITICAL' },
  major: { bg: rgb(0.92, 0.6, 0.15), text: WHITE, label: 'MAJOR' },
  minor: { bg: rgb(0.85, 0.78, 0.2), text: rgb(0.25, 0.22, 0.05), label: 'MINOR' },
  observation: { bg: rgb(0.22, 0.58, 0.92), text: WHITE, label: 'OBSERVATION' },
};

const VERDICT_COLORS: Record<string, { bg: RGB; text: RGB }> = {
  pass: { bg: rgb(0.16, 0.65, 0.38), text: WHITE },
  conditional: { bg: rgb(0.92, 0.6, 0.15), text: WHITE },
  fail: { bg: rgb(0.85, 0.2, 0.2), text: WHITE },
  pending: { bg: rgb(0.5, 0.52, 0.56), text: WHITE },
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_L = 50;
const MARGIN_R = 562;
const CONTENT_W = MARGIN_R - MARGIN_L;
const LINE_H = 14;
const FOOTER_Y = 40;

/**
 * PDF export for DCT Document Check sessions (layout aligned with paperwork review:
 * cover band, overview stats, info box, scope/notes blocks, severity-styled finding cards).
 */
export class DctDocumentCheckPdfGenerator {
  private pdfDoc!: PDFDocument;
  private page!: PDFPage;
  private y = 0;
  private fonts!: {
    regular: PDFFont;
    bold: PDFFont;
    italic: PDFFont;
  };

  async generate(session: DctDocumentCheckSessionForPdf): Promise<Uint8Array> {
    this.pdfDoc = await PDFDocument.create();
    this.fonts = {
      regular: await this.pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await this.pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await this.pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    };

    this.newPage();
    this.drawCoverHeader(session);
    this.drawSummaryStats(session);
    this.drawSectionDivider();
    this.drawSessionSection(session);
    this.drawPageFooters();

    return await this.pdfDoc.save();
  }

  private newPage(): PDFPage {
    this.page = this.pdfDoc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - 50;
    return this.page;
  }

  private ensureSpace(needed: number) {
    if (this.y - needed < FOOTER_Y + 20) {
      this.newPage();
    }
  }

  private drawCoverHeader(s: DctDocumentCheckSessionForPdf) {
    const headerH = 120;

    this.page.drawRectangle({
      x: 0,
      y: PAGE_H - headerH,
      width: PAGE_W,
      height: headerH,
      color: NAVY,
    });
    this.page.drawRectangle({
      x: 0,
      y: PAGE_H - headerH,
      width: PAGE_W,
      height: 3,
      color: ACCENT_GOLD,
    });
    this.page.drawRectangle({
      x: 0,
      y: PAGE_H - headerH,
      width: 5,
      height: headerH,
      color: ACCENT_SKY,
    });

    this.text('DCT DOCUMENT CHECK REPORT', MARGIN_L, PAGE_H - 45, 22, this.fonts.bold, WHITE);

    if (s.projectName) {
      this.text(`Project: ${s.projectName}`, MARGIN_L, PAGE_H - 68, 13, this.fonts.regular, ACCENT_GOLD);
    }

    this.text(
      'Applicable DCT requirements vs. company manuals',
      MARGIN_L,
      PAGE_H - (s.projectName ? 88 : 72),
      11,
      this.fonts.italic,
      rgb(0.65, 0.75, 0.88),
    );

    const dateStr = new Date(s.exportedAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeStr = new Date(s.exportedAt).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const exportLabel = `Exported: ${dateStr} at ${timeStr}`;
    const exportW = this.fonts.regular.widthOfTextAtSize(exportLabel, 9);
    this.text(exportLabel, PAGE_W - exportW - MARGIN_L, PAGE_H - 45, 9, this.fonts.regular, rgb(0.55, 0.65, 0.78));

    const countLabel = `${s.findings.length} finding${s.findings.length !== 1 ? 's' : ''}`;
    const countW = this.fonts.bold.widthOfTextAtSize(countLabel, 9);
    const badgeX = PAGE_W - countW - MARGIN_L - 16;
    const badgeY = PAGE_H - 68;
    this.page.drawRectangle({
      x: badgeX - 4,
      y: badgeY - 4,
      width: countW + 20,
      height: 18,
      color: ACCENT_SKY,
    });
    this.text(countLabel, badgeX + 6, badgeY, 9, this.fonts.bold, WHITE);

    this.y = PAGE_H - headerH - 24;
  }

  private drawSummaryStats(s: DctDocumentCheckSessionForPdf) {
    const t = s.totals;
    const critical = t?.critical ?? s.findings.filter((f) => f.severity === 'critical').length;
    const major = t?.major ?? s.findings.filter((f) => f.severity === 'major').length;
    const questions = t?.questions ?? s.findings.length;
    const gapMismatch =
      t != null ? t.gap + t.mismatch : s.findings.filter((f) => f.traceStatus === 'gap' || f.traceStatus === 'mismatch').length;

    const stats = [
      { label: 'Questions', value: String(questions), color: ACCENT_SKY },
      { label: 'Critical', value: String(critical), color: rgb(0.85, 0.2, 0.2) },
      { label: 'Major', value: String(major), color: rgb(0.92, 0.6, 0.15) },
      { label: 'Gaps + mismatches', value: String(gapMismatch), color: ACCENT_GOLD },
    ];

    const boxW = (CONTENT_W - 30) / 4;
    const boxH = 48;

    this.ensureSpace(boxH + 30);

    this.text('Overview', MARGIN_L, this.y, 12, this.fonts.bold, DARK_TEXT);
    this.y -= 20;

    for (let i = 0; i < stats.length; i++) {
      const x = MARGIN_L + i * (boxW + 10);

      this.page.drawRectangle({
        x,
        y: this.y - boxH,
        width: boxW,
        height: boxH,
        color: LIGHT_GRAY,
        borderColor: rgb(0.88, 0.89, 0.92),
        borderWidth: 0.5,
      });

      this.page.drawRectangle({
        x,
        y: this.y - boxH,
        width: 3,
        height: boxH,
        color: stats[i].color,
      });

      this.text(stats[i].value, x + 14, this.y - 20, 18, this.fonts.bold, DARK_TEXT);
      this.text(stats[i].label, x + 14, this.y - 36, 8, this.fonts.regular, SUBTLE_TEXT);
    }

    this.y -= boxH + 20;
  }

  private drawSectionDivider() {
    this.y -= 6;
    this.page.drawRectangle({
      x: MARGIN_L,
      y: this.y,
      width: CONTENT_W,
      height: 1.5,
      color: rgb(0.88, 0.89, 0.92),
    });
    this.y -= 18;
  }

  private drawSessionSection(s: DctDocumentCheckSessionForPdf) {
    const title = s.sessionTitle?.trim() || 'Document check session';
    this.drawSectionTitle(title);
    this.drawInfoBox(s);

    if (s.scope?.trim()) {
      this.ensureSpace(50);
      this.drawFieldBlock('Scope', s.scope.trim());
    }
    if (s.notes?.trim()) {
      this.ensureSpace(50);
      this.drawFieldBlock('Notes', s.notes.trim());
    }

    if (s.findings.length > 0) {
      this.ensureSpace(60);
      this.drawFindingsCards(s.findings);
    } else {
      this.ensureSpace(30);
      this.y -= 4;
      this.text('No findings in this session.', MARGIN_L + 8, this.y, 9, this.fonts.italic, SUBTLE_TEXT);
      this.y -= 16;
    }
  }

  private drawSectionTitle(title: string) {
    this.ensureSpace(36);

    this.page.drawRectangle({
      x: MARGIN_L,
      y: this.y - 4,
      width: CONTENT_W,
      height: 26,
      color: NAVY_MID,
    });

    this.page.drawRectangle({
      x: MARGIN_L,
      y: this.y - 4,
      width: 4,
      height: 26,
      color: ACCENT_SKY,
    });

    this.text(title, MARGIN_L + 14, this.y + 3, 12, this.fonts.bold, WHITE);
    this.y -= 36;
  }

  private drawInfoBox(s: DctDocumentCheckSessionForPdf) {
    const rows: { label: string; value: string; color?: RGB }[] = [
      { label: 'Corpus', value: 'Entity, regulatory, SMS, and uploaded manuals (extracted text)' },
      { label: 'Status', value: String(s.status || '—').charAt(0).toUpperCase() + String(s.status || '').slice(1) },
    ];

    if (s.verdict) {
      const v = s.verdict.toLowerCase();
      rows.push({
        label: 'Verdict',
        value: s.verdict.charAt(0).toUpperCase() + s.verdict.slice(1),
        color: VERDICT_COLORS[v]?.bg,
      });
    }

    if (s.perspectiveLabel) {
      rows.push({ label: 'Perspective', value: s.perspectiveLabel });
    }
    if (s.model) {
      rows.push({ label: 'Model', value: s.model });
    }

    if (s.startedAt) {
      rows.push({
        label: 'Started',
        value: new Date(s.startedAt).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }
    if (s.completedAt) {
      rows.push({
        label: 'Completed',
        value: new Date(s.completedAt).toLocaleString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      });
    }

    const rowH = 20;
    const totalH = rows.length * rowH + 12;
    this.ensureSpace(totalH + 10);

    this.page.drawRectangle({
      x: MARGIN_L,
      y: this.y - totalH,
      width: CONTENT_W,
      height: totalH,
      borderColor: rgb(0.82, 0.84, 0.88),
      borderWidth: 0.75,
      color: rgb(0.985, 0.985, 0.99),
    });

    const labelColW = 160;
    let ry = this.y - 6;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (i % 2 === 0) {
        this.page.drawRectangle({
          x: MARGIN_L + 0.5,
          y: ry - rowH + 4,
          width: CONTENT_W - 1,
          height: rowH,
          color: rgb(0.96, 0.965, 0.975),
        });
      }

      this.text(row.label, MARGIN_L + 10, ry - 10, 9, this.fonts.bold, SUBTLE_TEXT);

      if (row.label === 'Verdict' && row.color) {
        const badgeW = this.fonts.bold.widthOfTextAtSize(row.value, 9) + 14;
        this.page.drawRectangle({
          x: MARGIN_L + labelColW,
          y: ry - 14,
          width: badgeW,
          height: 16,
          color: row.color,
        });
        this.text(row.value, MARGIN_L + labelColW + 7, ry - 10, 9, this.fonts.bold, WHITE);
      } else {
        const maxValueW = CONTENT_W - labelColW - 20;
        const valueW = this.fonts.regular.widthOfTextAtSize(row.value, 9);
        if (valueW > maxValueW) {
          this.wrapText(row.value, MARGIN_L + labelColW, ry - 10, maxValueW, 9, this.fonts.regular, DARK_TEXT);
        } else {
          this.text(row.value, MARGIN_L + labelColW, ry - 10, 9, this.fonts.regular, DARK_TEXT);
        }
      }

      ry -= rowH;
    }

    this.y -= totalH + 12;
  }

  private drawFieldBlock(label: string, content: string) {
    this.text(label, MARGIN_L, this.y, 10, this.fonts.bold, DARK_TEXT);
    this.y -= 16;

    const boxPad = 10;
    const maxTextW = CONTENT_W - boxPad * 2;
    const lineCount = this.countLines(content, maxTextW, 9, this.fonts.regular);
    const blockH = lineCount * LINE_H + boxPad * 2;

    this.ensureSpace(blockH + 6);

    this.page.drawRectangle({
      x: MARGIN_L,
      y: this.y - blockH,
      width: CONTENT_W,
      height: blockH,
      color: rgb(0.97, 0.975, 0.985),
      borderColor: rgb(0.86, 0.88, 0.92),
      borderWidth: 0.5,
    });

    this.y -= boxPad;
    this.y = this.wrapText(content, MARGIN_L + boxPad, this.y, maxTextW, 9, this.fonts.regular, DARK_TEXT);
    this.y -= boxPad + 8;
  }

  private drawFindingsCards(findings: DctDocumentCheckFindingForPdf[]) {
    this.text(`Findings (${findings.length})`, MARGIN_L, this.y, 11, this.fonts.bold, DARK_TEXT);
    this.y -= 20;

    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      const sev = SEVERITY_COLORS[f.severity] ?? SEVERITY_COLORS.observation;

      const descLines = this.countLines(f.description || '—', CONTENT_W - 30, 9, this.fonts.regular);
      const cardH = 36 + descLines * LINE_H;

      this.ensureSpace(cardH + 12);

      this.page.drawRectangle({
        x: MARGIN_L,
        y: this.y - cardH,
        width: CONTENT_W,
        height: cardH,
        color: rgb(0.985, 0.985, 0.99),
        borderColor: rgb(0.84, 0.86, 0.9),
        borderWidth: 0.5,
      });

      this.page.drawRectangle({
        x: MARGIN_L,
        y: this.y - cardH,
        width: 4,
        height: cardH,
        color: sev.bg,
      });

      this.text(`#${i + 1}`, MARGIN_L + 12, this.y - 14, 9, this.fonts.bold, SUBTLE_TEXT);

      const badgeW = this.fonts.bold.widthOfTextAtSize(sev.label, 8) + 12;
      const badgeX = MARGIN_L + 34;
      this.page.drawRectangle({
        x: badgeX,
        y: this.y - 18,
        width: badgeW,
        height: 14,
        color: sev.bg,
      });
      this.text(sev.label, badgeX + 6, this.y - 14, 8, this.fonts.bold, sev.text);

      let metaX = badgeX + badgeW + 10;
      if (f.traceStatus) {
        const st = `[${f.traceStatus}]`;
        this.text(st, metaX, this.y - 14, 8, this.fonts.italic, MID_GRAY);
        metaX += this.fonts.italic.widthOfTextAtSize(st, 8) + 8;
      }
      if (f.dctFileName) {
        this.text(f.dctFileName, metaX, this.y - 14, 8, this.fonts.italic, MID_GRAY);
      }

      const descY = this.y - 30;
      this.wrapText(f.description || '—', MARGIN_L + 14, descY, CONTENT_W - 30, 9, this.fonts.regular, DARK_TEXT);

      this.y -= cardH + 8;
    }
  }

  private drawPageFooters() {
    const pages = this.pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const pg = pages[i];

      pg.drawRectangle({
        x: MARGIN_L,
        y: FOOTER_Y + 10,
        width: CONTENT_W,
        height: 0.5,
        color: rgb(0.85, 0.86, 0.9),
      });

      const pgLabel = `Page ${i + 1} of ${pages.length}`;
      const pgW = this.fonts.regular.widthOfTextAtSize(pgLabel, 8);
      pg.drawText(pgLabel, {
        x: (PAGE_W - pgW) / 2,
        y: FOOTER_Y - 2,
        size: 8,
        font: this.fonts.regular,
        color: MID_GRAY,
      });

      const brand = 'AeroGap — DCT Document Check';
      const brandW = this.fonts.italic.widthOfTextAtSize(brand, 7);
      pg.drawText(brand, {
        x: PAGE_W - brandW - MARGIN_L,
        y: FOOTER_Y - 2,
        size: 7,
        font: this.fonts.italic,
        color: rgb(0.7, 0.72, 0.76),
      });

      const dateFoot = new Date().toLocaleDateString();
      pg.drawText(dateFoot, {
        x: MARGIN_L,
        y: FOOTER_Y - 2,
        size: 7,
        font: this.fonts.regular,
        color: rgb(0.7, 0.72, 0.76),
      });
    }
  }

  private text(str: string, x: number, y: number, size: number, font: PDFFont, color: RGB) {
    this.page.drawText(str, { x, y, size, font, color });
  }

  private wrapText(
    text: string,
    x: number,
    startY: number,
    maxW: number,
    size: number,
    font: PDFFont,
    color: RGB,
  ): number {
    const words = text.split(/\s+/);
    let line = '';
    let y = startY;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const w = font.widthOfTextAtSize(testLine + ' ', size);

      if (w > maxW && line) {
        this.page.drawText(line, { x, y, size, font, color });
        line = word;
        y -= LINE_H;

        if (y < FOOTER_Y + 20) {
          this.newPage();
          y = this.y;
        }
      } else {
        line = testLine;
      }
    }

    if (line) {
      this.page.drawText(line, { x, y, size, font, color });
      y -= LINE_H;
    }

    return y;
  }

  private countLines(text: string, maxW: number, size: number, font: PDFFont): number {
    const words = text.split(/\s+/);
    let line = '';
    let count = 1;

    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(testLine + ' ', size) > maxW && line) {
        count++;
        line = word;
      } else {
        line = testLine;
      }
    }

    return count;
  }
}
