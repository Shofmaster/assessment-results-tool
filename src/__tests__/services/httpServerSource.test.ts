import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Covers the credential split between the two deployment shapes:
 *
 *   Hosted    — baseUrl points directly at a customer file server, so the
 *               configured file-server credential is what authenticates.
 *   Self-host — baseUrl points at this app's own /docsrv proxy, which applies
 *               the same guard as the AI endpoints. It needs the app session
 *               token; sending the file-server secret 401s every request.
 *
 * Getting this backwards silently breaks the whole self-hosted manuals feature,
 * which is the main capability self-hosting adds.
 */

const mockGetClerkToken = vi.fn();
const mockGetServerCredential = vi.fn();

vi.mock('../../services/authToken', () => ({
  getClerkToken: (...args: unknown[]) => mockGetClerkToken(...args),
}));

vi.mock('../../services/serverCredentials', () => ({
  getServerCredential: (...args: unknown[]) => mockGetServerCredential(...args),
}));

import {
  fetchFileFromServer,
  isSameOriginSource,
  joinUrl,
  ServerUnreachableError,
  type DocumentServerConfig,
} from '../../services/httpServerSource';

const APP_ORIGIN = 'https://aerogap.acme.internal';

function setLocation(origin: string) {
  // jsdom's location is read-only; replace it wholesale.
  Object.defineProperty(window, 'location', {
    value: new URL(`${origin}/library`),
    writable: true,
    configurable: true,
  });
}

function okResponse(body = 'PDFBYTES') {
  return {
    ok: true,
    status: 200,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  } as unknown as Response;
}

