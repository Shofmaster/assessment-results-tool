import { createClaudeMessage, type ClaudeMessageParams } from './claudeProxy';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type Form337Status = 'draft' | 'ready_for_review';
export type RepairOrAlteration = 'repair' | 'alteration';
export type UnitType = 'airframe' | 'powerplant' | 'propeller' | 'appliance';

export interface Form337Input {
  title: string;
  aircraft: {
    nationalityRegistration: string;
    make: string;
    model: string;
    series?: string;
    serialNumber: string;
  };
  owner: {
    name: string;
    address: string;
  };
  typeOfWork: RepairOrAlteration;
  unitType: UnitType;
  workDescription: {
    location: string;
    summaryOfWork: string;
    methodsAndData: string;
    partsAndReferences?: string;
    preclosureInspection?: string;
    weightAndBalanceImpact?: string;
    continuedAirworthiness?: string;
  };
  agency: {
    nameAndAddress: string;
    kindOfAgency: string;
    certificateNumber: string;
    completionDate: string;
    signerName?: string;
  };
  returnToService: {
    decision: 'approved' | 'rejected';
    approverName: string;
    approverCertificateOrDesignation: string;
    approverKind: string;
    approvalDate: string;
  };
  fieldApprovalNotes?: string;
}

export interface Form337GeneratedOutput {
  fieldMappedOutput: Record<string, unknown>;
  narrativeDraftOutput: string;
}

const PDF_DEBUG_GRID = false;

interface Form337PdfOptions {
  debugGrid?: boolean;
}

export function buildForm337SystemPrompt(): string {
  return `You are an FAA maintenance documentation assistant drafting Form 337 support text.

Your task: take user-provided input and produce JSON with two keys:
1) "fieldMappedOutput": object mapping the user's data to FAA Form 337 style blocks.
2) "narrativeDraftOutput": Item 8 draft prose (clear, concise, complete).

Rules:
- Output valid JSON only, no markdown.
- Do not invent facts not provided by user.
- Keep signatures/approvals as user-entered data only; do not imply FAA signed anything.
- Keep language suitable for review by certificated personnel before filing.
- Include references to provided methods/data in Item 8 narrative where available.

Expected fieldMappedOutput structure:
{
  "item1_aircraft": {...},
  "item2_owner": {...},
  "item4_type": {...},
  "item5_unitIdentification": {...},
  "item6_conformityStatementDraft": {...},
  "item7_returnToServiceDraft": {...},
  "item8_descriptionOfWorkDraft": "...",
  "adminNotes": {
    "fieldApprovalNotes": "...",
    "disclaimer": "..."
  }
}

Return strict JSON.`;
}

