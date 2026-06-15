/**
 * Server-orchestrated DCT traceability runs.
 *
 * Default mode — Anthropic Message Batches API:
 *   `processTraceabilityBatch` submits all remaining question slices as ONE
 *   Message Batch (50% token pricing), persists the batch id on the run row,
 *   and ends immediately. Subsequent scheduler-chained invocations poll batch
 *   status every ~60s (seconds of action compute per poll instead of minutes
 *   of idle waiting on a synchronous Claude call — Convex bills actions by
 *   wall-clock GB-hours). When the batch ends, results are drained, matched
 *   by custom_id, and persisted per slice.
 *
 * Fallback mode — set Convex env `DCT_TRACEABILITY_SYNC_MODE=1` to restore
 *   the previous behavior: each invocation makes one synchronous Claude call
 *   (~15 questions) then chains the next batch. Use this if batch turnaround
 *   latency is unacceptable for small runs.
 *
 * Both modes heartbeat through `_updateTraceabilityRun`, so the stall-resume
 * cron (`resumeStalledTraceabilityRuns`) and cooperative cancellation work
 * identically; in batch mode a resume simply re-enters the polling loop.
 */
import { v } from "convex/values";
import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";
import type { Doc, Id } from "./_generated/dataModel";
import {
  buildPersistRows,
  extractJsonArray,
  planSlices,
  sliceCustomId,
  type ParsedPersistRow,
} from "./lib/traceabilityBatch";

const MAX_CORPUS_CHARS = 60_000;
const DEFAULT_INTER_BATCH_MS = 800;
const RATE_LIMIT_INTER_BATCH_MS = 5_000;
/** Questions per Claude call — balance speed vs max_tokens. */
export const DEFAULT_BATCH_SIZE = 12;
const MAX_API_RETRIES = 4;
const API_BATCH_TIMEOUT_MS = 60_000;
/**
 * Max consecutive resume/retry attempts that make no progress before a run is
 * abandoned. Bounds both the in-band 15s retry loop and the watchdog cron so
 * a permanently-stuck run can't fire paid Claude batches indefinitely. In
 * batch mode every successful status poll resets the counter, so a slow
 * Anthropic batch (minutes–hours) is never mistaken for a stall.
 */
const MAX_STALL_RETRIES = 5;
/** How often the scheduler-driven action polls Message Batch status. */
const BATCH_POLL_INTERVAL_MS = 60_000;
/**
 * Cap on slices per Anthropic Message Batch so the submit action's prompt
 * building and the result drain stay well inside Convex action limits. Runs
 * larger than this continue with a follow-up batch automatically.
 */
const MAX_SLICES_PER_ANTHROPIC_BATCH = 100;
/** Stall windows for the resume cron (heartbeat age before re-queueing). */
const SYNC_STALL_MS = 2 * 60 * 1000;
/**
 * Batch-mode runs heartbeat once per ~60s poll, and an Anthropic batch can
 * take minutes to complete — give the poller a wider window before the cron
 * declares it dead.
 */
const BATCH_MODE_STALL_MS = 6 * 60 * 1000;

/** Set Convex env DCT_TRACEABILITY_SYNC_MODE=1 to use synchronous Claude calls. */
function useSyncFallback(): boolean {
  const flag = (process.env.DCT_TRACEABILITY_SYNC_MODE ?? "").toLowerCase();
  return flag === "1" || flag === "true";
}

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

/** Anthropic Message Batch in flight for a run (mirrors schema `pendingBatch`). */
type PendingBatch = {
  batchId: string;
  startIndex: number;
  sliceCount: number;
  submittedAt: string;
};

function getPendingBatch(run: Doc<"dctTraceabilityRuns">): PendingBatch | undefined {
  return (run as unknown as { pendingBatch?: PendingBatch }).pendingBatch;
}

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

