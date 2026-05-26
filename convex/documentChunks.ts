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
const MAX_TOP_K = 24;
const CHUNK_SIZE_CHARS = 1200;
const CHUNK_OVERLAP_CHARS = 200;
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

export const indexDocument = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(internal.documentChunks.getDocumentForIndex, { documentId: args.documentId });
    if (!doc) return { ok: false, reason: "missing_document" as const };
    if (!SUPPORTED_CATEGORIES.has(doc.category)) {
      await ctx.runMutation(internal.documentChunks.clearForDocument, { documentId: args.documentId });
      await ctx.runMutation(internal.documentChunks.recordIndexAttempt, {
        documentId: args.documentId,
        projectId: doc.projectId,
        succeeded: false,
        lastError: `unsupported category: ${doc.category || "(none)"}`,
        errorCode: "UNSUPPORTED_CATEGORY",
      });
      return { ok: false, reason: "unsupported_category" as const };
    }
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
        });
        return { ok: false, reason: "empty_text" as const };
      }

      const { embeddings, provider, model } = await embedTexts(
        spans.map((s) => s.text),
        "document",
      );
      const now = new Date().toISOString();
      const companyId = await ctx.runQuery(internal.documentChunks.getCompanyIdForProject, { projectId: doc.projectId });
      for (let i = 0; i < spans.length; i += 1) {
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
          embedding: embeddings[i],
          embeddingProvider: provider,
          embeddingModel: model,
          createdAt: now,
        } as any);
      }
      await ctx.runMutation(internal.documentChunks.recordIndexAttempt, {
        documentId: args.documentId,
        projectId: doc.projectId,
        succeeded: true,
        lastChunkCount: spans.length,
      });
      return { ok: true, chunkCount: spans.length };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.documentChunks.recordIndexAttempt, {
        documentId: args.documentId,
        projectId: doc.projectId,
        succeeded: false,
        lastError: shortenError(message),
        errorCode: classifyIndexError(message),
      });
      throw error;
    }
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

    const loadAllScopedChunks = async (): Promise<any[]> => {
      if (docIds.size > 0 && args.documentIds?.length) {
        return await ctx.runQuery(internal.documentChunks.listChunksByDocumentIds, {
          documentIds: args.documentIds,
        });
      }
      if (companyScope) {
        return await ctx.runQuery(internal.documentChunks.listChunksByCompany, {
          companyId: args.companyId!,
        });
      }
      return await ctx.runQuery(internal.documentChunks.listChunksByProject, {
        projectId: args.projectId!,
      });
    };

    const bruteForceScoped = async (): Promise<any[]> => {
      const scoped = await loadAllScopedChunks();
      return scoreChunksWithCosine(applyCategoryAndDocFilters(scoped, categories, docIds), queryEmbedding);
    };

    let candidates: any[] = [];
    if (docIds.size > 0) {
      // Focused documents: score every chunk for those docs (never dropped by ANN).
      candidates = await bruteForceScoped();
    } else {
      const annLimit = Math.max(limit * 3, limit);
      const vectorFilter = companyScope
        ? (q: any) => q.eq("companyId", args.companyId!)
        : (q: any) => q.eq("projectId", args.projectId!);

      const vectorResults =
        ((await (ctx as any).vectorSearch?.("documentChunks", "by_embedding", {
          vector: queryEmbedding,
          limit: annLimit,
          filter: vectorFilter,
        })) as any[]) || [];

      candidates = vectorResults.map((row: any) => {
        const item = row.document || row.value || row;
        return {
          ...item,
          _score: typeof row._score === "number" ? row._score : 0,
        };
      });

      const beforeCategoryFilter = candidates.length;
      candidates = applyCategoryAndDocFilters(candidates, categories, docIds);

      // ANN returned nothing, or category filter emptied the pool — scan all scoped chunks.
      if (candidates.length === 0) {
        candidates = await bruteForceScoped();
      } else if (categories.size > 0 && beforeCategoryFilter > 0 && candidates.length < limit) {
        const brute = await bruteForceScoped();
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
  args: { projectId: v.optional(v.id("projects")) },
  handler: async (ctx, args) => {
    if (!args.projectId) {
      throw new Error("projectId is required for backfill.");
    }
    assertEmbeddingEnv();
    const docs = (await ctx.runQuery(api.documents.listByProject, { projectId: args.projectId })) as any[];
    let queued = 0;
    let skippedNoText = 0;
    let skippedCategory = 0;
    const skippedCategoryNames: Array<{ name: string; category: string }> = [];
    const queuedByCategory: Record<string, number> = {};
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
      await ctx.scheduler.runAfter(0, internal.documentChunks.indexDocument, { documentId: doc._id });
      queued += 1;
      queuedByCategory[cat] = (queuedByCategory[cat] || 0) + 1;
    }
    return {
      queued,
      total: docs.length,
      skippedNoText,
      skippedCategory,
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
    if (companyScope) {
      await ctx.runQuery(api.documents.listByCompany, { companyId: args.companyId! });
    } else {
      await ctx.runQuery(api.documents.listByProject, { projectId: args.projectId! });
    }

    const docs = companyScope
      ? ((await ctx.runQuery(api.documents.listByCompany, { companyId: args.companyId! })) as any[])
      : ((await ctx.runQuery(api.documents.listByProject, { projectId: args.projectId! })) as any[]);
    const chunks = companyScope
      ? ((await ctx.runQuery(internal.documentChunks.listChunksByCompany, {
          companyId: args.companyId!,
        })) as any[])
      : ((await ctx.runQuery(internal.documentChunks.listChunksByProject, {
          projectId: args.projectId!,
        })) as any[]);
    const statuses = companyScope
      ? ((await ctx.runQuery(internal.documentChunks.listIndexStatusByCompany, {
          companyId: args.companyId!,
        })) as any[])
      : ((await ctx.runQuery(internal.documentChunks.listIndexStatusByProject, {
          projectId: args.projectId!,
        })) as any[]);
    const chunksByDoc: Record<string, number> = {};
    for (const row of chunks) {
      const id = String(row.documentId);
      chunksByDoc[id] = (chunksByDoc[id] || 0) + 1;
    }
    const statusByDoc: Record<string, any> = {};
    for (const row of statuses) {
      statusByDoc[String(row.documentId)] = row;
    }
    const nowMs = Date.now();
    const IN_FLIGHT_WINDOW_MS = 60_000;
    let failedCount = 0;
    let inFlightCount = 0;
    let lastErrorCode: string | undefined;
    const perDoc = docs.map((doc: any) => {
      const cat = String(doc.category || "");
      const hasText = typeof doc?.extractedText === "string" && doc.extractedText.trim().length > 0;
      const hasTextStorage = Boolean(doc?.extractedTextStorageId);
      const chunkCount = chunksByDoc[String(doc._id)] || 0;
      const status = statusByDoc[String(doc._id)];
      const attempts = Number(status?.attempts ?? 0);
      const lastAttemptMs = status?.lastAttemptedAt
        ? Date.parse(String(status.lastAttemptedAt))
        : 0;
      const recentAttempt =
        lastAttemptMs > 0 && nowMs - lastAttemptMs < IN_FLIGHT_WINDOW_MS;

      let reason = "";
      let state: "indexed" | "failed" | "inFlight" | "eligible" | "skipped" = "eligible";
      if (chunkCount > 0) {
        reason = "indexed";
        state = "indexed";
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
      totalChunks: chunks.length,
      indexed: perDoc.filter((d) => d.chunkCount > 0).length,
      failed: failedCount,
      inFlight: inFlightCount,
      lastErrorCode,
      perDoc,
    };
  },
});
