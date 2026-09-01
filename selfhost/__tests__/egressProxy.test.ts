import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { connect as tcpConnect } from 'node:net';
import { getGlobalDispatcher, setGlobalDispatcher, type Dispatcher } from 'undici';
import { configureEgressProxy, redactProxyUrl } from '../server/src/egressProxy.js';

/**
 * These tests exist because the bug they cover was invisible: setting
 * HTTPS_PROXY appears to work, produces no error, and silently does nothing,
 * while the operator believes vendor traffic is being inspected.
 *
 * So asserting "we called setGlobalDispatcher" would be worthless — it is
 * exactly the kind of check that passes while the feature is broken. Instead a
 * real proxy is started and we assert it actually received the request.
 */

/**
 * Minimal forward proxy.
 *
 * undici's proxy support tunnels with CONNECT even for plain-HTTP targets, so a
 * proxy that only handles ordinary requests never answers and the client hangs.
 * That is a real deployment constraint, not a test artifact: a corporate proxy
 * that forbids CONNECT to the vendor APIs will hang this app the same way.
 */
function startProxy(): Promise<{ server: Server; url: string; connects: string[] }> {
  const connects: string[] = [];
  const server = createServer((_req, res) => {
    // Non-CONNECT requests are not part of undici's proxy path; answer anyway
    // so an unexpected one surfaces as a wrong body rather than a hang.
    res.writeHead(400).end('expected CONNECT');
  });

  server.on('connect', (req, clientSocket, head) => {
    connects.push(req.url || '');
    const [host, port] = (req.url || '').split(':');
    const upstream = tcpConnect(Number(port || 80), host, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    const destroy = () => {
      upstream.destroy();
      clientSocket.destroy();
    };
    upstream.on('error', destroy);
    clientSocket.on('error', destroy);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, url: `http://127.0.0.1:${port}`, connects });
    });
  });
}

/** Ordinary origin server, standing in for a vendor API. */
function startOrigin(): Promise<{ server: Server; url: string; hits: number }> {
  const state = { hits: 0 };
  const server = createServer((_req, res) => {
    state.hits += 1;
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('direct');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({
        server,
        url: `http://127.0.0.1:${port}`,
        get hits() {
          return state.hits;
        },
      } as { server: Server; url: string; hits: number });
    });
  });
}

const close = (server: Server) => new Promise<void>((resolve) => server.close(() => resolve()));

const PROXY_ENV = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy'];

describe('configureEgressProxy', () => {
  let saved: Record<string, string | undefined> = {};
  let originalDispatcher: Dispatcher;

  beforeEach(() => {
    saved = {};
    for (const key of PROXY_ENV) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    originalDispatcher = getGlobalDispatcher();
  });

  afterEach(() => {
    for (const key of PROXY_ENV) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    // The dispatcher is process-global; leaking it would silently reroute every
    // later test's network calls.
    setGlobalDispatcher(originalDispatcher);
  });

  it('is a no-op when no proxy is configured', () => {
    const result = configureEgressProxy();
    expect(result.enabled).toBe(false);
    expect(getGlobalDispatcher()).toBe(originalDispatcher);
  });

  it('actually routes fetch through the proxy — not just sets a flag', async () => {
    const proxy = await startProxy();
    const origin = await startOrigin();
    try {
      process.env.HTTP_PROXY = proxy.url;
      process.env.HTTPS_PROXY = proxy.url;

      const result = configureEgressProxy();
      expect(result.enabled).toBe(true);

      const res = await fetch(`${origin.url}/v1/messages`);
      const body = await res.text();

      // Proof of routing: the proxy was asked to open a tunnel to the origin's
      // host:port. The origin is still reached — through the tunnel — so a
      // successful body alone would prove nothing.
      const originPort = new URL(origin.url).port;
      expect(proxy.connects).toContain(`127.0.0.1:${originPort}`);
      expect(body).toBe('direct');
    } finally {
      await close(proxy.server);
      await close(origin.server);
    }
  });

  it('honours NO_PROXY so internal stack traffic bypasses the proxy', async () => {
    const proxy = await startProxy();
    const origin = await startOrigin();
    try {
      process.env.HTTP_PROXY = proxy.url;
      process.env.HTTPS_PROXY = proxy.url;
      // Without this, calls to the convex and postgres containers would be sent
      // to a corporate proxy that cannot resolve them.
      process.env.NO_PROXY = '127.0.0.1,localhost';

      configureEgressProxy();

      const res = await fetch(`${origin.url}/internal`);
      expect(await res.text()).toBe('direct');
      expect(origin.hits).toBe(1);
      // The proxy was never involved.
      expect(proxy.connects).toHaveLength(0);
    } finally {
      await close(proxy.server);
      await close(origin.server);
    }
  });

  it('refuses a malformed proxy URL rather than silently ignoring it', () => {
    process.env.HTTPS_PROXY = 'not a url';
    expect(() => configureEgressProxy()).toThrow(/not a usable proxy URL/i);
  });

  it('refuses an unsupported proxy protocol', () => {
    process.env.HTTPS_PROXY = 'socks5://proxy.internal:1080';
    expect(() => configureEgressProxy()).toThrow(/unsupported protocol/i);
  });
});

describe('redactProxyUrl', () => {
  it('strips embedded credentials', () => {
    const redacted = redactProxyUrl('http://user:s3cret@proxy.internal:3128');
    expect(redacted).not.toContain('s3cret');
    expect(redacted).not.toContain('user');
    expect(redacted).toContain('proxy.internal:3128');
  });

  it('leaves a credential-free URL readable', () => {
    expect(redactProxyUrl('http://proxy.internal:3128')).toContain('proxy.internal:3128');
  });

  it('does not throw on an unparseable value', () => {
    expect(redactProxyUrl('nonsense')).toBe('(unparseable)');
  });
});
