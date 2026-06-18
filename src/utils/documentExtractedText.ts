import type { ConvexReactClient } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { isLocalReferenceCategory } from '../constants/localReference';
import { readDocumentSourceText, SourceUnavailableError } from '../services/documentSourceResolver';
import type { DocumentServerConfig } from '../services/httpServerSource';
import { getSharedDriveService } from '../services/googleDrive';
import { resolveGoogleConfig } from './googleConfig';
import type { DocumentSource } from '../types/document';

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
  category?: string;
}): boolean {
  // Manufacturer-reference docs hold no persisted text but resolve from their source at runtime.
  if (doc.category && isLocalReferenceCategory(doc.category)) return true;
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
  category?: string;
  source?: DocumentSource;
  path?: string;
  mimeType?: string;
  contentHash?: string;
  documentSourceId?: string;
};

/** Maps a Convex documentSources row to the client server config (secret stays in IndexedDB). */
export function makeGetServerConfig(convex: ConvexReactClient) {
  return async (sourceId: string): Promise<DocumentServerConfig | undefined> => {
    const row = await convex.query(api.documentSources.getById, {
      sourceId: sourceId as Id<'documentSources'>,
    });
    if (!row) return undefined;
    return {
      id: row._id,
      baseUrl: row.baseUrl,
      authType: row.authType as DocumentServerConfig['authType'],
      headerName: row.headerName,
      basicUsername: row.basicUsername,
    };
  };
}

/**
 * Builds a Drive-byte fetcher for the source resolver. Reads the user's Google
 * config from Convex, reuses the shared signed-in service, and downloads by file
 * ID. `ensureValidToken` handles silent refresh + interactive re-auth as needed.
 */
export function makeGetDriveFile(convex: ConvexReactClient) {
  return async (fileId: string): Promise<ArrayBuffer> => {
    const settings = await convex.query(api.userSettings.get, {});
    const { clientId, apiKey } = resolveGoogleConfig(settings);
    if (!clientId || !apiKey) {
      throw new Error('Google Drive is not configured in Settings.');
    }
    const service = getSharedDriveService({ clientId, apiKey });
    return service.downloadFile(fileId);
  };
}

/** The full resolver context wired to this Convex client (server + Drive sources). */
export function makeSourceResolveContext(convex: ConvexReactClient) {
  return {
    getServerConfig: makeGetServerConfig(convex),
    getDriveFile: makeGetDriveFile(convex),
  };
}

export async function resolveExtractedTextForConvexDoc(
  doc: ConvexProjectDocumentLike,
  convex: ConvexReactClient,
): Promise<string> {
  // Manufacturer-reference docs: read+extract from the customer source on demand. Never persisted.
  // A store-copy doc (admin escape hatch) keeps its text inline/overflow — prefer that and skip
  // the on-demand source read, which would otherwise look for a file that isn't linked.
  const hasPersistedText = !!(doc.extractedText && doc.extractedText.trim().length) || !!doc.extractedTextStorageId;
  if (!hasPersistedText && doc.category && isLocalReferenceCategory(doc.category) && doc.source && doc.path) {
    try {
      return await readDocumentSourceText(
        {
          source: doc.source,
          path: doc.path,
          name: doc.name,
          mimeType: doc.mimeType,
          contentHash: doc.contentHash,
          documentSourceId: doc.documentSourceId,
        },
        makeSourceResolveContext(convex),
      );
    } catch (err) {
      // Surface as recoverable: re-throw SourceUnavailableError so UI can prompt re-link;
      // any other failure degrades to empty text (doc simply isn't injected this run).
      if (err instanceof SourceUnavailableError) throw err;
      return '';
    }
  }
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
    let text = '';
    try {
      text = (await resolveExtractedTextForConvexDoc(d, convex)).trim();
    } catch (err) {
      // A manufacturer-reference doc whose source isn't reachable is skipped rather than
      // aborting the whole run; the library UI prompts the user to re-link separately.
      if (err instanceof SourceUnavailableError) {
        console.warn(`Skipping "${d.name || d._id}": ${err.message}`);
      } else {
        throw err;
      }
    }
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
