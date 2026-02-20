import { PDFDocument, rgb, StandardFonts, type PDFFont } from 'pdf-lib';
import type { AuditAgent, AuditMessage } from '../types/auditSimulation';

export class AuditSimulationPDFGenerator {
  async generateReport(
    companyName: string,
    messages: AuditMessage[],
    agents: AuditAgent[]
  ): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);

    const PAGE_W = 612;
    const PAGE_H = 792;
    const LEFT = 50;
    const RIGHT = PAGE_W - 50;
    const MAX_TEXT_W = RIGHT - LEFT;
    const LINE_H = 14;
    const BOTTOM_MARGIN = 60;

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - 42;

    const ensureSpace = (needed: number) => {
      if (y - needed < BOTTOM_MARGIN) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - 42;
      }
    };

    const drawText = (
      text: string,
      x: number,
      size: number,
      font: PDFFont,
      color = rgb(0, 0, 0)
    ) => {
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
    ): void => {
      const paragraphs = text.split('\n');
      for (const paragraph of paragraphs) {
        if (paragraph.trim() === '') {
          y -= LINE_H;
          ensureSpace(LINE_H);
          continue;
        }
        const words = paragraph.split(' ');
        let line = '';
        for (const word of words) {
          const test = line + word + ' ';
          const w = font.widthOfTextAtSize(test, size);
          if (w > maxW && line !== '') {
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
      }
    };

    // ── COVER PAGE ──────────────────────────────────────────
    page.drawRectangle({
      x: 0,
      y: PAGE_H - 92,
      width: PAGE_W,
      height: 92,
      color: rgb(0.04, 0.1, 0.16),
    });

    y = PAGE_H - 37;
    drawText('AUDIT SIMULATION REPORT', LEFT, 24, helveticaBold, rgb(1, 1, 1));
    y = PAGE_H - 62;
    drawText('Multi-Agent Aviation Compliance Audit', LEFT, 12, helvetica, rgb(0.48, 0.74, 0.99));

    y = PAGE_H - 130;
    drawText(`Company: ${companyName}`, LEFT, 14, helveticaBold);
    drawText(`Date: ${new Date().toLocaleDateString()}`, LEFT, 12, timesRoman);

    // Group messages by round for summary
    const roundCount = new Set(messages.map((m) => m.round)).size;
    drawText(`Total Exchanges: ${messages.length}`, LEFT, 12, timesRoman);
    drawText(`Rounds: ${roundCount}`, LEFT, 12, timesRoman);

    y -= 10;
    drawText('Participants', LEFT, 14, helveticaBold);
    for (const agent of agents) {
      drawText(`${agent.avatar}  ${agent.name} — ${agent.role}`, LEFT + 10, 11, timesRoman);
    }

    // ── TRANSCRIPT ──────────────────────────────────────────
    page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - 42;

    drawText('SIMULATION TRANSCRIPT', LEFT, 18, helveticaBold);
    y -= 6;

    // Group messages by round
    const rounds = new Map<number, AuditMessage[]>();
    for (const msg of messages) {
      if (!rounds.has(msg.round)) rounds.set(msg.round, []);
      rounds.get(msg.round)!.push(msg);
    }

    for (const [round, roundMessages] of rounds) {
      ensureSpace(40);

      // Round header line
      page.drawRectangle({
        x: LEFT,
        y: y - 2,
        width: MAX_TEXT_W,
        height: 1,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 16;
      drawText(`Round ${round}`, LEFT, 13, helveticaBold, rgb(0.3, 0.3, 0.3));
      y -= 4;

      for (const msg of roundMessages) {
        ensureSpace(60);

        // Agent name + role
        const agentColor = getAgentPDFColor(msg.agentId);
        drawText(`${msg.agentName}`, LEFT, 12, helveticaBold, agentColor);
        drawText(msg.role, LEFT, 9, helvetica, rgb(0.45, 0.45, 0.45));
        y -= 2;

        // Message body
        drawWrapped(msg.content, LEFT + 5, MAX_TEXT_W - 5, 10, timesRoman);
        y -= 10;
      }
    }

    // ── PAGE NUMBERS ────────────────────────────────────────
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
      pages[i].drawText(`Page ${i + 1} of ${pages.length}`, {
        x: 270,
        y: 30,
        size: 9,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    return pdfDoc.save();
  }
}

function getAgentPDFColor(agentId: string) {
  switch (agentId) {
    case 'faa-inspector':
      return rgb(0.1, 0.3, 0.7);
    case 'shop-owner':
      return rgb(0.7, 0.5, 0.05);
    case 'dom-maintenance-manager':
    case 'chief-inspector-quality-manager':
    case 'general-manager':
      return rgb(0.3, 0.35, 0.4);
    case 'entity-safety-manager':
      return rgb(0.05, 0.45, 0.5);
    case 'isbao-auditor':
      return rgb(0.05, 0.55, 0.35);
    case 'easa-inspector':
      return rgb(0.4, 0.2, 0.6);
    case 'as9100-auditor':
      return rgb(0.6, 0.2, 0.2);
    case 'sms-consultant':
      return rgb(0.05, 0.45, 0.55);
    case 'safety-auditor':
      return rgb(0.55, 0.2, 0.5);
    case 'audit-host':
      return rgb(0.4, 0.4, 0.4);
    default:
      return rgb(0, 0, 0);
  }
}