export async function generateForm337Outputs(
  input: Form337Input,
  model: string
): Promise<Form337GeneratedOutput> {
  const params: ClaudeMessageParams = {
    model,
    max_tokens: 3000,
    temperature: 0.2,
    system: buildForm337SystemPrompt(),
    messages: [
      {
        role: 'user',
        content: `Generate both outputs for this Form 337 draft input:\n${JSON.stringify(input, null, 2)}`,
      },
    ],
  };

  const response = await createClaudeMessage(params);
  const text =
    response.content
      ?.filter((b) => b.type === 'text' && b.text)
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('') ?? '{}';

  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const parsed = JSON.parse(cleaned) as Partial<Form337GeneratedOutput>;
  if (!parsed.fieldMappedOutput || !parsed.narrativeDraftOutput) {
    throw new Error('Model response missing required Form 337 output sections');
  }
  return {
    fieldMappedOutput: parsed.fieldMappedOutput as Record<string, unknown>,
    narrativeDraftOutput: parsed.narrativeDraftOutput,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pretty(value: unknown): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

export function buildPrintable337Html(
  input: Form337Input,
  output: Form337GeneratedOutput
): string {
  const mapped = pretty(output.fieldMappedOutput);
  const narrative = escapeHtml(output.narrativeDraftOutput || '');
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>FAA Form 337 Draft - ${escapeHtml(input.title || 'Untitled')}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #bbb; padding-bottom: 4px; }
    .meta { font-size: 12px; color: #444; margin-bottom: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 12px; }
    .block { border: 1px solid #aaa; padding: 8px; border-radius: 4px; }
    .label { font-weight: 700; margin-bottom: 4px; }
    pre { white-space: pre-wrap; word-break: break-word; margin: 0; font-size: 11px; }
    .notice { margin-top: 18px; font-size: 11px; color: #444; border-top: 1px dashed #999; padding-top: 8px; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>FAA Form 337 Draft Worksheet</h1>
  <div class="meta">Draft title: ${escapeHtml(input.title || '')}</div>

  <h2>Item 1 - Aircraft</h2>
  <div class="grid">
    <div class="block"><div class="label">N-Number</div><pre>${escapeHtml(input.aircraft.nationalityRegistration)}</pre></div>
    <div class="block"><div class="label">Serial Number</div><pre>${escapeHtml(input.aircraft.serialNumber)}</pre></div>
    <div class="block"><div class="label">Make / Model</div><pre>${escapeHtml(`${input.aircraft.make} ${input.aircraft.model}`.trim())}</pre></div>
    <div class="block"><div class="label">Series</div><pre>${escapeHtml(input.aircraft.series || '')}</pre></div>
  </div>

  <h2>Item 2 - Owner</h2>
  <div class="block"><pre>${escapeHtml(input.owner.name)}
${escapeHtml(input.owner.address || '')}</pre></div>

  <h2>Items 4 & 5 - Type / Unit</h2>
  <div class="grid">
    <div class="block"><div class="label">Type</div><pre>${escapeHtml(input.typeOfWork)}</pre></div>
    <div class="block"><div class="label">Unit</div><pre>${escapeHtml(input.unitType)}</pre></div>
  </div>

  <h2>Item 8 - Description of Work Accomplished (Draft)</h2>
  <div class="block"><pre>${narrative}</pre></div>

  <h2>Field-Mapped Output</h2>
  <div class="block"><pre>${escapeHtml(mapped)}</pre></div>

  <div class="notice">
    Draft assistance only. Review and finalize through certificated personnel and FAA submission procedures per 14 CFR Part 43 Appendix B and AC 43.9-1G.
  </div>
</body>
</html>`;
}

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

function wrapLinesByWidth(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const src = (text || '').replace(/\r/g, '');
  const lines: string[] = [];
  for (const paragraph of src.split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let cur = '';
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > maxWidth && cur) {
        lines.push(cur);
        cur = word;
      } else {
        cur = next;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function drawTopBox(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  x: number,
  top: number,
  width: number,
  height: number,
  label: string,
  content: string
): number {
  const pageHeight = page.getHeight();
  const y = pageHeight - top - height;
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.45, 0.45, 0.45),
    borderWidth: 0.45,
  });
  page.drawText(label, {
    x: x + 3,
    y: y + height - 9,
    size: 7.1,
    font: bold,
    color: rgb(0.2, 0.2, 0.2),
  });
  const lines = wrapLinesByWidth(content, font, 7.6, width - 6);
  let lineY = y + height - 18;
  for (const line of lines) {
    if (lineY < y + 3) break;
    page.drawText(line, {
      x: x + 3,
      y: lineY,
      size: 7.6,
      font,
      color: rgb(0.16, 0.16, 0.16),
    });
    lineY -= 8.8;
  }
  return Math.max(0, lines.length - Math.floor((height - 18) / 8.8));
}

function drawCheckbox(page: PDFPage, x: number, y: number, checked: boolean, label: string, font: PDFFont): void {
  page.drawRectangle({ x, y, width: 8, height: 8, borderWidth: 0.45, borderColor: rgb(0.45, 0.45, 0.45) });
  if (checked) {
    page.drawLine({ start: { x: x + 1.3, y: y + 1.3 }, end: { x: x + 6.7, y: y + 6.7 }, thickness: 0.8, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: x + 6.7, y: y + 1.3 }, end: { x: x + 1.3, y: y + 6.7 }, thickness: 0.8, color: rgb(0, 0, 0) });
  }
  page.drawText(label, { x: x + 11, y: y + 0.6, size: 7.5, font, color: rgb(0.15, 0.15, 0.15) });
}

export async function downloadForm337Pdf(
  input: Form337Input,
  output: Form337GeneratedOutput,
  options: Form337PdfOptions = {}
): Promise<void> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 612;
  const margin = 28;
  const debugGrid = options.debugGrid ?? PDF_DEBUG_GRID;

  if (debugGrid) {
    const gridStep = 18;
    for (let gx = 0; gx <= pageWidth; gx += gridStep) {
      page.drawLine({
        start: { x: gx, y: 0 },
        end: { x: gx, y: 792 },
        thickness: gx % (gridStep * 4) === 0 ? 0.35 : 0.2,
        color: rgb(0.9, 0.9, 0.9),
      });
    }
    for (let gy = 0; gy <= 792; gy += gridStep) {
      page.drawLine({
        start: { x: 0, y: gy },
        end: { x: pageWidth, y: gy },
        thickness: gy % (gridStep * 4) === 0 ? 0.35 : 0.2,
        color: rgb(0.9, 0.9, 0.9),
      });
    }
  }

  page.drawText('FAA Form 337 - Major Repair and Alteration (Draft Worksheet)', {
    x: margin,
    y: 771,
    size: 10.5,
    font: bold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(`Title: ${input.title || 'Untitled Draft'}`, {
    x: margin,
    y: 759,
    size: 7.6,
    font,
    color: rgb(0.25, 0.25, 0.25),
  });

  const top = 34;
  const colGap = 6;
  const leftW = 342;
  const rightW = pageWidth - margin * 2 - leftW - colGap;
  const item8Top = top + 6;

  drawTopBox(
    page,
    font,
    bold,
    margin,
    item8Top,
    leftW,
    68,
    'Item 1 - Aircraft (Nationality and Registration Mark / Make / Model / Series / Serial No.)',
    `${input.aircraft.nationalityRegistration}
${input.aircraft.make} ${input.aircraft.model} ${input.aircraft.series || ''}
S/N: ${input.aircraft.serialNumber}`
  );
  drawTopBox(
    page,
    font,
    bold,
    margin,
    item8Top + 70,
    leftW,
    64,
    'Item 2 - Owner',
    `${input.owner.name}
${input.owner.address || ''}`
  );
  drawTopBox(
    page,
    font,
    bold,
    margin + leftW + colGap,
    item8Top,
    rightW,
    68,
    'Item 3 - For FAA Use Only',
    'Reserved. FAA or authorized designee approval statements are completed through official process.'
  );
  drawTopBox(
    page,
    font,
    bold,
    margin + leftW + colGap,
    item8Top + 70,
    rightW,
    64,
    'Item 4/5 - Type and Unit Identification',
    `Type: ${input.typeOfWork}
Unit: ${input.unitType}`
  );

  const item6Top = item8Top + 138;
  drawTopBox(
    page,
    font,
    bold,
    margin,
    item6Top,
    leftW,
    86,
    'Item 6 - Conformity Statement (Agency)',
    `Agency: ${input.agency.nameAndAddress}
Kind: ${input.agency.kindOfAgency}
Cert #: ${input.agency.certificateNumber}
Completion Date: ${input.agency.completionDate}
Signer: ${input.agency.signerName || ''}`
  );
  drawTopBox(
    page,
    font,
    bold,
    margin + leftW + colGap,
    item6Top,
    rightW,
    86,
    'Item 7 - Approval For Return To Service',
    `Decision: ${input.returnToService.decision}
Approver: ${input.returnToService.approverName}
Kind: ${input.returnToService.approverKind}
Cert/Designation: ${input.returnToService.approverCertificateOrDesignation}
Date: ${input.returnToService.approvalDate}`
  );

  const checkY = page.getHeight() - (item6Top + 90) - 11;
  drawCheckbox(page, margin + leftW + colGap + 7, checkY, input.typeOfWork === 'repair', 'Repair', font);
  drawCheckbox(page, margin + leftW + colGap + 66, checkY, input.typeOfWork === 'alteration', 'Alteration', font);

  const item8YTop = item6Top + 92;
  const item8Height = 328;
  const item8Content = output.narrativeDraftOutput || [
    input.workDescription.location && `Location: ${input.workDescription.location}`,
    input.workDescription.summaryOfWork && `Summary: ${input.workDescription.summaryOfWork}`,
    input.workDescription.methodsAndData && `Methods/Data: ${input.workDescription.methodsAndData}`,
    input.workDescription.partsAndReferences && `Parts/Refs: ${input.workDescription.partsAndReferences}`,
    input.workDescription.weightAndBalanceImpact && `W&B: ${input.workDescription.weightAndBalanceImpact}`,
  ].filter(Boolean).join('\n');

  const item8Lines = wrapLinesByWidth(item8Content, font, 7.6, pageWidth - margin * 2 - 6);
  drawTopBox(
    page,
    font,
    bold,
    margin,
    item8YTop,
    pageWidth - margin * 2,
    item8Height,
    'Item 8 - Description of Work Accomplished',
    item8Content
  );

  const maxLinesOnFront = Math.floor((item8Height - 18) / 8.8);
  let remaining = item8Lines.slice(maxLinesOnFront);

  page.drawText('DRAFT - Review and finalize through certificated personnel before filing.', {
    x: margin,
    y: 19,
    size: 7.2,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });

  while (remaining.length > 0) {
    const cont = pdf.addPage([612, 792]);
    if (debugGrid) {
      const gridStep = 18;
      for (let gx = 0; gx <= pageWidth; gx += gridStep) {
        cont.drawLine({
          start: { x: gx, y: 0 },
          end: { x: gx, y: 792 },
          thickness: gx % (gridStep * 4) === 0 ? 0.35 : 0.2,
          color: rgb(0.9, 0.9, 0.9),
        });
      }
      for (let gy = 0; gy <= 792; gy += gridStep) {
        cont.drawLine({
          start: { x: 0, y: gy },
          end: { x: pageWidth, y: gy },
          thickness: gy % (gridStep * 4) === 0 ? 0.35 : 0.2,
          color: rgb(0.9, 0.9, 0.9),
        });
      }
    }
    cont.drawText('FAA Form 337 - Continuation Sheet (Item 8)', {
      x: margin,
      y: 772,
      size: 10.2,
      font: bold,
      color: rgb(0.1, 0.1, 0.1),
    });
    cont.drawText(`Title: ${input.title || 'Untitled Draft'}  |  N#: ${input.aircraft.nationalityRegistration}`, {
      x: margin,
      y: 759,
      size: 7.5,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });

    const yTop = 44;
    const h = 696;
    drawTopBox(cont, font, bold, margin, yTop, pageWidth - margin * 2, h, 'Item 8 Continued', remaining.join('\n'));
    const maxLines = Math.floor((h - 18) / 8.8);
    remaining = remaining.slice(maxLines);

    cont.drawText('CONTINUATION OF ITEM 8', {
      x: pageWidth - margin - 120,
      y: 20,
      size: 7.1,
      font: bold,
      color: rgb(0.35, 0.35, 0.35),
    });

    cont.drawText('Attachment generated from in-app draft worksheet data.', {
      x: margin,
      y: 20,
      size: 7.1,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
  }

  const bytes = await pdf.save();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const date = new Date().toISOString().slice(0, 10);
  const safeTitle = (input.title || 'form-337').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
  downloadBlob(blob, `${safeTitle}-${date}.pdf`);
}
