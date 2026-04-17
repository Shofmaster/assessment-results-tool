import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { ScheduleLogbookCrossRefRow } from './scheduleLogbookCrossRef';

export async function buildComplianceReportPdf(
  title: string,
  rows: ScheduleLogbookCrossRefRow[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageW = 612;
  const pageH = 792;
  const margin = 48;
  let page = pdfDoc.addPage([pageW, pageH]);
  let y = pageH - margin;

  const draw = (text: string, size: number, f = font, color = rgb(0, 0, 0)) => {
    if (y < margin + 40) {
      page = pdfDoc.addPage([pageW, pageH]);
      y = pageH - margin;
    }
    page.drawText(text.slice(0, 120), { x: margin, y, size, font: f, color });
    y -= size + 6;
  };

  draw(title, 16, bold);
  draw(`Generated ${new Date().toISOString().slice(0, 10)}`, 10);
  y -= 8;

  for (const r of rows) {
    const line1 = `${r.item.title} [${r.status}]`;
    const line2 = r.nextDue ? `Next due (calendar): ${r.nextDue}` : 'Next due: —';
    const line3 = r.lastEvidenceDate ? `Last evidence: ${r.lastEvidenceDate}` : 'Last evidence: —';
    draw(line1, 11, bold, rgb(0.1, 0.15, 0.35));
    draw(line2, 9);
    draw(line3, 9);
    if (r.matchedEntry?.entryDate) {
      draw(`Logbook: ${r.matchedEntry.entryDate} — ${(r.matchedEntry.workPerformed || r.matchedEntry.rawText || '').slice(0, 90)}`, 8, font, rgb(0.2, 0.2, 0.2));
    }
    y -= 4;
  }

  return pdfDoc.save();
}
