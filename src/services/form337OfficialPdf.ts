import { PDFDocument, StandardFonts, rgb, type PDFForm } from 'pdf-lib';
import {
  buildItem8FallbackContent,
  downloadBlob,
  wrapLinesByWidth,
  type Form337GeneratedOutput,
  type Form337Input,
} from './form337Service';

/**
 * Fills the official FAA Form 337 (10/06) fillable PDF shipped at
 * public/forms/faa-form-337.pdf. Field names below were extracted from that
 * exact revision's AcroForm; if the FAA ships a new revision the names may
 * change, so every fill is wrapped in a silent try (the rest of the form still
 * fills). Signature/date boxes in Items 6D and 7 are not AcroForm fields on
 * the official PDF, so printed name + date are drawn at fixed coordinates.
 */

const TEMPLATE_URL = '/forms/faa-form-337.pdf';

/** Page indices in the official PDF: 0 = instructions, 1 = form front, 2 = Item 8 reverse. */
const FRONT_PAGE = 1;
const REVERSE_PAGE = 2;

/** pdf-lib's WinAnsi encoder rejects characters outside Latin-1; map the common offenders. */
function sanitizePdfText(value: string): string {
  return (value || '')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/[•●▪]/g, '-')
    .replace(/…/g, '...')
    .replace(/[\u00A0\u2007\u202F]/g, ' ')
    .replace(/[^\x20-\x7E\xA1-\xFF\n]/g, '?');
}

function trySetText(form: PDFForm, fieldName: string, value: string | undefined, fontSize?: number): void {
  const text = sanitizePdfText(value || '').trim();
  if (!text) return;
  try {
    const field = form.getTextField(fieldName);
    if (fontSize) field.setFontSize(fontSize);
    field.setText(text);
  } catch {
    // Field missing or renamed in a newer FAA revision — leave blank rather than fail the export.
  }
}

/** The unit/type grid and Approved/Rejected cells are tiny text fields that take an "X". */
function trySetX(form: PDFForm, fieldName: string): void {
  trySetText(form, fieldName, 'X', 7);
}

interface ParsedAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

/**
 * Best-effort split of a free-text address blob into the official form's
 * Address / City / State / Zip / Country boxes. Falls back to putting
 * everything in the street line when no "City, ST 12345" tail is found.
 */
