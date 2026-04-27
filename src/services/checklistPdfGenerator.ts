import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';

export interface ChecklistItemExport {
  section: string;
  title: string;
  severity: string;
  status: string;
  owner?: string;
  dueDate?: string;
  requirementRef?: string;
  notes?: string;
  signoffName?: string;
  signoffCertNumber?: string;
  signoffCertType?: string;
  signoffDate?: string;
}

export interface ChecklistRunExport {
  name?: string;
  frameworkLabel: string;
  subtypeLabel?: string;
  createdAt: string;
}

export interface ChecklistExportMeta {
  entityName?: string;
  entityLocation?: string;
  seriesName?: string;
  cycleLabel?: string;
  plannedDueDate?: string;
}

const SEVERITY_COLORS: Record<string, [number, number, number]> = {
  critical: [0.8, 0.1, 0.1],
  major: [0.85, 0.45, 0.0],
  minor: [0.25, 0.55, 0.9],
  observation: [0.4, 0.4, 0.4],
};

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
  blocked: 'Blocked',
};

export async function generateChecklistPdf(
  run: ChecklistRunExport,
  items: ChecklistItemExport[],
  meta: ChecklistExportMeta
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 612;
  const PAGE_H = 792;
  const LEFT = 50;
  const RIGHT = PAGE_W - 50;
  const MAX_W = RIGHT - LEFT;
  const LINE_H = 14;
  const BOTTOM = 60;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - 50;

  const ensureSpace = (needed: number) => {
    if (y - needed < BOTTOM) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 50;
    }
  };

  const drawText = (
    text: string,
    x: number,
    size: number,
    font: PDFFont,
    color = rgb(0, 0, 0)
  ) => {
    ensureSpace(size + 4);
    page.drawText(text, { x, y, size, font, color });
    y -= size + 4;
  };

  const drawWrapped = (
    text: string,
    x: number,
    maxW: number,
    size: number,
    font: PDFFont,
    color = rgb(0, 0, 0)
  ) => {
    const words = text.split(' ');
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
  };

  const drawLine = (color = rgb(0.8, 0.8, 0.8)) => {
    page.drawLine({ start: { x: LEFT, y }, end: { x: RIGHT, y }, thickness: 0.5, color });
    y -= 8;
  };

  // ── COVER PAGE ──────────────────────────────────────────────────────────
  y = PAGE_H - 80;
  page.drawRectangle({ x: LEFT, y: y - 4, width: MAX_W, height: 44, color: rgb(0.04, 0.10, 0.18) });
  page.drawText('AUDIT CHECKLIST REPORT', { x: LEFT + 12, y: y + 12, size: 22, font: bold, color: rgb(1, 1, 1) });
  y -= 60;

  const runLabel = run.name || `${run.frameworkLabel}${run.subtypeLabel ? ` — ${run.subtypeLabel}` : ''}`;
  drawText(runLabel, LEFT, 14, bold, rgb(0.04, 0.10, 0.18));
  y -= 4;

  if (meta.entityName) drawText(`Entity: ${meta.entityName}${meta.entityLocation ? ` · ${meta.entityLocation}` : ''}`, LEFT, 11, regular, rgb(0.2, 0.2, 0.2));
  drawText(`Framework: ${run.frameworkLabel}${run.subtypeLabel ? ` — ${run.subtypeLabel}` : ''}`, LEFT, 11, regular, rgb(0.2, 0.2, 0.2));
  drawText(`Generated: ${new Date(run.createdAt).toLocaleDateString()}`, LEFT, 11, regular, rgb(0.2, 0.2, 0.2));
  drawText(`Report date: ${new Date().toLocaleDateString()}`, LEFT, 11, regular, rgb(0.2, 0.2, 0.2));
  if (meta.seriesName) drawText(`Series: ${meta.seriesName}${meta.cycleLabel ? ` · ${meta.cycleLabel}` : ''}`, LEFT, 11, regular, rgb(0.2, 0.2, 0.2));
  if (meta.plannedDueDate) drawText(`Planned due: ${meta.plannedDueDate}`, LEFT, 11, regular, rgb(0.2, 0.2, 0.2));

  y -= 16;
  drawLine();

  // ── SUMMARY STATS ────────────────────────────────────────────────────────
  const total = items.length;
  const complete = items.filter(i => i.status === 'complete').length;
  const blocked = items.filter(i => i.status === 'blocked').length;
  const critical = items.filter(i => i.severity === 'critical').length;
  const major = items.filter(i => i.severity === 'major').length;

  drawText('Summary', LEFT, 13, bold, rgb(0.04, 0.10, 0.18));
  drawText(`Total items: ${total}   Complete: ${complete}   Blocked: ${blocked}   Remaining: ${total - complete - blocked}`, LEFT, 10, regular);
  drawText(`Critical: ${critical}   Major: ${major}   Minor: ${items.filter(i => i.severity === 'minor').length}   Observation: ${items.filter(i => i.severity === 'observation').length}`, LEFT, 10, regular);
  y -= 16;

  // ── ITEMS BY SECTION ─────────────────────────────────────────────────────
  const sections = [...new Set(items.map(i => i.section))];

  for (const section of sections) {
    const sectionItems = items.filter(i => i.section === section);
    ensureSpace(30);
    y -= 8;
    drawText(section, LEFT, 12, bold, rgb(0.04, 0.10, 0.18));
    drawLine(rgb(0.7, 0.7, 0.9));

    for (const item of sectionItems) {
      ensureSpace(60);
      const [sr, sg, sb] = SEVERITY_COLORS[item.severity] ?? [0.4, 0.4, 0.4];
      const sev = item.severity.toUpperCase();
      const sevW = bold.widthOfTextAtSize(sev, 8) + 6;
      page.drawRectangle({ x: LEFT, y: y - 2, width: sevW, height: 12, color: rgb(sr, sg, sb) });
      page.drawText(sev, { x: LEFT + 3, y: y + 1, size: 8, font: bold, color: rgb(1, 1, 1) });

      const statusStr = STATUS_LABELS[item.status] ?? item.status;
      const statusX = LEFT + sevW + 8;
      page.drawText(statusStr, { x: statusX, y: y + 1, size: 8, font: regular, color: rgb(0.3, 0.3, 0.3) });
      y -= 14;

      drawWrapped(item.title, LEFT + 8, MAX_W - 8, 10, bold);

      if (item.requirementRef) drawText(`Ref: ${item.requirementRef}`, LEFT + 8, 9, regular, rgb(0.25, 0.45, 0.75));
      if (item.owner) drawText(`Owner: ${item.owner}`, LEFT + 8, 9, regular, rgb(0.3, 0.3, 0.3));
      if (item.dueDate) drawText(`Due: ${item.dueDate}`, LEFT + 8, 9, regular, rgb(0.3, 0.3, 0.3));
      if (item.notes) {
        drawText('Notes:', LEFT + 8, 9, bold, rgb(0.2, 0.2, 0.2));
        drawWrapped(item.notes, LEFT + 16, MAX_W - 24, 9, regular, rgb(0.2, 0.2, 0.2));
      }
      if (item.signoffName && item.status === 'complete') {
        const parts = [`Signed: ${item.signoffName}`];
        if (item.signoffCertNumber) parts.push(`Cert: ${item.signoffCertNumber}`);
        if (item.signoffCertType) parts.push(`(${item.signoffCertType})`);
        if (item.signoffDate) parts.push(`Date: ${item.signoffDate}`);
        drawText(parts.join('  '), LEFT + 8, 9, regular, rgb(0.1, 0.45, 0.2));
      }
      y -= 6;
    }
  }

  const bytes = await pdfDoc.save();
  return bytes;
}
