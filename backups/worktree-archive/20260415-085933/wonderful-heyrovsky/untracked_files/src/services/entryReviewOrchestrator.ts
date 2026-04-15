/**
 * Entry Review Orchestrator — routes input through Quick or Structured review.
 *
 * Quick: single-shot LLM review (existing behaviour, fast for short entries).
 * Structured: parse → per-entry LLM review → deterministic compliance → merge.
 */

import { parseLogbookText, type LogbookParseResult } from './logbookEntryParser';
import { createClaudeMessage } from './claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { runEphemeralComplianceChecks, type EphemeralComplianceResult } from './ephemeralComplianceEngine';
import type { ParsedLogEntry } from '../types/logbook';
import type { RawFinding } from './complianceEngine';

// ── Types ────────────────────────────────────────────────────────────────────

export type ReviewMode = 'quick' | 'structured';

export interface SmartReviewFinding {
  severity: 'critical' | 'major' | 'advisory';
  category: 'missing_field' | 'inadequate_description' | 'signoff_deficiency' | 'regulatory_gap' | 'best_practice';
  field?: string;
  citation: string;
  issue: string;
  suggestedText?: string;
}

export interface SmartReviewResult {
  overallCompliance: 'compliant' | 'minor_issues' | 'major_issues' | 'non_compliant';
  complianceScore: number;
  findings: SmartReviewFinding[];
  suggestedWorkPerformed?: string;
  suggestedRts?: string;
  regulatoryFramework: 'FAA' | 'EASA';
}

export interface StructuredReviewOutput {
  mode: 'structured';
  parsed: ParsedLogEntry[];
  parseResult: LogbookParseResult;
  reviews: Map<number, SmartReviewResult>;
  engineFindings: RawFinding[];
  rulesApplied: number;
}

export interface QuickReviewOutput {
  mode: 'quick';
  review: SmartReviewResult;
}

export type OrchestratorOutput = QuickReviewOutput | StructuredReviewOutput;

export interface OrchestratorContext {
  framework: 'FAA' | 'EASA';
  operatorType?: 'part91_owner' | 'part135' | 'part145' | 'ia_inspector' | 'other';
  model?: string;
  onProgress?: (stage: string, detail?: string) => void;
}

// ── Mode decision ────────────────────────────────────────────────────────────

const DATE_PATTERN = /\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b/g;
const SIG_PATTERN = /\b(signed?|signature|cert(ified)?|a[&]?p|ia\b|rts|return.to.service)/gi;

/** Heuristic: short single-entry → quick; multi-entry / long → structured. */
export function decideMode(text: string): ReviewMode {
  const trimmed = text.trim();
  if (trimmed.length < 400) {
    const dates = trimmed.match(DATE_PATTERN) ?? [];
    const sigs = trimmed.match(SIG_PATTERN) ?? [];
    if (dates.length < 2 && sigs.length < 2) return 'quick';
  }
  return 'structured';
}

// ── Per-entry review prompt ──────────────────────────────────────────────────

const ENTRY_REVIEW_SYSTEM = `You are an expert aviation maintenance records auditor. Review the single logbook entry below for compliance with 14 CFR Part 43 / EASA Part-M. Consider all structured fields provided as context — they were machine-parsed and may contain errors.

Respond ONLY with a JSON object matching this schema:
{
  "overallCompliance": "compliant" | "minor_issues" | "major_issues" | "non_compliant",
  "complianceScore": <integer 0-100>,
  "regulatoryFramework": "FAA" | "EASA",
  "findings": [
    {
      "severity": "critical" | "major" | "advisory",
      "category": "missing_field" | "inadequate_description" | "signoff_deficiency" | "regulatory_gap" | "best_practice",
      "field": "<field name if applicable>",
      "citation": "<exact CFR/EASA cite>",
      "issue": "<clear description>",
      "suggestedText": "<optional suggested fix>"
    }
  ],
  "suggestedWorkPerformed": "<improved work description — optional>",
  "suggestedRts": "<improved return-to-service statement — optional>"
}`;

