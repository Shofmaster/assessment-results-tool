import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";

const EMBEDDING_DIMENSIONS = Number(process.env.EMBEDDING_DIMENSIONS || "512");
const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
const VOYAGE_EMBEDDING_MODEL = process.env.VOYAGE_EMBEDDING_MODEL || "voyage-3-lite";
const EMBEDDING_PROVIDER = ((process.env.EMBEDDING_PROVIDER || "voyage").toLowerCase() === "openai"
  ? "openai"
  : "voyage") as "openai" | "voyage";
const DEFAULT_TOP_K = 12;
const MAX_TOP_K = 64;
const CHUNK_SIZE_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 200;
const EMBED_BATCH_SIZE = 64;
const EMBED_MAX_RETRIES = 5;
const EMBED_BACKOFF_BASE_MS = 1000;
const INDEX_IN_FLIGHT_WINDOW_MS = 60_000;
const SUPPORTED_CATEGORIES = new Set([
  "uploaded",
  "entity",
  "regulatory",
  "sms",
  "reference",
  "mel",
  "maintenance_manual",
  "parts_catalog",
  "logbook_scan",
  "wiring_diagram",
]);

type ChunkSpan = {
  text: string;
  startChar: number;
  endChar: number;
  chunkIndex: number;
};

function normalizeText(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\t/g, " ").replace(/[ ]{2,}/g, " ").trim();
}

function splitIntoChunks(raw: string, size = CHUNK_SIZE_CHARS, overlap = CHUNK_OVERLAP_CHARS): ChunkSpan[] {
  const text = normalizeText(raw);
  if (!text) return [];
  const chunks: ChunkSpan[] = [];
  let start = 0;
  while (start < text.length) {
    const maxEnd = Math.min(start + size, text.length);
    let end = maxEnd;
    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf("\n\n", maxEnd);
      const lineBreak = text.lastIndexOf("\n", maxEnd);
      const sentenceBreak = Math.max(
        text.lastIndexOf(". ", maxEnd),
        text.lastIndexOf("? ", maxEnd),
        text.lastIndexOf("! ", maxEnd),
      );
      const candidate = [paragraphBreak, lineBreak, sentenceBreak]
        .filter((idx) => idx > start + Math.floor(size * 0.55))
        .sort((a, b) => b - a)[0];
      if (candidate !== undefined) end = candidate + 1;
    }
    const spanText = text.slice(start, end).trim();
    if (spanText) {
      chunks.push({
        text: spanText,
        startChar: start,
        endChar: end,
        chunkIndex: chunks.length,
      });
    }
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (!normA || !normB) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getOpenAiClient(): Promise<OpenAI> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set in Convex environment.");
  }
  return new OpenAI({ apiKey });
}

