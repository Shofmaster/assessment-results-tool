import { describe, expect, it, vi } from 'vitest';
import { runAdWatchCheck } from '../../hooks/useRunAdWatchCheck';

const draft = (adNumber: string) => ({ adNumber }) as never;

function deps(overrides: Partial<Parameters<typeof runAdWatchCheck>[0]> = {}) {
  return {
    listAircraft: vi.fn().mockResolvedValue([]),
    discoverForAircraft: vi.fn().mockResolvedValue([]),
    upsertFindings: vi.fn().mockResolvedValue({ inserted: 0 }),
    ...overrides,
  } as Parameters<typeof runAdWatchCheck>[0];
}

describe('runAdWatchCheck', () => {
  it('tells the user where to add aircraft when the project has none', async () => {
    const d = deps();
    await expect(runAdWatchCheck(d)).resolves.toBe(
      'No active aircraft in this project — add aircraft in Fleet first.',
    );
    expect(d.discoverForAircraft).not.toHaveBeenCalled();
  });

  it('searches once per aircraft and sums the inserted counts', async () => {
    const d = deps({
      listAircraft: vi.fn().mockResolvedValue([
        { recordId: 'a1', tailNumber: 'N1AA', make: 'Cessna', model: '172S' },
        { recordId: 'a2', tailNumber: 'N2BB' },
      ]),
      discoverForAircraft: vi.fn().mockResolvedValue([draft('2026-01-01')]),
      upsertFindings: vi
        .fn()
        .mockResolvedValueOnce({ inserted: 2 })
        .mockResolvedValueOnce({ inserted: 1 }),
    });

    await expect(runAdWatchCheck(d)).resolves.toBe(
      'Check complete — 3 new potential ADs to review.',
    );
    expect(d.discoverForAircraft).toHaveBeenCalledTimes(2);
    expect(d.discoverForAircraft).toHaveBeenCalledWith({
      tailNumber: 'N1AA',
      make: 'Cessna',
      model: '172S',
      serial: undefined,
    });
    expect(d.upsertFindings).toHaveBeenCalledWith({
      aircraftId: 'a1',
      findings: [draft('2026-01-01')],
    });
  });

  it('singularizes a lone finding', async () => {
    const d = deps({
      listAircraft: vi.fn().mockResolvedValue([{ recordId: 'a1', tailNumber: 'N1AA' }]),
      discoverForAircraft: vi.fn().mockResolvedValue([draft('2026-01-01')]),
      upsertFindings: vi.fn().mockResolvedValue({ inserted: 1 }),
    });
    await expect(runAdWatchCheck(d)).resolves.toBe(
      'Check complete — 1 new potential AD to review.',
    );
  });

  it('skips the upsert when a search returns nothing', async () => {
    const d = deps({
      listAircraft: vi.fn().mockResolvedValue([{ recordId: 'a1', tailNumber: 'N1AA' }]),
    });
    await expect(runAdWatchCheck(d)).resolves.toBe(
      'Check complete — no new ADs found for this fleet.',
    );
    expect(d.upsertFindings).not.toHaveBeenCalled();
  });

  it('reports progress per tail', async () => {
    const onProgress = vi.fn();
    const d = deps({
      listAircraft: vi
        .fn()
        .mockResolvedValue([
          { recordId: 'a1', tailNumber: 'N1AA' },
          { recordId: 'a2', tailNumber: 'N2BB' },
        ]),
      onProgress,
    });
    await runAdWatchCheck(d);
    expect(onProgress).toHaveBeenNthCalledWith(1, 'Checking N1AA (1/2)…');
    expect(onProgress).toHaveBeenNthCalledWith(2, 'Checking N2BB (2/2)…');
  });
});
