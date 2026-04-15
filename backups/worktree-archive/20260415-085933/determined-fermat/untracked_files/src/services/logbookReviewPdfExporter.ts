import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';

// Mirror only what's needed (keeps LogbookEntryReviewPage self-contained)
export interface SmartReviewFindingExport {
  severity: 'critical' | 'major' | 'advisory';
  category: string;
  field?: string;
  citation: string;
  issue: string;
  suggestedText?: string;
}

export interface SmartReviewResultExport {
  overallCompliance: 'compliant' | 'minor_issues' | 'major_issues' | 'non_compliant';
  complianceScore: number;
  findings: SmartReviewFindingExport[];
  suggestedWorkPerformed?: string;
  suggestedRts?: string;
  regulatoryFramework: 'FAA' | 'EASA';
}

export interface ReviewExportOptions {
  appName: string;
  timestamp: Date;
  framework: string;
  result: SmartReviewResultExport;
}

const COMPLIANCE_LABEL: Record<string, string> = {
  compliant:     'Compliant',
  minor_issues:  'Minor Issues',
  major_issues:  'Major Issues',
  non_compliant: 'Non-Compliant',
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: 'CRITICAL',
  major:    'MAJOR',
  advisory: 'ADVISORY',
};

export class LogbookReviewPdfExporter {
  async generateReport(opts: ReviewExportOptions): Promise<Uint8Array> {
    const { appName, timestamp, framework, result } = opts;

    const pdfDoc = await PDFDocument.create();
    const helvetica     = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const timesRoman    = await pdfDoc.embedFont(StandardFonts.TimesRoman);

    const PAGE_W       = 612;
    const PAGE_H       = 792;
    const LEFT         = 50;
    const RIGHT        = PAGE_W - 50;
    const MAX_TEXT_W   = RIGHT - LEFT;
    const LINE_H       = 14;
    const BOTTOM_MARGIN = 60;

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - 42;

    const ensureSpace = (needed: number) => {
      if (y - needed < BOTTOM_MARGIN) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - 42;
      }
    };

    const drawText = (
      text: string,
      x: number,
      size: number,
      font: PDFFont,
      color = rgb(0, 0, 0),
    ) => {
      page.drawText(text, { x, y, size, font, color });
      y -= size + 4;
    };

