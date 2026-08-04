import { useState } from 'react';
import { useMutation } from 'convex/react';
import { FiBell, FiBellOff, FiClock } from 'react-icons/fi';
import { api } from '../../../convex/_generated/api';
import { useQuery } from '../../hooks/useConvexQueryNoThrow';
import { useTheme } from '../../context/ThemeContext';
import { relativeTime } from './fleetFormat';

type Subscription = {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  emailAlerts: boolean;
  lastCheckedAt?: string;
} | null;

/**
 * Automated AD/SB monitoring controls (on/off, cadence, email alerts). Rendered
 * `compact` on the dashboard card and `full` on the Fleet monitoring tab; both
 * write the same `adWatchSubscriptions` row, so toggling one updates the other.
 */
export default function AdWatchMonitorControls({
  projectId,
  variant = 'compact',
}: {
  projectId: string;
  variant?: 'compact' | 'full';
}) {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const muted = isDarkMode ? 'text-white/60' : 'text-slate-600';
  const subhead = isDarkMode ? 'text-white/45' : 'text-slate-500';

  const subscription = useQuery(
    api.adWatch.getSubscription,
    projectId ? { projectId: projectId as never } : 'skip',
  ) as Subscription | undefined;
  const setSubscription = useMutation(api.adWatch.setSubscription);
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

  const isFull = variant === 'full';
  const selectClass = isDarkMode
    ? 'border-white/15 bg-transparent text-white/80 [&>option]:bg-navy-900'
    : 'border-slate-300 bg-white text-slate-700';

  const toggleButton = (
    <button
      type="button"
      onClick={() => saveSubscription({ enabled: !monitoring?.enabled })}
      disabled={savingSub || subscription === undefined}
      aria-pressed={!!monitoring?.enabled}
      className={`inline-flex items-center gap-1.5 font-semibold transition-colors disabled:opacity-50 ${
        isFull ? 'text-sm' : 'text-xs'
      } ${
        monitoring?.enabled ? (isDarkMode ? 'text-emerald-300' : 'text-emerald-600') : muted
      }`}
      title={
        monitoring?.enabled
          ? 'Automated monitoring is on — click to turn off'
          : 'Turn on automated monitoring'
      }
    >
      {monitoring?.enabled ? <FiBell aria-hidden /> : <FiBellOff aria-hidden />}
      Auto-monitor {monitoring?.enabled ? 'on' : 'off'}
    </button>
  );

  const cadenceControls = monitoring?.enabled ? (
    <div className={`flex items-center gap-2 ${isFull ? 'text-sm' : ''}`}>
      <label className="sr-only" htmlFor={`ad-watch-frequency-${variant}`}>
        Check frequency
      </label>
      <select
        id={`ad-watch-frequency-${variant}`}
        value={monitoring.frequency}
        onChange={(e) => saveSubscription({ frequency: e.target.value as 'daily' | 'weekly' })}
        disabled={savingSub}
        className={`rounded-md border ${isFull ? 'px-2 py-1 text-xs' : 'px-1.5 py-0.5 text-[11px]'} ${selectClass}`}
      >
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
      </select>
      <label
        className={`inline-flex items-center gap-1 ${isFull ? 'text-xs' : 'text-[11px]'} ${muted}`}
        title="Email me when new ADs are found"
      >
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
  ) : null;

  const lastChecked = monitoring?.enabled ? (
    <p className={`mt-1 flex items-center gap-1 ${isFull ? 'text-xs' : 'text-[10px]'} ${subhead}`}>
      <FiClock aria-hidden /> Last automated check: {relativeTime(monitoring.lastCheckedAt)}
    </p>
  ) : null;

  if (isFull) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {toggleButton}
          {cadenceControls}
        </div>
        <p className={`mt-2 text-xs ${muted}`}>
          {monitoring?.enabled
            ? 'A scheduled job searches recent FAA ADs against every active tail in this project.'
            : 'Turn this on to have AeroGap search recent FAA ADs against your fleet on a schedule.'}
        </p>
        {lastChecked}
      </div>
    );
  }

  return (
    <div
      className={`mb-3 rounded-lg border px-2.5 py-2 ${
        isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        {toggleButton}
        {cadenceControls}
      </div>
      {lastChecked}
    </div>
  );
}
