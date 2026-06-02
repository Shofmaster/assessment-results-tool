/**
 * Reads manual files directly from a customer-hosted HTTP(S) server (DMS / file server).
 * Direct browser fetch — the customer must enable CORS for this app's origin. File bytes
 * are read transiently and never persisted on our infrastructure.
 */

import { getServerCredential } from './serverCredentials';

export type ServerAuthType = 'none' | 'bearer' | 'basic' | 'apiKey';

/** Non-secret config persisted in Convex `documentSources`. */
export interface DocumentServerConfig {
  id: string;
  baseUrl: string;
  authType: ServerAuthType;
  /** Header name for the apiKey auth type (e.g. "X-Api-Key"). */
  headerName?: string;
  /** Username for basic auth (the password is the client-side secret). */
  basicUsername?: string;
}

/** Thrown when the manuals server can't be reached — callers show a recoverable prompt. */
export class ServerUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerUnreachableError';
  }
}

export function joinUrl(baseUrl: string, relativePath: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const path = relativePath.replace(/^\/+/, '');
  return `${base}/${path}`;
}

async function buildHeaders(config: DocumentServerConfig): Promise<HeadersInit> {
  if (config.authType === 'none') return {};
  const secret = await getServerCredential(config.id);
  if (!secret) {
    throw new ServerUnreachableError(
      'No saved credential for this manuals server. Re-enter the server details to continue.',
    );
  }
  switch (config.authType) {
    case 'bearer':
      return { Authorization: `Bearer ${secret}` };
    case 'apiKey':
      return { [config.headerName || 'X-Api-Key']: secret };
    case 'basic':
      return { Authorization: `Basic ${btoa(`${config.basicUsername || ''}:${secret}`)}` };
    default:
      return {};
  }
}

export async function fetchFileFromServer(
  config: DocumentServerConfig,
  relativePath: string,
): Promise<ArrayBuffer> {
  const url = joinUrl(config.baseUrl, relativePath);
  let res: Response;
  try {
    res = await fetch(url, { headers: await buildHeaders(config) });
  } catch (err) {
    // Network failure / CORS rejection surface as a TypeError in the browser.
    throw new ServerUnreachableError(
      `Could not reach the manuals server at ${config.baseUrl}. Check that the server is online and allows access from this app (CORS).`,
    );
  }
  if (!res.ok) {
    throw new ServerUnreachableError(
      `Manuals server returned ${res.status} for ${relativePath}.`,
    );
  }
  return res.arrayBuffer();
}
