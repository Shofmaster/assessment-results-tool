import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { FiActivity, FiAlertTriangle, FiArchive, FiLayers, FiSend } from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import { useFleetAircraft, useFleetDiscrepancies, useUserSettings } from '../hooks/useConvexData';
import { SettingsShell, type SettingsSection } from './settings/SettingsShell';
import FleetAircraftTab from './fleet/FleetAircraftTab';
import FleetDiscrepanciesTab from './fleet/FleetDiscrepanciesTab';
import FleetMonitoringTab from './fleet/FleetMonitoringTab';
import FleetTypesTab from './fleet/FleetTypesTab';
import type { AircraftAsset } from '../types/aircraftAsset';
import type { AircraftDiscrepancy } from '../types/discrepancy';
import { DEFAULT_FLEET_TAB, resolveFleetTab, type FleetTab } from '../utils/fleetTabs';

/** Stable identities so still-loading queries don't invalidate every memo. */
const NO_AIRCRAFT: AircraftAsset[] = [];
const NO_DISCREPANCIES: AircraftDiscrepancy[] = [];

/**
 * The Fleet page: one place to see and configure the fleet. Sections are driven
 * by `?tab=`, and the Aircraft section drills into a single tail via `?tail=`.
 * Each section's `render` is a closure, so a tab's Convex queries only mount
 * once that tab is selected.
 */
export default function FleetView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = resolveFleetTab(searchParams.get('tab'));
  const tailId = searchParams.get('tail');

  const storeProjectId = useAppStore((s) => s.activeProjectId);
  const userSettings = useUserSettings();
  const activeProjectId = useMemo(() => {
    if (storeProjectId) return storeProjectId;
    const sid = userSettings?.activeProjectId;
    return sid ? String(sid) : null;
  }, [storeProjectId, userSettings?.activeProjectId]);

  const aircraft =
    (useFleetAircraft(activeProjectId ?? undefined) as AircraftAsset[] | undefined) ?? NO_AIRCRAFT;
  const discrepancies =
    (useFleetDiscrepancies(activeProjectId ?? undefined) as AircraftDiscrepancy[] | undefined) ??
    NO_DISCREPANCIES;

  const setParams = useCallback(
    (next: { tab?: FleetTab; tail?: string | null }) => {
      const params = new URLSearchParams(searchParams);
      if (next.tab !== undefined) {
        if (next.tab === DEFAULT_FLEET_TAB) params.delete('tab');
        else params.set('tab', next.tab);
      }
      if (next.tail !== undefined) {
        if (next.tail) params.set('tail', next.tail);
        else params.delete('tail');
      }
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const sections = useMemo<SettingsSection[]>(() => {
    if (!activeProjectId) return [];
    return [
      {
        id: 'aircraft',
        label: 'Aircraft',
        icon: <FiSend />,
        badge: aircraft.length > 0 ? <SectionCount value={aircraft.length} /> : undefined,
        render: () => (
          <FleetAircraftTab
            projectId={activeProjectId}
            aircraft={aircraft}
            discrepancies={discrepancies}
            selectedTailId={tailId}
            onSelectTail={(id) => setParams({ tail: id })}
            onViewDiscrepancies={(id) => setParams({ tab: 'discrepancies', tail: id })}
          />
        ),
      },
      {
        id: 'types',
        label: 'Types',
        icon: <FiLayers />,
        render: () => <FleetTypesTab projectId={activeProjectId} />,
      },
      {
        id: 'discrepancies',
        label: 'Discrepancies',
        icon: <FiAlertTriangle />,
        badge: (() => {
          const open = discrepancies.filter((d) => d.status === 'open').length;
          return open > 0 ? <SectionCount value={open} tone="rose" /> : undefined;
        })(),
        render: () => (
          <FleetDiscrepanciesTab
            aircraft={aircraft}
            discrepancies={discrepancies}
            initialTailId={tailId}
          />
        ),
      },
      {
        id: 'monitoring',
        label: 'Monitoring',
        icon: <FiActivity />,
        render: () => <FleetMonitoringTab projectId={activeProjectId} />,
      },
    ];
  }, [activeProjectId, aircraft, discrepancies, tailId, setParams]);

  if (!activeProjectId) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <FiArchive className="mx-auto mb-3 text-4xl text-white/30" aria-hidden />
          <h2 className="mb-1 text-lg font-semibold text-white/80">No Project Selected</h2>
          <p className="text-sm text-white/50">
            Select or create a project to manage its aircraft.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SettingsShell
      title="Fleet"
      subtitle="Aircraft, types, discrepancies, and monitoring for this project"
      sections={sections}
      activeId={tab}
      onActiveIdChange={(id) => setParams({ tab: resolveFleetTab(id), tail: null })}
    />
  );
}

function SectionCount({ value, tone = 'neutral' }: { value: number; tone?: 'neutral' | 'rose' }) {
  return (
    <span
      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
        tone === 'rose' ? 'bg-rose-500/25 text-rose-200' : 'bg-white/10 text-white/60'
      }`}
    >
      {value}
    </span>
  );
}
