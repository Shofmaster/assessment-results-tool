import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROJECT_HINT_HEADER,
  authedJsonHeaders,
  setActiveProjectIdGetter,
  setClerkTokenGetter,
} from '../../services/authToken';

vi.mock('../../services/sentry', () => ({ captureMessage: vi.fn() }));

/**
 * The bridge that lets plain service modules attach auth to proxy requests.
 *
 * The project hint is the interesting half: it is what lets the server bill the
 * company that owns the project you are working in, and it rides on this header
 * rather than in four request bodies. Nothing else asserts it is actually sent.
 */
beforeEach(() => {
  setClerkTokenGetter(null);
  setActiveProjectIdGetter(null);
});

afterEach(() => {
  setClerkTokenGetter(null);
  setActiveProjectIdGetter(null);
});

describe('authedJsonHeaders', () => {
  it('always sets Content-Type', async () => {
    expect(await authedJsonHeaders()).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('attaches the bearer token when a getter is registered', async () => {
    setClerkTokenGetter(async () => 'jwt-abc');
    expect((await authedJsonHeaders()).Authorization).toBe('Bearer jwt-abc');
  });

  it('omits Authorization when signed out', async () => {
    setClerkTokenGetter(async () => null);
    expect(await authedJsonHeaders()).not.toHaveProperty('Authorization');
  });

  it('forces a fresh token when asked', async () => {
    const getter = vi.fn(async () => 'jwt-abc');
    setClerkTokenGetter(getter);
    await authedJsonHeaders({ forceRefresh: true });
    expect(getter).toHaveBeenCalledWith({ skipCache: true });
  });
});

describe('the project hint header', () => {
  it('is sent when a project is active', async () => {
    setActiveProjectIdGetter(() => 'proj_123');
    expect((await authedJsonHeaders())[PROJECT_HINT_HEADER]).toBe('proj_123');
  });

  it('is absent when no getter is registered', async () => {
    expect(await authedJsonHeaders()).not.toHaveProperty(PROJECT_HINT_HEADER);
  });

  it.each([
    ['null', null],
    ['empty', ''],
    ['whitespace only', '   '],
  ])('is absent when the active project is %s', async (_label, value) => {
    // An empty header is worse than none: it would be sent, parsed, and dropped
    // server-side for no reason.
    setActiveProjectIdGetter(() => value as unknown as string);
    expect(await authedJsonHeaders()).not.toHaveProperty(PROJECT_HINT_HEADER);
  });

  it('is trimmed', async () => {
    setActiveProjectIdGetter(() => '  proj_123  ');
    expect((await authedJsonHeaders())[PROJECT_HINT_HEADER]).toBe('proj_123');
  });

  it('never fails the request when the getter throws', async () => {
    // A billing HINT must not be able to break an AI call.
    setClerkTokenGetter(async () => 'jwt-abc');
    setActiveProjectIdGetter(() => {
      throw new Error('store not ready');
    });
    const headers = await authedJsonHeaders();
    expect(headers.Authorization).toBe('Bearer jwt-abc');
    expect(headers).not.toHaveProperty(PROJECT_HINT_HEADER);
  });

  it('rides alongside the bearer token, not instead of it', async () => {
    setClerkTokenGetter(async () => 'jwt-abc');
    setActiveProjectIdGetter(() => 'proj_123');
    const headers = await authedJsonHeaders();
    expect(headers.Authorization).toBe('Bearer jwt-abc');
    expect(headers[PROJECT_HINT_HEADER]).toBe('proj_123');
  });
});

describe('client and server agree on the header name', () => {
  /**
   * Read the api/ constant statically rather than importing it: that module
   * pulls in the whole credential resolver, which has no business loading in a
   * jsdom test. A rename on one side only would fail silently - the server
   * would simply never see a hint and would quietly bill the wrong company.
   */
  function serverHeaderName(): string {
    const src = readFileSync(
      resolve(__dirname, '../../../api/_lib/aiCredentials.ts'),
      'utf8',
    );
    const match = src.match(/export const PROJECT_HINT_HEADER = '([^']+)'/);
    if (!match) throw new Error('api/_lib/aiCredentials.ts no longer exports PROJECT_HINT_HEADER');
    return match[1];
  }

  it('matches case-insensitively, which is all HTTP guarantees', () => {
    expect(PROJECT_HINT_HEADER.toLowerCase()).toBe(serverHeaderName().toLowerCase());
  });

  it('the server side is lowercase, as Node normalises incoming headers', () => {
    const name = serverHeaderName();
    expect(name).toBe(name.toLowerCase());
  });

  it('is allow-listed for CORS, or cross-origin preflight would block it', () => {
    const cors = readFileSync(resolve(__dirname, '../../../api/_lib/cors.ts'), 'utf8');
    expect(cors.toLowerCase()).toContain(PROJECT_HINT_HEADER.toLowerCase());
  });
});
