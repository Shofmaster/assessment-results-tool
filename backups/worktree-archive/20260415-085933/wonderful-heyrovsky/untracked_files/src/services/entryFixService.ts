/**
 * Entry Fix Service — generates compliant rewrites of logbook entries
 * using Claude tool-use mode for structured output.
 */

import { createClaudeMessage } from './claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import type { ParsedLogEntry } from '../types/logbook';
import type { RawFinding } from './complianceEngine';

// ── Types ────────────────────────────────────────────────────────────────────

export interface RewrittenEntry {
  entryDate: string;
  workPerformed: string;
  signerName: string;
  signerCertNumber: string;
  signerCertType: string;
  returnToServiceStatement: string;
  suggestedFullEntryText: string;
  changedFields: string[];
}

// ── Tool schema ──────────────────────────────────────────────────────────────

const EMIT_REWRITTEN_ENTRY_TOOL = {
  name: 'emit_rewritten_entry',
  description: 'Emit the rewritten logbook entry with corrected fields and full text.',
  input_schema: {
    type: 'object' as const,
    properties: {
      entryDate: { type: 'string', description: 'Corrected or original entry date (YYYY-MM-DD or original format). Never invent a date.' },
      workPerformed: { type: 'string', description: 'Improved work description. Preserve original meaning and technical detail.' },
      signerName: { type: 'string', description: 'Signer name. If missing from original, emit empty string — do NOT invent.' },
      signerCertNumber: { type: 'string', description: 'Certificate number. If missing from original, emit empty string — do NOT invent.' },
      signerCertType: { type: 'string', description: 'Certificate type (A&P, IA, etc). If missing from original, emit empty string — do NOT invent.' },
      returnToServiceStatement: { type: 'string', description: 'Return-to-service statement. If missing, emit "[REQUIRED: Return to service statement with signature, cert number, and cert type]".' },
      suggestedFullEntryText: { type: 'string', description: 'Complete rewritten entry text as it should appear in a logbook. Use [REQUIRED: ...] placeholders for missing identity info.' },
      changedFields: { type: 'string', description: 'Comma-separated list of field names that were modified from the original.' },
    },
    required: ['entryDate', 'workPerformed', 'signerName', 'signerCertNumber', 'signerCertType', 'returnToServiceStatement', 'suggestedFullEntryText', 'changedFields'],
  },
};

// ── Fix prompt ───────────────────────────────────────────────────────────────

const FIX_SYSTEM = `You are an expert aviation maintenance records writer. Given a logbook entry and its compliance findings, produce a corrected version that fixes all issues.

HARD CONSTRAINTS:
- Do NOT invent signer identity, certificate number, or dates. If missing, leave empty and use [REQUIRED: ...] placeholder in the full text.
- Do NOT alter numeric totals, dates, or AD/SB numbers from the source — only language and structure.
- Preserve all original technical content — part numbers, serial numbers, measurements.
- If the original work description is vague, improve it with standard aviation maintenance language while preserving the intent.
- For missing return-to-service statements, emit a template with [REQUIRED: ...] placeholders.

Call the emit_rewritten_entry tool with your corrections.`;

function buildFixMessage(
  entry: ParsedLogEntry,
  llmFindings: Array<{ severity: string; issue: string; citation: string; suggestedText?: string }>,
  engineFindings: RawFinding[],
): string {
  const findingsList = [
    ...llmFindings.map((f) => `- [${f.severity}] ${f.issue} (${f.citation})${f.suggestedText ? `\n  Suggestion: ${f.suggestedText}` : ''}`),
    ...engineFindings.map((f) => `- [${f.severity}] ${f.title}: ${f.description} (${f.citation}) [Deterministic]`),
  ].join('\n');

  return `--- ORIGINAL ENTRY ---
${entry.rawText}
--- END ORIGINAL ---

--- PARSED FIELDS ---
Date: ${entry.entryDate ?? '[missing]'}
Work Performed: ${entry.workPerformed ?? '[missing]'}
Signer: ${entry.signerName ?? '[missing]'}
Cert #: ${entry.signerCertNumber ?? '[missing]'}
Cert Type: ${entry.signerCertType ?? '[missing]'}
RTS: ${entry.returnToServiceStatement ?? '[missing]'}
--- END PARSED FIELDS ---

--- FINDINGS ---
${findingsList || 'No findings'}
--- END FINDINGS ---

Generate a corrected entry that addresses all findings. Call the emit_rewritten_entry tool.`;
}

// ── Main function ────────────────────────────────────────────────────────────

export async function generateCompliantRewrite(
  entry: ParsedLogEntry,
  llmFindings: Array<{ severity: string; issue: string; citation: string; suggestedText?: string }>,
  engineFindings: RawFinding[],
  opts?: { model?: string },
): Promise<RewrittenEntry> {
  const model = opts?.model ?? DEFAULT_CLAUDE_MODEL;

  const response = await createClaudeMessage({
    model,
    max_tokens: 2000,
    temperature: 0.15,
    system: FIX_SYSTEM,
    messages: [{
      role: 'user',
      content: buildFixMessage(entry, llmFindings, engineFindings),
    }],
    tools: [EMIT_REWRITTEN_ENTRY_TOOL],
  });

  // Find the tool_use block
  const toolBlock = response.content.find(
    (b: any) => b.type === 'tool_use' && b.name === 'emit_rewritten_entry',
  ) as { type: 'tool_use'; input: Record<string, string> } | undefined;

  if (!toolBlock) {
    // Fallback: try to parse JSON from text blocks
    const text = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text || '')
      .join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return {
        entryDate: parsed.entryDate ?? entry.entryDate ?? '',
        workPerformed: parsed.workPerformed ?? entry.workPerformed ?? '',
        signerName: parsed.signerName ?? '',
        signerCertNumber: parsed.signerCertNumber ?? '',
        signerCertType: parsed.signerCertType ?? '',
        returnToServiceStatement: parsed.returnToServiceStatement ?? '',
        suggestedFullEntryText: parsed.suggestedFullEntryText ?? '',
        changedFields: typeof parsed.changedFields === 'string'
          ? parsed.changedFields.split(',').map((s: string) => s.trim())
          : parsed.changedFields ?? [],
      };
    }
    throw new Error('No tool-use or JSON response from fix service');
  }

  const input = toolBlock.input;
  return {
    entryDate: input.entryDate ?? entry.entryDate ?? '',
    workPerformed: input.workPerformed ?? entry.workPerformed ?? '',
    signerName: input.signerName ?? '',
    signerCertNumber: input.signerCertNumber ?? '',
    signerCertType: input.signerCertType ?? '',
    returnToServiceStatement: input.returnToServiceStatement ?? '',
    suggestedFullEntryText: input.suggestedFullEntryText ?? '',
    changedFields: typeof input.changedFields === 'string'
      ? input.changedFields.split(',').map((s: string) => s.trim())
      : [],
  };
}