/** One Messages API request for a slice of questions — identical shape in both modes. */
function buildSliceParams(
  model: string,
  systemPrompt: string,
  corpus: string,
  compRows: CompRow[],
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  const qBlock = compRows
    .map(
      (q) =>
        `- comparisonId: ${q.comparisonId}\n  dct: ${q.dctFileName ?? "—"}\n  question: ${q.questionText.replace(/\s+/g, " ").trim()}\n  refs: ${q.questionReferences.join("; ") || "—"}`,
    )
    .join("\n");
  return {
    model,
    max_tokens: 8192,
    temperature: 0.2,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `COMPANY DOCUMENT CORPUS (excerpt):\n${corpus}`,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: `\n\n---\nQUESTIONS:\n${qBlock}`,
          },
        ],
      },
    ],
  };
}

function buildPayloadMaps(payload: RunPayload): {
  applicabilityMap: Record<string, "applicable" | "unsure" | "not_applicable">;
  lowConfidenceMap: Record<string, boolean>;
} {
  const applicabilityMap: Record<string, "applicable" | "unsure" | "not_applicable"> = {};
  for (const entry of payload.applicabilityByComparisonId ?? []) {
    applicabilityMap[entry.comparisonId] = entry.applicability;
  }
  const lowConfidenceMap: Record<string, boolean> = {};
  for (const entry of payload.lowConfidenceByComparisonId ?? []) {
    lowConfidenceMap[entry.comparisonId] = entry.value;
  }
  return { applicabilityMap, lowConfidenceMap };
}

function messageText(message: Anthropic.Message): string {
  return message.content
    .filter(
      (b): b is Anthropic.TextBlock => (b as { type: string }).type === "text",
    )
    .map((b) => b.text)
    .join("\n");
}

/** Write one slice's rows via the bulk mutation, with one retry. */
async function persistRowsWithRetry(
  ctx: BatchActionCtx,
  projectId: Id<"projects">,
  rows: ParsedPersistRow[],
): Promise<{ ok: boolean; applied: number }> {
  let writeErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const writeResult = (await ctx.runMutation(
        api.dctCompliance.bulkApplyTraceabilityResults,
        {
          projectId,
          results: rows,
        },
      )) as { applied?: number; missing?: number; mismatched?: number; sent?: number } | undefined;
      const applied = writeResult?.applied ?? 0;
      if (applied < rows.length) {
        console.error("[dct-traceability-runner] mutation skipped rows", {
          sent: rows.length,
          applied,
          missing: writeResult?.missing,
          mismatched: writeResult?.mismatched,
          projectId: String(projectId),
        });
      }
      return { ok: true, applied };
    } catch (err) {
      writeErr = err;
      if (attempt === 0) await new Promise((r) => setTimeout(r, 750));
    }
  }
  console.error("[dct-traceability-runner] persist failed after retry", writeErr);
  return { ok: false, applied: 0 };
}

/**
 * Mark a finished run completed — or failed with an explanatory error when
 * nothing was applied, so the UI's last-run banner makes the failure obvious
 * instead of pretending a 0-of-N run "succeeded".
 */
async function finalizeRun(
  ctx: BatchActionCtx,
  runId: Id<"dctTraceabilityRuns">,
  counts: { total: number; persisted: number; persistFailed: number; parseFailed: number },
) {
  if (counts.total > 0 && counts.persisted === 0) {
    const reasonBits: string[] = [];
    if (counts.parseFailed > 0) {
      reasonBits.push(
        `${counts.parseFailed} batch parse failure${counts.parseFailed === 1 ? "" : "s"}`,
      );
    }
    if (counts.persistFailed > 0) {
      reasonBits.push(
        `${counts.persistFailed} row${counts.persistFailed === 1 ? "" : "s"} not saved`,
      );
    }
    const reason = reasonBits.length > 0 ? ` (${reasonBits.join(", ")})` : "";
    await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
      runId,
      status: "failed",
      completedAt: new Date().toISOString(),
      error: `0 of ${counts.total} requirements applied${reason}. See last model output for details.`,
    });
    return;
  }
  await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
    runId,
    status: "completed",
    completedAt: new Date().toISOString(),
  });
}

