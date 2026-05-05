import { ClaudeRateLimitError, ClaudeRequestCancelledError, createClaudeMessage } from './claudeProxy';
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
  for (const opener of ['[{', '[']) {
    const start = text.indexOf(opener);
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) continue;
    try {
      const parsed = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // try next opener
    }
  }
  return null;
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
    signal?: AbortSignal;
    onBatchProgress?: (processed: number, total: number) => void;
    onRateLimit?: (info: { batchIndex: number; waitMs: number }) => void;
    onBatchError?: (info: { batchIndex: number; reason: 'http' | 'parse'; message: string }) => void;
  },
): Promise<DctDocumentCheckResult[]> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  const system =
    options?.systemPrompt ?? getDctDocumentCheckSystemPrompt('faa-dct-traceability');
  const corpus = buildCorpus(companyDocs);
  const idSet = new Set(companyDocs.map((d) => d.id));
  const out: DctDocumentCheckResult[] = [];

  const signal = options?.signal;
  let batchIndex = -1;
  for (let i = 0; i < questions.length; i += batchSize) {
    batchIndex += 1;
    if (signal?.aborted) return out;
    if (i > 0) {
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, 4_000);
        signal?.addEventListener('abort', () => { clearTimeout(t); reject(new ClaudeRequestCancelledError()); }, { once: true });
      }).catch((e) => { if (e instanceof ClaudeRequestCancelledError) throw e; });
      if (signal?.aborted) return out;
    }
    const slice = questions.slice(i, i + batchSize);
    const qBlock = slice
      .map(
        (q) =>
          `- comparisonId: ${q.comparisonId}\n  dct: ${q.dctFileName ?? '—'}\n  question: ${q.questionText.replace(/\s+/g, ' ').trim()}\n  refs: ${(q.questionReferences ?? []).join('; ') || '—'}`,
      )
      .join('\n');

    let res;
    try {
      res = await createClaudeMessage(
        {
          model,
          max_tokens: 6144,
          temperature: 0.2,
          // Cache the system prompt and corpus — they're identical across all batches in this run.
          system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: `COMPANY DOCUMENT CORPUS (excerpt):\n${corpus}`, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: `\n\n---\nQUESTIONS:\n${qBlock}` },
            ],
          }],
        },
        {
          timeoutMs: 240_000,
          retries: 4,
          signal,
          onRetry: ({ attempt, waitMs, status }) => {
            if (status === 429 || status === 529) {
              options?.onRateLimit?.({ batchIndex, waitMs });
            }
            // eslint-disable-next-line no-console
            console.info(
              `[dct-document-check] retrying batch ${batchIndex + 1} (attempt ${attempt}) after ${Math.round(waitMs / 1000)}s — status ${status ?? 'network'}`,
            );
          },
        },
      );
    } catch (err) {
      if (err instanceof ClaudeRequestCancelledError) return out;
      // eslint-disable-next-line no-console
      console.error(`[dct-document-check] batch ${batchIndex + 1} failed`, err);
      if (err instanceof ClaudeRateLimitError) {
        options?.onRateLimit?.({ batchIndex, waitMs: err.retryAfterMs ?? 0 });
      }
      options?.onBatchError?.({ batchIndex, reason: 'http', message: err instanceof Error ? err.message : String(err) });
      options?.onBatchProgress?.(Math.min(i + slice.length, questions.length), questions.length);
      continue;
    }

    const text =
      res.content
        ?.map((b) => (b.type === 'text' && 'text' in b ? (b as { text?: string }).text : ''))
        .join('\n') ?? '';
    const arr = extractJsonArray(text);
    if (!arr) {
      options?.onBatchError?.({ batchIndex, reason: 'parse', message: 'Model response was not valid JSON for this batch.' });
      options?.onBatchProgress?.(Math.min(i + batchSize, questions.length), questions.length);
      continue;
    }

    for (const row of arr) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const comparisonId = typeof r.comparisonId === 'string' ? r.comparisonId : '';
      const status = typeof r.status === 'string' ? r.status : '';
      if (!comparisonId || !['pending', 'aligned', 'gap', 'mismatch'].includes(status)) continue;
      // Claude sometimes returns "" or whitespace for no-evidence rows. Convex's
      // v.id("documents") rejects empty strings and fails the whole bulk mutation
      // with `ArgumentValidationError`, so coerce any non-matching/blank value to
      // undefined before it reaches the server.
      const rawUnderReviewDocId =
        typeof r.underReviewDocumentId === 'string' ? r.underReviewDocumentId.trim() : '';
      const underReviewDocumentId: string | undefined =
        rawUnderReviewDocId && idSet.has(rawUnderReviewDocId) ? rawUnderReviewDocId : undefined;
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
