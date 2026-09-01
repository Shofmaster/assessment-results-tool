/**
 * Reads manual files directly from a customer-hosted HTTP(S) server (DMS / file server).
 * Direct browser fetch — the customer must enable CORS for this app's origin. File bytes
 * are read transiently and never persisted on our infrastructure.
 */

import { getServerCredential } from './serverCredentials';
import { getClerkToken } from './authToken';

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

/**
 * True when the resolved URL is served by this app's own origin — i.e. the
 * self-hosted `/docsrv` reverse proxy rather than a directly-reachable file
 * server. Self-hosted installs point `baseUrl` at their own origin so the
 * browser makes a same-origin HTTPS request and the plain-HTTP hop to the
 * internal file server happens server-side.
 */
export function isSameOriginSource(url: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URL(url, window.location.href).origin === window.location.origin;
  } catch {
    return false;
  }
}

async function buildHeaders(config: DocumentServerConfig, resolvedUrl: string): Promise<HeadersInit> {
  // The self-hosted proxy authenticates with the app's own session, not with a
  // file-server credential — it applies the same guard as the AI endpoints,
  // including the account-approval check. Sending the file server's secret here
  // instead would fail token verification and 401 every request.
  if (isSameOriginSource(resolvedUrl)) {
    const token = await getClerkToken();
    if (!token) {
      throw new ServerUnreachableError(
        'Your session has expired. Refresh the page and try again to read this document.',
      );
    }
    return { Authorization: `Bearer ${token}` };
  }

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
    res = await fetch(url, { headers: await buildHeaders(config, url) });
  } catch (err) {
    // Network failure / CORS rejection surface as a TypeError in the browser.
    // A same-origin source cannot hit CORS, so naming it would misdirect.
    throw new ServerUnreachableError(
      isSameOriginSource(url)
        ? `Could not reach the manuals proxy at ${config.baseUrl}. Check that DOC_SERVER_UPSTREAM is set and the file server is reachable from the app host.`
        : `Could not reach the manuals server at ${config.baseUrl}. Check that the server is online and allows access from this app (CORS).`,
    );
  }
  if (!res.ok) {
    // 401/403 from the same-origin proxy is a session or approval problem, not
    // a missing file — the generic message sends operators hunting the wrong thing.
    if (isSameOriginSource(url) && (res.status === 401 || res.status === 403)) {
      throw new ServerUnreachableError(
        res.status === 403
          ? 'Your account is not approved to read documents. Ask an administrator to approve it.'
          : 'Your session has expired. Refresh the page and try again.',
      );
    }
    throw new ServerUnreachableError(
      `Manuals server returned ${res.status} for ${relativePath}.`,
    );
  }
  return res.arrayBuffer();
}
