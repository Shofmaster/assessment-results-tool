import { describe, it, expect } from 'vitest';
import { buildLifecycleTimeline } from '../../utils/lifecycleTimeline';

const EMPTY = { entries: [], components: [], discrepancies: [], form337s: [] };

describe('buildLifecycleTimeline', () => {
  it('returns no groups for empty input', () => {
    expect(buildLifecycleTimeline(EMPTY)).toEqual([]);
  });

  it('merges all four sources reverse-chronologically and groups by year', () => {
    const groups = buildLifecycleTimeline({
      entries: [
        { recordId: 'e1', entryDate: '2025-11-02', entryType: 'maintenance', workPerformed: 'Replaced ELT battery', totalTimeAtEntry: 1100.5, signerName: 'J. Smith' },
        { recordId: 'e2', entryDate: '2026-04-15', entryType: 'inspection', inspectionType: 'annual' },
      ],
      components: [
        { recordId: 'c1', description: 'Main battery', partNumber: 'PN-1', installDate: '2025-11-02', isLifeLimited: true },
        { recordId: 'c2', description: 'Old battery', partNumber: 'PN-0', removeDate: '2025-11-02', status: 'scrapped' },
      ],
      discrepancies: [
        { recordId: 'd1', description: 'Hydraulic leak', status: 'open', discoveredAt: '2026-01-20T14:00:00Z' },
      ],
      form337s: [{ recordId: 'f1', title: 'Avionics alteration', status: 'ready_for_review', createdAt: '2024-06-01T00:00:00Z' }],
    });

    expect(groups.map((g) => g.year)).toEqual(['2026', '2025', '2024']);
    expect(groups[0].events.map((e) => e.kind)).toEqual(['inspection', 'discrepancy']);
    expect(groups[1].events).toHaveLength(3); // entry + install + removal on 2025-11-02
    expect(groups[2].events[0]).toMatchObject({ kind: 'form_337', route: '/form-337' });
  });

  it('maps entry types to kinds and builds badges', () => {
    const groups = buildLifecycleTimeline({
      ...EMPTY,
      entries: [
        { recordId: 'e1', entryDate: '2026-02-01', entryType: 'ad_compliance', workPerformed: 'AD complied', adReferences: ['2026-04-05'], totalTimeAtEntry: 900, ataChapter: '32' },
      ],
    });
    const event = groups[0].events[0];
    expect(event.kind).toBe('ad_compliance');
    expect(event.detail).toBe('2026-04-05');
    expect(event.badges).toEqual(['900 TT', 'ATA 32']);
  });

  it('emits separate install and removal events for a swapped component', () => {
    const groups = buildLifecycleTimeline({
      ...EMPTY,
      components: [
        { recordId: 'c1', description: 'Starter', partNumber: 'PN-9', serialNumber: '123', installDate: '2025-01-10', removeDate: '2026-03-01', status: 'removed' },
      ],
    });
    const kinds = groups.flatMap((g) => g.events.map((e) => e.kind));
    expect(kinds).toEqual(['component_removed', 'component_installed']);
  });

  it('collects undated events into a trailing group instead of dropping them', () => {
    const groups = buildLifecycleTimeline({
      ...EMPTY,
      entries: [
        { recordId: 'e1', entryDate: '2026-01-01', workPerformed: 'Dated' },
        { recordId: 'e2', workPerformed: 'No date on this scan' },
      ],
    });
    expect(groups.map((g) => g.year)).toEqual(['2026', 'undated']);
    expect(groups[1].events[0].title).toContain('No date');
  });

  it('truncates timestamps to date-only', () => {
    const groups = buildLifecycleTimeline({
      ...EMPTY,
      discrepancies: [{ recordId: 'd1', description: 'X', discoveredAt: '2026-05-05T10:30:00.000Z' }],
    });
    expect(groups[0].events[0].date).toBe('2026-05-05');
  });
});