    const drawWrapped = (
      text: string,
      x: number,
      maxW: number,
      size: number,
      font: PDFFont,
      color = rgb(0, 0, 0),
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
          if (font.widthOfTextAtSize(test, size) > maxW && line !== '') {
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

    const drawHRule = (gap = 8) => {
      ensureSpace(gap * 2 + 1);
      y -= gap;
      page.drawLine({
        start: { x: LEFT, y },
        end:   { x: RIGHT, y },
        thickness: 0.5,
        color: rgb(0.75, 0.75, 0.75),
      });
      y -= gap;
    };

    // ── Header band ────────────────────────────────────────────────────────────
    const HEADER_H = 70;
    page.drawRectangle({
      x: 0, y: PAGE_H - HEADER_H,
      width: PAGE_W, height: HEADER_H,
      color: rgb(0.04, 0.1, 0.16),
    });
    y = PAGE_H - 26;
    page.drawText(appName, {
      x: LEFT, y,
      size: 16,
      font: helveticaBold,
      color: rgb(1, 1, 1),
    });
    y -= 20;
    page.drawText('LOGBOOK ENTRY COMPLIANCE REVIEW', {
      x: LEFT, y,
      size: 10,
      font: helvetica,
      color: rgb(0.56, 0.8, 0.95),
    });
    y = PAGE_H - HEADER_H - 20;

    // ── Metadata block ─────────────────────────────────────────────────────────
    const dateStr = timestamp.toLocaleString([], {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
    drawText(`Date: ${dateStr}`, LEFT, 9, helvetica, rgb(0.3, 0.3, 0.3));
    drawText(`Framework: ${framework}`, LEFT, 9, helvetica, rgb(0.3, 0.3, 0.3));

    const complianceLabel = COMPLIANCE_LABEL[result.overallCompliance] ?? result.overallCompliance;
    drawText(`Overall Compliance: ${complianceLabel}`, LEFT, 9, helveticaBold, rgb(0.15, 0.15, 0.15));
    drawText(`Compliance Score: ${result.complianceScore} / 100`, LEFT, 9, helveticaBold, rgb(0.15, 0.15, 0.15));

    drawHRule();

    // ── Findings ───────────────────────────────────────────────────────────────
    const ordered = [
      ...result.findings.filter(f => f.severity === 'critical'),
      ...result.findings.filter(f => f.severity === 'major'),
      ...result.findings.filter(f => f.severity === 'advisory'),
    ];

    if (ordered.length === 0) {
      ensureSpace(30);
      drawText('No compliance issues found.', LEFT, 10, helveticaBold, rgb(0.1, 0.55, 0.3));
    } else {
      ensureSpace(20);
      drawText('FINDINGS', LEFT, 11, helveticaBold, rgb(0.1, 0.1, 0.4));
      y -= 4;

      for (const f of ordered) {
        ensureSpace(60);
        y -= 6;

        const severityColor =
          f.severity === 'critical' ? rgb(0.75, 0.1, 0.1) :
          f.severity === 'major'    ? rgb(0.8,  0.4, 0.0) :
                                      rgb(0.05, 0.45, 0.75);

        const severityLabel = SEVERITY_LABEL[f.severity] ?? f.severity.toUpperCase();

        // Severity badge label + citation on same line
        const badgeText = `[${severityLabel}]`;
        const badgeW = helveticaBold.widthOfTextAtSize(badgeText, 9);
        page.drawText(badgeText, { x: LEFT, y, size: 9, font: helveticaBold, color: severityColor });
        const citationX = LEFT + badgeW + 6;
        page.drawText(f.citation, { x: citationX, y, size: 9, font: helvetica, color: rgb(0.35, 0.35, 0.35) });
        y -= 13;

        // Field (if present)
        if (f.field) {
          ensureSpace(LINE_H);
          page.drawText(`Field: ${f.field}`, { x: LEFT + 10, y, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5) });
          y -= LINE_H;
        }

        // Issue
        drawWrapped(f.issue, LEFT + 10, MAX_TEXT_W - 10, 9, timesRoman, rgb(0.1, 0.1, 0.1));

        // Suggested text
        if (f.suggestedText) {
          ensureSpace(LINE_H + 8);
          y -= 4;
          page.drawText('Suggested:', { x: LEFT + 10, y, size: 8, font: helveticaBold, color: rgb(0.1, 0.45, 0.25) });
          y -= LINE_H;
          drawWrapped(f.suggestedText, LEFT + 18, MAX_TEXT_W - 18, 8, timesRoman, rgb(0.15, 0.4, 0.2));
        }
      }
    }

    // ── Suggested Work Performed ───────────────────────────────────────────────
    if (result.suggestedWorkPerformed) {
      drawHRule();
      ensureSpace(20);
      drawText('SUGGESTED WORK PERFORMED', LEFT, 11, helveticaBold, rgb(0.1, 0.1, 0.4));
      y -= 4;
      drawWrapped(result.suggestedWorkPerformed, LEFT, MAX_TEXT_W, 9, timesRoman);
    }

    // ── Suggested RTS ─────────────────────────────────────────────────────────
    if (result.suggestedRts) {
      drawHRule();
      ensureSpace(20);
      drawText('SUGGESTED RETURN-TO-SERVICE STATEMENT', LEFT, 11, helveticaBold, rgb(0.1, 0.1, 0.4));
      y -= 4;
      drawWrapped(result.suggestedRts, LEFT, MAX_TEXT_W, 9, timesRoman);
    }

    // ── Page footers ──────────────────────────────────────────────────────────
    const pages = pdfDoc.getPages();
    const total = pages.length;
    for (let i = 0; i < total; i++) {
      const p = pages[i];
      const label = `Page ${i + 1} of ${total}`;
      const labelW = helvetica.widthOfTextAtSize(label, 8);
      p.drawText(label, {
        x: (PAGE_W - labelW) / 2,
        y: 28,
        size: 8,
        font: helvetica,
        color: rgb(0.55, 0.55, 0.55),
      });
    }

    return pdfDoc.save();
  }
}

export function downloadReviewPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
