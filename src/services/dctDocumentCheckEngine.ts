import { createClaudeMessage } from './claudeProxy';
import { getDctDocumentCheckSystemPrompt } from './auditAgents';
import type { TraceabilityCompanyDoc, TraceabilityQuestionRow } from './dctTraceabilityEngine';

export type DctFindingSeverity = 'critical' | 'major' | 'minor' | 'observation';

export type DctDocumentCheckResult = {
  comparisonId: string;
  status: 'pending' | 'aligned' | 'gap' | 'mismatch';
  severity: DctFindingSeverity;
  underReviewDocumentId?: string;
  evidenceSnippet?: string;
  rationale?: string;
};

const MAX_CORPUS_CHARS = 120_000;
const DEFAULT_BATCH = 10;
const VALID_SEVERITY = new Set<DctFindingSeverity>(['critical', 'major', 'minor', 'observation']);

function buildCorpus(docs: TraceabilityCompanyDoc[]): string {
  const parts: string[] = [];
  let used = 0;
  const sorted = [...docs].sort((a, b) => {
    const pri = (c: string | undefined) =>
      c === 'entity' ? 0 : c === 'regulatory' ? 1 : c === 'sms' ? 2 : 3;
    return pri(a.category) - pri(b.category);
  });
  for (const d of sorted) {
    const header = `\n\n=== DOCUMENT id=${d.id} name=${d.name} category=${d.category ?? 'unknown'} ===\n`;
    const chunk = header + d.text;
    if (used + chunk.length > MAX_CORPUS_CHARS) {
      const remain = MAX_CORPUS_CHARS - used - header.length;
      if (remain < 500) break;
      parts.push(header + d.text.slice(0, remain) + '\n[…truncated…]');
      break;
    }
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join('');
}

function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf('[{');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeSeverity(value: unknown): DctFindingSeverity {
  if (typeof value !== 'string') return 'observation';
  const key = value.toLowerCase().trim() as DctFindingSeverity;
  if (VALID_SEVERITY.has(key)) return key;
  return 'observation';
}

export async function runDctDocumentCheckBatch(
  model: string,
  companyDocs: TraceabilityCompanyDoc[],
  questions: TraceabilityQuestionRow[],
  options?: {
    batchSize?: number;
    systemPrompt?: string;
    onBatchProgress?: (processed: number, total: number) => void;
  },
): Promise<DctDocumentCheckResult[]> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  const system =
    options?.systemPrompt ?? getDctDocumentCheckSystemPrompt('faa-dct-traceability');
  const corpus = buildCorpus(companyDocs);
  const idSet = new Set(companyDocs.map((d) => d.id));
  const out: DctDocumentCheckResult[] = [];

  for (let i = 0; i < questions.length; i += batchSize) {
    if (i > 0) await new Promise((r) => setTimeout(r, 4_000));
    const slice = questions.slice(i, i + batchSize);
    const qBlock = slice
      .map(
        (q) =>
          `- comparisonId: ${q.comparisonId}\n  dct: ${q.dctFileName ?? '—'}\n  question: ${q.questionText.replace(/\s+/g, ' ').trim()}\n  refs: ${(q.questionReferences ?? []).join('; ') || '—'}`,
      )
      .join('\n');

    const user = `COMPANY DOCUMENT CORPUS (excerpt):\n${corpus}\n\n---\nQUESTIONS:\n${qBlock}`;

    const res = await createClaudeMessage(
      {
        model,
        max_tokens: 6144,
        temperature: 0.2,
        system,
        messages: [{ role: 'user', content: user }],
      },
      { timeoutMs: 240_000 },
    );

    const text =
      res.content
        ?.map((b) => (b.type === 'text' && 'text' in b ? (b as { text?: string }).text : ''))
        .join('\n') ?? '';
    const arr = extractJsonArray(text);
    if (!arr) {
      options?.onBatchProgress?.(Math.min(i + batchSize, questions.length), questions.length);
      continue;
    }

    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const comparisonId = typeof r.comparisonId === 'string' ? r.comparisonId : '';
      const status = typeof r.status === 'string' ? r.status : '';
      if (!comparisonId || !['pending', 'aligned', 'gap', 'mismatch'].includes(status)) continue;
      let underReviewDocumentId: string | undefined =
        typeof r.underReviewDocumentId === 'string' ? r.underReviewDocumentId : undefined;
      if (underReviewDocumentId && !idSet.has(underReviewDocumentId)) {
        underReviewDocumentId = undefined;
      }
      out.push({
        comparisonId,
        status: status as DctDocumentCheckResult['status'],
        severity: normalizeSeverity(r.severity),
        underReviewDocumentId,
        evidenceSnippet: typeof r.evidenceSnippet === 'string' ? r.evidenceSnippet : undefined,
        rationale: typeof r.rationale === 'string' ? r.rationale : undefined,
      });
    }

    options?.onBatchProgress?.(Math.min(i + batchSize, questions.length), questions.length);
  }

  return out;
}
