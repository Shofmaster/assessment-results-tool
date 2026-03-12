import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  Footer,
  Header,
  PageNumber,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  ShadingType,
  TableOfContents,
  StyleLevel,
  SectionType,
} from 'docx';

type DocChild = Paragraph | Table | TableOfContents;

// ─── Public types ──────────────────────────────────────────────────────────────

export interface ManualSection {
  sectionTitle: string;
  sectionNumber?: string;
  generatedContent: string;
  cfrRefs?: string[];
  status: string;
  updatedAt: string;
}

export interface ManualDefinition {
  term: string;
  definition: string;
}

export interface ManualExportConfig {
  includeCoverPage: boolean;
  includeLEP: boolean;
  includeTOC: boolean;
  includeDefinitions: boolean;
  includeAppendix: boolean;
  appendixIncludeCfrRefs: boolean;
  appendixIncludeStandardsXref: boolean;
  appendixIncludeChangeLog: boolean;
  appendixCustomText: string;
}

export interface ManualExportData {
  companyName: string;
  manualTitle: string;
  manualType: string;
  revision: string;
  date: string;
  standards: string[];
  sections: ManualSection[];
  definitions: ManualDefinition[];
  changeLog: Array<{ section: string; description: string; date: string }>;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const FONT = 'Calibri';
const NAVY = '0A1A29';
const SKY = '38BDFF';
const GRAY = '666666';
const LIGHT_GRAY = 'F0F2F5';
const WHITE = 'FFFFFF';

const sz = (pt: number) => pt * 2; // docx sizes are in half-points

// ─── Generator ─────────────────────────────────────────────────────────────────

export class ManualDocxGenerator {
  async generate(config: ManualExportConfig, data: ManualExportData): Promise<Blob> {
    const orderedSections = [...data.sections].sort((a, b) => {
      const numA = a.sectionNumber || '';
      const numB = b.sectionNumber || '';
      return numA.localeCompare(numB, undefined, { numeric: true });
    });

    const allCfrRefs = Array.from(
      new Set(orderedSections.flatMap((s) => s.cfrRefs || []))
    ).sort();

    const docSections: any[] = [];

    // ── Cover page section ─────────────────────────────────────
    if (config.includeCoverPage) {
      docSections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
        },
        headers: { default: this.buildHeader('', '') },
        footers: { default: this.buildFooter(data.revision) },
        children: this.buildCoverPage(data),
      });
    }

    // ── Front matter section (LEP, TOC, Definitions) ───────────
    const frontMatter: DocChild[] = [];

    if (config.includeLEP) {
      frontMatter.push(...this.buildLEP(orderedSections, data, config));
    }

    if (config.includeTOC) {
      if (frontMatter.length > 0) {
        frontMatter.push(new Paragraph({ children: [new PageBreak()] }));
      }
      frontMatter.push(...this.buildTOC());
    }

    if (config.includeDefinitions && data.definitions.length > 0) {
      if (frontMatter.length > 0) {
        frontMatter.push(new Paragraph({ children: [new PageBreak()] }));
      }
      frontMatter.push(...this.buildDefinitions(data.definitions));
    }

    if (frontMatter.length > 0) {
      docSections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
        },
        headers: { default: this.buildHeader(data.companyName, data.manualTitle) },
        footers: { default: this.buildFooter(data.revision) },
        children: frontMatter,
      });
    }

    // ── Body sections ──────────────────────────────────────────
    const bodyChildren: DocChild[] = [];
    for (let i = 0; i < orderedSections.length; i++) {
      if (i > 0) {
        bodyChildren.push(new Paragraph({ children: [new PageBreak()] }));
      }
      bodyChildren.push(...this.buildSection(orderedSections[i]));
    }

    if (bodyChildren.length > 0) {
      docSections.push({
        properties: {
          type: SectionType.NEXT_PAGE,
        },
        headers: { default: this.buildHeader(data.companyName, data.manualTitle) },
        footers: { default: this.buildFooter(data.revision) },
        children: bodyChildren,
      });
    }

    // ── Appendix ───────────────────────────────────────────────
    if (config.includeAppendix) {
      const appendixChildren = this.buildAppendix(config, data, allCfrRefs);
      if (appendixChildren.length > 0) {
        docSections.push({
          properties: {
            type: SectionType.NEXT_PAGE,
          },
          headers: { default: this.buildHeader(data.companyName, data.manualTitle) },
          footers: { default: this.buildFooter(data.revision) },
          children: appendixChildren,
        });
      }
    }

    // If nothing was added, add a placeholder
    if (docSections.length === 0) {
      docSections.push({
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: 'No content to export.', font: FONT, size: sz(12) })],
          }),
        ],
      });
    }

    const doc = new Document({
      features: { updateFields: true },
      styles: {
        default: {
          document: {
            run: { font: FONT, size: sz(11) },
            paragraph: { spacing: { after: 120 } },
          },
          heading1: {
            run: { font: FONT, size: sz(16), bold: true, color: NAVY },
            paragraph: { spacing: { before: 240, after: 120 } },
          },
          heading2: {
            run: { font: FONT, size: sz(13), bold: true, color: NAVY },
            paragraph: { spacing: { before: 200, after: 100 } },
          },
          heading3: {
            run: { font: FONT, size: sz(11), bold: true, color: NAVY },
            paragraph: { spacing: { before: 160, after: 80 } },
          },
        },
      },
      sections: docSections,
    });

    return Packer.toBlob(doc);
  }

  // ─── Cover page ──────────────────────────────────────────────────────────────

  private buildCoverPage(data: ManualExportData): DocChild[] {
    const children: DocChild[] = [];

    // Spacer
    children.push(new Paragraph({ spacing: { after: 600 } }));

    // Manual title
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: data.manualTitle.toUpperCase(),
            bold: true,
            size: sz(28),
            color: NAVY,
            font: FONT,
          }),
        ],
      })
    );

    // Manual type subtitle
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: data.manualType,
            size: sz(14),
            color: SKY,
            font: FONT,
          }),
        ],
      })
    );

    // Horizontal rule
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 2, color: SKY },
        },
        children: [new TextRun({ text: '' })],
      })
    );

    // Company name
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [
          new TextRun({ text: 'Prepared for: ', size: sz(12), color: GRAY, font: FONT }),
          new TextRun({ text: data.companyName, bold: true, size: sz(14), color: NAVY, font: FONT }),
        ],
      })
    );

    // Revision
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Revision: ', size: sz(12), color: GRAY, font: FONT }),
          new TextRun({ text: data.revision, size: sz(12), color: NAVY, font: FONT }),
        ],
      })
    );

    // Date
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Date: ', size: sz(12), color: GRAY, font: FONT }),
          new TextRun({ text: data.date, size: sz(12), color: NAVY, font: FONT }),
        ],
      })
    );

    // Standards
    if (data.standards.length > 0) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 80 },
          children: [
            new TextRun({ text: 'Applicable Standards: ', size: sz(11), color: GRAY, font: FONT }),
            new TextRun({ text: data.standards.join(', '), size: sz(11), color: NAVY, font: FONT }),
          ],
        })
      );
    }

    return children;
  }

  // ─── List of Effective Pages ─────────────────────────────────────────────────

  private buildLEP(
    sections: ManualSection[],
    data: ManualExportData,
    config: ManualExportConfig
  ): DocChild[] {
    const children: DocChild[] = [];

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: 'List of Effective Pages', bold: true, font: FONT, size: sz(16), color: NAVY })],
      })
    );

    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: 'This list identifies all pages in this manual and their current revision status. Upon receipt of a revision, insert the new pages and destroy superseded pages.',
            size: sz(10),
            color: GRAY,
            font: FONT,
            italics: true,
          }),
        ],
      })
    );

    const rows: TableRow[] = [];

    // Header row
    rows.push(
      new TableRow({
        tableHeader: true,
        children: ['Section', 'Title', 'Page(s)', 'Revision', 'Date'].map(
          (text) =>
            new TableCell({
              shading: { type: ShadingType.SOLID, color: NAVY },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text, bold: true, size: sz(10), color: WHITE, font: FONT })],
                }),
              ],
              width: { size: text === 'Title' ? 35 : text === 'Section' ? 15 : text === 'Page(s)' ? 15 : 17, type: WidthType.PERCENTAGE },
            })
        ),
      })
    );

    // Front matter rows
    const frontMatterItems: Array<{ section: string; title: string }> = [];
    if (config.includeCoverPage) frontMatterItems.push({ section: '--', title: 'Cover Page' });
    if (config.includeLEP) frontMatterItems.push({ section: '--', title: 'List of Effective Pages' });
    if (config.includeTOC) frontMatterItems.push({ section: '--', title: 'Table of Contents' });
    if (config.includeDefinitions && data.definitions.length > 0) {
      frontMatterItems.push({ section: '--', title: 'Definitions and Abbreviations' });
    }

    for (const item of frontMatterItems) {
      rows.push(this.buildLEPRow(item.section, item.title, 'i', data.revision, data.date, true));
    }

    // Body section rows
    for (let i = 0; i < sections.length; i++) {
      const sec = sections[i];
      rows.push(
        this.buildLEPRow(
          sec.sectionNumber || String(i + 1),
          sec.sectionTitle,
          String(i + 1),
          data.revision,
          sec.updatedAt ? new Date(sec.updatedAt).toLocaleDateString() : data.date,
          false
        )
      );
    }

    // Appendix row
    if (config.includeAppendix) {
      rows.push(this.buildLEPRow('App.', 'Appendix', '--', data.revision, data.date, true));
    }

    children.push(
      new Table({
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      })
    );

    return children;
  }

  private buildLEPRow(
    section: string,
    title: string,
    page: string,
    revision: string,
    date: string,
    isShaded: boolean
  ): TableRow {
    const shading: { type: typeof ShadingType.SOLID; color: string } | undefined = isShaded
      ? { type: ShadingType.SOLID, color: LIGHT_GRAY }
      : undefined;
    const cells = [section, title, page, revision, date].map(
      (text, idx) =>
        new TableCell({
          shading,
          children: [
            new Paragraph({
              alignment: idx === 0 || idx === 2 ? AlignmentType.CENTER : AlignmentType.LEFT,
              children: [new TextRun({ text, size: sz(9), font: FONT })],
            }),
          ],
        })
    );
    return new TableRow({ children: cells });
  }

  // ─── Table of Contents ───────────────────────────────────────────────────────

  private buildTOC(): DocChild[] {
    return [
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: 'Table of Contents', bold: true, font: FONT, size: sz(16), color: NAVY })],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: 'Update this table of contents after opening in Microsoft Word: right-click the table below and select "Update Field."',
            size: sz(10),
            color: GRAY,
            font: FONT,
            italics: true,
          }),
        ],
      }),
      new TableOfContents('Table of Contents', {
        hyperlink: true,
        headingStyleRange: '1-3',
        stylesWithLevels: [
          new StyleLevel('Heading1', 1),
          new StyleLevel('Heading2', 2),
          new StyleLevel('Heading3', 3),
        ],
      }),
    ];
  }

  // ─── Definitions ─────────────────────────────────────────────────────────────

  private buildDefinitions(definitions: ManualDefinition[]): DocChild[] {
    const children: DocChild[] = [];

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({ text: 'Definitions and Abbreviations', bold: true, font: FONT, size: sz(16), color: NAVY }),
        ],
      })
    );

    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({
            text: 'The following terms and abbreviations are used throughout this manual.',
            size: sz(10),
            color: GRAY,
            font: FONT,
            italics: true,
          }),
        ],
      })
    );

    const sorted = [...definitions].sort((a, b) =>
      a.term.toLowerCase().localeCompare(b.term.toLowerCase())
    );

    const rows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            shading: { type: ShadingType.SOLID, color: NAVY },
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Term / Abbreviation', bold: true, size: sz(10), color: WHITE, font: FONT })],
              }),
            ],
          }),
          new TableCell({
            shading: { type: ShadingType.SOLID, color: NAVY },
            width: { size: 70, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Definition', bold: true, size: sz(10), color: WHITE, font: FONT })],
              }),
            ],
          }),
        ],
      }),
    ];

    sorted.forEach((def, i) => {
      const shading: { type: typeof ShadingType.SOLID; color: string } | undefined = i % 2 === 0 ? { type: ShadingType.SOLID, color: LIGHT_GRAY } : undefined;
      rows.push(
        new TableRow({
          children: [
            new TableCell({
              shading,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: def.term, bold: true, size: sz(10), font: FONT })],
                }),
              ],
            }),
            new TableCell({
              shading,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: def.definition, size: sz(10), font: FONT })],
                }),
              ],
            }),
          ],
        })
      );
    });

    children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));

    return children;
  }

  // ─── Body section ────────────────────────────────────────────────────────────

  private buildSection(section: ManualSection): Paragraph[] {
    const children: Paragraph[] = [];

    const titleText = section.sectionNumber
      ? `${section.sectionNumber}  ${section.sectionTitle}`
      : section.sectionTitle;

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: titleText, bold: true, font: FONT, size: sz(16), color: NAVY })],
      })
    );

    const content = section.generatedContent || '';
    const paragraphs = content.split(/\n{2,}/);
    for (const para of paragraphs) {
      const lines = para.split('\n');
      const runs: TextRun[] = [];
      for (let i = 0; i < lines.length; i++) {
        if (i > 0) runs.push(new TextRun({ break: 1 }));
        runs.push(new TextRun({ text: lines[i], size: sz(11), font: FONT }));
      }
      children.push(new Paragraph({ spacing: { after: 120 }, children: runs }));
    }

    return children;
  }

  // ─── Appendix ────────────────────────────────────────────────────────────────

  private buildAppendix(
    config: ManualExportConfig,
    data: ManualExportData,
    allCfrRefs: string[]
  ): DocChild[] {
    const children: DocChild[] = [];

    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        children: [new TextRun({ text: 'Appendix', bold: true, font: FONT, size: sz(16), color: NAVY })],
      })
    );

    let appendixLetter = 'A';

    // Appendix A: CFR References
    if (config.appendixIncludeCfrRefs && allCfrRefs.length > 0) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          children: [
            new TextRun({
              text: `Appendix ${appendixLetter}: Applicable CFR References`,
              bold: true,
              font: FONT,
              size: sz(13),
              color: NAVY,
            }),
          ],
        })
      );

      for (const ref of allCfrRefs) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            bullet: { level: 0 },
            children: [new TextRun({ text: ref, size: sz(10), font: FONT })],
          })
        );
      }

      appendixLetter = String.fromCharCode(appendixLetter.charCodeAt(0) + 1);
    }

    // Appendix B: Standards Cross-Reference
    if (config.appendixIncludeStandardsXref && data.standards.length > 0) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300 },
          children: [
            new TextRun({
              text: `Appendix ${appendixLetter}: Standards Cross-Reference`,
              bold: true,
              font: FONT,
              size: sz(13),
              color: NAVY,
            }),
          ],
        })
      );

      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [
            new TextRun({
              text: 'This manual has been written to comply with the following standards:',
              size: sz(10),
              font: FONT,
              color: GRAY,
              italics: true,
            }),
          ],
        })
      );

      for (const std of data.standards) {
        children.push(
          new Paragraph({
            spacing: { after: 60 },
            bullet: { level: 0 },
            children: [new TextRun({ text: std, size: sz(10), font: FONT })],
          })
        );
      }

      appendixLetter = String.fromCharCode(appendixLetter.charCodeAt(0) + 1);
    }

    // Appendix C: Change Log
    if (config.appendixIncludeChangeLog && data.changeLog.length > 0) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300 },
          children: [
            new TextRun({
              text: `Appendix ${appendixLetter}: Change Log`,
              bold: true,
              font: FONT,
              size: sz(13),
              color: NAVY,
            }),
          ],
        })
      );

      const changeRows: TableRow[] = [
        new TableRow({
          tableHeader: true,
          children: ['Date', 'Section', 'Description'].map((text) =>
            new TableCell({
              shading: { type: ShadingType.SOLID, color: NAVY },
              children: [
                new Paragraph({
                  children: [new TextRun({ text, bold: true, size: sz(10), color: WHITE, font: FONT })],
                }),
              ],
              width: {
                size: text === 'Description' ? 55 : text === 'Date' ? 20 : 25,
                type: WidthType.PERCENTAGE,
              },
            })
          ),
        }),
      ];

      for (const log of data.changeLog) {
        changeRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: log.date, size: sz(9), font: FONT })] })],
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: log.section, size: sz(9), font: FONT })] })],
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: log.description, size: sz(9), font: FONT })] })],
              }),
            ],
          })
        );
      }

      children.push(new Table({ rows: changeRows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      appendixLetter = String.fromCharCode(appendixLetter.charCodeAt(0) + 1);
    }

    // Custom appendix text
    if (config.appendixCustomText?.trim()) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300 },
          children: [
            new TextRun({
              text: `Appendix ${appendixLetter}: Additional Information`,
              bold: true,
              font: FONT,
              size: sz(13),
              color: NAVY,
            }),
          ],
        })
      );

      const paragraphs = config.appendixCustomText.split(/\n{2,}/);
      for (const para of paragraphs) {
        children.push(
          new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: para, size: sz(10), font: FONT })],
          })
        );
      }
    }

    return children;
  }

  // ─── Header / Footer ────────────────────────────────────────────────────────

  private buildHeader(companyName: string, manualTitle: string): Header {
    return new Header({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: SKY },
          },
          spacing: { after: 120 },
          children: [
            new TextRun({ text: companyName, bold: true, size: sz(9), color: NAVY, font: FONT }),
            new TextRun({ text: companyName && manualTitle ? '  |  ' : '', size: sz(9), color: GRAY, font: FONT }),
            new TextRun({ text: manualTitle, size: sz(9), color: GRAY, font: FONT }),
          ],
        }),
      ],
    });
  }

  private buildFooter(revision: string): Footer {
    return new Footer({
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          border: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
          },
          children: [
            new TextRun({ text: `${revision}  |  Page `, size: sz(8), color: GRAY, font: FONT }),
            new TextRun({ children: [PageNumber.CURRENT], size: sz(8), color: GRAY, font: FONT }),
            new TextRun({ text: ' of ', size: sz(8), color: GRAY, font: FONT }),
            new TextRun({ children: [PageNumber.TOTAL_PAGES], size: sz(8), color: GRAY, font: FONT }),
          ],
        }),
      ],
    });
  }
}
