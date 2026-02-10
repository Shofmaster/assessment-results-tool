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
} from 'docx';
import type { AuditAgent, AuditMessage } from '../types/auditSimulation';

export class AuditSimulationDOCXGenerator {
  async generateReport(
    companyName: string,
    messages: AuditMessage[],
    agents: AuditAgent[]
  ): Promise<Blob> {
    // Group messages by round
    const rounds = new Map<number, AuditMessage[]>();
    for (const msg of messages) {
      if (!rounds.has(msg.round)) rounds.set(msg.round, []);
      rounds.get(msg.round)!.push(msg);
    }

    const normalRounds = [...rounds.entries()].filter(([r]) => r >= 1);
    const reviewRounds = [...rounds.entries()].filter(([r]) => r === -1);
    const roundCount = rounds.size;

    const children: Paragraph[] = [];

    // ── COVER PAGE ──────────────────────────────────────────
    children.push(
      new Paragraph({ spacing: { after: 200 } }), // top spacer
      new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { after: 100 },
        children: [
          new TextRun({
            text: 'AUDIT SIMULATION REPORT',
            bold: true,
            size: 52, // 26pt
            color: '0A1A29',
            font: 'Calibri',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 400 },
        children: [
          new TextRun({
            text: 'Multi-Agent Aviation Compliance Audit',
            size: 24, // 12pt
            color: '7ABCFF',
            font: 'Calibri',
          }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Company: ', bold: true, size: 24, font: 'Calibri' }),
          new TextRun({ text: companyName, size: 24, font: 'Calibri' }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Date: ', bold: true, size: 22, font: 'Calibri' }),
          new TextRun({ text: new Date().toLocaleDateString(), size: 22, font: 'Calibri' }),
        ],
      }),
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({ text: 'Total Exchanges: ', bold: true, size: 22, font: 'Calibri' }),
          new TextRun({ text: String(messages.length), size: 22, font: 'Calibri' }),
        ],
      }),
      new Paragraph({
        spacing: { after: 200 },
        children: [
          new TextRun({ text: 'Rounds: ', bold: true, size: 22, font: 'Calibri' }),
          new TextRun({ text: String(roundCount), size: 22, font: 'Calibri' }),
        ],
      }),
      new Paragraph({
        spacing: { after: 120 },
        children: [
          new TextRun({ text: 'Participants', bold: true, size: 26, font: 'Calibri' }),
        ],
      })
    );

    for (const agent of agents) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          indent: { left: 360 },
          children: [
            new TextRun({
              text: `${agent.avatar}  ${agent.name}`,
              bold: true,
              size: 22,
              font: 'Calibri',
              color: getAgentDocxColor(agent.id),
            }),
            new TextRun({
              text: ` — ${agent.role}`,
              size: 22,
              font: 'Calibri',
              color: '666666',
            }),
          ],
        })
      );
    }

    // Page break after cover
    children.push(new Paragraph({ children: [new PageBreak()] }));

    // ── TRANSCRIPT ──────────────────────────────────────────
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { after: 200 },
        children: [
          new TextRun({ text: 'Simulation Transcript', bold: true, size: 32, font: 'Calibri' }),
        ],
      })
    );

    for (const [round, roundMessages] of normalRounds) {
      // Round header
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
          border: {
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' },
          },
          children: [
            new TextRun({
              text: `Round ${round}`,
              bold: true,
              size: 26,
              font: 'Calibri',
              color: '333333',
            }),
          ],
        })
      );

      for (const msg of roundMessages) {
        this.addMessageParagraphs(children, msg);
      }
    }

    // ── REVIEW ROUNDS (if any) ──────────────────────────────
    if (reviewRounds.length > 0) {
      children.push(
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: 'Post-Simulation Review',
              bold: true,
              size: 32,
              font: 'Calibri',
            }),
          ],
        })
      );

      for (const [, reviewMessages] of reviewRounds) {
        for (const msg of reviewMessages) {
          this.addMessageParagraphs(children, msg);
        }
      }
    }

    // ── BUILD DOCUMENT ──────────────────────────────────────
    const doc = new Document({
      sections: [
        {
          properties: {},
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new TextRun({ text: 'Page ', size: 18, color: '999999', font: 'Calibri' }),
                    new TextRun({ children: [PageNumber.CURRENT], size: 18, color: '999999', font: 'Calibri' }),
                    new TextRun({ text: ' of ', size: 18, color: '999999', font: 'Calibri' }),
                    new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, color: '999999', font: 'Calibri' }),
                  ],
                }),
              ],
            }),
          },
          children,
        },
      ],
    });

    return Packer.toBlob(doc);
  }

  private addMessageParagraphs(children: Paragraph[], msg: AuditMessage): void {
    const agentColor = getAgentDocxColor(msg.agentId);

    // Agent name
    const nameRuns: TextRun[] = [
      new TextRun({
        text: msg.agentName,
        bold: true,
        size: 22,
        font: 'Calibri',
        color: agentColor,
      }),
    ];

    if (msg.wasRevised) {
      nameRuns.push(
        new TextRun({
          text: `  (Revised${msg.reviewIteration ? `, iteration ${msg.reviewIteration}` : ''})`,
          italics: true,
          size: 18,
          font: 'Calibri',
          color: 'E67E22',
        })
      );
    }

    children.push(
      new Paragraph({
        spacing: { before: 200, after: 40 },
        children: nameRuns,
      })
    );

    // Role
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [
          new TextRun({
            text: msg.role,
            italics: true,
            size: 18,
            font: 'Calibri',
            color: '888888',
          }),
        ],
      })
    );

    // Message content — split by newlines into separate paragraphs
    const paragraphs = msg.content.split('\n');
    for (const para of paragraphs) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          indent: { left: 180 },
          children: [
            new TextRun({
              text: para || ' ',
              size: 20,
              font: 'Calibri',
            }),
          ],
        })
      );
    }
  }
}

function getAgentDocxColor(agentId: string): string {
  switch (agentId) {
    case 'faa-inspector':
      return '1A4DB3';
    case 'shop-owner':
      return 'B38C0D';
    case 'isbao-auditor':
      return '0D8C59';
    case 'easa-inspector':
      return '6B21A8';
    case 'as9100-auditor':
      return 'B91C1C';
    case 'sms-consultant':
      return '0E7490';
    case 'safety-auditor':
      return '4338CA';
    default:
      return '000000';
  }
}
