/**
 * Server-orchestrated DCT traceability runs.
 *
 * Each scheduled `processTraceabilityBatch` handles exactly ONE Claude API call
 * (~15 questions), then chains the next batch. This avoids Convex's ~10 minute
 * action limit that caused runs to freeze at multiples of ~180 items.
 */
import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_CORPUS_CHARS = 60_000;
const DEFAULT_INTER_BATCH_MS = 800;
const RATE_LIMIT_INTER_BATCH_MS = 5_000;
/** Questions per Claude call — balance speed vs max_tokens. */
export const DEFAULT_BATCH_SIZE = 12;
const MAX_API_RETRIES = 4;
const API_BATCH_TIMEOUT_MS = 60_000;
/**
 * Max consecutive resume/retry attempts that make no progress before a run is
 * abandoned. Bounds both the in-band 15s retry loop and the 2-minute watchdog
 * cron so a permanently-stuck run can't fire paid Claude batches indefinitely.
 */
const MAX_STALL_RETRIES = 5;

/** Mirror of the client engine's corpus builder so server output matches. */
function buildCorpus(
  docs: { id: string; name: string; category?: string; text: string }[],
): string {
  const parts: string[] = [];
  let used = 0;
  const sorted = [...docs].sort((a, b) => {
    const pri = (c: string | undefined) =>
      c === "entity" ? 0 : c === "regulatory" ? 1 : c === "sms" ? 2 : 3;
    return pri(a.category) - pri(b.category);
  });
  for (const d of sorted) {
    const header = `\n\n=== DOCUMENT id=${d.id} name=${d.name} category=${d.category ?? "unknown"} ===\n`;
    const chunk = header + d.text;
    if (used + chunk.length > MAX_CORPUS_CHARS) {
      const remain = MAX_CORPUS_CHARS - used - header.length;
      if (remain < 500) break;
      parts.push(header + d.text.slice(0, remain) + "\n[…truncated…]");
      break;
    }
    parts.push(chunk);
    used += chunk.length;
  }
  return parts.join("");
}