/** Best-effort cancel of an in-flight Anthropic Message Batch + clear it from the run row. */
async function cancelRemoteBatch(
  ctx: BatchActionCtx,
  runId: Id<"dctTraceabilityRuns">,
  apiKey: string,
  batchId: string,
) {
  try {
    const client = new Anthropic({ apiKey });
    await withTimeout(
      client.messages.batches.cancel(batchId),
      API_BATCH_TIMEOUT_MS,
      "Batch cancel",
    );
  } catch (err) {
    // Tokens for dispatched requests are committed either way; don't block
    // cancellation of the run on a failed remote cancel.
    console.error("[dct-traceability-runner] remote batch cancel failed", err);
  }
  await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
    runId,
    clearPendingBatch: true,
  });
}

/**
 * Batch mode, step 1: submit the remaining slices as one Message Batch and
 * end the action. The poll step takes over via the scheduler.
 */
async function submitTraceabilityBatch(
  ctx: BatchActionCtx,
  args: {
    run: Doc<"dctTraceabilityRuns">;
    payload: RunPayload;
    apiKey: string;
  },
) {
  const { run, payload } = args;
  const batchSize = Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE);
  const total = payload.comparisonIds.length;
  const slices = planSlices(total, run.processed, batchSize, MAX_SLICES_PER_ANTHROPIC_BATCH);

  if (slices.length === 0) {
    await finalizeRun(ctx, run._id, {
      total: run.total,
      persisted: run.persisted,
      persistFailed: run.persistFailed,
      parseFailed: run.parseFailed,
    });
    return;
  }

  const requests: Anthropic.Messages.BatchCreateParams.Request[] = [];
  for (const slice of slices) {
    const sliceIds = payload.comparisonIds.slice(
      slice.startIndex,
      slice.startIndex + slice.count,
    );
    const compRows = (await ctx.runQuery(
      internal.dctTraceabilityRunner._loadComparisonsForTrace,
      { comparisonIds: sliceIds },
    )) as CompRow[];
    // Slices whose comparisons were deleted mid-run get no request; the drain
    // counts the missing result as a parse failure and advances past it.
    if (compRows.length === 0) continue;
    requests.push({
      custom_id: sliceCustomId(slice.startIndex),
      params: buildSliceParams(run.model, payload.systemPrompt, payload.corpus, compRows),
    });
  }

  const lastSlice = slices[slices.length - 1];
  const plannedEnd = lastSlice.startIndex + lastSlice.count;

  if (requests.length === 0) {
    // Nothing left to ask about in this window — advance past it and continue.
    await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
      runId: run._id,
      processed: plannedEnd,
    });
    await scheduleNextBatch(ctx, run._id, DEFAULT_INTER_BATCH_MS);
    return;
  }

  const client = new Anthropic({ apiKey: args.apiKey });
  const batch = await withTimeout(
    client.messages.batches.create({ requests }),
    API_BATCH_TIMEOUT_MS,
    "Message Batch create",
  );

  await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
    runId: run._id,
    resetStall: true,
    pendingBatch: {
      batchId: batch.id,
      startIndex: run.processed,
      sliceCount: slices.length,
      submittedAt: new Date().toISOString(),
    },
  });
  await scheduleNextBatch(ctx, run._id, BATCH_POLL_INTERVAL_MS);
}

/**
 * Batch mode, step 2: poll the in-flight Message Batch. Re-schedules itself
 * every ~60s until processing ends, then drains and persists the results.
 */
