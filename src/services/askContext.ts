/**
 * Compact retrieval-context builder for the embedded AskPanel (Library/Fleet).
 * The splash chat keeps its own richer builder (fallback previews, full-doc
 * mode); this one always tags, because the panel only exists on surfaces
 * where verifiable citations are the point.
 */

import { type AskChunkSource, makeExcerpt } from '../types/askSources';

export interface TaggedPassageContext {
  context: string;
  sources: AskChunkSource[];
  docCount: number;
}

export function buildTaggedPassages(chunks: unknown[]): TaggedPassageContext {
  const sources: AskChunkSource[] = [];
  const lines: string[] = [];
  const docIds = new Set<string>();
  for (const raw of Array.isArray(chunks) ? chunks : []) {
    const chunk = raw as Record<string, unknown>;
    const docId = String(chunk?.documentId || '');
    const text = String(chunk?.text || '').trim();
    if (!docId || !text) continue;
    if (!Number.isFinite(chunk?.startChar) || !Number.isFinite(chunk?.endChar)) continue;
    docIds.add(docId);
    const tag = `S${sources.length + 1}`;
    const docName = String(chunk?.docName || 'Company document').trim() || 'Company document';
    const chunkIndex = Number.isFinite(chunk?.chunkIndex) ? Number(chunk.chunkIndex) : 0;
    const totalChunks = Number.isFinite(chunk?.totalChunks) ? Number(chunk.totalChunks) : 0;
    sources.push({
      tag,
      kind: 'chunk',
      documentId: docId,
      chunkId: String(chunk?.chunkId || ''),
      docName,
      category: String(chunk?.category || ''),
      chunkIndex,
      totalChunks,
      startChar: Number(chunk.startChar),
      endChar: Number(chunk.endChar),
      score: Number.isFinite(chunk?.score) ? Number(chunk.score) : 0,
      excerpt: makeExcerpt(text),
    });
    lines.push(`[${tag}] ${docName} (passage ${chunkIndex + 1}/${totalChunks || '?'})\n${text}`);
  }
  return { context: lines.join('\n\n'), sources, docCount: docIds.size };
}