function buildEntryReviewMessage(entry: ParsedLogEntry, framework: 'FAA' | 'EASA', operatorType?: string): string {
  const fields = [
    `Date: ${entry.entryDate ?? '[missing]'}`,
    `Work Performed: ${entry.workPerformed ?? '[missing]'}`,
    entry.ataChapter ? `ATA Chapter: ${entry.ataChapter}` : null,
    entry.totalTimeAtEntry != null ? `Total Time: ${entry.totalTimeAtEntry}` : null,
    `Signer: ${entry.signerName ?? '[missing]'}`,
    entry.signerCertNumber ? `Cert #: ${entry.signerCertNumber}` : null,
    entry.signerCertType ? `Cert Type: ${entry.signerCertType}` : null,
    `RTS: ${entry.returnToServiceStatement ?? (entry.hasReturnToService ? '[present but text not extracted]' : '[missing]')}`,
    entry.entryType ? `Entry Type: ${entry.entryType}` : null,
    entry.adReferences?.length ? `AD References: ${entry.adReferences.join(', ')}` : null,
    entry.sbReferences?.length ? `SB References: ${entry.sbReferences.join(', ')}` : null,
  ].filter(Boolean).join('\n');

  const confidence = Object.entries(entry.fieldConfidence ?? {})
    .map(([k, v]) => `  ${k}: ${(v * 100).toFixed(0)}%`)
    .join('\n');

  return `Framework: ${framework}${operatorType ? ` | Operator: ${operatorType}` : ''}

--- RAW TEXT ---
${entry.rawText}
--- END RAW TEXT ---

--- PARSED FIELDS ---
${fields}
--- END PARSED FIELDS ---

${confidence ? `--- FIELD CONFIDENCE ---\n${confidence}\n--- END ---` : ''}

Review this entry for regulatory compliance. Respond with JSON only.`;
}

async function reviewSingleEntry(
  entry: ParsedLogEntry,
  ctx: OrchestratorContext,
): Promise<SmartReviewResult> {
  const model = ctx.model ?? DEFAULT_CLAUDE_MODEL;
  const response = await createClaudeMessage({
    model,
    max_tokens: 2000,
    system: ENTRY_REVIEW_SYSTEM,
    messages: [{
      role: 'user',
      content: buildEntryReviewMessage(entry, ctx.framework, ctx.operatorType),
    }],
  });

  const raw = response.content
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text || '')
    .join('');
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON in review response');
  return JSON.parse(match[0]) as SmartReviewResult;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/** Concurrency cap for per-entry reviews. */
const MAX_CONCURRENT = 3;

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T, idx: number) => Promise<void>,
  limit: number,
): Promise<void> {
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx], idx);
    }
  };
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run());
  await Promise.all(workers);
}

/**
 * Run a structured review: parse → per-entry LLM review → deterministic checks.
 */
export async function runStructuredReview(
  text: string,
  ctx: OrchestratorContext,
): Promise<StructuredReviewOutput> {
  ctx.onProgress?.('parsing', 'Splitting text into individual entries…');

  const parseResult = await parseLogbookText(text, {
    model: ctx.model ?? DEFAULT_CLAUDE_MODEL,
    debug: true,
  });

  const parsed = parseResult.entries;
  if (parsed.length === 0) {
    throw new Error('Parser found no logbook entries in the provided text.');
  }

  ctx.onProgress?.('reviewing', `Reviewing ${parsed.length} entries…`);

  const reviews = new Map<number, SmartReviewResult>();
  await runWithConcurrency(parsed, async (entry, idx) => {
    ctx.onProgress?.('reviewing', `Entry ${idx + 1} of ${parsed.length}…`);
    const result = await reviewSingleEntry(entry, ctx);
    reviews.set(idx, result);
  }, MAX_CONCURRENT);

  ctx.onProgress?.('compliance', 'Running deterministic compliance checks…');

  let engineResult: EphemeralComplianceResult;
  try {
    engineResult = runEphemeralComplianceChecks(parsed, {
      framework: ctx.framework,
      operatorType: ctx.operatorType,
    });
  } catch {
    // Non-fatal: deterministic checks are supplementary
    engineResult = { findings: [], rulesApplied: 0 };
  }

  ctx.onProgress?.('done', `Reviewed ${parsed.length} entries.`);

  return {
    mode: 'structured',
    parsed,
    parseResult,
    reviews,
    engineFindings: engineResult.findings,
    rulesApplied: engineResult.rulesApplied,
  };
}