function extractJsonArray(text: string): unknown[] | null {
  for (const opener of ["[{", "["]) {
    const start = text.indexOf(opener);
    const end = text.lastIndexOf("]");
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

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

const APPLICABILITY_LITERALS = v.union(
  v.literal("applicable"),
  v.literal("unsure"),
  v.literal("not_applicable"),
);

type CompRow = {
  comparisonId: string;
  questionText: string;
  dctFileName?: string;
  questionReferences: string[];
};

type RunPayload = NonNullable<Doc<"dctTraceabilityRuns">["runPayload"]>;

type PersistRow = {
  comparisonId: Id<"dctComparisons">;
  status: "pending" | "aligned" | "gap" | "mismatch";
  underReviewDocumentId?: Id<"documents">;
  evidenceSnippet?: string;
  rationale?: string;
  lowConfidenceApplicability?: boolean;
  applicabilityState?: "applicable" | "unsure" | "not_applicable";
  applicabilitySource?: string;
};

type BatchActionCtx = {
  runMutation: (ref: any, args: any) => Promise<any>;
  runQuery: (ref: any, args: any) => Promise<any>;
  scheduler: {
    runAfter: (delayMs: number, ref: any, args: any) => Promise<any>;
  };
};

async function scheduleNextBatch(
  ctx: BatchActionCtx,
  runId: Id<"dctTraceabilityRuns">,
  delayMs: number,
) {
  await ctx.scheduler.runAfter(
    delayMs,
    internal.dctTraceabilityRunner.processTraceabilityBatch,
    { runId },
  );
}

/** Process exactly one API batch; returns whether to continue the run. */
async function processOneBatch(
  ctx: BatchActionCtx,
  args: {
    projectId: Id<"projects">;
    runId: Id<"dctTraceabilityRuns">;
    model: string;
    systemPrompt: string;
    corpus: string;
    docIdSet: Set<string>;
    compRows: CompRow[];
    globalStartIndex: number;
    applicabilityMap: Record<string, "applicable" | "unsure" | "not_applicable">;
    lowConfidenceMap: Record<string, boolean>;
    apiKey: string;
    persisted: number;
    persistFailed: number;
    parseFailed: number;
  },
): Promise<{
  processed: number;
  persisted: number;
  persistFailed: number;
  parseFailed: number;
  cancelled: boolean;
  nextDelayMs: number;
}> {
  const client = new Anthropic({ apiKey: args.apiKey });
  let processed = args.globalStartIndex;
  let persisted = args.persisted;
  let persistFailed = args.persistFailed;
  let parseFailed = args.parseFailed;
  let nextDelayMs = DEFAULT_INTER_BATCH_MS;

  if (args.compRows.length === 0) {
    return { processed, persisted, persistFailed, parseFailed, cancelled: false, nextDelayMs };
  }

  const slice = args.compRows;
  const qBlock = slice
    .map(
      (q) =>
        `- comparisonId: ${q.comparisonId}\n  dct: ${q.dctFileName ?? "—"}\n  question: ${q.questionText.replace(/\s+/g, " ").trim()}\n  refs: ${q.questionReferences.join("; ") || "—"}`,
    )
    .join("\n");

  let response: Anthropic.Message | null = null;
  let lastApiErr: unknown = null;
  for (let attempt = 0; attempt < MAX_API_RETRIES; attempt++) {
    try {
      response = await withTimeout(
        client.messages.create({
          model: args.model,
          max_tokens: 8192,
          temperature: 0.2,
          system: [
            {
              type: "text",
              text: args.systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `COMPANY DOCUMENT CORPUS (excerpt):\n${args.corpus}`,
                  cache_control: { type: "ephemeral" },
                },
                {
                  type: "text",
                  text: `\n\n---\nQUESTIONS:\n${qBlock}`,
                },
              ],
            },
          ],
        }),
        API_BATCH_TIMEOUT_MS,
        "Claude API call",
      );
      break;
    } catch (err: unknown) {
      lastApiErr = err;
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? Number((err as { status?: number }).status)
          : undefined;
      const retriable =
        status === 429 || status === 529 || (status !== undefined && status >= 500);
      if (retriable && attempt < MAX_API_RETRIES - 1) {
        if (status === 429 || status === 529) nextDelayMs = RATE_LIMIT_INTER_BATCH_MS;
        const wait = Math.min(60_000, 2 ** attempt * 5_000);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      break;
    }
  }

  if (!response) {
    parseFailed += 1;
    processed = args.globalStartIndex + slice.length;
    await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
      runId: args.runId,
      processed,
      persisted,
      persistFailed,
      parseFailed,
    });
    console.error("[dct-traceability-runner] batch failed after retries", lastApiErr);
    return { processed, persisted, persistFailed, parseFailed, cancelled: false, nextDelayMs };
  }

  const text = response.content
    .filter(
      (b): b is Anthropic.TextBlock => (b as { type: string }).type === "text",
    )
    .map((b) => b.text)
    .join("\n");
  const arr = extractJsonArray(text);
  if (!arr) {
    parseFailed += 1;
    processed = args.globalStartIndex + slice.length;
    await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
      runId: args.runId,
      processed,
      persisted,
      persistFailed,
      parseFailed,
      lastBadResponse: text.slice(0, 4_000),
    });
    return { processed, persisted, persistFailed, parseFailed, cancelled: false, nextDelayMs };
  }

  const batchResults: PersistRow[] = [];
  for (const row of arr) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const comparisonId = typeof r.comparisonId === "string" ? r.comparisonId : "";
    const status = typeof r.status === "string" ? r.status : "";
    if (!comparisonId || !["pending", "aligned", "gap", "mismatch"].includes(status)) {
      continue;
    }
    const rawDocId =
      typeof r.underReviewDocumentId === "string" ? r.underReviewDocumentId.trim() : "";
    const underReviewDocumentId =
      rawDocId && args.docIdSet.has(rawDocId) ? (rawDocId as Id<"documents">) : undefined;
    const eff = args.applicabilityMap[comparisonId];
    batchResults.push({
      comparisonId: comparisonId as Id<"dctComparisons">,
      status: status as PersistRow["status"],
      underReviewDocumentId,
      evidenceSnippet: typeof r.evidenceSnippet === "string" ? r.evidenceSnippet : undefined,
      rationale: typeof r.rationale === "string" ? r.rationale : undefined,
      lowConfidenceApplicability: args.lowConfidenceMap[comparisonId] === true,
      applicabilityState: eff,
      applicabilitySource: eff ? "auto" : undefined,
    });
  }

  if (batchResults.length > 0) {
    let ok = false;
    let writeErr: unknown = null;
    let appliedNow = 0;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const writeResult = (await ctx.runMutation(
          api.dctCompliance.bulkApplyTraceabilityResults,
          {
            projectId: args.projectId,
            results: batchResults,
          },
        )) as { applied?: number; missing?: number; mismatched?: number; sent?: number } | undefined;
        appliedNow = writeResult?.applied ?? 0;
        ok = true;
        if (appliedNow < batchResults.length) {
          console.error(
            "[dct-traceability-runner] mutation skipped rows",
            {
              sent: batchResults.length,
              applied: appliedNow,
              missing: writeResult?.missing,
              mismatched: writeResult?.mismatched,
              projectId: String(args.projectId),
            },
          );
        }
        break;
      } catch (err) {
        writeErr = err;
        if (attempt === 0) await new Promise((r) => setTimeout(r, 750));
      }
    }
    if (ok) {
      persisted += appliedNow;
      const skipped = batchResults.length - appliedNow;
      if (skipped > 0) {
        persistFailed += skipped;
      }
    } else {
      persistFailed += batchResults.length;
      console.error("[dct-traceability-runner] persist failed after retry", writeErr);
    }
  }

  processed = args.globalStartIndex + slice.length;
  await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
    runId: args.runId,
    processed,
    persisted,
    persistFailed,
    parseFailed,
  });

  return { processed, persisted, persistFailed, parseFailed, cancelled: false, nextDelayMs };
}

