import { useState } from 'react';
import { Link } from 'react-router';
import { FiExternalLink, FiHelpCircle, FiRefreshCw, FiSearch, FiShield } from 'react-icons/fi';
import { api } from '../../../convex/_generated/api';
import { FEATURE_KEYS } from '../../config/featureKeys';
import { useAvianisStatus, useIsFeatureEnabled, useSyncAvianis } from '../../hooks/useConvexData';
import { useQuery } from '../../hooks/useConvexQueryNoThrow';
import { useRunAdWatchCheck } from '../../hooks/useRunAdWatchCheck';
import { SettingsCard } from '../ui';
import AdWatchMonitorControls from './AdWatchMonitorControls';

/**
 * Connection and automation settings for the fleet: the Avianis pull, the
 * scheduled AD/SB search, and an explainer for how forecasting picks its rates.
 * These were previously split between /settings and a dashboard card.
 */
export default function FleetMonitoringTab({ projectId }: { projectId: string }) {
  const avianisStatus = useAvianisStatus();
  const syncAvianis = useSyncAvianis();
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const isAdWatchEnabled = useIsFeatureEnabled(FEATURE_KEYS.AD_WATCH);
  const { run: runAdCheck, checking, progress } = useRunAdWatchCheck(projectId);
  const findings = useQuery(
    api.adWatch.listByProject,
    isAdWatchEnabled && projectId ? { projectId: projectId as never } : 'skip',
  ) as Array<{ status: string }> | undefined;
  const openFindings = (findings ?? []).filter((f) => f.status === 'new').length;

  const handleSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = (await syncAvianis({ projectId: projectId as never })) as {
        aircraftSynced: number;
        discrepanciesSynced: number;
      };
      setSyncMessage(
        `Synced ${res.aircraftSynced} aircraft and ${res.discrepanciesSynced} discrepancies.`,
      );
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <>
      <SettingsCard
        title="Avianis connection"
        description="Pulls current times and open discrepancies for every tail in this project."
        icon={<FiRefreshCw />}
        status={
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              avianisStatus?.configured
                ? 'bg-green-500/20 text-green-300'
                : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {avianisStatus?.configured ? 'Connected' : 'Not configured'}
          </span>
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || !avianisStatus?.configured}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-sky to-sky-light px-5 py-2.5 font-semibold transition-all hover:shadow-lg hover:shadow-sky/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FiRefreshCw className={syncing ? 'animate-spin' : ''} aria-hidden />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <Link
            to="/settings#integrations"
            className="inline-flex items-center gap-1.5 text-sm text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline"
          >
            Configure credentials <FiExternalLink aria-hidden className="text-xs" />
          </Link>
        </div>
        <p className="mt-3 text-sm text-white/55">
          {avianisStatus?.lastSyncedAt
            ? `Last sync: ${new Date(avianisStatus.lastSyncedAt).toLocaleString()}`
            : 'Never synced.'}
        </p>
        {syncMessage && <p className="mt-1 text-sm text-white/70">{syncMessage}</p>}
        {avianisStatus?.lastSyncError && (
          <p className="mt-1 text-sm text-rose-300">
            Last sync error: {avianisStatus.lastSyncError}
          </p>
        )}
      </SettingsCard>

      {isAdWatchEnabled && (
        <SettingsCard
          title="AD/SB monitoring"
          description="Searches recent FAA airworthiness directives against your fleet."
          icon={<FiShield />}
          iconGradient="from-rose-500 to-rose-600"
        >
          <AdWatchMonitorControls projectId={projectId} variant="full" />

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={runAdCheck}
              disabled={checking}
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/5 disabled:opacity-50"
            >
              <FiSearch aria-hidden className={checking ? 'animate-pulse' : ''} />
              {checking ? 'Checking…' : 'Run check now'}
            </button>
            <Link
              to="/quality-command-center"
              className="text-sm text-sky-300 underline-offset-2 hover:text-sky-200 hover:underline"
            >
              {openFindings > 0
                ? `Review ${openFindings} open finding${openFindings === 1 ? '' : 's'} →`
                : 'View findings →'}
            </Link>
          </div>
          {progress ? <p className="mt-2 text-sm text-white/60">{progress}</p> : null}
          <p className="mt-3 text-xs text-white/45">
            Advisory web-search results — always confirm applicability against the official AD text
            and your aircraft's serial/configuration before acting.
          </p>
        </SettingsCard>
      )}

      <SettingsCard
        title="How forecasting picks a rate"
        description="Why a due item shows the date it does."
        icon={<FiHelpCircle />}
        iconGradient="from-slate-500 to-slate-600"
      >
        <ul className="space-y-2 text-sm text-white/65">
          <li>
            <strong className="text-white/85">Derived rate wins.</strong> If Avianis has synced at
            least 30 days of times for a tail, the forecast uses the rate it measures.
          </li>
          <li>
            <strong className="text-white/85">Manual rate is the fallback.</strong> With no derived
            rate, the per-day values you enter under a tail's{' '}
            <em>Utilization rates</em> are used instead.
          </li>
          <li>
            <strong className="text-white/85">No rate, no date.</strong> Hours- and cycles-based
            items with neither rate are listed as unforecastable rather than guessed at.
          </li>
        </ul>
      </SettingsCard>
    </>
  );
}
