import { createClaudeMessage } from './claudeProxy';

export type TraceabilityCompanyDoc = {
  id: string;
  name: string;
  category?: string;
  text: string;
};

export type TraceabilityQuestionRow = {
  comparisonId: string;
  questionText: string;
  dctFileName?: string;
  questionReferences?: string[];
};

export type TraceabilityBatchResult = {
  comparisonId: string;
  status: 'pending' | 'aligned' | 'gap' | 'mismatch';
  underReviewDocumentId?: string;
  evidenceSnippet?: string;
  rationale?: string;
};

const MAX_CORPUS_CHARS = 120_000;
const DEFAULT_BATCH = 12;

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
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Strict traceability: map each DCT question to company manual evidence using Claude.
 * Returns Convex-ready patches (caller runs `bulkApplyTraceabilityResults`).
 */
export async function runDctTraceabilityBatch(
  model: string,
  companyDocs: TraceabilityCompanyDoc[],
  questions: TraceabilityQuestionRow[],
  options?: { batchSize?: number },
): Promise<TraceabilityBatchResult[]> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  const corpus = buildCorpus(companyDocs);
  const idSet = new Set(companyDocs.map((d) => d.id));
  const out: TraceabilityBatchResult[] = [];

  for (let i = 0; i < questions.length; i += batchSize) {
    const slice = questions.slice(i, i + batchSize);
    const qBlock = slice
      .map(
        (q) =>
          `- comparisonId: ${q.comparisonId}\n  dct: ${q.dctFileName ?? '—'}\n  question: ${q.questionText.replace(/\s+/g, ' ').trim()}\n  refs: ${(q.questionReferences ?? []).join('; ') || '—'}`,
      )
      .join('\n');

    const system = `You are an FAA Part 145 / aviation quality auditor. For each DCT question, decide if the company documentation corpus clearly supports the requirement.

Rules:
- "aligned": at least one document contains explicit, on-point evidence (procedure, policy, or record instruction) that satisfies the question.
- "gap": no supporting evidence found in the corpus (missing coverage).
- "mismatch": evidence exists but contradicts the question or shows non-compliance.
- "pending": insufficient text to decide (e.g. corpus empty or question unparseable).

Return ONLY a JSON array (no markdown fences) of objects:
[{"comparisonId":"...","status":"aligned|gap|mismatch|pending","underReviewDocumentId":"<id from corpus header or omit>","evidenceSnippet":"<short quote>","rationale":"<one sentence>"}]

Use underReviewDocumentId only when it matches a document id from the corpus headers.`;

    const user = `COMPANY DOCUMENT CORPUS (excerpt):\n${corpus}\n\n---\nQUESTIONS:\n${qBlock}`;

    const res = await createClaudeMessage(
      {
        model,
        max_tokens: 4096,
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
    if (!arr) continue;

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
        status: status as TraceabilityBatchResult['status'],
        underReviewDocumentId,
        evidenceSnippet: typeof r.evidenceSnippet === 'string' ? r.evidenceSnippet : undefined,
        rationale: typeof r.rationale === 'string' ? r.rationale : undefined,
      });
    }
  }

  return out;
}