/**
 * One API batch per invocation — schedules the next batch when more work remains.
 */
export const processTraceabilityBatch = internalAction({
  args: { runId: v.id("dctTraceabilityRuns") },
  handler: async (ctx, { runId }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: "ANTHROPIC_API_KEY is not set in Convex environment.",
      });
      return;
    }

    const run = (await ctx.runQuery(internal.dctCompliance._getTraceabilityRun, {
      runId,
    })) as Doc<"dctTraceabilityRuns"> | null;
    if (!run) return;
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      return;
    }

    const payload = run.runPayload as RunPayload | undefined;
    if (!payload) {
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: "Run configuration missing — start a new traceability run.",
      });
      return;
    }

    if (run.status === "queued") {
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "running",
      });
    }

    if (run.cancelRequested) {
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "cancelled",
        completedAt: new Date().toISOString(),
      });
      return;
    }

    const batchSize = Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE);
    const globalStart = run.processed;
    const sliceIds = payload.comparisonIds.slice(globalStart, globalStart + batchSize);

    if (sliceIds.length === 0) {
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      return;
    }

    const applicabilityMap: Record<string, "applicable" | "unsure" | "not_applicable"> = {};
    for (const entry of payload.applicabilityByComparisonId ?? []) {
      applicabilityMap[entry.comparisonId] = entry.applicability;
    }
    const lowConfidenceMap: Record<string, boolean> = {};
    for (const entry of payload.lowConfidenceByComparisonId ?? []) {
      lowConfidenceMap[entry.comparisonId] = entry.value;
    }

    const compRows = (await ctx.runQuery(
      internal.dctTraceabilityRunner._loadComparisonsForTrace,
      { comparisonIds: sliceIds },
    )) as CompRow[];

    const docIdSet = new Set(payload.docIds.map((id: Id<"documents">) => String(id)));

    try {
      const result = await processOneBatch(ctx, {
        projectId: run.projectId,
        runId,
        model: run.model,
        systemPrompt: payload.systemPrompt,
        corpus: payload.corpus,
        docIdSet,
        compRows,
        globalStartIndex: globalStart,
        applicabilityMap,
        lowConfidenceMap,
        apiKey,
        persisted: run.persisted,
        persistFailed: run.persistFailed,
        parseFailed: run.parseFailed,
      });

      const fresh = (await ctx.runQuery(internal.dctCompliance._getTraceabilityRun, {
        runId,
      })) as Doc<"dctTraceabilityRuns"> | null;
      if (
        fresh?.cancelRequested === true ||
        fresh?.status === "cancelled" ||
        fresh?.status === "failed"
      ) {
        return;
      }

      const processed = fresh?.processed ?? result.processed;
      const total = fresh?.total ?? run.total;

      if (processed < total) {
        await scheduleNextBatch(ctx, runId, result.nextDelayMs);
        return;
      }

      // Don't pretend a 0-of-N run "succeeded" — that's the symptom users see as
      // "ran but nothing changed". Mark failed with an explanatory error so the
      // UI's last-run banner makes the failure obvious.
      const finalPersisted = fresh?.persisted ?? result.persisted;
      const finalParseFailed = fresh?.parseFailed ?? result.parseFailed;
      const finalPersistFailed = fresh?.persistFailed ?? result.persistFailed;
      if (total > 0 && finalPersisted === 0) {
        const reasonBits: string[] = [];
        if (finalParseFailed > 0) {
          reasonBits.push(
            `${finalParseFailed} batch parse failure${finalParseFailed === 1 ? "" : "s"}`,
          );
        }
        if (finalPersistFailed > 0) {
          reasonBits.push(
            `${finalPersistFailed} row${finalPersistFailed === 1 ? "" : "s"} not saved`,
          );
        }
        const reason = reasonBits.length > 0 ? ` (${reasonBits.join(", ")})` : "";
        await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
          runId,
          status: "failed",
          completedAt: new Date().toISOString(),
          error: `0 of ${total} requirements applied${reason}. See last model output for details.`,
        });
        return;
      }

      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[dct-traceability-runner] batch action failed — will retry", err);
      // Do not mark failed: schedule retry of the same offset after a short pause.
      const fresh = (await ctx.runQuery(internal.dctCompliance._getTraceabilityRun, {
        runId,
      })) as Doc<"dctTraceabilityRuns"> | null;
      const stallRetries =
        (fresh as unknown as { stallRetries?: number } | null)?.stallRetries ?? 0;
      if (
        fresh &&
        fresh.status !== "cancelled" &&
        fresh.status !== "completed" &&
        !fresh.cancelRequested &&
        fresh.processed < fresh.total &&
        stallRetries < MAX_STALL_RETRIES
      ) {
        // Bump the stall counter before retrying so a batch that keeps throwing
        // at the same offset eventually gives up instead of looping forever.
        await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
          runId,
          incrementStall: true,
        });
        await scheduleNextBatch(ctx, runId, 15_000);
        return;
      }
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "failed",
        completedAt: new Date().toISOString(),
        error:
          stallRetries >= MAX_STALL_RETRIES
            ? `Stopped after ${MAX_STALL_RETRIES} failed attempts with no progress. Last error: ${message}`
            : message,
      });
    }
  },
});

