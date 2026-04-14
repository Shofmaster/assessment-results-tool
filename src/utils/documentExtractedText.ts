import type { ConvexReactClient } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';

/** Convex document row max ~1 MiB; keep inline string under 1 MB UTF-8. */
export const MAX_EXTRACTED_TEXT_INLINE_UTF8_BYTES = 950_000;

/**
 * When overflow goes to `_storage`, keep a short inline prefix for list UI / “has text” checks.
 * Full text for AI is loaded from `extractedTextStorageId`.
 */
export const MAX_EXTRACTED_TEXT_PREVIEW_UTF8_BYTES = 120_000;

export function clampUtf8ByBytes(raw: string, maxBytes: number): { text: string; truncated: boolean } {
  const enc = new TextEncoder();
  if (enc.encode(raw).length <= maxBytes) {
    return { text: raw, truncated: false };
  }
  let low = 0;
  let high = raw.length;
  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (enc.encode(raw.slice(0, mid)).length <= maxBytes) low = mid;
    else high = mid - 1;
  }
  return { text: raw.slice(0, low), truncated: low < raw.length };
}

/** Inline-only save: full text must fit in the documents row (no overflow file). */
export function clampExtractedTextForConvexInline(raw: string | undefined): { text: string | undefined; truncated: boolean } {
  if (!raw) return { text: undefined, truncated: false };
  return clampUtf8ByBytes(raw, MAX_EXTRACTED_TEXT_INLINE_UTF8_BYTES);
}

export function hasExtractedTextContent(doc: {
  extractedText?: string;
  extractedTextStorageId?: string;
}): boolean {
  return (doc.extractedText || '').trim().length > 0 || !!doc.extractedTextStorageId;
}

/**
 * Returns full extracted text: inline field, or fetches overflow blob when `extractedTextStorageId` is set.
 */
export async function resolveExtractedText(
  doc: { extractedText?: string; extractedTextStorageId?: string },
  getOverflowUrl: () => Promise<string | null | undefined>,
): Promise<string> {
  const inline = doc.extractedText ?? '';
  if (!doc.extractedTextStorageId) return inline;
  const url = await getOverflowUrl();
  if (!url) return inline;
  try {
    const res = await fetch(url);
    if (!res.ok) return inline;
    const remote = await res.text();
    return remote || inline;
  } catch {
    return inline;
  }
}

export type ConvexProjectDocumentLike = {
  _id: string;
  name?: string;
  extractedText?: string;
  extractedTextStorageId?: string;
};

export async function resolveExtractedTextForConvexDoc(
  doc: ConvexProjectDocumentLike,
  convex: ConvexReactClient,
): Promise<string> {
  return resolveExtractedText(doc, () =>
    convex.query(api.documents.getExtractedTextOverflowUrl, { documentId: doc._id as Id<'documents'> }),
  );
}

/** Resolves overflow storage; includes `text` only when non-empty after trim. */
export async function mapProjectDocumentsToOptionalText(
  docs: ConvexProjectDocumentLike[],
  convex: ConvexReactClient,
): Promise<Array<{ name: string; text?: string }>> {
  const out: Array<{ name: string; text?: string }> = [];
  for (const d of docs) {
    const text = (await resolveExtractedTextForConvexDoc(d, convex)).trim();
    out.push({ name: d.name || 'Document', ...(text ? { text } : {}) });
  }
  return out;
}

export async function mapProjectDocumentsToRequiredText(
  docs: ConvexProjectDocumentLike[],
  convex: ConvexReactClient,
): Promise<Array<{ name: string; text: string }>> {
  const mapped = await mapProjectDocumentsToOptionalText(docs, convex);
  return mapped.filter((d): d is { name: string; text: string } => (d.text || '').trim().length > 0);
}

/**
 * Prepares `extractedText` / optional `extractedTextStorageId` for a Convex `documents` row.
 * Large extractions spill to `_storage` (UTF-8 text file); the row keeps a short preview.
 */
export async function prepareExtractedPayloadForConvex(
  fullText: string,
  generateUploadUrl: () => Promise<string>,
): Promise<{
  extractedText?: string;
  extractedTextStorageId?: string;
  spillFailed?: boolean;
  inlineTruncated?: boolean;
}> {
  const enc = new TextEncoder();
  const t = fullText.trim();
  if (!t) return {};
  if (enc.encode(t).length <= MAX_EXTRACTED_TEXT_INLINE_UTF8_BYTES) {
    const c = clampExtractedTextForConvexInline(t);
    return { extractedText: c.text, inlineTruncated: c.truncated };
  }
  try {
    const overflowUrl = await generateUploadUrl();
    const body = new Blob([t], { type: 'text/plain;charset=utf-8' });
    const overflowRes = await fetch(overflowUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
    });
    const overflowJson = await overflowRes.json();
    const preview = clampUtf8ByBytes(t, MAX_EXTRACTED_TEXT_PREVIEW_UTF8_BYTES);
    return {
      extractedText: preview.text || undefined,
      extractedTextStorageId: overflowJson.storageId as string,
    };
  } catch {
    const c = clampExtractedTextForConvexInline(t);
    return { extractedText: c.text, spillFailed: true, inlineTruncated: c.truncated };
  }
}
