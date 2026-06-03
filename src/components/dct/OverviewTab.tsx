import { FiClock, FiGrid } from 'react-icons/fi';
import { GlassCard } from '../ui';
import { StatusPill } from './StatusPill';

/**
 * Overview tab: project-wide status breakdown bar + schedule summary.
 *
 * Several props (agent id, mutations, project id) are accepted but unused in
 * the body — they're retained to keep the call site stable for a future
 * iteration that may surface inline schedule/agent controls here.
 */
export function OverviewTab({
  summary,
  settings,
  statusBreakdown,
  displayStatus,
  dctLibraryCount,
  ingestedCount,
  newLibraryHashesAvailable,
}: {
  summary: any;
  settings: any;
  statusBreakdown: { aligned: number; gap: number; mismatch: number; pending: number };
  displayStatus: string;
  localDctTraceabilityAgentId: string;
  setLocalDctTraceabilityAgentId: (s: string) => void;
  upsertUserSettings: any;
  activeProjectId: string;
  completeCheck: any;
  upsertDctProjectSettings: any;
  dctTraceabilityAgentIdFromStore: string;
  dctLibraryCount: number;
  ingestedCount: number;
  newLibraryHashesAvailable: number;
}) {
  const total = statusBreakdown.aligned + statusBreakdown.gap + statusBreakdown.mismatch + statusBreakdown.pending;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const guidance =
    displayStatus === 'green'
      ? 'All systems clear — traceability is up to date and no open gaps.'
      : displayStatus === 'red'
        ? 'Resolve open gaps or mismatches, then re-run traceability.'
        : displayStatus === 'yellow'
          ? 'Scheduled check is overdue — complete it from Settings and re-run traceability.'
          : newLibraryHashesAvailable > 0
            ? 'Start by syncing new DCT files from your reference library, then run traceability.'
            : 'Run traceability against your manuals to establish compliance posture.';

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <GlassCard>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <FiGrid /> Status breakdown
          </h2>
          {total > 0 ? (
            <span className="text-xs text-white/50">
              {total} requirements (full project)
            </span>
          ) : null}
        </div>

        <p className="text-sm text-white/70 mb-4 bg-white/[0.03] border border-white/10 rounded-lg p-3">
          {guidance}
        </p>

        {total === 0 ? (
          <div className="text-center py-10">
            <p className="text-white/60 mb-4">No DCT requirements ingested yet.</p>
            <p className="text-xs text-white/40 mb-4">
              Library files: {dctLibraryCount} · Ingested: {ingestedCount}
              {newLibraryHashesAvailable > 0 ? ` · ${newLibraryHashesAvailable} new available` : ''}
            </p>
          </div>
        ) : (
          <>
            <div className="flex h-3 w-full rounded-full overflow-hidden bg-white/5 mb-4">
              {statusBreakdown.aligned > 0 ? (
                <div
                  className="bg-emerald-500/80"
                  style={{ width: `${pct(statusBreakdown.aligned)}%` }}
                  title={`Aligned: ${statusBreakdown.aligned}`}
                />
              ) : null}
              {statusBreakdown.gap > 0 ? (
                <div
                  className="bg-amber-500/80"
                  style={{ width: `${pct(statusBreakdown.gap)}%` }}
                  title={`Gap: ${statusBreakdown.gap}`}
                />
              ) : null}
              {statusBreakdown.mismatch > 0 ? (
                <div
                  className="bg-red-500/80"
                  style={{ width: `${pct(statusBreakdown.mismatch)}%` }}
                  title={`Mismatch: ${statusBreakdown.mismatch}`}
                />
              ) : null}
              {statusBreakdown.pending > 0 ? (
                <div
                  className="bg-white/20"
                  style={{ width: `${pct(statusBreakdown.pending)}%` }}
                  title={`Pending: ${statusBreakdown.pending}`}
                />
              ) : null}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <StatusPill color="emerald" label="Aligned" count={statusBreakdown.aligned} pct={pct(statusBreakdown.aligned)} />
              <StatusPill color="amber" label="Gap" count={statusBreakdown.gap} pct={pct(statusBreakdown.gap)} />
              <StatusPill color="red" label="Mismatch" count={statusBreakdown.mismatch} pct={pct(statusBreakdown.mismatch)} />
              <StatusPill color="white" label="Pending" count={statusBreakdown.pending} pct={pct(statusBreakdown.pending)} />
            </div>
          </>
        )}

        <div className="mt-6 pt-4 border-t border-white/10">
          <p className="text-xs text-white/50">
            Use the <strong>Run traceability</strong> button in the page header or the Step 3
            card above to run against applicable + unsure requirements using your configured
            manuals.
          </p>
        </div>
      </GlassCard>

      <GlassCard>
        <h2 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
          <FiClock /> Schedule
        </h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-white/50 text-[10px] uppercase tracking-wide">Last check</dt>
            <dd className="text-white/90">
              {settings?.lastCheckCompletedAt
                ? new Date(settings.lastCheckCompletedAt).toLocaleString()
                : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-white/50 text-[10px] uppercase tracking-wide">Next due</dt>
            <dd className={summary?.overdue ? 'text-amber-200' : 'text-white/90'}>
              {settings?.nextDueAt ? new Date(settings.nextDueAt).toLocaleString() : '—'}
              {summary?.overdue ? ' (overdue)' : ''}
            </dd>
          </div>
          <div>
            <dt className="text-white/50 text-[10px] uppercase tracking-wide">Last library ingest</dt>
            <dd className="text-white/90">
              {settings?.lastXmlIngestAt ? new Date(settings.lastXmlIngestAt).toLocaleString() : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-white/50 text-[10px] uppercase tracking-wide">Interval</dt>
            <dd className="text-white/90">{settings?.scheduleIntervalDays ?? 7} days</dd>
          </div>
        </dl>
        <p className="text-xs text-white/40 mt-4">Manage schedule and library sync in the Settings tab.</p>
      </GlassCard>
    </div>
  );
}
