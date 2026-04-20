import { ClaudeRateLimitError, createClaudeMessage } from './claudeProxy';
import { getDctTraceabilitySystemPrompt } from './auditAgents';

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
/** Delay between consecutive batches to stay under Anthropic's tokens-per-minute quota. */
const DEFAULT_INTER_BATCH_MS = 4_000;

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

/**
 * Strict traceability: map each DCT question to company manual evidence using Claude.
 * Returns Convex-ready patches (caller runs `bulkApplyTraceabilityResults`).
 */
export async function runDctTraceabilityBatch(
  model: string,
  companyDocs: TraceabilityCompanyDoc[],
  questions: TraceabilityQuestionRow[],
  options?: {
    batchSize?: number;
    systemPrompt?: string;
    /** Called when we retry after hitting a rate limit, so callers can update a toast/progress indicator. */
    onRateLimit?: (info: { batchIndex: number; waitMs: number }) => void;
    /** Called before/after each batch so callers can show progress. */
    onBatchProgress?: (processed: number, total: number) => void;
  },
): Promise<TraceabilityBatchResult[]> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  const system =
    options?.systemPrompt ?? getDctTraceabilitySystemPrompt('faa-dct-traceability');
  const corpus = buildCorpus(companyDocs);
  const idSet = new Set(companyDocs.map((d) => d.id));
  const out: TraceabilityBatchResult[] = [];

  let batchIndex = -1;
  for (let i = 0; i < questions.length; i += batchSize) {
    batchIndex += 1;
    if (i > 0) await new Promise((r) => setTimeout(r, DEFAULT_INTER_BATCH_MS));
    const slice = questions.slice(i, i + batchSize);
    const qBlock = slice
      .map(
        (q) =>
          `- comparisonId: ${q.comparisonId}\n  dct: ${q.dctFileName ?? '—'}\n  question: ${q.questionText.replace(/\s+/g, ' ').trim()}\n  refs: ${(q.questionReferences ?? []).join('; ') || '—'}`,
      )
      .join('\n');

    const user = `COMPANY DOCUMENT CORPUS (excerpt):\n${corpus}\n\n---\nQUESTIONS:\n${qBlock}`;

    let res;
    try {
      res = await createClaudeMessage(
        {
          model,
          max_tokens: 4096,
          temperature: 0.2,
          system,
          messages: [{ role: 'user', content: user }],
        },
        {
          timeoutMs: 240_000,
          retries: 4,
          onRetry: ({ attempt, waitMs, status }) => {
            // Only surface rate-limit-related waits to the user; transient 5xx
            // retries stay silent so we don't spam toasts.
            if (status === 429 || status === 529) {
              options?.onRateLimit?.({ batchIndex, waitMs });
            }
            // eslint-disable-next-line no-console
            console.info(
              `[dct-traceability] retrying batch ${batchIndex + 1} (attempt ${attempt}) after ${Math.round(waitMs / 1000)}s — status ${status ?? 'network'}`,
            );
          },
        },
      );
    } catch (err) {
      // Rate-limit exhaustion or other failure on this batch. Keep going so we
      // don't lose the entire run; the caller's `bulkApplyTraceabilityResults`
      // simply won't patch the rows from this batch and the user can re-run.
      // eslint-disable-next-line no-console
      console.error(`[dct-traceability] batch ${batchIndex + 1} failed`, err);
      if (err instanceof ClaudeRateLimitError) {
        // Signal the caller so it can show a helpful message at the end.
        options?.onRateLimit?.({
          batchIndex,
          waitMs: err.retryAfterMs ?? 0,
        });
      }
      options?.onBatchProgress?.(
        Math.min(i + slice.length, questions.length),
        questions.length,
      );
      continue;
    }

    const text =
      res.content
        ?.map((b) => (b.type === 'text' && 'text' in b ? (b as { text?: string }).text : ''))
        .join('\n') ?? '';
    const arr = extractJsonArray(text);
    options?.onBatchProgress?.(
      Math.min(i + slice.length, questions.length),
      questions.length,
    );
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
