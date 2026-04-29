import { createClaudeMessage, type ClaudeMessageParams } from './claudeProxy';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

export type Form337Status = 'draft' | 'ready_for_review';
export type RepairOrAlteration = 'repair' | 'alteration';
export type UnitType = 'airframe' | 'powerplant' | 'propeller' | 'appliance';

/**
 * A single discrete work item for Form 337 Item 8 / logbook entry.
 * Fields align with 14 CFR 43.9 logbook requirements and AC 43.9-1G Item 8 guidance.
 */
export interface WorkItem {
  id: string;
  /** Where on the aircraft or component the work was performed [43.9(a)(1)] */
  location: string;
  /** Description of what was done — include findings, actions, dimensions [43.9(a)(1)] */
  description: string;
  /** Approved data / regulatory basis used per 14 CFR 43.13(a) — AC, AMM, STC, 8110-3, etc. [required on 337] */
  approvedData: string;
  /** Parts installed/removed: P/N, S/N, manufacturer [required if parts changed] */
  partsUsed?: string;
  /** Weight & balance impact — state delta or "No change" [required on 337] */
  weightChange?: string;
  /** Post-maintenance limitations or inspection requirements, if any */
  continuedAirworthiness?: string;
}

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
  /** Array of discrete work items — each becomes a numbered entry in Item 8 */
  workItems: WorkItem[];
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

/**
 * Migrate legacy formData that used workDescription (single object) to the new workItems array.
 * Safe to call on both old and new formats.
 */
