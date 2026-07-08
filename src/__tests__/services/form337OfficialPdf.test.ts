import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { buildOfficialForm337PdfBytes, parseAddressBlock } from '../../services/form337OfficialPdf';
import type { Form337Input } from '../../services/form337Service';

const templateBytes = Uint8Array.from(readFileSync(resolve(__dirname, '../../../public/forms/faa-form-337.pdf')));

function sampleInput(overrides: Partial<Form337Input> = {}): Form337Input {
  return {
    title: 'Test Draft',
    aircraft: {
      nationalityRegistration: 'N12345',
      make: 'Cessna',
      model: '182T',
      series: 'T182T',
      serialNumber: 'T18208888',
    },
    owner: {
      name: 'Acme Aviation LLC',
      address: '123 Hangar Rd\nWichita, KS 67201\nUSA',
    },
    typeOfWork: 'alteration',
    unitType: 'airframe',
    workItems: [
      {
        id: 'item-1',
        location: 'Aft fuselage',
        description: 'Installed antenna per STC.',
        approvedData: 'STC SA01234WI Rev B',
        partsUsed: 'Antenna P/N CI-105, 8130-3 attached',
        weightChange: '+0.8 lb at +180.0 in. arm',
        continuedAirworthiness: 'None',
      },
    ],
    agency: {
      nameAndAddress: 'Best Aero Repair\n456 Ramp Way\nDerby, KS 67037',
      kindOfAgency: 'Certificated Repair Station',
      certificateNumber: 'BR1R234X',
      completionDate: '2026-07-01',
      signerName: 'Jane Doe',
    },
    returnToService: {
      decision: 'approved',
      approverName: 'John Smith',
      approverCertificateOrDesignation: 'A&P 1234567 IA',
      approverKind: 'Inspection Authorization',
      approvalDate: '2026-07-02',
    },
    fieldApprovalNotes: '',
    ...overrides,
  };
}

describe('parseAddressBlock', () => {
  it('splits street / city / state / zip / country', () => {
    expect(parseAddressBlock('123 Hangar Rd\nWichita, KS 67201\nUSA')).toEqual({
      street: '123 Hangar Rd',
      city: 'Wichita',
      state: 'KS',
      zip: '67201',
      country: 'USA',
    });
  });

  it('handles comma-separated single-line addresses', () => {
    const parsed = parseAddressBlock('456 Ramp Way, Derby, KS 67037');
    expect(parsed.street).toBe('456 Ramp Way');
    expect(parsed.city).toBe('Derby');
    expect(parsed.state).toBe('KS');
    expect(parsed.zip).toBe('67037');
  });

  it('falls back to street when no city/state/zip tail found', () => {
    const parsed = parseAddressBlock('Hangar 4, Somewhere Airport');
    expect(parsed.street.length).toBeGreaterThan(0);
    expect(parsed.zip).toBe('');
  });
});

describe('buildOfficialForm337PdfBytes', () => {
  it('fills the official template fields', async () => {
    const bytes = await buildOfficialForm337PdfBytes(
      sampleInput(),
      {
        fieldMappedOutput: {},
        narrativeDraftOutput: '1. Installed antenna per STC SA01234WI Rev B. No change to weight or balance.',
        logbookEntryOutput: '',
      },
      templateBytes
    );

    const pdf = await PDFDocument.load(bytes);
    const form = pdf.getForm();
    expect(form.getTextField('Nationality and Registration Mark').getText()).toBe('N12345');
    expect(form.getTextField('Serial No').getText()).toBe('T18208888');
    expect(form.getTextField('Make').getText()).toBe('Cessna');
    expect(form.getTextField('Model').getText()).toBe('182T');
    expect(form.getTextField('Name (As shown on registration certificate)').getText()).toBe('Acme Aviation LLC');
    expect(form.getTextField('City').getText()).toBe('Wichita');
    expect(form.getTextField('State').getText()).toBe('KS');
    // Alteration on the airframe row; repair cell untouched.
    expect(form.getTextField('Alteration1').getText()).toBe('X');
    expect(form.getTextField('Repair1').getText() ?? '').toBe('');
    // Item 6: repair station keyword maps to the CRS X-cell; name from first blob line.
    expect(form.getTextField('Certificated Repair Station').getText()).toBe('X');
    expect(form.getTextField('Name').getText()).toBe('Best Aero Repair');
    expect(form.getTextField('Certificate No').getText()).toBe('BR1R234X');
    // Item 7.
    expect(form.getTextField('Approved').getText()).toBe('X');
    expect(form.getTextField('Inspection Authorization').getText()).toBe('X');
    expect(form.getTextField('Certificate or Designation No').getText()).toBe('A&P 1234567 IA');
    // Item 8 reverse.
    expect(form.getTextField('Description of Work Accomplished').getText()).toContain('Installed antenna');
    expect(
      form.getTextField('Identify with aircraft nationality and registration mark and date work completed 1').getText()
    ).toBe('N12345');
    expect(form.getTextField('1').getText()).toBe('2026-07-01');
    // No overflow: no continuation pages beyond the template's 3.
    expect(pdf.getPageCount()).toBe(3);
  });

  it('fills powerplant unit identification and repair type row', async () => {
    const bytes = await buildOfficialForm337PdfBytes(
      sampleInput({
        typeOfWork: 'repair',
        unitType: 'powerplant',
        unitIdentification: { make: 'Lycoming', model: 'IO-540-AB1A5', serialNumber: 'L-12345-48A' },
      }),
      { fieldMappedOutput: {}, narrativeDraftOutput: 'Repaired cylinder.', logbookEntryOutput: '' },
      templateBytes
    );
    const pdf = await PDFDocument.load(bytes);
    const form = pdf.getForm();
    expect(form.getTextField('Repair2').getText()).toBe('X');
    expect(form.getTextField('POWERPLANT').getText()).toBe('Lycoming');
    expect(form.getTextField('As described in Item 1 abovePOWERPLANT').getText()).toBe('IO-540-AB1A5');
    expect(form.getTextField('POWERPLANT_2').getText()).toBe('L-12345-48A');
  });

  it('overflows long Item 8 text onto continuation sheets and checks the box', async () => {
    const longNarrative = Array.from({ length: 120 }, (_, i) =>
      `${i + 1}. Removed and reinstalled inspection panel F-${i} per AMM 53-10-00 Rev 12 para 2-3, torqued fasteners to 25 in.-lb.`
    ).join('\n');
    const bytes = await buildOfficialForm337PdfBytes(
      sampleInput(),
      { fieldMappedOutput: {}, narrativeDraftOutput: longNarrative, logbookEntryOutput: '' },
      templateBytes
    );
    const pdf = await PDFDocument.load(bytes);
    const form = pdf.getForm();
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(form.getCheckBox('Check Box2').isChecked()).toBe(true);
    expect(form.getTextField('Description of Work Accomplished').getText()).toContain('CONTINUED ON ATTACHED SHEETS');
  });

  it('smart quotes and dashes survive WinAnsi encoding', async () => {
    const bytes = await buildOfficialForm337PdfBytes(
      sampleInput(),
      {
        fieldMappedOutput: {},
        narrativeDraftOutput: 'Installed “new” bracket — torqued to 25 in.-lb…',
        logbookEntryOutput: '',
      },
      templateBytes
    );
    const pdf = await PDFDocument.load(bytes);
    const text = pdf.getForm().getTextField('Description of Work Accomplished').getText() || '';
    expect(text).toContain('Installed "new" bracket - torqued');
  });
});
