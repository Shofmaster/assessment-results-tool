/**
 * Server-orchestrated DCT traceability runs.
 *
 * The single public entrypoint `startTraceabilityRun` owns the entire batch
 * loop: it resolves the document corpus, calls Claude in batches with caching
 * + 429/529 retry, persists each batch via `bulkApplyTraceabilityResults`, and
 * keeps the `dctTraceabilityRuns` row updated so the UI can render live
 * progress.
 *
 * Why an action (vs. running this in the browser): closing the tab no longer
 * cancels a run. The user can fire one off, navigate away, and come back to
 * the result. Cancellation is cooperative — the UI patches `cancelRequested`
 * on the run row, the action sees it between batches, and exits cleanly.
 *
 * Note on action timeout: Convex actions cap at 10 min. A run of ~140 batches
 * at the 4s inter-batch delay reaches that limit. Larger runs would need
 * scheduled continuation; out-of-scope for the first cut and the existing
 * 1300/1500 read caps already constrain run size below that ceiling.
 */
import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import Anthropic from "@anthropic-ai/sdk";
import type { Doc, Id } from "./_generated/dataModel";

const MAX_CORPUS_CHARS = 60_000;
const DEFAULT_INTER_BATCH_MS = 4_000;
const DEFAULT_BATCH_SIZE = 10;
const MAX_API_RETRIES = 4;

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

const APPLICABILITY_LITERALS = v.union(
  v.literal("applicable"),
  v.literal("unsure"),
  v.literal("not_applicable"),
);

/**
 * Public action: kick off a server-side traceability run for the given
 * comparisons. Returns the run id immediately so the UI can subscribe to
 * `getActiveTraceabilityRun`; the actual work continues asynchronously.
 *
 * The action does not return until the whole run finishes — callers should
 * NOT await it if they want fire-and-forget behavior. They can ignore the
 * returned promise and read progress from the run row instead.
 */
