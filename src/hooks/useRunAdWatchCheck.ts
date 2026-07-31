import { useCallback, useState } from 'react';
import { useConvex, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { checkAircraftForAds } from '../services/adWatchService';

type AircraftStatusRow = {
  recordId: string;
  tailNumber: string;
  make?: string;
  model?: string;
  serial?: string;
};

/** Injectable seam so the loop can be unit-tested without a Convex client. */
export interface RunAdWatchCheckDeps {
  listAircraft: () => Promise<AircraftStatusRow[]>;
  discoverForAircraft: typeof checkAircraftForAds;
  upsertFindings: (args: {
    aircraftId: string;
    findings: Awaited<ReturnType<typeof checkAircraftForAds>>;
  }) => Promise<{ inserted: number }>;
  onProgress?: (message: string) => void;
}

/**
 * Walks every active aircraft in the project, web-searches for ADs that may
 * apply, and upserts the drafts. Returns a human-readable summary — the same
 * string both the dashboard card and the Fleet monitoring tab display.
 */
export async function runAdWatchCheck(deps: RunAdWatchCheckDeps): Promise<string> {
  const aircraft = await deps.listAircraft();
  if (aircraft.length === 0) {
    return 'No active aircraft in this project — add aircraft in Fleet first.';
  }
  let totalNew = 0;
  for (const [index, a] of aircraft.entries()) {
    deps.onProgress?.(`Checking ${a.tailNumber} (${index + 1}/${aircraft.length})…`);
    const drafts = await deps.discoverForAircraft({
      tailNumber: a.tailNumber,
      make: a.make,
      model: a.model,
      serial: a.serial,
    });
    if (drafts.length > 0) {
      const result = await deps.upsertFindings({ aircraftId: a.recordId, findings: drafts });
      totalNew += result.inserted;
    }
  }
  return totalNew > 0
    ? `Check complete — ${totalNew} new potential AD${totalNew === 1 ? '' : 's'} to review.`
    : 'Check complete — no new ADs found for this fleet.';
}

/**
 * Wires `runAdWatchCheck` to Convex. Shared by the dashboard AD/SB card and the
 * Fleet monitoring tab so both run an identical check.
 */
export function useRunAdWatchCheck(projectId: string) {
  const convex = useConvex();
  const upsertFindings = useMutation(api.adWatch.upsertFindings);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const run = useCallback(async () => {
    setChecking(true);
    setProgress(null);
    try {
      const summary = await runAdWatchCheck({
        listAircraft: () =>
          convex.query(api.askTools.aircraftStatus, {
            projectId: projectId as Id<'projects'>,
          }) as Promise<AircraftStatusRow[]>,
        discoverForAircraft: checkAircraftForAds,
        upsertFindings: ({ aircraftId, findings }) =>
          upsertFindings({
            projectId: projectId as never,
            aircraftId: aircraftId as never,
            findings,
          }) as Promise<{ inserted: number }>,
        onProgress: setProgress,
      });
      setProgress(summary);
    } catch (err) {
      setProgress(err instanceof Error ? err.message : 'AD check failed.');
    } finally {
      setChecking(false);
    }
  }, [convex, projectId, upsertFindings]);

  return { run, checking, progress };
}