export function parseAddressBlock(raw: string): ParsedAddress {
  const out: ParsedAddress = { street: '', city: '', state: '', zip: '', country: '' };
  const cleaned = (raw || '').trim();
  if (!cleaned) return out;

  let rest = cleaned;
  const countryMatch = rest.match(/[,\n]\s*(USA|U\.S\.A\.?|United States(?: of America)?|Canada|Mexico)\s*$/i);
  if (countryMatch) {
    out.country = countryMatch[1];
    rest = rest.slice(0, countryMatch.index).trim();
  }

  const cityStateZip = rest.match(/^(.*?)[,\n]+\s*([A-Za-z .'-]+?)[,\s]+([A-Za-z]{2})\.?,?\s+(\d{5}(?:-\d{4})?)\s*$/s);
  if (cityStateZip) {
    out.street = cityStateZip[1].replace(/\n+/g, ', ').trim();
    out.city = cityStateZip[2].trim();
    out.state = cityStateZip[3].toUpperCase();
    out.zip = cityStateZip[4];
  } else {
    const lines = rest.split('\n').map((l) => l.trim()).filter(Boolean);
    out.street = lines[0] || '';
    out.city = lines.slice(1).join(', ');
  }
  return out;
}

/** Item 6B "Kind of Agency" X-cell field names, keyed by keyword tests against the free-text kind. */
const AGENCY_KIND_FIELDS: Array<{ test: RegExp; field: string }> = [
  { test: /repair\s*station|\bCRS\b|part\s*145/i, field: 'Certificated Repair Station' },
  { test: /maintenance\s*organi[sz]ation|\bAMO\b/i, field: 'Certificated Maintenance Organization' },
  { test: /foreign/i, field: 'Foreign Certificated Mechanic' },
  { test: /mechanic|a\s*&\s*p|\bA&P\b|airframe\s*and\s*powerplant|\bIA\b|inspection\s*authorization/i, field: 'U.S. Certificated Mechanic' },
];

/** Item 7 "BY" row X-cell field names. `Manufacturer` is a shared field, handled by drawn X. */
const APPROVER_KIND_FIELDS: Array<{ test: RegExp; field: string }> = [
  { test: /inspection\s*authorization|\bIA\b/i, field: 'Inspection Authorization' },
  { test: /repair\s*station|\bCRS\b|part\s*145/i, field: 'Repair Station' },
  { test: /designee|\bDER\b|\bDAR\b|\bODA\b/i, field: 'FAA Designee' },
  { test: /inspector|flight\s*standards|\bFSDO\b|\bASI\b/i, field: 'FAA Flight Standards Inspector' },
  { test: /canadian|canada/i, field: 'Persons Approved by Canadian Department of Transport' },
  { test: /maintenance\s*organi[sz]ation|\bAMO\b/i, field: 'Maintenance Organization' },
];

/** Item 5 rows for non-airframe units: [make field, model field, serial field, repair X, alteration X]. */
const UNIT_ROW_FIELDS: Record<Exclude<Form337Input['unitType'], 'airframe'>, { make: string; model: string; serial: string }> = {
  powerplant: { make: 'POWERPLANT', model: 'As described in Item 1 abovePOWERPLANT', serial: 'POWERPLANT_2' },
  propeller: { make: 'PROPELLER', model: 'As described in Item 1 abovePROPELLER', serial: 'PROPELLER_2' },
  appliance: { make: '', model: 'As described in Item 1 aboveAPPLIANCE', serial: 'APPLIANCE_2' },
};

const TYPE_ROW_INDEX: Record<Form337Input['unitType'], number> = {
  airframe: 1,
  powerplant: 2,
  propeller: 3,
  appliance: 4,
};

/** Item 8 field metrics (page 3 of the PDF): 533x567pt box at x39,y71. */
const ITEM8_WIDTH = 523;
const ITEM8_FONT_SIZE = 9;
const ITEM8_LINE_HEIGHT = 11.2;
const ITEM8_MAX_LINES = Math.floor(557 / ITEM8_LINE_HEIGHT); // ~49

/** Fetches the template, fills it, and triggers a browser download. */
export async function fillOfficialForm337Pdf(
  input: Form337Input,
  output: Form337GeneratedOutput
): Promise<void> {
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error('Official FAA Form 337 template not found (public/forms/faa-form-337.pdf)');
  }
  const templateBytes = await response.arrayBuffer();
  const bytes = await buildOfficialForm337PdfBytes(input, output, templateBytes);
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const date = new Date().toISOString().slice(0, 10);
  const safeTitle = (input.title || 'form-337').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '');
  downloadBlob(blob, `FAA-337-${safeTitle}-${date}.pdf`);
}

/** Pure fill: template bytes in, filled PDF bytes out. Exported separately so tests can run it in node. */
export async function buildOfficialForm337PdfBytes(
  input: Form337Input,
  output: Form337GeneratedOutput,
  templateBytes: ArrayBuffer | Uint8Array
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBytes, { ignoreEncryption: true });
  const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();
  const pages = pdf.getPages();
  const front = pages[FRONT_PAGE];

  // Item 1 — Aircraft. The Make / Serial No fields have second widgets in the
  // Item 5 airframe row, so filling them also fills "(As described in Item 1 above)".
  trySetText(form, 'Nationality and Registration Mark', input.aircraft.nationalityRegistration);
  trySetText(form, 'Serial No', input.aircraft.serialNumber);
  trySetText(form, 'Make', input.aircraft.make);
  trySetText(form, 'Model', input.aircraft.model);
  trySetText(form, 'Series', input.aircraft.series);

  // Item 2 — Owner.
  const ownerAddress = parseAddressBlock(input.owner.address);
  trySetText(form, 'Name (As shown on registration certificate)', input.owner.name);
  trySetText(form, 'Address', ownerAddress.street, 8);
  trySetText(form, 'City', ownerAddress.city, 8);
  trySetText(form, 'State', ownerAddress.state, 8);
  trySetText(form, 'Zip', ownerAddress.zip, 8);
  trySetText(form, 'Country', ownerAddress.country, 8);

  // Item 3 — For FAA Use Only: intentionally left blank.

  // Item 4 — Type: X in the repair/alteration column of the row matching the unit.
  const rowIndex = TYPE_ROW_INDEX[input.unitType];
  trySetX(form, input.typeOfWork === 'repair' ? `Repair${rowIndex}` : `Alteration${rowIndex}`);

  // Item 5 — Unit Identification for non-airframe units.
  if (input.unitType !== 'airframe') {
    const row = UNIT_ROW_FIELDS[input.unitType];
    const unit = input.unitIdentification || {};
    if (input.unitType === 'appliance') {
      trySetText(form, 'Type', unit.applianceType, 8);
      // The appliance Manufacturer field is shared with two X-cells elsewhere on
      // the form, so draw the text directly instead of setting the field.
      if (unit.applianceManufacturer) {
        front.drawText(sanitizePdfText(unit.applianceManufacturer), {
          x: 234,
          y: 318,
          size: 8,
          font: helvetica,
          color: rgb(0, 0, 0),
          maxWidth: 88,
        });
      }
    } else {
      trySetText(form, row.make, unit.make, 8);
    }
    trySetText(form, row.model, unit.model, 8);
    trySetText(form, row.serial, unit.serialNumber, 8);
  }

  // Item 6 — Conformity Statement. First line of the blob is the agency name.
  const agencyLines = (input.agency.nameAndAddress || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const agencyName = agencyLines[0] || '';
  const agencyAddress = parseAddressBlock(agencyLines.slice(1).join('\n'));
  trySetText(form, 'Name', agencyName, 8);
  trySetText(form, 'Address_2', agencyAddress.street, 7);
  trySetText(form, 'City_2', agencyAddress.city, 8);
  trySetText(form, 'State_2', agencyAddress.state, 8);
  trySetText(form, 'Zip_2', agencyAddress.zip, 8);
  trySetText(form, 'Country_2', agencyAddress.country, 8);
  trySetText(form, 'Certificate No', input.agency.certificateNumber, 8);

  const agencyKindField = AGENCY_KIND_FIELDS.find((k) => k.test.test(input.agency.kindOfAgency || ''));
  if (agencyKindField) {
    trySetX(form, agencyKindField.field);
  } else if (/manufactur/i.test(input.agency.kindOfAgency || '')) {
    // Shared field — draw the X into the Item 6B Manufacturer cell.
    front.drawText('X', { x: 429, y: 276, size: 8, font: helvetica, color: rgb(0, 0, 0) });
  }

  // Item 6D signature box has no AcroForm field; draw printed name + completion date.
  const signerLine = [input.agency.signerName, input.agency.completionDate].filter(Boolean).join('    ');
  if (signerLine) {
    front.drawText(sanitizePdfText(signerLine), {
      x: 172,
      y: 170,
      size: 9,
      font: helvetica,
      color: rgb(0, 0, 0),
      maxWidth: 390,
    });
  }

  // Item 7 — Approval for Return to Service.
  trySetX(form, input.returnToService.decision === 'approved' ? 'Approved' : 'Rejected');
  const approverKindRaw = input.returnToService.approverKind || '';
  const approverKindField = APPROVER_KIND_FIELDS.find((k) => k.test.test(approverKindRaw));
  if (approverKindField) {
    trySetX(form, approverKindField.field);
  } else if (/manufactur/i.test(approverKindRaw)) {
    front.drawText('X', { x: 156, y: 113, size: 9, font: helvetica, color: rgb(0, 0, 0) });
  } else if (approverKindRaw) {
    trySetText(form, 'Other (Specify)', approverKindRaw, 7);
  }
  trySetText(form, 'Certificate or Designation No', input.returnToService.approverCertificateOrDesignation, 8);

  // Item 7 signature box (also not a field): printed approver name + approval date.
  const approverLine = [input.returnToService.approverName, input.returnToService.approvalDate]
    .filter(Boolean)
    .join('    ');
  if (approverLine) {
    front.drawText(sanitizePdfText(approverLine), {
      x: 172,
      y: 50,
      size: 9,
      font: helvetica,
      color: rgb(0, 0, 0),
      maxWidth: 390,
    });
  }

  // Item 8 — reverse side header + description.
  trySetText(
    form,
    'Identify with aircraft nationality and registration mark and date work completed 1',
    input.aircraft.nationalityRegistration,
    8
  );
  trySetText(form, '1', input.agency.completionDate, 8);

  const item8Content = sanitizePdfText(output.narrativeDraftOutput || buildItem8FallbackContent(input));
  const item8Lines = wrapLinesByWidth(item8Content, helvetica, ITEM8_FONT_SIZE, ITEM8_WIDTH);
  let overflowLines: string[] = [];
  let fieldText = item8Content;
  if (item8Lines.length > ITEM8_MAX_LINES) {
    const kept = item8Lines.slice(0, ITEM8_MAX_LINES - 1);
    overflowLines = item8Lines.slice(ITEM8_MAX_LINES - 1);
    fieldText = `${kept.join('\n')}\n(CONTINUED ON ATTACHED SHEETS)`;
    try {
      form.getCheckBox('Check Box2').check(); // "Additional Sheets Are Attached"
    } catch {
      // checkbox renamed — continuation pages are still appended below
    }
  }
  try {
    const descField = form.getTextField('Description of Work Accomplished');
    descField.enableMultiline();
    descField.setFontSize(ITEM8_FONT_SIZE);
    descField.setText(fieldText);
  } catch {
    // If the big field is ever missing, fall back to drawing on the reverse page.
    pages[REVERSE_PAGE].drawText(fieldText, {
      x: 44,
      y: 628,
      size: ITEM8_FONT_SIZE,
      font: helvetica,
      color: rgb(0, 0, 0),
      maxWidth: ITEM8_WIDTH,
      lineHeight: ITEM8_LINE_HEIGHT,
    });
  }

  // Continuation sheets for Item 8 overflow, identified per the form's instructions.
  while (overflowLines.length > 0) {
    const cont = pdf.addPage([612, 792]);
    const contMargin = 40;
    cont.drawText('FAA Form 337 — Item 8 Description of Work Accomplished (Continuation Sheet)', {
      x: contMargin,
      y: 758,
      size: 10.5,
      font: helvetica,
      color: rgb(0, 0, 0),
    });
    cont.drawText(
      sanitizePdfText(
        `Aircraft: ${input.aircraft.nationalityRegistration}   Date work completed: ${input.agency.completionDate || ''}`
      ),
      { x: contMargin, y: 744, size: 9, font: helvetica, color: rgb(0.15, 0.15, 0.15) }
    );
    const maxLines = Math.floor(690 / ITEM8_LINE_HEIGHT);
    const chunk = overflowLines.slice(0, maxLines);
    overflowLines = overflowLines.slice(maxLines);
    let y = 724;
    for (const line of chunk) {
      cont.drawText(line, { x: contMargin, y, size: ITEM8_FONT_SIZE, font: helvetica, color: rgb(0, 0, 0) });
      y -= ITEM8_LINE_HEIGHT;
    }
  }

  form.updateFieldAppearances(helvetica);

  return await pdf.save();
}
