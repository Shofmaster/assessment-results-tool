import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { AssessmentData, Finding, Recommendation, ComplianceStatus } from '../types/assessment';

export class PDFReportGenerator {
  async generateReport(
    assessment: AssessmentData,
    findings: Finding[],
    recommendations: Recommendation[],
    compliance: ComplianceStatus
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([612, 792]); // Letter size
    let yPosition = 750;
    const leftMargin = 50;
    const rightMargin = 562;
    const lineHeight = 14;

    // Helper functions
    const addText = (text: string, x: number, y: number, size: number, font: any, color = rgb(0, 0, 0)) => {
      page.drawText(text, { x, y, size, font, color });
    };

    const addWrappedText = (text: string, x: number, startY: number, maxWidth: number, size: number, font: any): number => {
      const words = text.split(' ');
      let line = '';
      let y = startY;

      for (const word of words) {
        const testLine = line + word + ' ';
        const width = font.widthOfTextAtSize(testLine, size);

        if (width > maxWidth && line !== '') {
          page.drawText(line.trim(), { x, y, size, font });
          line = word + ' ';
          y -= lineHeight;

          if (y < 50) {
            page = pdfDoc.addPage([612, 792]);
            y = 750;
          }
        } else {
          line = testLine;
        }
      }

      if (line.trim() !== '') {
        page.drawText(line.trim(), { x, y, size, font });
        y -= lineHeight;
      }

      return y;
    };

    const checkPageSpace = (needed: number): number => {
      if (yPosition - needed < 50) {
        page = pdfDoc.addPage([612, 792]);
        return 750;
      }
      return yPosition;
    };

    // COVER PAGE
    page.drawRectangle({
      x: 0,
      y: 700,
      width: 612,
      height: 92,
      color: rgb(0.04, 0.1, 0.16), // Navy
    });

    addText('AVIATION QUALITY AUDIT REPORT', leftMargin, 755, 24, helveticaBold, rgb(1, 1, 1));
    addText('Comprehensive Compliance Assessment', leftMargin, 730, 12, helvetica, rgb(0.48, 0.74, 0.99));

    yPosition = 650;

    addText(`Company: ${assessment.companyName}`, leftMargin, yPosition, 14, helveticaBold);
    yPosition -= 20;
    addText(`Location: ${assessment.location}`, leftMargin, yPosition, 12, timesRoman);
    yPosition -= 16;
    addText(`Employees: ${assessment.employeeCount}`, leftMargin, yPosition, 12, timesRoman);
    yPosition -= 16;
    addText(`Report Date: ${new Date().toLocaleDateString()}`, leftMargin, yPosition, 12, timesRoman);
    yPosition -= 40;

    // EXECUTIVE SUMMARY
    addText('EXECUTIVE SUMMARY', leftMargin, yPosition, 16, helveticaBold);
    yPosition -= 25;

    page.drawRectangle({
      x: leftMargin - 5,
      y: yPosition - 60,
      width: rightMargin - leftMargin + 10,
      height: 75,
      color: rgb(0.95, 0.96, 0.98),
      borderColor: rgb(0.56, 0.64, 0.74),
      borderWidth: 1,
    });

    yPosition -= 15;
    addText(`Overall Compliance Score: ${compliance.overall}%`, leftMargin + 5, yPosition, 12, helveticaBold);
    yPosition -= 18;
    addText(`Critical Findings: ${compliance.criticalGaps}`, leftMargin + 5, yPosition, 11, timesRoman);
    yPosition -= 14;
    addText(`Major Findings: ${compliance.majorGaps}`, leftMargin + 5, yPosition, 11, timesRoman);
    yPosition -= 14;
    addText(`Minor Findings: ${compliance.minorGaps}`, leftMargin + 5, yPosition, 11, timesRoman);
    yPosition -= 30;

    // COMPLIANCE BY CATEGORY
    yPosition = checkPageSpace(200);
    addText('COMPLIANCE BY CATEGORY', leftMargin, yPosition, 14, helveticaBold);
    yPosition -= 20;

    for (const [category, score] of Object.entries(compliance.byCategory)) {
      yPosition = checkPageSpace(20);
      addText(`${category}: ${score}%`, leftMargin + 10, yPosition, 11, timesRoman);
      yPosition -= 16;
    }

    yPosition -= 20;

    // CRITICAL FINDINGS
    const criticalFindings = findings.filter((f) => f.severity === 'critical');
    if (criticalFindings.length > 0) {
      yPosition = checkPageSpace(100);
      page = pdfDoc.addPage([612, 792]);
      yPosition = 750;

      addText('CRITICAL FINDINGS', leftMargin, yPosition, 16, helveticaBold, rgb(0.9, 0.22, 0.05));
      yPosition -= 25;

      for (const finding of criticalFindings) {
        yPosition = checkPageSpace(150);

        page.drawRectangle({
          x: leftMargin - 5,
          y: yPosition - 100,
          width: rightMargin - leftMargin + 10,
          height: 110,
          color: rgb(1, 0.95, 0.88),
          borderColor: rgb(0.96, 0.62, 0.05),
          borderWidth: 2,
        });

        yPosition -= 10;
        addText(`🚨 ${finding.title}`, leftMargin + 5, yPosition, 12, helveticaBold);
        yPosition -= 18;
        addText(`Regulation: ${finding.regulation}`, leftMargin + 5, yPosition, 10, timesRoman);
        yPosition -= 15;
        yPosition = addWrappedText(finding.description, leftMargin + 5, yPosition, rightMargin - leftMargin - 10, 10, timesRoman);
        yPosition -= 20;
        addText(`Requirement: ${finding.requirement}`, leftMargin + 5, yPosition, 9, timesRoman, rgb(0.3, 0.3, 0.3));
        yPosition -= 30;
      }
    }

    // MAJOR FINDINGS
    const majorFindings = findings.filter((f) => f.severity === 'major');
    if (majorFindings.length > 0) {
      page = pdfDoc.addPage([612, 792]);
      yPosition = 750;

      addText('MAJOR FINDINGS', leftMargin, yPosition, 16, helveticaBold);
      yPosition -= 25;

      for (const finding of majorFindings) {
        yPosition = checkPageSpace(130);

        page.drawRectangle({
          x: leftMargin - 5,
          y: yPosition - 90,
          width: rightMargin - leftMargin + 10,
          height: 100,
          color: rgb(0.94, 0.96, 1),
          borderColor: rgb(0.06, 0.65, 0.91),
          borderWidth: 1,
        });

        yPosition -= 10;
        addText(`⚠ ${finding.title}`, leftMargin + 5, yPosition, 11, helveticaBold);
        yPosition -= 16;
        addText(`Regulation: ${finding.regulation}`, leftMargin + 5, yPosition, 9, timesRoman);
        yPosition -= 14;
        yPosition = addWrappedText(finding.description, leftMargin + 5, yPosition, rightMargin - leftMargin - 10, 9, timesRoman);
        yPosition -= 30;
      }
    }

    // RECOMMENDATIONS
    page = pdfDoc.addPage([612, 792]);
    yPosition = 750;

    addText('RECOMMENDATIONS', leftMargin, yPosition, 16, helveticaBold, rgb(0.06, 0.73, 0.51));
    yPosition -= 25;

    const highPriorityRecs = recommendations.filter((r) => r.priority === 'high');
    for (const rec of highPriorityRecs) {
      yPosition = checkPageSpace(100);

      addText(`✓ ${rec.area}`, leftMargin + 5, yPosition, 11, helveticaBold);
      yPosition -= 16;
      yPosition = addWrappedText(rec.recommendation, leftMargin + 10, yPosition, rightMargin - leftMargin - 15, 10, timesRoman);
      yPosition -= 14;
      addText(`Timeline: ${rec.timeline} | Impact: ${rec.expectedImpact}`, leftMargin + 10, yPosition, 9, timesRoman, rgb(0.4, 0.4, 0.4));
      yPosition -= 25;
    }

    // Add page numbers
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const currentPage = pages[i];
      currentPage.drawText(`Page ${i + 1} of ${pages.length}`, {
        x: 280,
        y: 30,
        size: 9,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    return await pdfDoc.save();
  }
}
