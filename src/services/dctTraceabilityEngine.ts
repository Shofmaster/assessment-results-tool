import {
  ClaudeRateLimitError,
  ClaudeRequestCancelledError,
  createClaudeMessage,
} from './claudeProxy';
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

export type TraceabilityBatchErrorInfo = {
  batchIndex: number;
  /**
   * `http`: Anthropic API call failed after retries.
   * `parse`: model returned unparseable JSON.
   * `persist`: streaming write (`onBatchComplete`) failed twice — caller should
   * surface this to the user since those rows were AI-classified but not saved.
   */
  reason: 'http' | 'parse' | 'persist';
  message: string;
  status?: number;
  /** For `persist` failures, how many rows from this batch could not be written. */
  droppedRows?: number;
};

const MAX_CORPUS_CHARS = 60_000;
const DEFAULT_BATCH = 6;
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
  // Try the most-specific opener first ([{), then fall back to any array ([)
  // so we also handle empty arrays ([]) and arrays with whitespace ([ {).
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

function batchErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function interBatchDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (!signal) {
    await new Promise((r) => setTimeout(r, ms));
    return;
  }
  if (signal.aborted) throw new ClaudeRequestCancelledError();
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line prefer-const -- read by onAbort closure below before assignment, so it cannot be merged into a const
    let timer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new ClaudeRequestCancelledError());
    };
    timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort);
  });
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
    /** When aborted, returns partial results collected so far (no throw). */
    signal?: AbortSignal;
    /** Called when a batch fails (HTTP) or returns unparseable JSON. */
    onBatchError?: (info: TraceabilityBatchErrorInfo) => void;
    /** Called when we retry after hitting a rate limit, so callers can update a toast/progress indicator. */
    onRateLimit?: (info: { batchIndex: number; waitMs: number }) => void;
    /** Called before/after each batch so callers can show progress. */
    onBatchProgress?: (processed: number, total: number) => void;
    /**
     * Called with the results from each batch as soon as they're parsed.
     * Lets callers stream writes into Convex per batch instead of waiting
     * for the whole run, so the matrix updates live. Awaited before the
     * next batch starts so write failures surface and aren't lost.
     */
    onBatchComplete?: (batchResults: TraceabilityBatchResult[]) => void | Promise<void>;
  },
): Promise<TraceabilityBatchResult[]> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH;
  const system =
    options?.systemPrompt ?? getDctTraceabilitySystemPrompt('faa-dct-traceability');
  const corpus = buildCorpus(companyDocs);
  const idSet = new Set(companyDocs.map((d) => d.id));
  const out: TraceabilityBatchResult[] = [];
  const signal = options?.signal;

  let batchIndex = -1;
  for (let i = 0; i < questions.length; i += batchSize) {
    batchIndex += 1;
    if (signal?.aborted) {
      return out;
    }
    if (i > 0) {
      try {
        await interBatchDelay(DEFAULT_INTER_BATCH_MS, signal);
      } catch (e) {
        if (e instanceof ClaudeRequestCancelledError) {
          return out;
        }
        throw e;
      }
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
      const requestPayload = {
        model,
        max_tokens: 8192,
        temperature: 0.2,
        // Cache the system prompt — identical across all batches in this run.
        system: [{ type: 'text' as const, text: system, cache_control: { type: 'ephemeral' as const } }],
        messages: [{
          role: 'user' as const,
          content: [
            // Corpus is the same every batch — cache it to avoid re-billing 60k chars each call.
            { type: 'text' as const, text: `COMPANY DOCUMENT CORPUS (excerpt):\n${corpus}`, cache_control: { type: 'ephemeral' as const } },
            { type: 'text' as const, text: `\n\n---\nQUESTIONS:\n${qBlock}` },
          ],
        }],
      };
      res = await createClaudeMessage(
        requestPayload,
        {
          timeoutMs: 240_000,
          retries: 4,
          signal,
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
      if (err instanceof ClaudeRequestCancelledError) {
        return out;
      }
      // Rate-limit exhaustion or other failure on this batch. Keep going so we
      // don't lose the entire run; the caller's `bulkApplyTraceabilityResults`
      // simply won't patch the rows from this batch and the user can re-run.
      // eslint-disable-next-line no-console
      console.error(`[dct-traceability] batch ${batchIndex + 1} failed`, err);
      const msg = batchErrorMessage(err);
      options?.onBatchError?.({
        batchIndex,
        reason: 'http',
        message: msg,
        status: err instanceof ClaudeRateLimitError ? err.status : undefined,
      });
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
    if (!arr) {
      options?.onBatchError?.({
        batchIndex,
        reason: 'parse',
        message:
          'Model response was not valid JSON for this batch (truncated output or wrong format).',
      });
      continue;
    }

    const batchOut: TraceabilityBatchResult[] = [];
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
      batchOut.push({
        comparisonId,
        status: status as TraceabilityBatchResult['status'],
        underReviewDocumentId,
        evidenceSnippet: typeof r.evidenceSnippet === 'string' ? r.evidenceSnippet : undefined,
        rationale: typeof r.rationale === 'string' ? r.rationale : undefined,
      });
    }
    if (batchOut.length > 0) {
      out.push(...batchOut);
      if (options?.onBatchComplete) {
        // Try once, then retry after a short delay. Streaming writes hit Convex,
        // which usually fails transiently (network blip, scheduler queue); a single
        // retry catches the common case without blocking the run.
        let lastErr: unknown = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await options.onBatchComplete(batchOut);
            lastErr = null;
            break;
          } catch (err) {
            lastErr = err;
            if (attempt === 0) {
              await new Promise((r) => setTimeout(r, 750));
            }
          }
        }
        if (lastErr) {
          // Both attempts failed — these rows are AI-classified but unpersisted.
          // The caller MUST treat this as user-visible: rows look "applied" in
          // memory but the DB never got them. Drop them from `out` so the
          // returned "applied N" count reflects reality.
          out.splice(out.length - batchOut.length, batchOut.length);
          options?.onBatchError?.({
            batchIndex,
            reason: 'persist',
            message: lastErr instanceof Error ? lastErr.message : String(lastErr),
            droppedRows: batchOut.length,
          });
        }
      }
    }
  }

  return out;
}
