import type { UploadedDocument } from '../types/document';
import type { KBDocumentCurrencyResult } from '../types/auditSimulation';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { createClaudeMessage } from './claudeProxy';

export class KBCurrencyChecker {
  async checkDocumentCurrency(
    doc: UploadedDocument,
    model: string = DEFAULT_CLAUDE_MODEL
  ): Promise<KBDocumentCurrencyResult> {
    const prompt = `You are an aviation document specialist. Verify whether the following document is the latest/current revision.

Document Name: "${doc.name}"
Document excerpt (first 500 chars): "${(doc.text || '').substring(0, 500)}"

Search the internet for the latest version of this document. Check official regulatory body websites (FAA.gov, EASA.europa.eu, IBAC.org), standards organizations (SAE International for AS9100), and other aviation authorities.

Return your findings as JSON:
\`\`\`json
{
  "latestRevision": "the current revision/version you found (or 'unknown' if not found)",
  "isCurrent": true/false/null,
  "summary": "Brief explanation with source URL if found"
}
\`\`\``;

    try {
      const message = await createClaudeMessage({
        model,
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{ role: 'user', content: prompt }],
      });

      const textBlocks = message.content.filter((b) => b.type === 'text');
      const responseText = textBlocks
        .map((b) => (b.type === 'text' ? b.text : ''))
        .join('\n');
      const parsed = this.parseResponse(responseText);

      return {
        documentId: doc.id,
        documentName: doc.name,
        status:
          parsed.isCurrent === null
            ? 'unknown'
            : parsed.isCurrent
              ? 'current'
              : 'outdated',
        latestRevision: parsed.latestRevision,
        summary: parsed.summary,
        checkedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        documentId: doc.id,
        documentName: doc.name,
        status: 'error',
        latestRevision: '',
        summary: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        checkedAt: new Date().toISOString(),
      };
    }
  }

  private parseResponse(response: string): {
    latestRevision: string;
    isCurrent: boolean | null;
    summary: string;
  } {
    try {
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          latestRevision: parsed.latestRevision || 'unknown',
          isCurrent:
            parsed.isCurrent === null || parsed.isCurrent === undefined
              ? null
              : Boolean(parsed.isCurrent),
          summary: parsed.summary || '',
        };
      }
    } catch {
      /* parse failed */
    }
    return { latestRevision: 'unknown', isCurrent: null, summary: 'Could not parse response' };
  }
}
