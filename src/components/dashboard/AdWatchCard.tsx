import { useMemo, useState } from 'react';
import { useConvex, useMutation } from 'convex/react';
import { FiBell, FiBellOff, FiCheck, FiClock, FiExternalLink, FiSearch, FiShield, FiX } from 'react-icons/fi';
import { useQuery } from '../../hooks/useConvexQueryNoThrow';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { useTheme } from '../../context/ThemeContext';
import { GlassCard } from '../ui';
import { checkAircraftForAds } from '../../services/adWatchService';

type FindingRow = {
  _id: string;
  adNumber: string;
  title: string;
  summary?: string;
  effectiveDate?: string;
  sourceUrl?: string;
  confidence: string;
  complianceStatus: string;
  status: string;
  tailNumber?: string;
  checkedAt: string;
};

function confidenceBadge(confidence: string, isDarkMode: boolean): string {
  if (confidence === 'high') return isDarkMode ? 'bg-rose-500/20 text-rose-200' : 'bg-rose-100 text-rose-700';
  if (confidence === 'medium') return isDarkMode ? 'bg-amber-500/20 text-amber-200' : 'bg-amber-100 text-amber-700';
  return isDarkMode ? 'bg-white/10 text-white/60' : 'bg-slate-100 text-slate-600';
}

type Subscription = {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  emailAlerts: boolean;
  lastCheckedAt?: string;
} | null;