async function pollTraceabilityBatch(
  ctx: BatchActionCtx,
  args: {
    run: Doc<"dctTraceabilityRuns">;
    payload: RunPayload;
    pending: PendingBatch;
    apiKey: string;
  },
) {
  const { run, payload, pending } = args;
  const client = new Anthropic({ apiKey: args.apiKey });

  const batch = await withTimeout(
    client.messages.batches.retrieve(pending.batchId),
    API_BATCH_TIMEOUT_MS,
    "Message Batch poll",
  );

  if (batch.processing_status !== "ended") {
    // Heartbeat + clear the stall counter: the batch is alive, we're just
    // waiting on Anthropic. ("canceling" also resolves to "ended".)
    await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
      runId: run._id,
      resetStall: true,
    });
    await scheduleNextBatch(ctx, run._id, BATCH_POLL_INTERVAL_MS);
    return;
  }

  // Drain results — order is not guaranteed, match slices by custom_id.
  const resultsById = new Map<string, Anthropic.Messages.MessageBatchResult>();
  const decoder = await client.messages.batches.results(pending.batchId);
  for await (const entry of decoder) {
    resultsById.set(entry.custom_id, entry.result);
  }

  const { applicabilityMap, lowConfidenceMap } = buildPayloadMaps(payload);
  const docIdSet = new Set(payload.docIds.map((id: Id<"documents">) => String(id)));
  const batchSize = Math.max(1, payload.batchSize ?? DEFAULT_BATCH_SIZE);
  const total = payload.comparisonIds.length;

  // `run.processed` is the resume cursor: if a previous drain died partway
  // through (deploy, action timeout), already-persisted slices are skipped.
  let processed = run.processed;
  let persisted = run.persisted;
  let persistFailed = run.persistFailed;
  let parseFailed = run.parseFailed;

  for (let i = 0; i < pending.sliceCount; i++) {
    const startIndex = pending.startIndex + i * batchSize;
    if (startIndex >= total) break;
    const sliceLen = Math.min(batchSize, total - startIndex);
    const sliceEnd = startIndex + sliceLen;
    if (sliceEnd <= run.processed) continue; // persisted before a restart

    const result = resultsById.get(sliceCustomId(startIndex));
    let lastBadResponse: string | undefined;

    if (result?.type === "succeeded") {
      const text = messageText(result.message);
      const arr = extractJsonArray(text);
      if (!arr) {
        parseFailed += 1;
        lastBadResponse = text.slice(0, 4_000);
      } else {
        const rows = buildPersistRows(arr, { docIdSet, applicabilityMap, lowConfidenceMap });
        if (rows.length > 0) {
          const write = await persistRowsWithRetry(ctx, run.projectId, rows);
          if (write.ok) {
            persisted += write.applied;
            persistFailed += rows.length - write.applied;
          } else {
            persistFailed += rows.length;
          }
        }
      }
    } else {
      // errored / canceled / expired — or no request was submitted for this
      // slice (comparisons deleted). Count it and move on.
      parseFailed += 1;
      console.error("[dct-traceability-runner] batch request did not succeed", {
        customId: sliceCustomId(startIndex),
        resultType: result?.type ?? "missing",
      });
    }

    processed = sliceEnd;
    await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
      runId: run._id,
      processed,
      persisted,
      persistFailed,
      parseFailed,
      lastBadResponse,
    });
  }

  await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
    runId: run._id,
    clearPendingBatch: true,
  });

  const fresh = (await ctx.runQuery(internal.dctCompliance._getTraceabilityRun, {
    runId: run._id,
  })) as Doc<"dctTraceabilityRuns"> | null;
  if (
    fresh?.cancelRequested === true ||
    fresh?.status === "cancelled" ||
    fresh?.status === "failed"
  ) {
    return;
  }

  if ((fresh?.processed ?? processed) < (fresh?.total ?? run.total)) {
    // More slices than fit in one Anthropic batch — submit the next chunk.
    await scheduleNextBatch(ctx, run._id, DEFAULT_INTER_BATCH_MS);
    return;
  }

  await finalizeRun(ctx, run._id, {
    total: fresh?.total ?? run.total,
    persisted: fresh?.persisted ?? persisted,
    persistFailed: fresh?.persistFailed ?? persistFailed,
    parseFailed: fresh?.parseFailed ?? parseFailed,
  });
}