export function migrateFormData(data: Record<string, unknown>): Form337Input {
  const d = data as Record<string, unknown>;
  if (!d.workItems && d.workDescription) {
    const wd = d.workDescription as Record<string, string>;
    const legacyItem: WorkItem = {
      id: 'item-1',
      location: wd.location || '',
      description: wd.summaryOfWork || '',
      approvedData: wd.methodsAndData || '',
      partsUsed: wd.partsAndReferences || '',
      weightChange: wd.weightAndBalanceImpact || '',
      continuedAirworthiness: wd.continuedAirworthiness || '',
    };
    return { ...(d as unknown as Form337Input), workItems: [legacyItem] };
  }
  return d as unknown as Form337Input;
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
  return `You are an FAA maintenance documentation specialist drafting FAA Form 337 (Major Repair and Alteration) support text per AC 43.9-1G, 14 CFR Part 43 Appendix B, and 14 CFR 43.9.

Your task: take user-provided input and produce JSON with two keys:
1) "fieldMappedOutput": object mapping data to the official FAA Form 337 block numbers (Blocks 1–10 front, Reverse side description).
2) "narrativeDraftOutput": Description of Work Accomplished draft prose for the reverse side of the form.

DESCRIPTION OF WORK ACCOMPLISHED — LANGUAGE RULES (AC 43.9-1G / 14 CFR 43.9):

VERBIAGE REQUIREMENTS:
- Use active past tense throughout. Mandatory action verbs: Removed, Inspected, Repaired, Replaced, Fabricated, Installed, Reinstalled, Torqued, Rigged, Adjusted, Tested, Verified, Sealed, Bonded, Drilled, Deburred, Primed, Painted, Cleaned, Checked, Measured.
- NEVER use passive voice ("was repaired," "was installed") or vague language ("fixed," "worked on," "addressed," "took care of," "performed maintenance on").
- Write in complete, present-perfect-parallel sentences. Each sentence begins with an action verb.

COMPONENT IDENTIFICATION:
- Identify every component with P/N and S/N where available. Format: "P/N XXXX-XX, S/N XXXXXXX".
- Reference aircraft structural locations by station number, frame number, stringer, or distance from datum where applicable (e.g., "FS 137.5," "WS 84R," "49 in. outboard of centerline").
- Specify zone or area per aircraft manufacturer convention when relevant.

MEASUREMENTS AND SPECIFICATIONS:
- Include actual measurements, tolerances, gap settings, torque values, and clearances when work-critical.
- State before and after conditions for repairs (e.g., "Found elongated hole, 0.003 in. oversize. Reamed to next oversize and installed NAS1097 rivet").
- Use standard aviation units: in., ft., lb., in.-lb., ft.-lb., °F, psi.

APPROVED DATA CITATIONS:
- Cite approved data inline at point of use, not only at the end. Use "per" or "IAW" (in accordance with).
- Formats: "per AMM 57-10-00 Rev 15 para 3-4," "IAW AC 43-13-1B, Ch. 4, Fig. 4-17," "per STC SA01234NM Rev A, Install. Instr. para 3.2," "per AD 2023-14-07 para (e)(1)," "per OEM SB 07-57-12 Rev B."
- For field approvals: reference the 8110-3 or DER approval letter number.

PARTS TRACEABILITY (required for all parts installed):
- Format: "[Manufacturer], P/N [X], S/N [Y], [traceability tag type]." Tag types: "FAA Form 8130-3 attached," "TSO-Cxxx cert. attached," "PMA-approved," "OEM serviceable tag."
- If no parts were installed or removed, state "No parts installed or removed."

WEIGHT AND BALANCE:
- State actual delta with arm: "+3.2 lb at +42.5 in. arm" or "−0.8 lb at +67.0 in. arm."
- If no change: "No change to weight or balance."
- Reference the current W&B document revised if altered: "W&B revised per [document reference]."

CONTINUED AIRWORTHINESS:
- List any post-repair/alteration inspection intervals, operational limitations, placard requirements, or AFM/POH supplement revisions required.
- If none: "No continued airworthiness requirements."

FORMATTING:
- Number each discrete work item (1., 2., 3., ...) when multiple workItems exist.
- Each numbered item is a standalone, self-contained record legible to a certificated person unfamiliar with the work.
- Do not use abbreviations without defining them on first use in that item.

General rules:
- Output valid JSON only, no markdown fences.
- Do not invent facts not provided by the user.
- Preserve user-entered signature/approval data exactly; never imply FAA has signed or approved.
- Language must be suitable for review by certificated maintenance personnel before filing.

Required fieldMappedOutput structure (use official FAA Form 337 block numbers):
{
  "block1_nationalityRegistrationMark": "...",
  "block2_make": "...",
  "block3_model": "...",
  "block4_series": "...",
  "block5_serialNo": "...",
  "block6_owner": { "name": "...", "address": "..." },
  "block7_forFaaUseOnly": "Reserved for FAA use only",
  "block8_unitIdentification": {
    "unit": "Airframe | Powerplant | Propeller | Appliance",
    "typeOfWork": "Major Repair | Major Alteration"
  },
  "block9_conformityStatement": {
    "agencyNameAndAddress": "...",
    "kindOfAgency": "...",
    "certificateNumber": "...",
    "completionDate": "...",
    "signerName": "..."
  },
  "block10_approvalForReturnToService": {
    "decision": "Approved | Rejected",
    "approverName": "...",
    "approverKind": "...",
    "certificateOrDesignation": "...",
    "approvalDate": "..."
  },
  "reverse_descriptionOfWorkAccomplished": "...",
  "adminNotes": {
    "fieldApprovalNotes": "...",
    "disclaimer": "Draft assistance only. All entries must be reviewed and finalized by certificated maintenance personnel before filing per 14 CFR Part 43 Appendix B and AC 43.9-1G."
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
    'Blocks 1–5 — Aircraft (Nationality/Registration Mark, Make, Model, Series, Serial No.)',
    `${input.aircraft.nationalityRegistration}
${input.aircraft.make} ${input.aircraft.model}${input.aircraft.series ? ' ' + input.aircraft.series : ''}
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
    'Block 6 — Owner',
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
    'Block 7 — For FAA Use Only',
    'Reserved for FAA use. Field approval number and FAA inspector signature completed through official FAA process.'
  );

  const unitLabels = ['Airframe', 'Powerplant', 'Propeller', 'Appliance'] as const;
  const unitChecks = unitLabels.map((u) => `${u.toLowerCase() === input.unitType ? '[X]' : '[ ]'} ${u}`).join('  ');
  const typeChecks = `[${input.typeOfWork === 'repair' ? 'X' : ' '}] Major Repair   [${input.typeOfWork === 'alteration' ? 'X' : ' '}] Major Alteration`;
  drawTopBox(
    page,
    font,
    bold,
    margin + leftW + colGap,
    item8Top + 70,
    rightW,
    64,
    'Block 8 — Unit Identification & Type of Work',
    `Unit: ${unitChecks}\nType: ${typeChecks}`
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
    'Block 9 — Conformity Statement',
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
    'Block 10 — Approval For Return To Service',
    `Decision: ${input.returnToService.decision === 'approved' ? 'Approved' : 'Rejected'}
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
  const item8Content = output.narrativeDraftOutput || (input.workItems || []).map((item, idx) => {
    const lines = [`${idx + 1}. Location: ${item.location || '(not specified)'}`];
    if (item.description) lines.push(`   Work: ${item.description}`);
    if (item.approvedData) lines.push(`   Approved Data: ${item.approvedData}`);
    if (item.partsUsed) lines.push(`   Parts: ${item.partsUsed}`);
    if (item.weightChange) lines.push(`   W&B: ${item.weightChange}`);
    if (item.continuedAirworthiness) lines.push(`   Cont. Airworthiness: ${item.continuedAirworthiness}`);
    return lines.join('\n');
  }).join('\n\n');

  const item8Lines = wrapLinesByWidth(item8Content, font, 7.6, pageWidth - margin * 2 - 6);
  drawTopBox(
    page,
    font,
    bold,
    margin,
    item8YTop,
    pageWidth - margin * 2,
    item8Height,
    'Description of Work Accomplished (Reverse Side)',
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
    cont.drawText('FAA Form 337 — Description of Work Accomplished (Continued)', {
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
    drawTopBox(cont, font, bold, margin, yTop, pageWidth - margin * 2, h, 'Description of Work Accomplished — Continued', remaining.join('\n'));
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