/** Cron: re-queue batches for runs whose worker stopped (action timeout, deploy, etc.). */
export const resumeStalledTraceabilityRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const stallMs = 2 * 60 * 1000;
    const now = Date.now();
    const rows = await ctx.db.query("dctTraceabilityRuns").collect();
    for (const row of rows) {
      if (row.status !== "running" && row.status !== "queued") continue;
      if (row.cancelRequested) continue;
      if (row.processed >= row.total) continue;
      const hb = new Date(row.lastHeartbeatAt).getTime();
      if (now - hb < stallMs) continue;
      const stallRetries =
        (row as unknown as { stallRetries?: number }).stallRetries ?? 0;
      if (stallRetries >= MAX_STALL_RETRIES) {
        // Worker has been resurrected too many times without progress — stop
        // burning Claude calls on it and surface the failure to the user.
        await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
          runId: row._id,
          status: "failed",
          completedAt: new Date().toISOString(),
          error: `Abandoned after ${MAX_STALL_RETRIES} stalled resume attempts with no progress.`,
        });
        continue;
      }
      // Count this resume; a batch that actually advances will reset the counter.
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId: row._id,
        incrementStall: true,
      });
      await ctx.scheduler.runAfter(
        0,
        internal.dctTraceabilityRunner.processTraceabilityBatch,
        { runId: row._id },
      );
    }
  },
});

