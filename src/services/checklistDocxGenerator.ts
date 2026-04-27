import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  Footer,
  PageNumber,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ShadingType,
} from 'docx';
import type { ChecklistItemExport, ChecklistRunExport, ChecklistExportMeta } from './checklistPdfGenerator';

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: '✓ Complete',
  blocked: '⚠ Blocked',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'C0392B',
  major: 'D35400',
  minor: '2471A3',
  observation: '707070',
};

function sectionHeader(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '0A1A29', space: 4 } },
    children: [new TextRun({ text, bold: true, size: 24, color: '0A1A29', font: 'Calibri' })],
  });
}

function metaRow(label: string, value: string): Paragraph {
  return new Paragraph({
    spacing: { after: 60 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, size: 20, font: 'Calibri' }),
      new TextRun({ text: value, size: 20, font: 'Calibri' }),
    ],
  });
}

function itemBlock(item: ChecklistItemExport): Paragraph[] {
  const color = SEVERITY_COLORS[item.severity] ?? '707070';
  const status = STATUS_LABELS[item.status] ?? item.status;
  const paras: Paragraph[] = [];

  paras.push(
    new Paragraph({
      spacing: { before: 160, after: 60 },
      children: [
        new TextRun({ text: `[${item.severity.toUpperCase()}] `, bold: true, size: 20, color, font: 'Calibri' }),
        new TextRun({ text: item.title, bold: true, size: 20, font: 'Calibri' }),
        new TextRun({ text: `  —  ${status}`, size: 18, color: '666666', font: 'Calibri' }),
      ],
    })
  );

  if (item.requirementRef) {
    paras.push(new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({ text: 'Reg. Ref: ', bold: true, size: 18, font: 'Calibri' }),
        new TextRun({ text: item.requirementRef, size: 18, color: '2471A3', font: 'Courier New' }),
      ],
    }));
  }

  const meta: string[] = [];
  if (item.owner) meta.push(`Owner: ${item.owner}`);
  if (item.dueDate) meta.push(`Due: ${item.dueDate}`);
  if (meta.length) {
    paras.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: meta.join('   '), size: 18, color: '444444', font: 'Calibri' })],
    }));
  }

  if (item.notes) {
    paras.push(
      new Paragraph({ spacing: { after: 20 }, children: [new TextRun({ text: 'Notes:', bold: true, size: 18, font: 'Calibri' })] }),
      new Paragraph({ spacing: { after: 40 }, indent: { left: 360 }, children: [new TextRun({ text: item.notes, size: 18, font: 'Calibri' })] })
    );
  }

  if (item.signoffName && item.status === 'complete') {
    const parts = [`Signed: ${item.signoffName}`];
    if (item.signoffCertNumber) parts.push(`Cert: ${item.signoffCertNumber}`);
    if (item.signoffCertType) parts.push(`(${item.signoffCertType})`);
    if (item.signoffDate) parts.push(`Date: ${item.signoffDate}`);
    paras.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({ text: parts.join('  '), size: 18, color: '1E8449', font: 'Calibri' })],
    }));
  }

  return paras;
}

export async function generateChecklistDocx(
  run: ChecklistRunExport,
  items: ChecklistItemExport[],
  meta: ChecklistExportMeta
): Promise<Blob> {
  const children: (Paragraph | Table)[] = [];

  // ── COVER PAGE ──────────────────────────────────────────────────────────
  children.push(
    new Paragraph({ spacing: { after: 300 } }),
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 120 },
      children: [new TextRun({ text: 'AUDIT CHECKLIST REPORT', bold: true, size: 56, color: '0A1A29', font: 'Calibri' })],
    }),
    new Paragraph({
      spacing: { after: 400 },
      children: [new TextRun({ text: 'Aviation Compliance Checklist', size: 24, color: '7ABCFF', font: 'Calibri' })],
    })
  );

  const runLabel = run.name || `${run.frameworkLabel}${run.subtypeLabel ? ` — ${run.subtypeLabel}` : ''}`;
  children.push(metaRow('Checklist', runLabel));
  if (meta.entityName) children.push(metaRow('Entity', `${meta.entityName}${meta.entityLocation ? ` · ${meta.entityLocation}` : ''}`));
  children.push(metaRow('Framework', `${run.frameworkLabel}${run.subtypeLabel ? ` — ${run.subtypeLabel}` : ''}`));
  children.push(metaRow('Generated', new Date(run.createdAt).toLocaleDateString()));
  children.push(metaRow('Report date', new Date().toLocaleDateString()));
  if (meta.seriesName) children.push(metaRow('Series', `${meta.seriesName}${meta.cycleLabel ? ` · ${meta.cycleLabel}` : ''}`));
  if (meta.plannedDueDate) children.push(metaRow('Planned due', meta.plannedDueDate));

  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ── SUMMARY STATS ────────────────────────────────────────────────────────
  const total = items.length;
  const complete = items.filter(i => i.status === 'complete').length;
  const blocked = items.filter(i => i.status === 'blocked').length;

  children.push(sectionHeader('Summary'));

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: ['Total', 'Complete', 'Blocked', 'Remaining', 'Critical', 'Major'].map(h =>
            new TableCell({
              shading: { type: ShadingType.SOLID, color: '0A1A29', fill: '0A1A29' },
              children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, size: 18, color: 'FFFFFF', font: 'Calibri' })] })],
            })
          ),
        }),
        new TableRow({
          children: [
            String(total),
            String(complete),
            String(blocked),
            String(total - complete - blocked),
            String(items.filter(i => i.severity === 'critical').length),
            String(items.filter(i => i.severity === 'major').length),
          ].map(v =>
            new TableCell({
              children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: v, size: 20, font: 'Calibri' })] })],
            })
          ),
        }),
      ],
    })
  );

  children.push(new Paragraph({ spacing: { after: 200 } }));

  // ── ITEMS BY SECTION ─────────────────────────────────────────────────────
  const sections = [...new Set(items.map(i => i.section))];
  for (const section of sections) {
    children.push(sectionHeader(section));
    for (const item of items.filter(i => i.section === section)) {
      children.push(...itemBlock(item));
    }
  }

  const doc = new Document({
    sections: [{
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({ text: `${runLabel}  |  Page `, size: 16, font: 'Calibri', color: '888888' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Calibri', color: '888888' }),
              ],
            }),
          ],
        }),
      },
      children,
    }],
  });

  return Packer.toBlob(doc);
}
