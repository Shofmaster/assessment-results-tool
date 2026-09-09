import { describe, it, expect, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
import {
  hashBundle,
  mirrorChangedSomething,
  runHostedMirror,
  stableStringify,
  type HostedConvexLike,
  type LocalConvexLike,
} from '../../services/hostedMirror';

const ORIGIN = 'https://hosted.example.convex.cloud';

const companyBundle = (name: string, extra: Record<string, unknown> = {}) => ({
  format: 'aerogap-org-bundle',
  version: 1,
  exportedAt: new Date().toISOString(),
  company: { name, ...extra },
  members: [],
  projectRoster: [],
  auditSettings: null,
  certificates: [],
  ratings: [],
});
const projectBundle = (name: string) => ({
  format: 'aerogap-project-bundle',
  version: 1,
  exportedAt: new Date().toISOString(),
  project: { name },
  assessments: [],
  documents: [],
  analyses: [],
  simulations: [],
  findings: [],
});

/**
 * A fake hosted deployment: one company with one project, plus one personal
 * project. Records the token it was given per request so token refresh can be
 * asserted.
 */
function fakeHosted(overrides: Partial<Record<string, (args: Record<string, unknown>) => unknown>> = {}) {
  const tokens: string[] = [];
  let token = '';
  const handlers: Record<string, (args: Record<string, unknown>) => unknown> = {
    'mirror:listMirrorable': () => ({
      companies: [
        { id: 'co_1', name: 'Acme Aero', role: 'company_admin', projects: [{ id: 'pr_1', name: 'Q3 audit' }] },
      ],
      personalProjects: [{ id: 'pr_2', name: 'Scratch' }],
    }),
    'mirror:exportCompany': () => companyBundle('Acme Aero'),
    'mirror:exportProject': (args) => projectBundle(args.projectId === 'pr_1' ? 'Q3 audit' : 'Scratch'),
    ...overrides,
  };
  const hosted: HostedConvexLike = {
    setAuth: (t) => {
      token = t;
    },
    query: vi.fn(async (ref, args) => {
      tokens.push(token);
      const name = getFunctionName(ref);
      const handler = handlers[name];
      if (!handler) throw new Error(`unexpected hosted query ${name}`);
      return handler(args as Record<string, unknown>) as never;
    }) as HostedConvexLike['query'],
  };
  return { hosted, tokens };
}

/** A fake local deployment that remembers what was applied, by origin id. */
function fakeLocal(known: { companies?: Array<{ originId: string; contentHash: string }>; projects?: Array<{ originId: string; contentHash: string }> } = {}) {
  const applied: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const local: LocalConvexLike = {
    query: vi.fn(async (ref) => {
      if (getFunctionName(ref) !== 'mirror:status') throw new Error('unexpected local query');
      return {
        companies: (known.companies ?? []).map((c) => ({ ...c, name: c.originId, syncedAt: 'x' })),
        projects: (known.projects ?? []).map((p) => ({ ...p, name: p.originId, syncedAt: 'x' })),
      } as never;
    }) as LocalConvexLike['query'],
    mutation: vi.fn(async (ref, args) => {
      const fn = getFunctionName(ref);
      applied.push({ fn, args: args as Record<string, unknown> });
      if (fn === 'mirror:applyCompany') {
        return { skipped: false, created: true, companyId: 'local_co', counts: {} } as never;
      }
      if (fn === 'mirror:applyProject') {
        return { skipped: false, created: false, projectId: 'local_pr', counts: {} } as never;
      }
      throw new Error(`unexpected local mutation ${fn}`);
    }) as LocalConvexLike['mutation'],
  };
  return { local, applied };
}

describe('stableStringify / hashBundle', () => {
  it('is independent of key order and ignores undefined', () => {
    expect(stableStringify({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe(
      stableStringify({ a: { d: [1, { y: 2, z: 1 }] }, b: 1 }),
    );
  });

  it('hashes content only - exportedAt does not count', async () => {
    const a = companyBundle('Acme');
    const b = { ...companyBundle('Acme'), exportedAt: '1999-01-01T00:00:00.000Z' };
    expect(await hashBundle(a)).toBe(await hashBundle(b));
    expect(await hashBundle(companyBundle('Acme', { city: 'Wichita' }))).not.toBe(await hashBundle(a));
    expect(await hashBundle(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('runHostedMirror', () => {
  it('pulls every company and project of the account and applies them locally', async () => {
    const { hosted, tokens } = fakeHosted();
    const { local, applied } = fakeLocal();
    let calls = 0;
    const progress: string[] = [];

    const summary = await runHostedMirror({
      local,
      hosted,
      origin: ORIGIN,
      getToken: async () => `tok-${++calls}`,
      onProgress: (p) => progress.push(p.phase),
    });

    expect(summary.errors).toEqual([]);
    expect(summary.companies).toEqual({ total: 1, created: 1, updated: 0, unchanged: 0, failed: 0 });
    expect(summary.projects).toEqual({ total: 2, created: 0, updated: 2, unchanged: 0, failed: 0 });

    expect(applied.map((a) => a.fn)).toEqual([
      'mirror:applyCompany',
      'mirror:applyProject',
      'mirror:applyProject',
    ]);
    expect(applied[0].args).toMatchObject({ origin: ORIGIN, originId: 'co_1', role: 'company_admin' });
    expect(applied[0].args.contentHash).toMatch(/^[0-9a-f]{64}$/);
    // The company's project carries the company link; the personal one does not.
    expect(applied[1].args).toMatchObject({ originId: 'pr_1', companyOriginId: 'co_1' });
    expect(applied[2].args).toMatchObject({ originId: 'pr_2' });
    expect(applied[2].args.companyOriginId).toBeUndefined();

    // A fresh token before EVERY hosted request (they are short-lived).
    expect(tokens).toEqual(['tok-1', 'tok-2', 'tok-3', 'tok-4']);
    expect(progress[0]).toBe('listing');
    expect(progress.at(-1)).toBe('done');
    expect(mirrorChangedSomething(summary)).toBe(true);
  });

  it('does not re-apply a bundle whose content hash is already on this computer', async () => {
    const { hosted } = fakeHosted();
    const coHash = await hashBundle(companyBundle('Acme Aero'));
    const p1Hash = await hashBundle(projectBundle('Q3 audit'));
    const { local, applied } = fakeLocal({
      companies: [{ originId: 'co_1', contentHash: coHash }],
      projects: [{ originId: 'pr_1', contentHash: p1Hash }],
    });

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    expect(summary.companies).toMatchObject({ unchanged: 1, created: 0, updated: 0 });
    expect(summary.projects).toMatchObject({ unchanged: 1, updated: 1 });
    expect(applied.map((a) => a.args.originId)).toEqual(['pr_2']);
    expect(mirrorChangedSomething(summary)).toBe(true);
  });

  it('reports an account that cannot be listed and touches nothing locally', async () => {
    const { hosted } = fakeHosted({
      'mirror:listMirrorable': () => {
        throw new Error('network down');
      },
    });
    const { local, applied } = fakeLocal();

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    expect(summary.errors).toEqual([{ scope: 'list', name: ORIGIN, message: 'network down' }]);
    expect(applied).toEqual([]);
    expect(local.query).not.toHaveBeenCalled();
    expect(mirrorChangedSomething(summary)).toBe(false);
  });

  it('keeps going when one item fails and names it in the summary', async () => {
    const { hosted } = fakeHosted({
      'mirror:exportProject': (args) => {
        if (args.projectId === 'pr_1') throw new Error('forbidden');
        return projectBundle('Scratch');
      },
    });
    const { local, applied } = fakeLocal();

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    expect(summary.projects).toEqual({ total: 2, created: 0, updated: 1, unchanged: 0, failed: 1 });
    expect(summary.errors).toEqual([{ scope: 'project', name: 'Q3 audit', message: 'forbidden' }]);
    expect(applied.map((a) => a.args.originId)).toEqual(['co_1', 'pr_2']);
  });

  it('stops before the first hosted call when there is no token', async () => {
    const { hosted } = fakeHosted();
    const { local, applied } = fakeLocal();

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => null });

    expect(summary.errors[0]).toMatchObject({ scope: 'list' });
    expect(summary.errors[0].message).toMatch(/signed in/i);
    expect(hosted.query).not.toHaveBeenCalled();
    expect(applied).toEqual([]);
  });
});
