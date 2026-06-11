import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiAlertTriangle,
  FiCheckCircle,
  FiClipboard,
  FiFileText,
  FiMinusCircle,
  FiPlusCircle,
  FiShield,
  FiTool,
} from 'react-icons/fi';
import { useQuery } from '../../hooks/useConvexQueryNoThrow';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import { buildLifecycleTimeline, type LifecycleEventKind } from '../../utils/lifecycleTimeline';

const KIND_META: Record<LifecycleEventKind, { icon: typeof FiTool; tone: string; label: string }> = {
  inspection: { icon: FiCheckCircle, tone: 'text-emerald-300 bg-emerald-500/15', label: 'Inspection' },
  ad_compliance: { icon: FiShield, tone: 'text-rose-300 bg-rose-500/15', label: 'AD compliance' },
  sb_compliance: { icon: FiShield, tone: 'text-amber-300 bg-amber-500/15', label: 'SB compliance' },
  maintenance: { icon: FiTool, tone: 'text-sky-300 bg-sky/15', label: 'Maintenance' },
  alteration: { icon: FiClipboard, tone: 'text-violet-300 bg-violet-500/15', label: 'Alteration' },
  component_installed: { icon: FiPlusCircle, tone: 'text-emerald-300 bg-emerald-500/15', label: 'Component installed' },
  component_removed: { icon: FiMinusCircle, tone: 'text-white/60 bg-white/10', label: 'Component removed' },
  discrepancy: { icon: FiAlertTriangle, tone: 'text-amber-300 bg-amber-500/15', label: 'Discrepancy' },
  form_337: { icon: FiFileText, tone: 'text-sky-300 bg-sky/15', label: 'Form 337' },
};

/**
 * Bluetail-style reverse-chronological lifecycle timeline for one aircraft:
 * logbook entries, component installs/removals, discrepancies, and Form 337s
 * grouped by year. Rows navigate to the owning view.
 */
export default function LifecycleTimeline({ aircraftId }: { aircraftId: string }) {
  const navigate = useNavigate();
  const data = useQuery(api.lifecycle.eventsForAircraft, {
    aircraftId: aircraftId as Id<'aircraftAssets'>,
  });

  const groups = useMemo(() => (data ? buildLifecycleTimeline(data) : null), [data]);

  if (data === undefined) {
    return <p className="text-sm text-white/55">Loading timeline…</p>;
  }
  if (!groups || groups.length === 0) {
    return (
      <p className="text-sm text-white/55">
        No history yet — logbook entries, components, discrepancies, and 337s will appear here.
      </p>
    );
  }

  const totalEvents = groups.reduce((n, g) => n + g.events.length, 0);

  return (
    <div>
      <p className="mb-2 text-[11px] text-white/45">
        {totalEvents} event{totalEvents === 1 ? '' : 's'} across logbooks, components, discrepancies, and 337s.
      </p>
      <div className="max-h-[50vh] overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.year} className="mb-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/50">
              {group.year === 'undated' ? 'Undated' : group.year}
            </p>
            <ol className="relative ml-2 border-l border-white/10 pl-4">
              {group.events.map((event) => {
                const meta = KIND_META[event.kind];
                const Icon = meta.icon;
                return (
                  <li key={`${event.table}-${event.recordId}-${event.kind}`} className="relative mb-3 last:mb-0">
                    <span
                      className={`absolute -left-[25px] top-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full ${meta.tone}`}
                      title={meta.label}
                    >
                      <Icon className="text-[10px]" aria-hidden />
                    </span>
                    <button
                      type="button"
                      onClick={() => navigate(event.route)}
                      className="group block w-full rounded-lg px-2 py-1 text-left transition-colors hover:bg-white/5"
                    >
                      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        {event.date ? (
                          <span className="text-[11px] tabular-nums text-white/50">{event.date}</span>
                        ) : null}
                        <span className="text-sm text-white/90 group-hover:text-white">{event.title}</span>
                        {event.badges.map((badge) => (
                          <span
                            key={badge}
                            className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60"
                          >
                            {badge}
                          </span>
                        ))}
                      </span>
                      {event.detail ? (
                        <span className="block truncate text-[11px] text-white/45">{event.detail}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>
    </div>
  );
}