/** Compact "3 days ago" style relative time for the last automated check. */
function relativeTime(iso?: string): string {
  if (!iso) return 'never';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'never';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

/**
 * AD/SB watch card for the Quality Command Center: web-search-discovered ADs
 * that may apply to the fleet, cross-referenced against logbook AD references.
 * Advisory only — review actions are "mark recorded" / "dismiss", never
 * auto-compliance.
 */
export default function AdWatchCard({ projectId }: { projectId: string }) {
  const convex = useConvex();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const heading = isDarkMode ? 'text-white' : 'text-slate-900';
  const subhead = isDarkMode ? 'text-white/45' : 'text-slate-500';
  const muted = isDarkMode ? 'text-white/60' : 'text-slate-600';
  const kpiBg = isDarkMode ? 'bg-white/5' : 'bg-slate-50';

  const findings = useQuery(
    api.adWatch.listByProject,
    projectId ? { projectId: projectId as never } : 'skip',
  ) as FindingRow[] | undefined;
  const upsertFindings = useMutation(api.adWatch.upsertFindings);
  const setStatus = useMutation(api.adWatch.setStatus);

  const subscription = useQuery(
    api.adWatch.getSubscription,
    projectId ? { projectId: projectId as never } : 'skip',
  ) as Subscription | undefined;
  const setSubscription = useMutation(api.adWatch.setSubscription);

  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [savingSub, setSavingSub] = useState(false);

  const monitoring = subscription ?? null;

  const saveSubscription = async (patch: Partial<NonNullable<Subscription>>) => {
    setSavingSub(true);
    try {
      await setSubscription({
        projectId: projectId as never,
        enabled: patch.enabled ?? monitoring?.enabled ?? false,
        frequency: patch.frequency ?? monitoring?.frequency ?? 'daily',
        emailAlerts: patch.emailAlerts ?? monitoring?.emailAlerts ?? true,
      });
    } finally {
      setSavingSub(false);
    }
  };

  const runCheck = async () => {
    setChecking(true);
    setProgress(null);
    try {
      const aircraft = (await convex.query(api.askTools.aircraftStatus, {
        projectId: projectId as Id<'projects'>,
      })) as Array<{ recordId: string; tailNumber: string; make?: string; model?: string; serial?: string }>;
      if (aircraft.length === 0) {
        setProgress('No active aircraft in this project — add aircraft in Fleet first.');
        return;
      }
      let totalNew = 0;
      for (const [index, a] of aircraft.entries()) {
        setProgress(`Checking ${a.tailNumber} (${index + 1}/${aircraft.length})…`);
        const drafts = await checkAircraftForAds({
          tailNumber: a.tailNumber,
          make: a.make,
          model: a.model,
          serial: a.serial,
        });
        if (drafts.length > 0) {
          const result = (await upsertFindings({
            projectId: projectId as never,
            aircraftId: a.recordId as never,
            findings: drafts,
          })) as { inserted: number };
          totalNew += result.inserted;
        }
      }
      setProgress(
        totalNew > 0
          ? `Check complete — ${totalNew} new potential AD${totalNew === 1 ? '' : 's'} to review.`
          : 'Check complete — no new ADs found for this fleet.',
      );
    } catch (err) {
      setProgress(err instanceof Error ? err.message : 'AD check failed.');
    } finally {
      setChecking(false);
    }
  };

  const { open, reviewedCount } = useMemo(() => {
    const all = findings ?? [];
    const openRows = all
      .filter((f) => f.status === 'new')
      .sort((a, b) => {
        // Unrecorded before recorded; then high confidence first; then newest AD.
        const rec = Number(a.complianceStatus === 'recorded_in_logbook') - Number(b.complianceStatus === 'recorded_in_logbook');
        if (rec !== 0) return rec;
        const order = (c: string) => (c === 'high' ? 0 : c === 'medium' ? 1 : 2);
        const conf = order(a.confidence) - order(b.confidence);
        if (conf !== 0) return conf;
        return b.adNumber.localeCompare(a.adNumber);
      });
    return { open: openRows, reviewedCount: all.length - openRows.length };
  }, [findings]);

  return (
    <GlassCard className={`!p-4 ${kpiBg}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FiShield className={isDarkMode ? 'text-rose-300' : 'text-rose-600'} />
          <span className={`text-sm font-semibold ${heading}`}>AD/SB watch</span>
          {open.length > 0 ? (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${
              isDarkMode ? 'bg-rose-500/25 text-rose-200' : 'bg-rose-600 text-white'
            }`}>
              {open.length} new
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={runCheck}
          disabled={checking}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-50 ${
            isDarkMode
              ? 'border-white/20 text-white/75 hover:bg-white/5'
              : 'border-slate-300 text-slate-600 hover:bg-slate-100'
          }`}
        >
          <FiSearch aria-hidden className={checking ? 'animate-pulse' : ''} />
          {checking ? 'Checking…' : 'Run check'}
        </button>
      </div>

      {/* Automated monitoring controls */}
      <div className={`mb-3 rounded-lg border px-2.5 py-2 ${isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-white'}`}>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => saveSubscription({ enabled: !monitoring?.enabled })}
            disabled={savingSub || subscription === undefined}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
              monitoring?.enabled
                ? isDarkMode ? 'text-emerald-300' : 'text-emerald-600'
                : muted
            }`}
            title={monitoring?.enabled ? 'Automated monitoring is on — click to turn off' : 'Turn on automated monitoring'}
          >
            {monitoring?.enabled ? <FiBell aria-hidden /> : <FiBellOff aria-hidden />}
            Auto-monitor {monitoring?.enabled ? 'on' : 'off'}
          </button>
          {monitoring?.enabled ? (
            <div className="flex items-center gap-2">
              <select
                value={monitoring.frequency}
                onChange={(e) => saveSubscription({ frequency: e.target.value as 'daily' | 'weekly' })}
                disabled={savingSub}
                className={`rounded-md border px-1.5 py-0.5 text-[11px] ${
                  isDarkMode ? 'border-white/15 bg-transparent text-white/80' : 'border-slate-300 bg-white text-slate-700'
                }`}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
              <label className={`inline-flex items-center gap-1 text-[11px] ${muted}`} title="Email me when new ADs are found">
                <input
                  type="checkbox"
                  checked={monitoring.emailAlerts}
                  onChange={(e) => saveSubscription({ emailAlerts: e.target.checked })}
                  disabled={savingSub}
                  className="h-3 w-3"
                />
                Email
              </label>
            </div>
          ) : null}
        </div>
        {monitoring?.enabled ? (
          <p className={`mt-1 flex items-center gap-1 text-[10px] ${subhead}`}>
            <FiClock aria-hidden /> Last automated check: {relativeTime(monitoring.lastCheckedAt)}
          </p>
        ) : null}
      </div>

      {progress ? <p className={`mb-2 text-xs ${muted}`}>{progress}</p> : null}

      {findings === undefined ? (
        <p className={`text-sm ${muted}`}>Loading AD watch…</p>
      ) : open.length === 0 ? (
        <p className={`text-sm ${muted}`}>
          No open AD findings.{' '}
          {findings.length === 0
            ? 'Run a check to search recent FAA ADs against your fleet.'
            : `${reviewedCount} reviewed.`}
        </p>
      ) : (
        <ul className="space-y-2">
          {open.slice(0, 6).map((f) => (
            <li key={f._id} className={`rounded-lg border p-2 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {f.sourceUrl ? (
                  <a
                    href={f.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 text-sm font-semibold underline-offset-2 hover:underline ${
                      isDarkMode ? 'text-sky-200' : 'text-sky-700'
                    }`}
                  >
                    AD {f.adNumber} <FiExternalLink className="text-[11px]" aria-hidden />
                  </a>
                ) : (
                  <span className={`text-sm font-semibold ${heading}`}>AD {f.adNumber}</span>
                )}
                {f.tailNumber ? <span className={`text-xs ${muted}`}>{f.tailNumber}</span> : null}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${confidenceBadge(f.confidence, isDarkMode)}`}>
                  {f.confidence}
                </span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    f.complianceStatus === 'recorded_in_logbook'
                      ? isDarkMode
                        ? 'bg-emerald-500/20 text-emerald-200'
                        : 'bg-emerald-100 text-emerald-700'
                      : isDarkMode
                        ? 'bg-amber-500/20 text-amber-200'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {f.complianceStatus === 'recorded_in_logbook' ? 'in logbook' : 'no logbook record'}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setStatus({ findingId: f._id as never, status: 'recorded' })}
                    title="Mark as recorded/complied — keeps it out of the open list"
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${
                      isDarkMode ? 'border-white/15 text-white/70 hover:bg-white/5' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <FiCheck aria-hidden /> Recorded
                  </button>
                  <button
                    type="button"
                    onClick={() => setStatus({ findingId: f._id as never, status: 'dismissed' })}
                    title="Dismiss — not applicable to this aircraft"
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-semibold ${
                      isDarkMode ? 'border-white/15 text-white/70 hover:bg-white/5' : 'border-slate-300 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <FiX aria-hidden /> Dismiss
                  </button>
                </span>
              </div>
              <p className={`mt-1 text-xs ${heading}`}>{f.title}</p>
              {f.summary ? <p className={`mt-0.5 text-[11px] ${muted}`}>{f.summary}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {open.length > 6 ? <p className={`mt-2 text-xs ${muted}`}>+{open.length - 6} more open findings</p> : null}
      <p className={`mt-3 text-[10px] ${subhead}`}>
        Advisory web-search results — always confirm applicability against the official AD text and your aircraft's
        serial/configuration before acting.
      </p>
    </GlassCard>
  );
}