async function embedTextsOpenAi(client: OpenAI, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await client.embeddings.create({
    model: OPENAI_EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data.map((row) => row.embedding);
}

async function embedTextsVoyage(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.VOYAGE_API_KEY;
  if (!apiKey) {
    throw new Error("VOYAGE_API_KEY is not set in Convex environment.");
  }

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: VOYAGE_EMBEDDING_MODEL,
      input: texts,
      input_type: inputType,
      output_dimension: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Voyage embeddings request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  if (!Array.isArray(payload.data)) {
    throw new Error("Voyage embeddings response is missing data array.");
  }
  return payload.data.map((row) => row.embedding || []);
}

function assertEmbeddingDimensions(
  embeddings: number[][],
  provider: "openai" | "voyage",
  model: string,
): void {
  if (!Number.isFinite(EMBEDDING_DIMENSIONS) || EMBEDDING_DIMENSIONS <= 0) {
    throw new Error(`Invalid EMBEDDING_DIMENSIONS value: ${String(EMBEDDING_DIMENSIONS)}`);
  }
  for (const emb of embeddings) {
    if (emb.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Embedding dimension mismatch from ${provider}:${model}. Expected ${EMBEDDING_DIMENSIONS}, received ${emb.length}.`,
      );
    }
  }
}

async function embedTexts(
  texts: string[],
  inputType: "document" | "query",
): Promise<{
  embeddings: number[][];
  provider: "openai" | "voyage";
  model: string;
}> {
  if (EMBEDDING_PROVIDER === "openai") {
    const client = await getOpenAiClient();
    const embeddings = await embedTextsOpenAi(client, texts);
    assertEmbeddingDimensions(embeddings, "openai", OPENAI_EMBEDDING_MODEL);
    return {
      embeddings,
      provider: "openai",
      model: OPENAI_EMBEDDING_MODEL,
    };
  }
  const embeddings = await embedTextsVoyage(texts, inputType);
  assertEmbeddingDimensions(embeddings, "voyage", VOYAGE_EMBEDDING_MODEL);
  return {
    embeddings,
    provider: "voyage",
    model: VOYAGE_EMBEDDING_MODEL,
  };
}

function isTransientEmbedError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("econnreset") ||
    lower.includes("503") ||
    lower.includes("502") ||
    lower.includes("504")
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Embed `texts` in slices of `batchSize`, invoking `onBatch` after each slice
 * completes so callers can persist partial work. On transient errors (429,
 * timeout, 5xx) each batch is retried with exponential backoff up to
 * `EMBED_MAX_RETRIES`. Large documents with thousands of chunks otherwise
 * exceed embedding-provider per-request limits and silently fail.
 */
async function embedTextsBatched(
  texts: string[],
  inputType: "document" | "query",
  options?: {
    batchSize?: number;
    maxRetries?: number;
    backoffBaseMs?: number;
    onBatch?: (batch: {
      startIndex: number;
      embeddings: number[][];
      provider: "openai" | "voyage";
      model: string;
    }) => Promise<void> | void;
  },
): Promise<{
  embeddings: number[][];
  provider: "openai" | "voyage";
  model: string;
}> {
  const batchSize = Math.max(1, options?.batchSize ?? EMBED_BATCH_SIZE);
  const maxRetries = Math.max(0, options?.maxRetries ?? EMBED_MAX_RETRIES);
  const backoffBaseMs = Math.max(100, options?.backoffBaseMs ?? EMBED_BACKOFF_BASE_MS);

  const all: number[][] = [];
  let provider: "openai" | "voyage" = EMBEDDING_PROVIDER;
  let model = EMBEDDING_PROVIDER === "openai" ? OPENAI_EMBEDDING_MODEL : VOYAGE_EMBEDDING_MODEL;

  for (let start = 0; start < texts.length; start += batchSize) {
    const slice = texts.slice(start, start + batchSize);

    let lastError: unknown;
    let succeeded = false;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const result = await embedTexts(slice, inputType);
        provider = result.provider;
        model = result.model;
        all.push(...result.embeddings);
        if (options?.onBatch) {
          await options.onBatch({
            startIndex: start,
            embeddings: result.embeddings,
            provider: result.provider,
            model: result.model,
          });
        }
        succeeded = true;
        break;
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= maxRetries || !isTransientEmbedError(message)) {
          break;
        }
        const delay = backoffBaseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
        await sleep(delay);
      }
    }
    if (!succeeded) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
  }

  return { embeddings: all, provider, model };
}

function assertEmbeddingEnv(): void {
  if (EMBEDDING_PROVIDER === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error(
        "INDEXING_UNAVAILABLE: OPENAI_API_KEY is not set in the Convex environment. " +
          "Set it via `npx convex env set OPENAI_API_KEY <key>` or the Convex dashboard.",
      );
    }
    return;
  }
  if (!process.env.VOYAGE_API_KEY) {
    throw new Error(
      "INDEXING_UNAVAILABLE: VOYAGE_API_KEY is not set in the Convex environment. " +
        "Set it via `npx convex env set VOYAGE_API_KEY <key>` or the Convex dashboard.",
    );
  }
}

function shortenError(message: string, max = 240): string {
  const trimmed = message.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1) + "…";
}

function classifyIndexError(message: string): string {
  if (message.includes("INDEXING_UNAVAILABLE")) return "INDEXING_UNAVAILABLE";
  const lower = message.toLowerCase();
  if (lower.includes("rate limit") || lower.includes("429")) return "EMBED_RATE_LIMITED";
  if (lower.includes("timeout") || lower.includes("etimedout")) return "EMBED_TIMEOUT";
  if (lower.includes("voyage")) return "EMBED_FAILED";
  if (lower.includes("openai")) return "EMBED_FAILED";
  if (lower.includes("dimension mismatch")) return "EMBED_DIMENSION_MISMATCH";
  return "INDEX_ERROR";
}

async function resolveDocumentText(ctx: any, documentId: Id<"documents">): Promise<string> {
  const doc = await ctx.runQuery(internal.documentChunks.getDocumentForIndex, { documentId });
  if (!doc) return "";
  const inlineText = (doc.extractedText || "").trim();
  if (!doc.extractedTextStorageId) return inlineText;
  try {
    const url = await ctx.storage.getUrl(doc.extractedTextStorageId);
    if (!url) return inlineText;
    const response = await fetch(url);
    if (!response.ok) return inlineText;
    const storageText = (await response.text()).trim();
    return storageText || inlineText;
  } catch {
    return inlineText;
  }
}

export const getDocumentForIndex = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.documentId);
  },
});

export const getCompanyIdForProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    return project?.companyId;
  },
});

export const listChunksByProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentChunks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listChunksByCompany = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    const all: any[] = [];
    for (const project of projects) {
      const rows = await ctx.db
        .query("documentChunks")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect();
      all.push(...rows);
    }
    return all;
  },
});

export const listChunksByDocumentIds = internalQuery({
  args: { documentIds: v.array(v.id("documents")) },
  handler: async (ctx, args) => {
    const all: any[] = [];
    for (const documentId of args.documentIds) {
      const rows = await ctx.db
        .query("documentChunks")
        .withIndex("by_documentId", (q) => q.eq("documentId", documentId))
        .collect();
      all.push(...rows);
    }
    return all;
  },
});

/** Fetch chunk rows by id (small reads — used after vectorSearch hits). */
export const getChunksByIds = internalQuery({
  args: { chunkIds: v.array(v.id("documentChunks")) },
  handler: async (ctx, args) => {
    const rows: any[] = [];
    for (const chunkId of args.chunkIds) {
      const row = await ctx.db.get(chunkId);
      if (row) rows.push(row);
    }
    return rows;
  },
});

export const listProjectIdsByCompany = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    return projects.map((p) => p._id);
  },
});

export const scanChunksPageByProject = internalQuery({
  args: {
    projectId: v.id("projects"),
    cursor: v.union(v.string(), v.null()),
    pageSize: v.number(),
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("documentChunks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .paginate({ cursor: args.cursor, numItems: args.pageSize });
    return {
      rows: result.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

const SCAN_PAGE_SIZE = 200;
const FOCUSED_ANN_CAP = 200;
const FOCUSED_SINGLE_DOC_FLOOR = 32;

type ChunkScanPage = {
  rows: any[];
  isDone: boolean;
  continueCursor: string;
};

function applyCategoryAndDocFilters(
  rows: any[],
  categories: Set<string>,
  docIds: Set<string>,
): any[] {
  let filtered = rows;
  if (categories.size > 0) {
    filtered = filtered.filter((row: any) => categories.has(String(row.category || "")));
  }
  if (docIds.size > 0) {
    filtered = filtered.filter((row: any) => docIds.has(String(row.documentId)));
  }
  return filtered;
}

function scoreChunksWithCosine(rows: any[], queryEmbedding: number[]): any[] {
  return rows.map((row: any) => ({
    ...row,
    _score: cosineSimilarity(queryEmbedding, row.embedding || []),
  }));
}

function mergeIntoTopK(heap: any[], row: any, k: number): void {
  heap.push(row);
  heap.sort((a, b) => (b._score || 0) - (a._score || 0));
  if (heap.length > k) heap.length = k;
}

function mapVectorSearchHit(row: any): any | null {
  const item = row?.document || row?.value || row;
  if (!item || typeof item !== "object") return null;
  const score = typeof row._score === "number" ? row._score : 0;
  if (item._id && item.text !== undefined) {
    return { ...item, _score: score };
  }
  return null;
}

async function vectorSearchChunks(
  ctx: any,
  queryEmbedding: number[],
  limit: number,
  filter: (q: any) => any,
): Promise<any[]> {
  const vectorResults =
    ((await ctx.vectorSearch?.("documentChunks", "by_embedding", {
      vector: queryEmbedding,
      limit,
      filter,
    })) as any[]) || [];

  const hydrated: any[] = [];
  const idsToFetch: Id<"documentChunks">[] = [];
  const scoreById = new Map<string, number>();

  for (const row of vectorResults) {
    const mapped = mapVectorSearchHit(row);
    if (mapped) {
      hydrated.push(mapped);
      continue;
    }
    const chunkId = row?._id as Id<"documentChunks"> | undefined;
    if (chunkId) {
      idsToFetch.push(chunkId);
      scoreById.set(String(chunkId), typeof row._score === "number" ? row._score : 0);
    }
  }

  if (idsToFetch.length > 0) {
    const rows = await ctx.runQuery(internal.documentChunks.getChunksByIds, { chunkIds: idsToFetch });
    for (const docRow of rows) {
      hydrated.push({
        ...docRow,
        _score: scoreById.get(String(docRow._id)) ?? 0,
      });
    }
  }

  return hydrated;
}

async function searchFocusedDocuments(
  ctx: any,
  documentIds: Id<"documents">[],
  queryEmbedding: number[],
  limit: number,
  categories: Set<string>,
): Promise<any[]> {
  if (documentIds.length === 0) return [];
  const singleDocFloor = documentIds.length === 1 ? FOCUSED_SINGLE_DOC_FLOOR : 4;
  const perDocLimit = Math.min(
    FOCUSED_ANN_CAP,
    Math.max(singleDocFloor, Math.ceil(limit / documentIds.length)),
  );
  const merged: any[] = [];
  for (const documentId of documentIds) {
    const hits = await vectorSearchChunks(ctx, queryEmbedding, perDocLimit, (q: any) =>
      q.eq("documentId", documentId),
    );
    for (const hit of hits) {
      mergeIntoTopK(merged, hit, Math.min(FOCUSED_ANN_CAP, limit * 2));
    }
  }
  let filtered = merged;
  if (categories.size > 0) {
    filtered = filtered.filter((row: any) => categories.has(String(row.category || "")));
  }
  return filtered.sort((a, b) => (b._score || 0) - (a._score || 0)).slice(0, limit);
}

async function paginatedBruteForceScoped(
  ctx: any,
  args: {
    companyScope: boolean;
    companyId?: Id<"companies">;
    projectId?: Id<"projects">;
    queryEmbedding: number[];
    limit: number;
    categories: Set<string>;
    docIds: Set<string>;
  },
): Promise<any[]> {
  const topK: any[] = [];
  const projectIds: Id<"projects">[] = args.companyScope
    ? await ctx.runQuery(internal.documentChunks.listProjectIdsByCompany, {
        companyId: args.companyId!,
      })
    : [args.projectId!];

  for (const projectId of projectIds) {
    let cursor: string | null = null;
    while (true) {
      const page: ChunkScanPage = await ctx.runQuery(internal.documentChunks.scanChunksPageByProject, {
        projectId,
        cursor,
        pageSize: SCAN_PAGE_SIZE,
      });
      let rows = page.rows as any[];
      rows = applyCategoryAndDocFilters(rows, args.categories, args.docIds);
      const scored = scoreChunksWithCosine(rows, args.queryEmbedding);
      for (const row of scored) {
        mergeIntoTopK(topK, row, args.limit);
      }
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
  }

  return topK.sort((a, b) => (b._score || 0) - (a._score || 0)).slice(0, args.limit);
}

export const clearForDocument = internalMutation({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("documentChunks")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .collect();
    for (const row of existing) {
      await ctx.db.delete(row._id);
    }
  },
});

export const insertChunk = internalMutation({
  args: {
    documentId: v.id("documents"),
    projectId: v.id("projects"),
    companyId: v.optional(v.id("companies")),
    category: v.string(),
    docName: v.string(),
    chunkIndex: v.number(),
    totalChunks: v.number(),
    text: v.string(),
    startChar: v.number(),
    endChar: v.number(),
    embedding: v.array(v.number()),
    embeddingProvider: v.optional(v.string()),
    embeddingModel: v.string(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("documentChunks", args);
  },
});

export const recordIndexAttempt = internalMutation({
  args: {
    documentId: v.id("documents"),
    projectId: v.id("projects"),
    succeeded: v.boolean(),
    lastError: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    lastChunkCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("documentIndexStatus")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .first();
    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch(existing._id, {
        projectId: args.projectId,
        lastAttemptedAt: now,
        succeeded: args.succeeded,
        lastError: args.lastError,
        errorCode: args.errorCode,
        attempts: (existing.attempts ?? 0) + 1,
        lastChunkCount: args.lastChunkCount ?? existing.lastChunkCount,
      });
    } else {
      await ctx.db.insert("documentIndexStatus", {
        documentId: args.documentId,
        projectId: args.projectId,
        lastAttemptedAt: now,
        succeeded: args.succeeded,
        lastError: args.lastError,
        errorCode: args.errorCode,
        attempts: 1,
        lastChunkCount: args.lastChunkCount,
      });
    }
  },
});

export const listIndexStatusByProject = internalQuery({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentIndexStatus")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const listIndexStatusByCompany = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_companyId", (q) => q.eq("companyId", args.companyId))
      .collect();
    const all: any[] = [];
    for (const project of projects) {
      const rows = await ctx.db
        .query("documentIndexStatus")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect();
      all.push(...rows);
    }
    return all;
  },
});

export const getIndexStatusForDocument = internalQuery({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("documentIndexStatus")
      .withIndex("by_documentId", (q) => q.eq("documentId", args.documentId))
      .first();
  },
});

function isRecentIndexAttempt(lastAttemptedAt: string | undefined, nowMs = Date.now()): boolean {
  if (!lastAttemptedAt) return false;
  const lastAttemptMs = Date.parse(lastAttemptedAt);
  return lastAttemptMs > 0 && nowMs - lastAttemptMs < INDEX_IN_FLIGHT_WINDOW_MS;
}

export const indexDocument = internalAction({
  args: {
    documentId: v.id("documents"),
    /** When true, run even if another index attempt is in flight. */
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(internal.documentChunks.getDocumentForIndex, { documentId: args.documentId });
    if (!doc) return { ok: false, reason: "missing_document" as const };

    if (!args.force) {
      const priorStatus = await ctx.runQuery(internal.documentChunks.getIndexStatusForDocument, {
        documentId: args.documentId,
      });
      if (
        priorStatus &&
        priorStatus.succeeded !== true &&
        isRecentIndexAttempt(String(priorStatus.lastAttemptedAt ?? ""))
      ) {
        return { ok: false, reason: "in_flight" as const };
      }
    }

    if (!SUPPORTED_CATEGORIES.has(doc.category)) {
      await ctx.runMutation(internal.documentChunks.clearForDocument, { documentId: args.documentId });
      await ctx.runMutation(internal.documentChunks.recordIndexAttempt, {
        documentId: args.documentId,
        projectId: doc.projectId,
        succeeded: false,
        lastError: `unsupported category: ${doc.category || "(none)"}`,
        errorCode: "UNSUPPORTED_CATEGORY",
        lastChunkCount: 0,
      });
      return { ok: false, reason: "unsupported_category" as const };
    }

    await ctx.runMutation(internal.documentChunks.recordIndexAttempt, {
      documentId: args.documentId,
      projectId: doc.projectId,
      succeeded: false,
      lastError: "indexing in progress",
      errorCode: "IN_PROGRESS",
    });

    let insertedCount = 0;
    try {
      assertEmbeddingEnv();
      const fullText = await resolveDocumentText(ctx, args.documentId);
      const spans = splitIntoChunks(fullText);
      await ctx.runMutation(internal.documentChunks.clearForDocument, { documentId: args.documentId });
      if (!spans.length) {
        await ctx.runMutation(internal.documentChunks.recordIndexAttempt, {
          documentId: args.documentId,
          projectId: doc.projectId,
          succeeded: false,
          lastError: "no extractable text",
          errorCode: "EMPTY_TEXT",
          lastChunkCount: 0,
        });
        return { ok: false, reason: "empty_text" as const };
      }

      const now = new Date().toISOString();
      const companyId = await ctx.runQuery(internal.documentChunks.getCompanyIdForProject, { projectId: doc.projectId });

      await embedTextsBatched(
        spans.map((s) => s.text),
        "document",
        {
          onBatch: async ({ startIndex, embeddings, provider, model }) => {
            for (let j = 0; j < embeddings.length; j += 1) {
              const i = startIndex + j;
              await ctx.runMutation(internal.documentChunks.insertChunk, {
                documentId: doc._id,
                projectId: doc.projectId,
                companyId,
                category: doc.category,
                docName: doc.name,
                chunkIndex: i,
                totalChunks: spans.length,
                text: spans[i].text,
                startChar: spans[i].startChar,
                endChar: spans[i].endChar,
                embedding: embeddings[j],
                embeddingProvider: provider,
                embeddingModel: model,
                createdAt: now,
              } as any);
              insertedCount += 1;
            }
          },
        },
      );

      await ctx.runMutation(internal.documentChunks.recordIndexAttempt, {
        documentId: args.documentId,
        projectId: doc.projectId,
        succeeded: true,
        lastChunkCount: insertedCount,
      });
      return { ok: true, chunkCount: insertedCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.documentChunks.recordIndexAttempt, {
        documentId: args.documentId,
        projectId: doc.projectId,
        succeeded: false,
        lastError: shortenError(message),
        errorCode: classifyIndexError(message),
        lastChunkCount: insertedCount,
      });
      throw error;
    }
  },
});

export const reindexOne = action({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args): Promise<{ ok: boolean; chunkCount?: number; reason?: string }> => {
    await ctx.runQuery(api.documents.get, { documentId: args.documentId });
    return (await ctx.runAction(internal.documentChunks.indexDocument, {
      documentId: args.documentId,
      force: true,
    })) as { ok: boolean; chunkCount?: number; reason?: string };
  },
});

export const search = action({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    query: v.string(),
    documentIds: v.optional(v.array(v.id("documents"))),
    categories: v.optional(v.array(v.string())),
    topK: v.optional(v.number()),
    includeFullDocuments: v.optional(v.boolean()),
    maxFullDocuments: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId && !args.companyId) {
      throw new Error("projectId or companyId is required for document search.");
    }
    const companyScope = Boolean(args.companyId);
    if (companyScope) {
      await ctx.runQuery(api.documents.listByCompany, { companyId: args.companyId! });
    } else {
      await ctx.runQuery(api.documents.listByProject, { projectId: args.projectId! });
    }

    const trimmed = args.query.trim();
    if (!trimmed) return { chunks: [] as any[], documents: [] as any[] };

    const { embeddings: queryEmbeddings } = await embedTexts([trimmed], "query");
    const [queryEmbedding] = queryEmbeddings;
    const limit = Math.max(1, Math.min(args.topK ?? DEFAULT_TOP_K, MAX_TOP_K));
    const categories = new Set((args.categories || []).filter(Boolean));
    const docIds = new Set((args.documentIds || []).map((id) => String(id)));
    const focusedDocumentIds = (args.documentIds || []) as Id<"documents">[];

    const paginatedFallback = async (): Promise<any[]> =>
      paginatedBruteForceScoped(ctx, {
        companyScope,
        companyId: args.companyId,
        projectId: args.projectId,
        queryEmbedding,
        limit,
        categories,
        docIds,
      });

    let candidates: any[] = [];
    if (docIds.size > 0 && focusedDocumentIds.length > 0) {
      // Focused documents: per-document ANN (avoids loading every chunk row).
      candidates = await searchFocusedDocuments(ctx, focusedDocumentIds, queryEmbedding, limit, categories);
      if (candidates.length === 0) {
        candidates = await paginatedFallback();
      }
    } else {
      const annLimit = Math.max(limit * 3, limit);
      const vectorFilter = companyScope
        ? (q: any) => q.eq("companyId", args.companyId!)
        : (q: any) => q.eq("projectId", args.projectId!);

      candidates = await vectorSearchChunks(ctx, queryEmbedding, annLimit, vectorFilter);

      const beforeCategoryFilter = candidates.length;
      candidates = applyCategoryAndDocFilters(candidates, categories, docIds);

      // ANN returned nothing, or category filter emptied the pool — paginated scan.
      if (candidates.length === 0) {
        candidates = await paginatedFallback();
      } else if (categories.size > 0 && beforeCategoryFilter > 0 && candidates.length < limit) {
        const brute = await paginatedFallback();
        const seen = new Set(candidates.map((row: any) => String(row._id)));
        for (const row of brute) {
          const key = String(row._id);
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push(row);
        }
      }
    }

    const top = candidates
      .sort((a: any, b: any) => (b._score || 0) - (a._score || 0))
      .slice(0, limit);

    const mappedChunks = top.map((row: any) => ({
      documentId: row.documentId,
      docName: row.docName,
      category: row.category,
      chunkIndex: row.chunkIndex,
      totalChunks: row.totalChunks,
      text: row.text,
      score: row._score || 0,
    }));

    const fullDocuments: Array<{
      documentId: Id<"documents">;
      docName: string;
      category: string;
      text: string;
    }> = [];
    if (args.includeFullDocuments === true && top.length > 0) {
      const orderedDocIds: Id<"documents">[] = [];
      const seen = new Set<string>();
      for (const row of top) {
        const id = row?.documentId as Id<"documents"> | undefined;
        if (!id) continue;
        const key = String(id);
        if (seen.has(key)) continue;
        seen.add(key);
        orderedDocIds.push(id);
      }
      const maxDocs = Math.max(
        1,
        Math.min(
          Math.floor(args.maxFullDocuments ?? orderedDocIds.length),
          orderedDocIds.length,
        ),
      );
      for (const documentId of orderedDocIds.slice(0, maxDocs)) {
        const bestRow = top.find((row: any) => String(row?.documentId) === String(documentId));
        const text = await resolveDocumentText(ctx, documentId);
        if (!text) continue;
        fullDocuments.push({
          documentId,
          docName: String(bestRow?.docName || "Company document"),
          category: String(bestRow?.category || "uploaded"),
          text,
        });
      }
    }

    return {
      chunks: mappedChunks,
      documents: fullDocuments,
    };
  },
});

export const backfillAll = action({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    /** When true, re-queue every eligible document even if already indexed. */
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId && !args.companyId) {
      throw new Error("projectId or companyId is required for backfill.");
    }
    assertEmbeddingEnv();
    const companyScope = Boolean(args.companyId);
    const docs = companyScope
      ? ((await ctx.runQuery(api.documents.listByCompany, { companyId: args.companyId! })) as any[])
      : ((await ctx.runQuery(api.documents.listByProject, { projectId: args.projectId! })) as any[]);
    const statuses = companyScope
      ? ((await ctx.runQuery(internal.documentChunks.listIndexStatusByCompany, {
          companyId: args.companyId!,
        })) as any[])
      : ((await ctx.runQuery(internal.documentChunks.listIndexStatusByProject, {
          projectId: args.projectId!,
        })) as any[]);
    const alreadyIndexed = new Set<string>();
    for (const row of statuses) {
      if (row.succeeded === true && (row.lastChunkCount ?? 0) > 0) {
        alreadyIndexed.add(String(row.documentId));
      }
    }
    let queued = 0;
    let skippedNoText = 0;
    let skippedCategory = 0;
    let skippedAlreadyIndexed = 0;
    const skippedCategoryNames: Array<{ name: string; category: string }> = [];
    const queuedByCategory: Record<string, number> = {};
    const force = args.force === true;
    for (const doc of docs) {
      const hasText = typeof doc?.extractedText === "string" && doc.extractedText.trim().length > 0;
      if (!hasText && !doc?.extractedTextStorageId) {
        skippedNoText += 1;
        continue;
      }
      const cat = String(doc.category || "");
      if (!SUPPORTED_CATEGORIES.has(cat)) {
        skippedCategory += 1;
        if (skippedCategoryNames.length < 25) {
          skippedCategoryNames.push({ name: String(doc.name || "(unnamed)"), category: cat || "(none)" });
        }
        continue;
      }
      if (!force && alreadyIndexed.has(String(doc._id))) {
        skippedAlreadyIndexed += 1;
        continue;
      }
      await ctx.scheduler.runAfter(0, internal.documentChunks.indexDocument, { documentId: doc._id });
      queued += 1;
      queuedByCategory[cat] = (queuedByCategory[cat] || 0) + 1;
    }
    return {
      queued,
      total: docs.length,
      skippedNoText,
      skippedCategory,
      skippedAlreadyIndexed,
      skippedCategoryNames,
      queuedByCategory,
    };
  },
});

/**
 * Diagnostic: returns a per-document summary of what is and isn't indexed for a project or company.
 * Use this to figure out why a document is missing from Ask Agents search.
 */
export const indexSummary = action({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
  },
  handler: async (ctx, args) => {
    if (!args.projectId && !args.companyId) {
      throw new Error("projectId or companyId is required for index summary.");
    }
    const companyScope = Boolean(args.companyId);

    const docs = companyScope
      ? ((await ctx.runQuery(api.documents.listByCompany, { companyId: args.companyId! })) as any[])
      : ((await ctx.runQuery(api.documents.listByProject, { projectId: args.projectId! })) as any[]);
    const statuses = companyScope
      ? ((await ctx.runQuery(internal.documentChunks.listIndexStatusByCompany, {
          companyId: args.companyId!,
        })) as any[])
      : ((await ctx.runQuery(internal.documentChunks.listIndexStatusByProject, {
          projectId: args.projectId!,
        })) as any[]);
    const statusByDoc: Record<string, any> = {};
    for (const row of statuses) {
      statusByDoc[String(row.documentId)] = row;
    }
    const nowMs = Date.now();
    let failedCount = 0;
    let inFlightCount = 0;
    let lastErrorCode: string | undefined;
    let totalChunks = 0;
    const perDoc = docs.map((doc: any) => {
      const cat = String(doc.category || "");
      const hasText = typeof doc?.extractedText === "string" && doc.extractedText.trim().length > 0;
      const hasTextStorage = Boolean(doc?.extractedTextStorageId);
      const status = statusByDoc[String(doc._id)];
      const chunkCount = Number(status?.lastChunkCount ?? 0);
      const succeeded = status?.succeeded === true;
      const attempts = Number(status?.attempts ?? 0);
      const recentAttempt = isRecentIndexAttempt(
        status?.lastAttemptedAt ? String(status.lastAttemptedAt) : undefined,
        nowMs,
      );

      let reason = "";
      let state: "indexed" | "failed" | "inFlight" | "eligible" | "skipped" = "eligible";
      if (succeeded && chunkCount > 0) {
        reason = "indexed";
        state = "indexed";
        totalChunks += chunkCount;
      } else if (status && !succeeded && chunkCount > 0) {
        reason = `partial index: ${status.lastError || status.errorCode || "unknown error"}`;
        state = "failed";
        failedCount += 1;
        if (!lastErrorCode && status.errorCode) lastErrorCode = String(status.errorCode);
      } else if (!SUPPORTED_CATEGORIES.has(cat)) {
        reason = `unsupported category: ${cat || "(none)"}`;
        state = "skipped";
      } else if (!hasText && !hasTextStorage) {
        reason = "no extracted text";
        state = "skipped";
      } else if (status && status.succeeded === false && attempts > 0 && !recentAttempt) {
        reason = `failed: ${status.lastError || status.errorCode || "unknown error"}`;
        state = "failed";
        failedCount += 1;
        if (!lastErrorCode && status.errorCode) lastErrorCode = String(status.errorCode);
      } else if (status && recentAttempt && !status.succeeded) {
        reason = `indexing… (attempt ${attempts || 1})`;
        state = "inFlight";
        inFlightCount += 1;
      } else if (status && attempts > 0) {
        reason = "eligible — last attempt did not produce chunks";
        state = "eligible";
      } else {
        reason = "eligible — not yet attempted";
        state = "eligible";
      }
      return {
        documentId: String(doc._id),
        name: String(doc.name || "(unnamed)"),
        category: cat,
        hasText,
        hasTextStorage,
        chunkCount,
        reason,
        state,
        attempts,
        lastError: status?.lastError ? String(status.lastError) : undefined,
        errorCode: status?.errorCode ? String(status.errorCode) : undefined,
        lastAttemptedAt: status?.lastAttemptedAt ? String(status.lastAttemptedAt) : undefined,
      };
    });
    return {
      totalDocs: docs.length,
      totalChunks,
      indexed: perDoc.filter((d) => d.state === "indexed").length,
      failed: failedCount,
      inFlight: inFlightCount,
      lastErrorCode,
      perDoc,
    };
  },
});
