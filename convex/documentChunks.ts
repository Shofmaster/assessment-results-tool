import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";
import { normalizeText } from "./_textUtils";
import { requireCompanyOrDelegatedSupportAccess, requireProjectAccess } from "./_helpers";
import { EMBEDDING_DIMENSIONS } from "./lib/embeddingConfig";
import { reciprocalRankFusion, chunkFusionKey } from "./lib/hybridSearchFusion";

const OPENAI_EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
// voyage-3-lite is fixed at 512 dims and rejects other output_dimension values;
// voyage-3.5-lite supports 256/512/1024/2048. If VOYAGE_EMBEDDING_MODEL is set
// in the deployment env, it must support EMBEDDING_DIMENSIONS.
const VOYAGE_EMBEDDING_MODEL = process.env.VOYAGE_EMBEDDING_MODEL || "voyage-3.5-lite";
const EMBEDDING_PROVIDER = ((process.env.EMBEDDING_PROVIDER || "voyage").toLowerCase() === "openai"
  ? "openai"
  : "voyage") as "openai" | "voyage";
const ACTIVE_EMBEDDING_MODEL =
  EMBEDDING_PROVIDER === "openai" ? OPENAI_EMBEDDING_MODEL : VOYAGE_EMBEDDING_MODEL;
const DEFAULT_TOP_K = 12;
const MAX_TOP_K = 64;
/** Pool size for hybrid retrieval before federated rerank slices to caller topK. */
const HYBRID_POOL_TOP_K = 40;
/** Max characters returned per manual when includeFullDocuments is enabled. */
const MAX_FULL_DOCUMENT_CHARS = 120_000;
const CHUNK_SIZE_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 200;
const EMBED_BATCH_SIZE = 64;
const EMBED_MAX_RETRIES = 5;
const EMBED_BACKOFF_BASE_MS = 1000;
const INDEX_IN_FLIGHT_WINDOW_MS = 60_000;
export const SUPPORTED_CATEGORIES = new Set([
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

/** FNV-1a 32-bit hash + length suffix — keeps the cache key short and bounded. */
function hashQueryText(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${(h >>> 0).toString(16)}-${s.length.toString(36)}`;
}

/**
 * Embed a search query, reusing a previously cached embedding for the exact same
 * query text (per provider/model/dimensions). Identical questions — common in a
 * multi-turn chat or repeated discrepancy lookups — otherwise re-bill the
 * embedding provider on every search. The stored `query` is re-checked on read so
 * a hash collision can never return a wrong embedding (it just misses).
 */
async function embedQueryCached(ctx: any, query: string): Promise<number[]> {
  const cacheKey = `${EMBEDDING_PROVIDER}:${ACTIVE_EMBEDDING_MODEL}:${EMBEDDING_DIMENSIONS}:${hashQueryText(query)}`;
  const cached = (await ctx.runQuery(internal.documentChunks._getCachedQueryEmbedding, {
    cacheKey,
    query,
  })) as number[] | null;
  if (cached && cached.length) return cached;

  const { embeddings, provider, model } = await embedTexts([query], "query");
  const embedding = embeddings[0] || [];
  if (embedding.length) {
    await ctx.runMutation(internal.documentChunks._putCachedQueryEmbedding, {
      cacheKey,
      query,
      provider,
      model,
      dimensions: EMBEDDING_DIMENSIONS,
      embedding,
    });
  }
  return embedding;
}

export const _getCachedQueryEmbedding = internalQuery({
  args: { cacheKey: v.string(), query: v.string() },
  handler: async (ctx, { cacheKey, query }) => {
    const row = await ctx.db
      .query("queryEmbeddingCache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", cacheKey))
      .first();
    if (row && row.query === query) return row.embedding;
    return null;
  },
});

export const _putCachedQueryEmbedding = internalMutation({
  args: {
    cacheKey: v.string(),
    query: v.string(),
    provider: v.string(),
    model: v.string(),
    dimensions: v.number(),
    embedding: v.array(v.float64()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("queryEmbeddingCache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", args.cacheKey))
      .first();
    if (existing) {
      // Only rewrite on a hash collision (different text, same key).
      if (existing.query !== args.query) {
        await ctx.db.patch(existing._id, { ...args, createdAt: Date.now() });
      }
      return;
    }
    await ctx.db.insert("queryEmbeddingCache", { ...args, createdAt: Date.now() });
  },
});

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

async function resolveDocumentText(
  ctx: any,
  documentId: Id<"documents">,
  maxChars?: number,
): Promise<string> {
  const doc = await ctx.runQuery(internal.documentChunks.getDocumentForIndex, { documentId });
  if (!doc) return "";
  const inlineText = (doc.extractedText || "").trim();
  let text = inlineText;
  if (doc.extractedTextStorageId) {
    try {
      const url = await ctx.storage.getUrl(doc.extractedTextStorageId);
      if (url) {
        const response = await fetch(url);
        if (response.ok) {
          const storageText = (await response.text()).trim();
          text = storageText || inlineText;
        }
      }
    } catch {
      // fall back to inline preview
    }
  }
  if (maxChars && maxChars > 0 && text.length > maxChars) {
    return `${text.slice(0, maxChars)}\n[Truncated for retrieval cost limits.]`;
  }
  return text;
}

/** Lightweight auth for search actions — avoids loading full document bodies. */
export const assertSearchAccess = internalQuery({
  args: {
    companyId: v.optional(v.id("companies")),
    projectId: v.optional(v.id("projects")),
  },
  handler: async (ctx, args) => {
    if (args.companyId) {
      await requireCompanyOrDelegatedSupportAccess(ctx, args.companyId);
      return;
    }
    if (args.projectId) {
      await requireProjectAccess(ctx, args.projectId);
      return;
    }
    throw new Error("projectId or companyId is required for document search.");
  },
});

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

/** Full-text keyword search over indexed chunk text (BM25 via Convex search index). */
export const keywordSearchChunks = internalQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    companyId: v.optional(v.id("companies")),
    query: v.string(),
    limit: v.number(),
    categories: v.optional(v.array(v.string())),
    documentIds: v.optional(v.array(v.id("documents"))),
  },
  handler: async (ctx, args) => {
    const trimmed = args.query.trim();
    if (!trimmed) return [] as any[];

    const categories = new Set((args.categories || []).filter(Boolean));
    const docIds = new Set((args.documentIds || []).map((id) => String(id)));
    const takeLimit = Math.max(1, Math.min(args.limit, MAX_TOP_K));
    const overFetch = Math.min(takeLimit * 3, 128);

    let rows: any[] = [];
    if (args.companyId) {
      rows = await ctx.db
        .query("documentChunks")
        .withSearchIndex("by_text", (q) => q.search("text", trimmed).eq("companyId", args.companyId!))
        .take(overFetch);
    } else if (args.projectId) {
      rows = await ctx.db
        .query("documentChunks")
        .withSearchIndex("by_text", (q) => q.search("text", trimmed).eq("projectId", args.projectId!))
        .take(overFetch);
    }

    let filtered = rows;
    if (categories.size > 0) {
      filtered = filtered.filter((row: any) => categories.has(String(row.category || "")));
    }
    if (docIds.size > 0) {
      filtered = filtered.filter((row: any) => docIds.has(String(row.documentId)));
    }
    return filtered.slice(0, takeLimit);
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
/** Convex `ctx.vectorSearch` caps `limit` at 256. */
const VECTOR_SEARCH_MAX_LIMIT = 256;
/**
 * Max documentId OR-clauses per vector search. Focused search used to issue one
 * vector search PER document, which multiplied Convex vector-search billing by
 * the number of indexed docs (a single chat question over a 50-doc library = 50
 * searches). We now OR the docIds into one search; batching only kicks in for
 * libraries larger than this, keeping the filter expression bounded.
 */
const FOCUSED_OR_BATCH = 64;

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
  // One vector search across all focused docs via an OR filter, instead of one
  // search per document. The ANN returns the globally top-scoring chunks across
  // the whole focused set, which we then re-rank and slice below — so we ask for
  // a generous limit (capped at Convex's 256 ceiling) rather than a per-doc one.
  const annLimit = Math.min(
    VECTOR_SEARCH_MAX_LIMIT,
    Math.max(FOCUSED_SINGLE_DOC_FLOOR, limit * 3),
  );
  const merged: any[] = [];
  for (let i = 0; i < documentIds.length; i += FOCUSED_OR_BATCH) {
    const batch = documentIds.slice(i, i + FOCUSED_OR_BATCH);
    const hits = await vectorSearchChunks(ctx, queryEmbedding, annLimit, (q: any) =>
      batch.length === 1
        ? q.eq("documentId", batch[0])
        : q.or(...batch.map((id) => q.eq("documentId", id))),
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
): Promise<{ results: any[]; pagesScanned: number }> {
  const topK: any[] = [];
  let pagesScanned = 0;
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
      pagesScanned += 1;
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

  return {
    results: topK.sort((a, b) => (b._score || 0) - (a._score || 0)).slice(0, args.limit),
    pagesScanned,
  };
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
    contentHash: v.optional(v.string()),
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
        contentHash: args.contentHash ?? existing.contentHash,
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
        contentHash: args.contentHash,
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

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

    // Source-partitioned indexing: Convex only owns docs for which it holds a
    // resolvable text copy (inline extractedText or overflow storage). No-copy
    // external references (Drive/http-linked manuals) have no Convex text and are
    // owned + searched by the Drive .aqv.json index instead — never index them
    // here. Clear any legacy chunks so the two stores can't diverge.
    const hasConvexText = !!(
      ((doc as any).extractedText && String((doc as any).extractedText).trim().length > 0) ||
      (doc as any).extractedTextStorageId
    );
    if (!hasConvexText) {
      await ctx.runMutation(internal.documentChunks.clearForDocument, { documentId: args.documentId });
      return { ok: true, reason: "external_reference" as const };
    }

    const priorStatus = args.force
      ? null
      : await ctx.runQuery(internal.documentChunks.getIndexStatusForDocument, {
          documentId: args.documentId,
        });
    if (
      priorStatus &&
      priorStatus.succeeded !== true &&
      isRecentIndexAttempt(String(priorStatus.lastAttemptedAt ?? ""))
    ) {
      return { ok: false, reason: "in_flight" as const };
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

    let insertedCount = 0;
    try {
      const fullText = await resolveDocumentText(ctx, args.documentId);
      const newHash = await sha256Hex(fullText);

      // Skip re-embedding when the resolved text is byte-identical to the last
      // successful index. Manual (force) reindexes always rebuild.
      if (
        !args.force &&
        priorStatus &&
        priorStatus.succeeded === true &&
        (priorStatus.lastChunkCount ?? 0) > 0 &&
        priorStatus.contentHash &&
        priorStatus.contentHash === newHash
      ) {
        return { ok: true, reason: "unchanged" as const, chunkCount: priorStatus.lastChunkCount ?? 0 };
      }

      await ctx.runMutation(internal.documentChunks.recordIndexAttempt, {
        documentId: args.documentId,
        projectId: doc.projectId,
        succeeded: false,
        lastError: "indexing in progress",
        errorCode: "IN_PROGRESS",
      });

      assertEmbeddingEnv();
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
        contentHash: newHash,
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
    /** When false, skip keyword half of hybrid retrieval (vector-only). */
    hybridKeyword: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (!args.projectId && !args.companyId) {
      throw new Error("projectId or companyId is required for document search.");
    }
    const companyScope = Boolean(args.companyId);
    await ctx.runQuery(internal.documentChunks.assertSearchAccess, {
      companyId: companyScope ? args.companyId : undefined,
      projectId: companyScope ? undefined : args.projectId,
    });

    const trimmed = args.query.trim();
    if (!trimmed) return { chunks: [] as any[], documents: [] as any[] };

    const queryEmbedding = await embedQueryCached(ctx, trimmed);
    const limit = Math.max(1, Math.min(args.topK ?? DEFAULT_TOP_K, MAX_TOP_K));
    const poolLimit = Math.max(limit, Math.min(HYBRID_POOL_TOP_K, MAX_TOP_K));
    const categories = new Set((args.categories || []).filter(Boolean));
    const docIds = new Set((args.documentIds || []).map((id) => String(id)));
    const focusedDocumentIds = (args.documentIds || []) as Id<"documents">[];
    const useKeyword = args.hybridKeyword !== false;

    let retrievalPath: "focused" | "vector" | "brute_force" | "hybrid" = "hybrid";
    let bruteForcePages = 0;

    const paginatedFallback = async (): Promise<any[]> => {
      retrievalPath = "brute_force";
      const { results, pagesScanned } = await paginatedBruteForceScoped(ctx, {
        companyScope,
        companyId: args.companyId,
        projectId: args.projectId,
        queryEmbedding,
        limit: poolLimit,
        categories,
        docIds,
      });
      bruteForcePages += pagesScanned;
      return results;
    };

    const keywordScope = {
      projectId: companyScope ? undefined : args.projectId,
      companyId: companyScope ? args.companyId : undefined,
      query: trimmed,
      limit: poolLimit,
      categories: args.categories,
      documentIds: args.documentIds,
    };

    const keywordPromise = useKeyword
      ? ctx.runQuery(internal.documentChunks.keywordSearchChunks, keywordScope)
      : Promise.resolve([] as any[]);

    let vectorCandidates: any[] = [];
    if (docIds.size > 0 && focusedDocumentIds.length > 0) {
      retrievalPath = "focused";
      vectorCandidates = await searchFocusedDocuments(
        ctx,
        focusedDocumentIds,
        queryEmbedding,
        poolLimit,
        categories,
      );
      if (vectorCandidates.length === 0) {
        vectorCandidates = await paginatedFallback();
      }
    } else {
      retrievalPath = "vector";
      const annLimit = Math.min(VECTOR_SEARCH_MAX_LIMIT, Math.max(poolLimit * 3, poolLimit));
      const vectorFilter = companyScope
        ? (q: any) => q.eq("companyId", args.companyId!)
        : (q: any) => q.eq("projectId", args.projectId!);

      vectorCandidates = await vectorSearchChunks(ctx, queryEmbedding, annLimit, vectorFilter);

      const beforeCategoryFilter = vectorCandidates.length;
      vectorCandidates = applyCategoryAndDocFilters(vectorCandidates, categories, docIds);

      if (vectorCandidates.length === 0 && (beforeCategoryFilter === 0 || categories.size > 0)) {
        vectorCandidates = await paginatedFallback();
      }
    }

    vectorCandidates = vectorCandidates
      .sort((a: any, b: any) => (b._score || 0) - (a._score || 0))
      .slice(0, poolLimit);

    const keywordCandidates = (await keywordPromise) as any[];

    let fusedTop: ReturnType<typeof reciprocalRankFusion>;
    if (useKeyword && keywordCandidates.length > 0) {
      retrievalPath = retrievalPath === "brute_force" ? "hybrid" : "hybrid";
      const vectorHits = vectorCandidates.map((row: any) => ({
        key: chunkFusionKey(String(row.documentId), row.chunkIndex),
        row,
        vectorScore: row._score || 0,
      }));
      const keywordHits = keywordCandidates.map((row: any) => ({
        key: chunkFusionKey(String(row.documentId), row.chunkIndex),
        row,
      }));
      fusedTop = reciprocalRankFusion(vectorHits, keywordHits);
    } else {
      fusedTop = vectorCandidates.map((row: any) => ({
        row,
        fusionScore: row._score || 0,
        vectorScore: row._score || 0,
        keywordRank: null,
        matchType: "semantic" as const,
      }));
    }

    if (fusedTop.length === 0 && useKeyword) {
      vectorCandidates = await paginatedFallback();
      fusedTop = vectorCandidates.map((row: any) => ({
        row,
        fusionScore: row._score || 0,
        vectorScore: row._score || 0,
        keywordRank: null,
        matchType: "semantic" as const,
      }));
    }

    const top = fusedTop.slice(0, limit);

    const mappedChunks = top.map((fused) => {
      const row = fused.row as any;
      return {
        chunkId: row._id,
        documentId: row.documentId,
        docName: row.docName,
        category: row.category,
        chunkIndex: row.chunkIndex,
        totalChunks: row.totalChunks,
        text: row.text,
        startChar: row.startChar,
        endChar: row.endChar,
        score: fused.fusionScore,
        vectorScore: fused.vectorScore,
        keywordRank: fused.keywordRank,
        matchType: fused.matchType,
      };
    });

    const fullDocuments: Array<{
      documentId: Id<"documents">;
      docName: string;
      category: string;
      text: string;
    }> = [];
    if (args.includeFullDocuments === true && top.length > 0) {
      const orderedDocIds: Id<"documents">[] = [];
      const seen = new Set<string>();
      for (const fused of top) {
        const row = fused.row as any;
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
        const bestRow = top.find((fused) => String((fused.row as any)?.documentId) === String(documentId));
        const text = await resolveDocumentText(ctx, documentId, MAX_FULL_DOCUMENT_CHARS);
        if (!text) continue;
        fullDocuments.push({
          documentId,
          docName: String((bestRow?.row as any)?.docName || "Company document"),
          category: String((bestRow?.row as any)?.category || "uploaded"),
          text,
        });
      }
    }

    console.log(
      "[documentChunks.search]",
      JSON.stringify({
        retrievalPath,
        companyScope,
        focusedDocCount: focusedDocumentIds.length,
        topK: limit,
        poolLimit,
        keywordHitCount: keywordCandidates.length,
        vectorHitCount: vectorCandidates.length,
        resultCount: mappedChunks.length,
        fullDocumentCount: fullDocuments.length,
        includeFullDocuments: args.includeFullDocuments === true,
        bruteForcePages,
        categoryCount: categories.size,
      }),
    );

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
