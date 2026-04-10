import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';

export interface DctComplianceFindingForPdf {
  severity: 'gap' | 'mismatch' | 'aligned' | 'pending';
  dctFileName: string;
  questionPreview: string;
  evidenceSnippet?: string;
  rationale?: string;
  resolved?: boolean;
}

export interface DctComplianceReportForPdf {
  projectName: string;
  reportTitle?: string;
  statusLabel: string;
  verdict: string;
  executiveConclusion: string;
  metrics: {
    totalQuestions: number;
    aligned: number;
    gap: number;
    mismatch: number;
    pending: number;
    unresolvedGapOrMismatch: number;
  };
  revision: {
    lastCheckCompletedAt?: string;
    nextDueAt?: string;
    overdue: boolean;
    lastXmlIngestAt?: string;
    lastDrssyncAt?: string;
  };
  findings: DctComplianceFindingForPdf[];
  generatedAt: string;
}

const NAVY = rgb(0.06, 0.09, 0.16);
const NAVY_MID = rgb(0.09, 0.13, 0.22);
const ACCENT_SKY = rgb(0.22, 0.58, 0.92);
const ACCENT_GOLD = rgb(0.87, 0.72, 0.25);
const WHITE = rgb(1, 1, 1);
const LIGHT_GRAY = rgb(0.94, 0.95, 0.96);
const DARK_TEXT = rgb(0.15, 0.15, 0.18);
const SUBTLE_TEXT = rgb(0.45, 0.47, 0.52);
const RED = rgb(0.85, 0.22, 0.22);
const GREEN = rgb(0.16, 0.65, 0.38);
const AMBER = rgb(0.92, 0.6, 0.15);

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_L = 50;
const MARGIN_R = 562;
const CONTENT_W = MARGIN_R - MARGIN_L;
const FOOTER_Y = 40;

export class DctCompliancePdfGenerator {
  private pdfDoc!: PDFDocument;
  private page!: PDFPage;
  private y = 0;
  private fonts!: { regular: PDFFont; bold: PDFFont; italic: PDFFont };
  private pageIndex = 0;

  async generate(payload: DctComplianceReportForPdf): Promise<Uint8Array> {
    this.pdfDoc = await PDFDocument.create();
    this.fonts = {
      regular: await this.pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await this.pdfDoc.embedFont(StandardFonts.HelveticaBold),
      italic: await this.pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    };
    this.newPage();
    this.drawHeader(payload);
    this.drawMetrics(payload);
    this.drawRevision(payload);
    this.drawConclusion(payload);
    this.drawFindings(payload);
    this.drawFooters();
    return this.pdfDoc.save();
  }

  private newPage() {
    this.page = this.pdfDoc.addPage([PAGE_W, PAGE_H]);
    this.pageIndex++;
    this.y = PAGE_H - 50;
  }

  private ensure(n: number) {
    if (this.y - n < FOOTER_Y + 24) this.newPage();
  }

  private text(s: string, x: number, y: number, size: number, font: PDFFont, color: RGB = DARK_TEXT) {
    this.page.drawText(s, { x, y, size, font, color, maxWidth: CONTENT_W });
  }

  private wrap(s: string, x: number, y: number, w: number, size: number, font: PDFFont, color: RGB): number {
    const words = s.split(/\s+/);
    let line = '';
    let cy = y;
    for (const wd of words) {
      const test = line ? `${line} ${wd}` : wd;
      if (font.widthOfTextAtSize(test, size) > w && line) {
        this.ensure(16);
        this.text(line, x, cy, size, font, color);
        cy -= size + 2;
        line = wd;
      } else {
        line = test;
      }
    }
    if (line) {
      this.ensure(16);
      this.text(line, x, cy, size, font, color);
      cy -= size + 2;
    }
    return cy;
  }

