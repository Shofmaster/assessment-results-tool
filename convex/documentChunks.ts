import { action, internalAction, internalMutation, internalQuery } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import OpenAI from "openai";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;
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

async function embedTexts(client: OpenAI, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  return response.data.map((row) => row.embedding);
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
    embeddingModel: v.string(),
    createdAt: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("documentChunks", args);
  },
});

export const indexDocument = internalAction({
  args: { documentId: v.id("documents") },
  handler: async (ctx, args) => {
    const doc = await ctx.runQuery(internal.documentChunks.getDocumentForIndex, { documentId: args.documentId });
    if (!doc) return { ok: false, reason: "missing_document" as const };
    if (!SUPPORTED_CATEGORIES.has(doc.category)) {
      await ctx.runMutation(internal.documentChunks.clearForDocument, { documentId: args.documentId });
      return { ok: false, reason: "unsupported_category" as const };
    }
    const fullText = await resolveDocumentText(ctx, args.documentId);
    const spans = splitIntoChunks(fullText);
    await ctx.runMutation(internal.documentChunks.clearForDocument, { documentId: args.documentId });
    if (!spans.length) return { ok: false, reason: "empty_text" as const };

    const client = await getOpenAiClient();
    const embeddings = await embedTexts(client, spans.map((s) => s.text));
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
        embeddingModel: EMBEDDING_MODEL,
        createdAt: now,
      } as any);
    }
    return { ok: true, chunkCount: spans.length };
  },
});

export const search = action({
  args: {
    projectId: v.id("projects"),
    query: v.string(),
    documentIds: v.optional(v.array(v.id("documents"))),
    categories: v.optional(v.array(v.string())),
    topK: v.optional(v.number()),
    includeFullDocuments: v.optional(v.boolean()),
    maxFullDocuments: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Reuse existing guarded query for access enforcement.
    await ctx.runQuery(api.documents.listByProject, { projectId: args.projectId });
    const trimmed = args.query.trim();
    if (!trimmed) return { chunks: [] as any[], documents: [] as any[] };

    const client = await getOpenAiClient();
    const [queryEmbedding] = await embedTexts(client, [trimmed]);
    const limit = Math.max(1, Math.min(args.topK ?? DEFAULT_TOP_K, MAX_TOP_K));
    const categories = new Set((args.categories || []).filter(Boolean));
    const docIds = new Set((args.documentIds || []).map((id) => String(id)));

    let candidates: any[] = [];
    if (docIds.size > 0) {
      // When the user focuses specific documents, score within that subset directly
      // so selected docs are never dropped by a global ANN pre-filter.
      const scoped = await ctx.runQuery(internal.documentChunks.listChunksByProject, { projectId: args.projectId });
      candidates = scoped
        .filter((row: any) => docIds.has(String(row.documentId)))
        .map((row: any) => ({
          ...row,
          _score: cosineSimilarity(queryEmbedding, row.embedding || []),
        }));
    } else {
      const vectorResults =
        ((await (ctx as any).vectorSearch?.("documentChunks", "by_embedding", {
          vector: queryEmbedding,
          limit: Math.max(limit * 3, limit),
          filter: (q: any) => q.eq("projectId", args.projectId),
        })) as any[]) || [];

      candidates = vectorResults.map((row: any) => {
        const item = row.document || row.value || row;
        return {
          ...item,
          _score: typeof row._score === "number" ? row._score : 0,
        };
      });

      // Safety fallback when vector search is unavailable.
      if (candidates.length === 0) {
        candidates = await ctx.runQuery(internal.documentChunks.listChunksByProject, { projectId: args.projectId });
        candidates = candidates.map((row: any) => ({
          ...row,
          _score: cosineSimilarity(queryEmbedding, row.embedding || []),
        }));
      }
    }

    if (categories.size > 0) {
      candidates = candidates.filter((row: any) => categories.has(String(row.category || "")));
    }
    if (docIds.size > 0) {
      candidates = candidates.filter((row: any) => docIds.has(String(row.documentId)));
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
 * Diagnostic: returns a per-document summary of what is and isn't indexed for a project.
 * Use this to figure out why a document is missing from Ask Agents search.
 */
export const indexSummary = action({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const docs = (await ctx.runQuery(api.documents.listByProject, { projectId: args.projectId })) as any[];
    const chunks = (await ctx.runQuery(internal.documentChunks.listChunksByProject, {
      projectId: args.projectId,
    })) as any[];
    const chunksByDoc: Record<string, number> = {};
    for (const row of chunks) {
      const id = String(row.documentId);
      chunksByDoc[id] = (chunksByDoc[id] || 0) + 1;
    }
    const perDoc = docs.map((doc: any) => {
      const cat = String(doc.category || "");
      const hasText = typeof doc?.extractedText === "string" && doc.extractedText.trim().length > 0;
      const hasTextStorage = Boolean(doc?.extractedTextStorageId);
      const chunkCount = chunksByDoc[String(doc._id)] || 0;
      let reason = "";
      if (chunkCount > 0) reason = "indexed";
      else if (!SUPPORTED_CATEGORIES.has(cat)) reason = `unsupported category: ${cat || "(none)"}`;
      else if (!hasText && !hasTextStorage) reason = "no extracted text";
      else reason = "eligible — not yet indexed (run backfill)";
      return {
        documentId: String(doc._id),
        name: String(doc.name || "(unnamed)"),
        category: cat,
        hasText,
        hasTextStorage,
        chunkCount,
        reason,
      };
    });
    return {
      totalDocs: docs.length,
      totalChunks: chunks.length,
      indexed: perDoc.filter((d) => d.chunkCount > 0).length,
      perDoc,
    };
  },
});