export const startTraceabilityRun = action({
  args: {
    projectId: v.id("projects"),
    comparisonIds: v.array(v.id("dctComparisons")),
    docIds: v.array(v.id("documents")),
    model: v.string(),
    agentId: v.string(),
    /** Rendered DCT traceability system prompt — client picks the agent. */
    systemPrompt: v.string(),
    /**
     * Optional effective applicability per comparison, auto-accepted on write
     * so the matrix stops re-inferring on every render. Mirrors the client
     * engine's `applicabilityByComparisonId` map.
     *
     * Passed as an array (not `v.record`) because Convex rejects objects with
     * more than 1024 fields, and real runs hit the 1500-row matrix cap.
     */
    applicabilityByComparisonId: v.optional(
      v.array(
        v.object({
          comparisonId: v.string(),
          applicability: APPLICABILITY_LITERALS,
        }),
      ),
    ),
    /** Flags rows to mark low-confidence on write. Same array shape for the same 1024-field reason. */
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
    // Capture caller identity up-front; the create-run mutation needs it and we
    // can't rely on Clerk identity surviving every internal hop.
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated.");
    }
    const userId = identity.subject;

    if (args.comparisonIds.length === 0) {
      throw new Error("No comparisons selected.");
    }

    const runId: Id<"dctTraceabilityRuns"> = await ctx.runMutation(
      internal.dctCompliance._createTraceabilityRun,
      {
        projectId: args.projectId,
        userId,
        total: args.comparisonIds.length,
        model: args.model,
        agentId: args.agentId,
      },
    );

    try {
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "running",
      });

      // ── Resolve company doc corpus ─────────────────────────────────────────
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
              if (resp.ok) {
                text = (await resp.text()).trim();
              }
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
        throw new Error(
          "No document extracted text found — extract manuals first.",
        );
      }
      const corpus = buildCorpus(docsForAi);
      const docIdSet = new Set(docsForAi.map((d) => d.id));

      // ── Load comparison metadata (question text, dct file, refs) ──────────
      const compRows = (await ctx.runQuery(
        internal.dctTraceabilityRunner._loadComparisonsForTrace,
        { comparisonIds: args.comparisonIds },
      )) as Array<{
        comparisonId: string;
        questionText: string;
        dctFileName?: string;
        questionReferences: string[];
      }>;
      if (compRows.length === 0) {
        throw new Error("Selected comparisons not found.");
      }

      // Reconstruct lookup maps from the array-form args (see args block for
      // why these aren't passed as records).
      const applicabilityMap: Record<string, "applicable" | "unsure" | "not_applicable"> = {};
      for (const entry of args.applicabilityByComparisonId ?? []) {
        applicabilityMap[entry.comparisonId] = entry.applicability;
      }
      const lowConfidenceMap: Record<string, boolean> = {};
      for (const entry of args.lowConfidenceByComparisonId ?? []) {
        lowConfidenceMap[entry.comparisonId] = entry.value;
      }
      const batchSize = Math.max(1, args.batchSize ?? DEFAULT_BATCH_SIZE);

      const client = new Anthropic({ apiKey });
      let processed = 0;
      let persisted = 0;
      let persistFailed = 0;
      let parseFailed = 0;

      // ── Batch loop ─────────────────────────────────────────────────────────
      for (let i = 0; i < compRows.length; i += batchSize) {
        // Cooperative cancel check — the UI sets cancelRequested via the
        // public mutation; we honor it on each batch boundary.
        const runSnapshot = (await ctx.runQuery(
          internal.dctCompliance._getTraceabilityRun,
          { runId },
        )) as Doc<"dctTraceabilityRuns"> | null;
        if (runSnapshot?.cancelRequested) {
          await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
            runId,
            status: "cancelled",
            completedAt: new Date().toISOString(),
          });
          return runId;
        }

        if (i > 0) {
          await new Promise((r) => setTimeout(r, DEFAULT_INTER_BATCH_MS));
        }

        const slice = compRows.slice(i, i + batchSize);
        const qBlock = slice
          .map(
            (q) =>
              `- comparisonId: ${q.comparisonId}\n  dct: ${q.dctFileName ?? "—"}\n  question: ${q.questionText.replace(/\s+/g, " ").trim()}\n  refs: ${q.questionReferences.join("; ") || "—"}`,
          )
          .join("\n");

        // Call Claude with backoff for 429/529. Other failures fall through to
        // parseFailed and the next batch keeps going — we don't want one bad
        // batch to torch the whole run.
        let response: Anthropic.Message | null = null;
        let lastApiErr: unknown = null;
        for (let attempt = 0; attempt < MAX_API_RETRIES; attempt++) {
          try {
            response = await client.messages.create({
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
            });
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
              const wait = Math.min(60_000, 2 ** attempt * 5_000);
              await new Promise((r) => setTimeout(r, wait));
              continue;
            }
            break;
          }
        }

        if (!response) {
          parseFailed += 1;
          processed = Math.min(i + slice.length, compRows.length);
          await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
            runId,
            processed,
            persisted,
            persistFailed,
            parseFailed,
          });
          console.error(
            "[dct-traceability-runner] batch failed after retries",
            lastApiErr,
          );
          continue;
        }

        const text = response.content
          .filter(
            (b): b is Anthropic.TextBlock =>
              (b as { type: string }).type === "text",
          )
          .map((b) => b.text)
          .join("\n");
        const arr = extractJsonArray(text);
        if (!arr) {
          parseFailed += 1;
          processed = Math.min(i + slice.length, compRows.length);
          await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
            runId,
            processed,
            persisted,
            persistFailed,
            parseFailed,
          });
          continue;
        }

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
        const batchResults: PersistRow[] = [];
        for (const row of arr) {
          if (!row || typeof row !== "object") continue;
          const r = row as Record<string, unknown>;
          const comparisonId =
            typeof r.comparisonId === "string" ? r.comparisonId : "";
          const status = typeof r.status === "string" ? r.status : "";
          if (
            !comparisonId ||
            !["pending", "aligned", "gap", "mismatch"].includes(status)
          ) {
            continue;
          }
          const rawDocId =
            typeof r.underReviewDocumentId === "string"
              ? r.underReviewDocumentId.trim()
              : "";
          const underReviewDocumentId =
            rawDocId && docIdSet.has(rawDocId)
              ? (rawDocId as Id<"documents">)
              : undefined;
          const eff = applicabilityMap[comparisonId];
          batchResults.push({
            comparisonId: comparisonId as Id<"dctComparisons">,
            status: status as PersistRow["status"],
            underReviewDocumentId,
            evidenceSnippet:
              typeof r.evidenceSnippet === "string" ? r.evidenceSnippet : undefined,
            rationale:
              typeof r.rationale === "string" ? r.rationale : undefined,
            lowConfidenceApplicability:
              lowConfidenceMap[comparisonId] === true,
            applicabilityState: eff,
            applicabilitySource: eff ? "auto" : undefined,
          });
        }

        if (batchResults.length > 0) {
          // Two attempts before declaring persist failure — same policy as
          // the client engine's hardened streaming path.
          let ok = false;
          let writeErr: unknown = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              await ctx.runMutation(
                api.dctCompliance.bulkApplyTraceabilityResults,
                {
                  projectId: args.projectId,
                  results: batchResults,
                },
              );
              ok = true;
              break;
            } catch (err) {
              writeErr = err;
              if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 750));
              }
            }
          }
          if (ok) {
            persisted += batchResults.length;
          } else {
            persistFailed += batchResults.length;
            console.error(
              "[dct-traceability-runner] persist failed after retry",
              writeErr,
            );
          }
        }

        processed = Math.min(i + slice.length, compRows.length);
        await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
          runId,
          processed,
          persisted,
          persistFailed,
          parseFailed,
        });
      }

      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      return runId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[dct-traceability-runner] run failed", err);
      await ctx.runMutation(internal.dctCompliance._updateTraceabilityRun, {
        runId,
        status: "failed",
        completedAt: new Date().toISOString(),
        error: message,
      });
      // Swallow — the run row carries the failure for the UI; rethrowing would
      // surface as an unhandled action error in logs without giving the user
      // any new info.
      return runId;
    }
  },
});

/** Internal helper: fetch document rows by id for corpus building. */
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

/** Internal helper: fetch comparison → question → dctDocument metadata for batching. */
export const _loadComparisonsForTrace = internalQuery({
  args: { comparisonIds: v.array(v.id("dctComparisons")) },
  handler: async (ctx, { comparisonIds }) => {
    const out: Array<{
      comparisonId: string;
      questionText: string;
      dctFileName?: string;
      questionReferences: string[];
    }> = [];
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
