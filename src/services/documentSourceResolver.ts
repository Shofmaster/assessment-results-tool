/**
 * Single entry point for reading a manufacturer-reference document from its
 * customer-controlled source (local disk / mapped share / HTTP server) and
 * extracting text in-browser. Nothing read here is ever persisted.
 */

import type { DocumentSource } from '../types/document';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { DocumentExtractor } from './documentExtractor';
import {
  getStoredManualsDirectory,
  ensureReadPermission,
  readFileFromDirectory,
} from './localFileAccess';
import {
  fetchFileFromServer,
  ServerUnreachableError,
  type DocumentServerConfig,
} from './httpServerSource';

export interface SourceDocRef {
  source: DocumentSource;
  path: string;
  name?: string;
  mimeType?: string;
  contentHash?: string;
  documentSourceId?: string;
}

export interface SourceResolveContext {
  /** Resolves a non-secret server config by its documentSources id. */
  getServerConfig?: (sourceId: string) => Promise<DocumentServerConfig | undefined>;
  model?: string;
}

/** Recoverable error: the source needs to be (re)linked by the user. */
export class SourceUnavailableError extends Error {
  constructor(
    message: string,
    readonly source: DocumentSource,
  ) {
    super(message);
    this.name = 'SourceUnavailableError';
  }
}

/** Read raw bytes for a document from its source. Throws SourceUnavailableError when unlinked/unreachable. */
export async function readSourceFile(doc: SourceDocRef, ctx: SourceResolveContext): Promise<ArrayBuffer> {
  if (doc.source === 'local') {
    const handle = await getStoredManualsDirectory();
    if (!handle) {
      throw new SourceUnavailableError('No manuals folder is linked. Link the folder to read this document.', 'local');
    }
    if (!(await ensureReadPermission(handle))) {
      throw new SourceUnavailableError('Permission to read the manuals folder was not granted. Re-link the folder.', 'local');
    }
    try {
      return await readFileFromDirectory(handle, doc.path);
    } catch {
      throw new SourceUnavailableError(`"${doc.name || doc.path}" was not found in the linked manuals folder.`, 'local');
    }
  }

  // http-server
  if (!doc.documentSourceId || !ctx.getServerConfig) {
    throw new SourceUnavailableError('This document has no linked manuals server. Configure the server to continue.', 'http-server');
  }
  const config = await ctx.getServerConfig(doc.documentSourceId);
  if (!config) {
    throw new SourceUnavailableError('The manuals server for this document is not configured. Re-enter the server details.', 'http-server');
  }
  try {
    return await fetchFileFromServer(config, doc.path);
  } catch (err) {
    const msg = err instanceof ServerUnreachableError ? err.message : `Could not read "${doc.name || doc.path}" from the manuals server.`;
    throw new SourceUnavailableError(msg, 'http-server');
  }
}

// Session-only text cache keyed by content hash (falls back to source+path when hash absent).
const sessionTextCache = new Map<string, string>();

function cacheKey(doc: SourceDocRef): string {
  return doc.contentHash ? `h:${doc.contentHash}` : `p:${doc.source}:${doc.documentSourceId || ''}:${doc.path}`;
}

/** Read + extract text for a source document, memoized for the session. Never persisted. */
export async function readDocumentSourceText(doc: SourceDocRef, ctx: SourceResolveContext): Promise<string> {
  const key = cacheKey(doc);
  const cached = sessionTextCache.get(key);
  if (cached !== undefined) return cached;

  const buffer = await readSourceFile(doc, ctx);
  const extractor = new DocumentExtractor();
  const text = await extractor.extractText(
    buffer,
    doc.name || doc.path,
    doc.mimeType || '',
    ctx.model || DEFAULT_CLAUDE_MODEL,
  );
  sessionTextCache.set(key, text);
  return text;
}

/** Clear the session cache (e.g. after re-linking a folder/server). */
export function clearDocumentSourceCache(): void {
  sessionTextCache.clear();
}
