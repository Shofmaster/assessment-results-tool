import { describe, expect, it } from 'vitest';
import { insertProjectBundleContents } from '../lib/projectBundleOps';

/** Just enough of MutationCtx for the insert path: records every insert. */
function fakeCtx() {
  const inserts: Array<{ table: string; doc: Record<string, unknown> }> = [];
  const ctx = {
    db: {
      insert: async (table: string, doc: Record<string, unknown>) => {
        inserts.push({ table, doc });
        return `${table}:${inserts.length}`;
      },
    },
  };
  return { ctx: ctx as any, inserts };
}

const issue = (source: unknown, title: string) => ({
  source,
  title,
  description: 'd',
  severity: 'minor',
  status: 'in_progress',
  carNumber: 'CAR-2026-001',
  owner: 'QA',
  correctiveAction: 'Removed from service',
});

describe('insertProjectBundleContents: CARs / entity issues', () => {
  it('keeps manually entered and logbook-compliance CARs with their source', async () => {
    const { ctx, inserts } = fakeCtx();
    const counts = await insertProjectBundleContents(ctx, {
      projectId: 'projects:1' as any,
      userId: 'user_1',
      bundle: {
        entityIssues: [
          issue('manual', 'Manual CAR'),
          issue('logbook_compliance', 'Logbook CAR'),
          issue('audit_sim', 'Sim CAR'),
        ],
      },
      now: '2026-11-09T00:00:00.000Z',
    });

    expect(counts.entityIssues).toBe(3);
    const issues = inserts.filter((i) => i.table === 'entityIssues').map((i) => i.doc);
    expect(issues.map((i) => [i.title, i.source])).toEqual([
      ['Manual CAR', 'manual'],
      ['Logbook CAR', 'logbook_compliance'],
      ['Sim CAR', 'audit_sim'],
    ]);
    expect(issues[0]).toMatchObject({
      projectId: 'projects:1',
      status: 'in_progress',
      owner: 'QA',
      correctiveAction: 'Removed from service',
    });
  });

  it('maps an unknown source to analysis instead of failing the import', async () => {
    const { ctx, inserts } = fakeCtx();
    await insertProjectBundleContents(ctx, {
      projectId: 'projects:1' as any,
      userId: 'user_1',
      bundle: { entityIssues: [issue('something_new', 'Future CAR')] },
    });
    expect(inserts[0].doc.source).toBe('analysis');
  });
});