  private drawHeader(p: DctComplianceReportForPdf) {
    const headerH = 110;
    this.page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: NAVY });
    this.page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: 3, color: ACCENT_GOLD });
    this.page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: 5, height: headerH, color: ACCENT_SKY });
    this.text('DCT COMPLIANCE REPORT', MARGIN_L, PAGE_H - 42, 20, this.fonts.bold, WHITE);
    this.text(p.reportTitle ?? 'FAA SAS DCT — Manual Traceability', MARGIN_L, PAGE_H - 64, 11, this.fonts.italic, rgb(0.65, 0.75, 0.88));
    this.text(`Project: ${p.projectName}`, MARGIN_L, PAGE_H - 86, 12, this.fonts.regular, ACCENT_GOLD);
    const dateStr = new Date(p.generatedAt).toLocaleString();
    const dl = `Generated: ${dateStr}`;
    const dw = this.fonts.regular.widthOfTextAtSize(dl, 9);
    this.text(dl, PAGE_W - dw - MARGIN_L, PAGE_H - 42, 9, this.fonts.regular, rgb(0.55, 0.65, 0.78));
    this.y = PAGE_H - headerH - 28;
  }

  private metricAccentColor(label: string): RGB {
    if (label.includes('Gap') || label.includes('Mismatch')) return RED;
    if (label.includes('Aligned')) return GREEN;
    if (label.includes('Pending')) return ACCENT_SKY;
    if (label.includes('Status')) {
      if (label.toLowerCase().includes('red')) return RED;
      if (label.toLowerCase().includes('green')) return GREEN;
      if (label.toLowerCase().includes('yellow')) return AMBER;
    }
    return DARK_TEXT;
  }

  private drawMetrics(p: DctComplianceReportForPdf) {
    this.ensure(80);
    this.text('Overview', MARGIN_L, this.y, 12, this.fonts.bold, DARK_TEXT);
    this.y -= 18;
    const stats = [
      { label: 'Status', value: p.statusLabel },
      { label: 'Requirements', value: String(p.metrics.totalQuestions) },
      { label: 'Aligned', value: String(p.metrics.aligned) },
      { label: 'Gaps + Mismatches (open)', value: String(p.metrics.unresolvedGapOrMismatch) },
      { label: 'Pending', value: String(p.metrics.pending) },
    ];
    const boxW = (CONTENT_W - 40) / 5;
    const boxH = 46;
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
      this.page.drawRectangle({ x, y: this.y - boxH, width: 3, height: boxH, color: this.metricAccentColor(stats[i].label) });
      this.text(stats[i].value, x + 10, this.y - 18, stats[i].label === 'Status' ? 11 : 16, this.fonts.bold, DARK_TEXT);
      this.text(stats[i].label, x + 10, this.y - 34, 7, this.fonts.regular, SUBTLE_TEXT);
    }
    this.y -= boxH + 24;
    this.text(`Verdict: ${p.verdict}`, MARGIN_L, this.y, 10, this.fonts.bold, DARK_TEXT);
    this.y -= 20;
  }

  private drawRevision(p: DctComplianceReportForPdf) {
    this.ensure(100);
    this.text('Revision & schedule', MARGIN_L, this.y, 11, this.fonts.bold, NAVY_MID);
    this.y -= 16;
    const r = p.revision;
    const lines = [
      `Last completed check: ${r.lastCheckCompletedAt ?? '—'}`,
      `Next due: ${r.nextDueAt ?? '—'}${r.overdue ? '  (OVERDUE)' : ''}`,
      `Last XML ingest: ${r.lastXmlIngestAt ?? '—'}`,
      `Last DRS catalog sync: ${r.lastDrssyncAt ?? '—'}`,
    ];
    for (const line of lines) {
      this.ensure(14);
      this.text(line, MARGIN_L + 4, this.y, 9, this.fonts.regular, SUBTLE_TEXT);
      this.y -= 13;
    }
    this.y -= 10;
  }

  private drawConclusion(p: DctComplianceReportForPdf) {
    this.ensure(60);
    this.text('Executive compliance conclusion', MARGIN_L, this.y, 11, this.fonts.bold, NAVY_MID);
    this.y -= 16;
    this.y = this.wrap(p.executiveConclusion, MARGIN_L + 4, this.y, CONTENT_W - 8, 9, this.fonts.regular, DARK_TEXT);
    this.y -= 12;
  }

  private sevColor(sev: DctComplianceFindingForPdf['severity']): RGB {
    if (sev === 'mismatch') return RED;
    if (sev === 'gap') return AMBER;
    if (sev === 'aligned') return GREEN;
    return SUBTLE_TEXT;
  }

  private drawFindings(p: DctComplianceReportForPdf) {
    const open = p.findings.filter((f) => f.severity === 'gap' || f.severity === 'mismatch').slice(0, 50);
    if (open.length === 0) {
      this.ensure(30);
      this.text('No open gaps or mismatches in this snapshot.', MARGIN_L, this.y, 9, this.fonts.italic, SUBTLE_TEXT);
      return;
    }
    this.ensure(40);
    this.text('Per-requirement findings (gaps & mismatches)', MARGIN_L, this.y, 11, this.fonts.bold, NAVY_MID);
    this.y -= 18;
    for (const f of open) {
      this.ensure(70);
      const tag = `[${f.severity.toUpperCase()}]${f.resolved ? ' (resolved)' : ''}`;
      this.text(tag, MARGIN_L, this.y, 9, this.fonts.bold, this.sevColor(f.severity));
      this.text(f.dctFileName, MARGIN_L + 72, this.y, 9, this.fonts.regular, SUBTLE_TEXT);
      this.y -= 14;
      this.y = this.wrap(f.questionPreview, MARGIN_L + 6, this.y, CONTENT_W - 12, 8, this.fonts.regular, DARK_TEXT);
      if (f.evidenceSnippet) {
        this.y = this.wrap(`Evidence: ${f.evidenceSnippet}`, MARGIN_L + 6, this.y, CONTENT_W - 12, 8, this.fonts.italic, rgb(0.2, 0.35, 0.5));
      }
      if (f.rationale) {
        this.y = this.wrap(`Rationale: ${f.rationale}`, MARGIN_L + 6, this.y, CONTENT_W - 12, 8, this.fonts.regular, SUBTLE_TEXT);
      }
      this.y -= 10;
    }
  }

  private drawFooters() {
    const pages = this.pdfDoc.getPages();
    const total = pages.length;
    for (let i = 0; i < total; i++) {
      const pg = pages[i];
      pg.drawLine({
        start: { x: MARGIN_L, y: FOOTER_Y + 10 },
        end: { x: MARGIN_R, y: FOOTER_Y + 10 },
        thickness: 0.5,
        color: rgb(0.75, 0.78, 0.82),
      });
      pg.drawText(`AeroGap — DCT Compliance — Page ${i + 1} of ${total}`, {
        x: MARGIN_L,
        y: FOOTER_Y,
        size: 8,
        font: this.fonts.regular,
        color: SUBTLE_TEXT,
      });
    }
  }
}
