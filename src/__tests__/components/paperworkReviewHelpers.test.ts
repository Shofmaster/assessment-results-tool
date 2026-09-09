import { describe, it, expect } from 'vitest';
import {
  buildReferenceOptionGroups,
  referenceOptionValue,
  type ReferenceEntry,
} from '../../components/paperwork/paperworkReviewHelpers';

const doc = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  _id: id,
  name,
  ...extra,
});

const projectRefs = [doc('p1', 'GMM Rev 4'), doc('p2', 'Quality Control Manual')];
const kbDocs = [doc('k1', 'FAA Order 8900.1', { agentId: 'faa-inspector' })];
const sharedGroups = [
  { typeId: 'isbao-standards', docs: [doc('s1', 'IS-BAO Protocols')] },
  { typeId: 'part-145-manual', docs: [doc('s2', 'Sample RSM')] },
];

const build = (entries: ReferenceEntry[] = [], filter = '') =>
  buildReferenceOptionGroups({ projectRefs, kbDocs, sharedGroups, entries, filter });

describe('buildReferenceOptionGroups', () => {
  it('groups options in display order with readable labels', () => {
    const groups = build();
    expect(groups.map((g) => [g.key, g.label, g.source])).toEqual([
      ['project', 'Project reference documents', 'project'],
      ['kb', 'Knowledge Base', 'kb'],
      ['shared:isbao-standards', 'IS-BAO Standards', 'shared'],
      ['shared:part-145-manual', 'Part 145 Repair Station Manual', 'shared'],
    ]);
  });

  it('drops already-selected project and shared docs', () => {
    const groups = build([
      { source: 'project', id: 'p1' },
      { source: 'shared', id: 's1' },
    ]);
    expect(groups.find((g) => g.key === 'project')?.docs.map((d) => d._id)).toEqual(['p2']);
    expect(groups.find((g) => g.key === 'shared:isbao-standards')).toBeUndefined();
    expect(groups.find((g) => g.key === 'shared:part-145-manual')?.docs.map((d) => d._id)).toEqual([
      's2',
    ]);
  });

  it('keeps Knowledge Base rows visible so the caller can render them checked', () => {
    // A KB pick becomes a project doc with a new id; the KB row itself must stay in the list.
    const groups = build([{ source: 'project', id: 'copy-of-k1' }]);
    expect(groups.find((g) => g.key === 'kb')?.docs.map((d) => d._id)).toEqual(['k1']);
  });

  it('filters by document name, case-insensitively and trimmed, across every group', () => {
    // Matches the project doc by name only — the "Part 145 Repair Station Manual" *label* is not
    // searched, so its "Sample RSM" doc drops out.
    const groups = build([], '  MaNuAl  ');
    expect(groups.map((g) => g.key)).toEqual(['project']);
    expect(groups[0].docs.map((d) => d.name)).toEqual(['Quality Control Manual']);
  });

  it('matches shared and knowledge-base docs by name too', () => {
    expect(build([], 'is-bao').map((g) => g.key)).toEqual(['shared:isbao-standards']);
    expect(build([], '8900').map((g) => g.key)).toEqual(['kb']);
  });

  it('omits groups that filter down to nothing and returns [] when nothing matches', () => {
    expect(build([], 'zzz-no-match')).toEqual([]);
  });

  it('falls back to the raw type id when a shared type has no label', () => {
    const groups = buildReferenceOptionGroups({
      projectRefs: [],
      kbDocs: [],
      sharedGroups: [{ typeId: 'brand-new-type', docs: [doc('s9', 'Mystery doc')] }],
      entries: [],
      filter: '',
    });
    expect(groups[0].label).toBe('brand-new-type');
  });
});

describe('referenceOptionValue', () => {
  it('encodes the value that addReference decodes', () => {
    expect(referenceOptionValue('project', 'p1')).toBe('p1');
    expect(referenceOptionValue('kb', 'k1')).toBe('kb:k1');
    expect(referenceOptionValue('shared', 's1')).toBe('shared:s1');
  });
});
