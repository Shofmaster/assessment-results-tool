import { describe, expect, it } from 'vitest';
import { aggregateModRequirements } from '../modRequirements';
import { markDuplicates } from '../../services/modificationExtraction';
import type { AircraftModification } from '../../types/aircraftModification';

function makeMod(overrides: Partial<AircraftModification>): AircraftModification {
  return {
    _id: 'mod-1',
    projectId: 'p1',
    userId: 'u1',
    aircraftId: 'a1',
    modType: 'stc',
    title: 'Test mod',
    status: 'installed',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('aggregateModRequirements', () => {
  it('rolls up requirements across installed mods only', () => {
    const rollup = aggregateModRequirements([
      makeMod({
        _id: 'gps',
        title: 'GPS install',
        icaRequirements: [{ description: 'Antenna bond check', interval: '24 months' }],
        afmSupplement: { required: true, reference: 'AFMS 190-01', limitations: ['GPS approaches require RAIM check'] },
        weightBalance: { weightChangeLbs: 10.5 },
        placards: ['GPS LIMITED TO VFR'],
        recurringInspections: [{ description: 'Database currency', interval: 28, intervalUnit: 'calendar_days' }],
      }),
      makeMod({
        _id: 'removed',
        title: 'Removed mod',
        status: 'removed',
        weightBalance: { weightChangeLbs: 100 },
        placards: ['SHOULD NOT APPEAR'],
      }),
      makeMod({ _id: 'ballast', title: 'Ballast', weightBalance: { weightChangeLbs: -3.25 } }),
    ]);

    expect(rollup.counts.installedMods).toBe(2);
    expect(rollup.counts.icaTasks).toBe(1);
    expect(rollup.counts.afmsSupplements).toBe(1);
    expect(rollup.afmsLimitations).toHaveLength(1);
    expect(rollup.counts.placards).toBe(1);
    expect(rollup.counts.recurringInspections).toBe(1);
    expect(rollup.netWeightChangeLbs).toBe(7.25);
    expect(rollup.icaTasks[0].modTitle).toBe('GPS install');
  });

  it('flags AFMS-required mods without a reference', () => {
    const rollup = aggregateModRequirements([
      makeMod({ afmSupplement: { required: true } }),
    ]);
    expect(rollup.afmsSupplements[0].item).toContain('no reference recorded');
  });
});

describe('markDuplicates', () => {
  const existing = [
    { id: 'ex1', modType: 'stc', title: 'Garmin GTN 750 install', approvalRef: 'SA01234NM' },
  ];

  it('matches by normalized approval reference first', () => {
    const [marked] = markDuplicates(
      [{ modType: 'stc', title: 'Different title', approvalRef: 'sa 01234-nm', status: 'installed' }],
      existing,
    );
    expect(marked.dedupeMatch?.existingModId).toBe('ex1');
    expect(marked.dedupeMatch?.reason).toContain('approval reference');
  });

  it('falls back to case-insensitive title match', () => {
    const [marked] = markDuplicates(
      [{ modType: 'stc', title: 'garmin gtn 750 INSTALL', status: 'installed' }],
      existing,
    );
    expect(marked.dedupeMatch?.existingModId).toBe('ex1');
  });

  it('leaves novel mods unflagged', () => {
    const [marked] = markDuplicates(
      [{ modType: 'amoc', title: 'Brand new mod', approvalRef: 'AMOC-77', status: 'installed' }],
      existing,
    );
    expect(marked.dedupeMatch).toBeUndefined();
  });
});