function errorResponse(status: number) {
  return { ok: false, status, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
}

/** Read the Authorization header off the single recorded fetch call. */
function authHeaderFromFetch(fetchMock: ReturnType<typeof vi.fn>): string | undefined {
  const [, init] = fetchMock.mock.calls[0];
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

describe('joinUrl', () => {
  it('joins without doubling slashes', () => {
    expect(joinUrl('https://x.internal/docs/', '/amm/a.pdf')).toBe('https://x.internal/docs/amm/a.pdf');
    expect(joinUrl('https://x.internal/docs', 'amm/a.pdf')).toBe('https://x.internal/docs/amm/a.pdf');
  });
});

describe('isSameOriginSource', () => {
  beforeEach(() => setLocation(APP_ORIGIN));

  it('recognises the app origin', () => {
    expect(isSameOriginSource(`${APP_ORIGIN}/docsrv/amm/a.pdf`)).toBe(true);
  });

  it('recognises a relative URL', () => {
    expect(isSameOriginSource('/docsrv/amm/a.pdf')).toBe(true);
  });

  it('rejects a different host', () => {
    expect(isSameOriginSource('http://manuals.acme.internal/amm/a.pdf')).toBe(false);
  });

  it('rejects a different scheme on the same host', () => {
    expect(isSameOriginSource('http://aerogap.acme.internal/docsrv/a.pdf')).toBe(false);
  });

  it('returns false for an unparseable URL rather than throwing', () => {
    // Note most odd strings are legal *relative* paths and resolve same-origin;
    // only a malformed absolute URL actually fails to parse.
    expect(isSameOriginSource('http://[')).toBe(false);
  });

  it('treats a strange relative path as same-origin, since that is what it is', () => {
    expect(isSameOriginSource('::::')).toBe(true);
  });
});

describe('fetchFileFromServer', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setLocation(APP_ORIGIN);
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mockGetClerkToken.mockReset();
    mockGetServerCredential.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('self-hosted proxy (same-origin baseUrl)', () => {
    const config: DocumentServerConfig = {
      id: 'src1',
      baseUrl: `${APP_ORIGIN}/docsrv`,
      authType: 'none',
    };

    it('sends the app session token even when authType is none', async () => {
      mockGetClerkToken.mockResolvedValue('clerk-session-jwt');
      fetchMock.mockResolvedValue(okResponse());

      await fetchFileFromServer(config, '/amm/a.pdf');

      expect(authHeaderFromFetch(fetchMock)).toBe('Bearer clerk-session-jwt');
      // The file-server credential store must not be consulted at all.
      expect(mockGetServerCredential).not.toHaveBeenCalled();
    });

    it('sends the session token INSTEAD of a configured file-server secret', async () => {
      // Regression guard: sending the file-server bearer here fails Clerk
      // verification and 401s, which is what the original bug did.
      mockGetClerkToken.mockResolvedValue('clerk-session-jwt');
      mockGetServerCredential.mockResolvedValue('file-server-secret');
      fetchMock.mockResolvedValue(okResponse());

      await fetchFileFromServer({ ...config, authType: 'bearer' }, '/amm/a.pdf');

      expect(authHeaderFromFetch(fetchMock)).toBe('Bearer clerk-session-jwt');
      expect(authHeaderFromFetch(fetchMock)).not.toContain('file-server-secret');
    });

    it('reports an expired session rather than a missing file on 401', async () => {
      mockGetClerkToken.mockResolvedValue('clerk-session-jwt');
      fetchMock.mockResolvedValue(errorResponse(401));

      await expect(fetchFileFromServer(config, '/amm/a.pdf')).rejects.toThrow(/session has expired/i);
    });

    it('reports an unapproved account on 403', async () => {
      mockGetClerkToken.mockResolvedValue('clerk-session-jwt');
      fetchMock.mockResolvedValue(errorResponse(403));

      await expect(fetchFileFromServer(config, '/amm/a.pdf')).rejects.toThrow(/not approved/i);
    });

    it('still reports a plain 404 as a server response', async () => {
      mockGetClerkToken.mockResolvedValue('clerk-session-jwt');
      fetchMock.mockResolvedValue(errorResponse(404));

      await expect(fetchFileFromServer(config, '/amm/a.pdf')).rejects.toThrow(/returned 404/);
    });

    it('fails clearly when no session token can be minted', async () => {
      mockGetClerkToken.mockResolvedValue(null);

      await expect(fetchFileFromServer(config, '/amm/a.pdf')).rejects.toBeInstanceOf(ServerUnreachableError);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('does not blame CORS when a same-origin request fails', async () => {
      // CORS cannot apply same-origin; naming it sends operators the wrong way.
      mockGetClerkToken.mockResolvedValue('clerk-session-jwt');
      fetchMock.mockRejectedValue(new TypeError('network error'));

      await expect(fetchFileFromServer(config, '/amm/a.pdf')).rejects.toThrow(/DOC_SERVER_UPSTREAM/);
    });
  });

  describe('hosted (direct file server)', () => {
    const config: DocumentServerConfig = {
      id: 'src2',
      baseUrl: 'https://manuals.acme.internal/docs',
      authType: 'bearer',
    };

    it('sends the configured file-server credential, not a session token', async () => {
      mockGetServerCredential.mockResolvedValue('file-server-secret');
      fetchMock.mockResolvedValue(okResponse());

      await fetchFileFromServer(config, '/amm/a.pdf');

      expect(authHeaderFromFetch(fetchMock)).toBe('Bearer file-server-secret');
      expect(mockGetClerkToken).not.toHaveBeenCalled();
    });

    it('sends no auth header when authType is none', async () => {
      fetchMock.mockResolvedValue(okResponse());

      await fetchFileFromServer({ ...config, authType: 'none' }, '/amm/a.pdf');

      expect(authHeaderFromFetch(fetchMock)).toBeUndefined();
      expect(mockGetClerkToken).not.toHaveBeenCalled();
    });

    it('still mentions CORS when a cross-origin request fails', async () => {
      mockGetServerCredential.mockResolvedValue('file-server-secret');
      fetchMock.mockRejectedValue(new TypeError('network error'));

      await expect(fetchFileFromServer(config, '/amm/a.pdf')).rejects.toThrow(/CORS/);
    });
  });
});