export const startTraceabilityRun = action({
  args: {
    projectId: v.id("projects"),
    comparisonIds: v.array(v.id("dctComparisons")),
    docIds: v.array(v.id("documents")),
    model: v.string(),
    agentId: v.string(),
    systemPrompt: v.string(),
    applicabilityByComparisonId: v.optional(
      v.array(
        v.object({
          comparisonId: v.string(),
          applicability: APPLICABILITY_LITERALS,
        }),
      ),
    ),
    lowConfidenceByComparisonId: v.optional(
      v.array(
        v.object({
          comparisonId: v.string(),
          value: v.boolean(),
        }),
      ),
    ),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"dctTraceabilityRuns">> => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set in Convex environment. Run: npx convex env set ANTHROPIC_API_KEY=sk-ant-...",
      );
    }
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated.");
    }
    const userId = identity.subject;

    if (args.comparisonIds.length === 0) {
      throw new Error("No comparisons selected.");
    }

    await ctx.runMutation(internal.dctCompliance._failStaleTraceabilityRunsForProject, {
      projectId: args.projectId,
    });

    const rawDocs = (await ctx.runQuery(
      internal.dctTraceabilityRunner._loadDocumentsForTrace,
      { docIds: args.docIds },
    )) as Array<Doc<"documents"> | null>;
    const validDocs = rawDocs.filter((d): d is Doc<"documents"> => !!d);

    const docsWithText = await Promise.all(
      validDocs.map(async (d) => {
        const dd = d as Doc<"documents"> & {
          extractedText?: string;
          extractedTextStorageId?: Id<"_storage">;
          category?: string;
        };
        let text = (dd.extractedText ?? "").trim();
        if (!text && dd.extractedTextStorageId) {
          const url = await ctx.storage.getUrl(dd.extractedTextStorageId);
          if (url) {
            const resp = await fetch(url);
            if (resp.ok) text = (await resp.text()).trim();
          }
        }
        return {
          id: String(dd._id),
          name: dd.name ?? "Document",
          category: dd.category,
          text,
        };
      }),
    );
    const docsForAi = docsWithText
      .filter((d) => d.text.length >= 80)
      .map((d) => ({ ...d, text: d.text.slice(0, 50_000) }));
    if (docsForAi.length === 0) {
      throw new Error("No document extracted text found — extract manuals first.");
    }
    const corpus = buildCorpus(docsForAi);
    const batchSize = Math.max(1, args.batchSize ?? DEFAULT_BATCH_SIZE);

    const runPayload: RunPayload = {
      comparisonIds: args.comparisonIds,
      docIds: args.docIds,
      systemPrompt: args.systemPrompt,
      corpus,
      batchSize,
      applicabilityByComparisonId: args.applicabilityByComparisonId,
      lowConfidenceByComparisonId: args.lowConfidenceByComparisonId,
    };

    const runId: Id<"dctTraceabilityRuns"> = await ctx.runMutation(
      internal.dctCompliance._createTraceabilityRun,
      {
        projectId: args.projectId,
        userId,
        total: args.comparisonIds.length,
        model: args.model,
        agentId: args.agentId,
        runPayload,
      },
    );

    await ctx.scheduler.runAfter(0, internal.dctTraceabilityRunner.processTraceabilityBatch, {
      runId,
    });

    return runId;
  },
});

export const _loadDocumentsForTrace = internalQuery({
  args: { docIds: v.array(v.id("documents")) },
  handler: async (ctx, { docIds }) => {
    const out: Array<Doc<"documents"> | null> = [];
    for (const id of docIds) {
      out.push(await ctx.db.get(id));
    }
    return out;
  },
});

export const _loadComparisonsForTrace = internalQuery({
  args: { comparisonIds: v.array(v.id("dctComparisons")) },
  handler: async (ctx, { comparisonIds }) => {
    const out: CompRow[] = [];
    for (const id of comparisonIds) {
      const c = await ctx.db.get(id);
      if (!c) continue;
      const q = await ctx.db.get(c.questionId);
      if (!q) continue;
      const d = await ctx.db.get(q.dctDocumentId);
      if (!d) continue;
      const refs = Array.isArray((q as { references?: Array<{ label?: string }> }).references)
        ? ((q as { references?: Array<{ label?: string }> }).references ?? [])
            .map((r) => (typeof r?.label === "string" ? r.label : ""))
            .filter((x): x is string => x.length > 0)
        : [];
      out.push({
        comparisonId: String(id),
        questionText: (q as { text?: string }).text ?? "",
        dctFileName: (d as { fileName?: string }).fileName,
        questionReferences: refs,
      });
    }
    return out;
  },
});