/** Synchronous fallback: process exactly one API batch; returns whether to continue. */
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

  let response: Anthropic.Message | null = null;
  let lastApiErr: unknown = null;
  for (let attempt = 0; attempt < MAX_API_RETRIES; attempt++) {
    try {
      response = await withTimeout(
        client.messages.create(
          buildSliceParams(args.model, args.systemPrompt, args.corpus, slice),
        ),
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

  const text = messageText(response);
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

  const batchResults = buildPersistRows(arr, {
    docIdSet: args.docIdSet,
    applicabilityMap: args.applicabilityMap,
    lowConfidenceMap: args.lowConfidenceMap,
  });

  if (batchResults.length > 0) {
    const write = await persistRowsWithRetry(ctx, args.projectId, batchResults);
    if (write.ok) {
      persisted += write.applied;
      const skipped = batchResults.length - write.applied;
      if (skipped > 0) {
        persistFailed += skipped;
      }
    } else {
      persistFailed += batchResults.length;
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
 * One step per invocation — submits/polls a Message Batch (default) or makes
 * one synchronous Claude call (fallback), then chains the next step.
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
    const pending = getPendingBatch(run);
    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      // A late chunk after cancel/fail: stop the remote batch so it doesn't
      // keep processing paid requests nobody will read.
      if (pending) await cancelRemoteBatch(ctx, runId, apiKey, pending.batchId);
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
      if (pending) await cancelRemoteBatch(ctx, runId, apiKey, pending.batchId);
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "cancelled",
        completedAt: new Date().toISOString(),
      });
      return;
    }

    try {
      if (!useSyncFallback()) {
        if (pending) {
          await pollTraceabilityBatch(ctx, { run, payload, pending, apiKey });
        } else {
          await submitTraceabilityBatch(ctx, { run, payload, apiKey });
        }
        return;
      }

      // ---- Synchronous fallback path (DCT_TRACEABILITY_SYNC_MODE) ----
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

      const { applicabilityMap, lowConfidenceMap } = buildPayloadMaps(payload);

      const compRows = (await ctx.runQuery(
        internal.dctTraceabilityRunner._loadComparisonsForTrace,
        { comparisonIds: sliceIds },
      )) as CompRow[];

      const docIdSet = new Set(payload.docIds.map((id: Id<"documents">) => String(id)));

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

      await finalizeRun(ctx, runId, {
        total,
        persisted: fresh?.persisted ?? result.persisted,
        persistFailed: fresh?.persistFailed ?? result.persistFailed,
        parseFailed: fresh?.parseFailed ?? result.parseFailed,
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
    const now = Date.now();
    // Only "running"/"queued" runs can stall — read them via the by_status index
    // instead of scanning the whole (ever-growing) dctTraceabilityRuns table on
    // every 2-minute tick.
    const [running, queued] = await Promise.all([
      ctx.db
        .query("dctTraceabilityRuns")
        .withIndex("by_status", (q) => q.eq("status", "running"))
        .collect(),
      ctx.db
        .query("dctTraceabilityRuns")
        .withIndex("by_status", (q) => q.eq("status", "queued"))
        .collect(),
    ]);
    const rows = [...running, ...queued];
    for (const row of rows) {
      if (row.cancelRequested) continue;
      if (row.processed >= row.total) continue;
      const hb = new Date(row.lastHeartbeatAt).getTime();
      // Batch-mode runs (Message Batch in flight) heartbeat once per ~60s
      // poll, so give their poller a wider window than the sync path.
      const hasPendingBatch = Boolean(
        (row as unknown as { pendingBatch?: unknown }).pendingBatch,
      );
      const stallMs = hasPendingBatch ? BATCH_MODE_STALL_MS : SYNC_STALL_MS;
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
      // Count this resume; a batch that actually advances (or a successful
      // status poll in batch mode) will reset the counter.
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
