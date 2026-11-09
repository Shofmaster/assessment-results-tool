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
    'userSync:exportCompanyMembers': () => ({ members: [], invites: [] }),
    'userSync:inviteFromDesktop': (args) => ({
      results: (args.invitees as Array<{ email: string }>).map((i) => ({ email: i.email, outcome: 'invited' })),
    }),
    ...overrides,
  };
  const call = (kind: string) =>
    vi.fn(async (ref: Parameters<typeof getFunctionName>[0], args: unknown) => {
      tokens.push(token);
      const name = getFunctionName(ref);
      const handler = handlers[name];
      if (!handler) throw new Error(`unexpected hosted ${kind} ${name}`);
      return handler(args as Record<string, unknown>) as never;
    });
  const hosted: HostedConvexLike = {
    setAuth: (t) => {
      token = t;
    },
    query: call('query') as unknown as HostedConvexLike['query'],
    mutation: call('mutation') as unknown as HostedConvexLike['mutation'],
  };
  return { hosted, tokens };
}

type LocalOnly = Array<{
  companyOriginId: string;
  companyName: string;
  invitees: Array<{ email: string; name?: string; role: string }>;
}>;

/** A fake local deployment that remembers what was applied, by origin id. */
function fakeLocal(
  known: {
    companies?: Array<{ originId: string; contentHash: string }>;
    projects?: Array<{ originId: string; contentHash: string }>;
    localOnly?: LocalOnly;
  } = {},
) {
  const applied: Array<{ fn: string; args: Record<string, unknown> }> = [];
  /** userSync calls, kept apart so the bundle assertions stay about bundles. */
  const people: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const local: LocalConvexLike = {
    query: vi.fn(async (ref) => {
      if (getFunctionName(ref) === 'userSync:localOnlyMembers') return (known.localOnly ?? []) as never;
      if (getFunctionName(ref) !== 'mirror:status') throw new Error('unexpected local query');
      return {
        companies: (known.companies ?? []).map((c) => ({ ...c, name: c.originId, syncedAt: 'x' })),
        projects: (known.projects ?? []).map((p) => ({ ...p, name: p.originId, syncedAt: 'x' })),
      } as never;
    }) as LocalConvexLike['query'],
    mutation: vi.fn(async (ref, args) => {
      const fn = getFunctionName(ref);
      if (fn === 'userSync:applyCompanyMembers') {
        people.push({ fn, args: args as Record<string, unknown> });
        const n = (args as { members: unknown[] }).members.length;
        return { members: n, usersCreated: n, memberships: n, linked: n > 0 ? 1 : 0, removed: 0 } as never;
      }
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
  return { local, applied, people };
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
    // list, company, company members, two projects.
    expect(tokens).toEqual(['tok-1', 'tok-2', 'tok-3', 'tok-4', 'tok-5']);
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

describe('runHostedMirror - people', () => {
  const alice = { subject: 'user_alice', email: 'alice@acme.aero', name: 'Alice', role: 'company_manager' as const };
  const bob = { email: 'bob@acme.aero', name: 'Bob', role: 'company_user' };
  const bobOnly: LocalOnly = [{ companyOriginId: 'co_1', companyName: 'Acme Aero', invitees: [bob] }];
  const calledNames = (fn: unknown) =>
    (fn as ReturnType<typeof vi.fn>).mock.calls.map(([ref]) => getFunctionName(ref));

  it('remembers the hosted members of each copied company on this computer', async () => {
    const { hosted } = fakeHosted({
      'userSync:exportCompanyMembers': () => ({ members: [alice], invites: [] }),
    });
    const { local, people } = fakeLocal();

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    expect(people).toEqual([
      { fn: 'userSync:applyCompanyMembers', args: { origin: ORIGIN, companyOriginId: 'co_1', members: [alice] } },
    ]);
    expect(summary.people).toMatchObject({ remembered: 1, linked: 1, failed: 0 });
    expect(summary.errors).toEqual([]);
  });

  it('skips the people of a company that failed to copy', async () => {
    const { hosted } = fakeHosted({
      'mirror:exportCompany': () => {
        throw new Error('forbidden');
      },
    });
    const { local, people } = fakeLocal({ localOnly: bobOnly });

    await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    expect(people).toEqual([]);
    expect(calledNames(hosted.query)).not.toContain('userSync:exportCompanyMembers');
    expect(hosted.mutation).not.toHaveBeenCalled();
  });

  it('invites people who exist only on this computer where the account is a hosted company admin', async () => {
    const { hosted } = fakeHosted();
    const { local } = fakeLocal({ localOnly: bobOnly });

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    const calls = (hosted.mutation as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(1);
    expect(getFunctionName(calls[0][0])).toBe('userSync:inviteFromDesktop');
    expect(calls[0][1]).toEqual({ companyId: 'co_1', invitees: [bob] });
    expect(summary.people).toMatchObject({ invited: 1, added: 0 });
    expect(mirrorChangedSomething(summary)).toBe(true);
  });

  it('sends nothing for a company the account does not administer online', async () => {
    const { hosted } = fakeHosted({
      'mirror:listMirrorable': () => ({
        companies: [{ id: 'co_1', name: 'Acme Aero', role: 'company_user', projects: [] }],
        personalProjects: [],
      }),
    });
    const { local } = fakeLocal({ localOnly: bobOnly });

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    expect(hosted.mutation).not.toHaveBeenCalled();
    expect(calledNames(local.query)).not.toContain('userSync:localOnlyMembers');
    expect(summary.people).toMatchObject({ invited: 0 });
  });

  it('counts invitations already waiting without calling them a change', async () => {
    const { hosted } = fakeHosted({
      'userSync:inviteFromDesktop': (args) => ({
        results: (args.invitees as Array<{ email: string }>).map((i) => ({ email: i.email, outcome: 'already_invited' })),
      }),
    });
    const { local } = fakeLocal({
      companies: [{ originId: 'co_1', contentHash: await hashBundle(companyBundle('Acme Aero')) }],
      projects: [
        { originId: 'pr_1', contentHash: await hashBundle(projectBundle('Q3 audit')) },
        { originId: 'pr_2', contentHash: await hashBundle(projectBundle('Scratch')) },
      ],
      localOnly: bobOnly,
    });

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    expect(summary.people).toMatchObject({ awaiting: 1, invited: 0 });
    expect(mirrorChangedSomething(summary)).toBe(false);
  });

  it('reports a refused invitation and carries on', async () => {
    const refusal = 'Not authorized: required company role for this action.';
    const { hosted } = fakeHosted({
      'userSync:inviteFromDesktop': () => {
        throw new Error(refusal);
      },
    });
    const { local } = fakeLocal({ localOnly: bobOnly });

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    expect(summary.people).toMatchObject({ failed: 1 });
    expect(summary.errors).toEqual([{ scope: 'invite', name: 'Acme Aero', message: refusal }]);
    expect(summary.projects.failed).toBe(0);
  });

  it('splits a large invite list into calls the hosted side accepts', async () => {
    const { hosted } = fakeHosted();
    const many = Array.from({ length: 120 }, (_, i) => ({ email: `p${i}@acme.aero`, role: 'company_user' }));
    const { local } = fakeLocal({ localOnly: [{ companyOriginId: 'co_1', companyName: 'Acme Aero', invitees: many }] });

    const summary = await runHostedMirror({ local, hosted, origin: ORIGIN, getToken: async () => 't' });

    const sizes = (hosted.mutation as ReturnType<typeof vi.fn>).mock.calls.map(
      ([, args]) => (args as { invitees: unknown[] }).invitees.length,
    );
    expect(sizes).toEqual([50, 50, 20]);
    expect(summary.people?.invited).toBe(120);
  });
});
