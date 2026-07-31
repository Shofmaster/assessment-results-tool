import { useState } from 'react';
import { FiArrowLeft } from 'react-icons/fi';
import { FEATURE_KEYS } from '../../config/featureKeys';
import { useIsFeatureEnabled } from '../../hooks/useConvexData';
import type { AircraftAsset } from '../../types/aircraftAsset';
import type { AircraftType } from '../../types/aircraftType';
import { SettingsCard } from '../ui';
import AskPanel from '../ask/AskPanel';
import LifecycleTimeline from './LifecycleTimeline';
import { ModificationsTab } from './ModificationsTab';
import AircraftBaselineEditor from './AircraftBaselineEditor';
import AircraftIdentityEditor from './AircraftIdentityEditor';
import UtilizationRatesEditor from './UtilizationRatesEditor';

type SubTab = 'overview' | 'modifications' | 'ask';

/**
 * Everything about one tail. Sub-tab selection stays in local state — the
 * deep-link contract for the Fleet page is `?tab=` + `?tail=` only.
 */
export default function AircraftDetailPanel({
  aircraft,
  aircraftTypes,
  projectId,
  openDiscrepancyCount,
  onBack,
  onViewDiscrepancies,
}: {
  aircraft: AircraftAsset;
  aircraftTypes: AircraftType[];
  projectId: string;
  openDiscrepancyCount: number;
  onBack: () => void;
  onViewDiscrepancies: () => void;
}) {
  const [subTab, setSubTab] = useState<SubTab>('overview');
  const [showTimeline, setShowTimeline] = useState(false);

  const isModsEnabled = useIsFeatureEnabled(FEATURE_KEYS.AIRCRAFT_MODIFICATIONS);
  const isAskCitationsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ASK_CITATIONS);
  const isAskRecordToolsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ASK_RECORD_TOOLS);

  const typeName = aircraft.aircraftTypeId
    ? aircraftTypes.find((t) => t._id === aircraft.aircraftTypeId)?.name
    : undefined;

  const subTabs: Array<{ id: SubTab; label: string }> = [
    { id: 'overview', label: 'Overview' },
    ...(isModsEnabled ? [{ id: 'modifications' as const, label: 'Modifications' }] : []),
    ...(isAskCitationsEnabled ? [{ id: 'ask' as const, label: 'Ask' }] : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-white/60 transition-colors hover:text-white"
        >
          <FiArrowLeft aria-hidden /> All aircraft
        </button>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-display font-bold">{aircraft.tailNumber}</h2>
            <p className="text-sm text-white/60">
              {[typeName, [aircraft.make, aircraft.model].filter(Boolean).join(' ')]
                .filter(Boolean)
                .join(' · ') || 'No make/model on file'}
              {aircraft.serial ? ` · S/N ${aircraft.serial}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onViewDiscrepancies}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              openDiscrepancyCount > 0
                ? 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30'
                : 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
            }`}
          >
            {openDiscrepancyCount > 0
              ? `${openDiscrepancyCount} open discrepanc${openDiscrepancyCount === 1 ? 'y' : 'ies'}`
              : 'No open discrepancies'}
          </button>
        </div>
      </div>

      {subTabs.length > 1 && (
        <div className="flex gap-1 border-b border-white/10">
          {subTabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              aria-current={subTab === t.id ? 'page' : undefined}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                subTab === t.id
                  ? 'border-b-2 border-sky-light bg-white/10 text-white'
                  : 'text-white/60 hover:text-white/85'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Lazy mount: each sub-tab's Convex queries only run once it's selected. */}
      {subTab === 'overview' && (
        <>
          <SettingsCard
            title="Aircraft details"
            description="Identity and type assignment. Type drives which manuals apply."
          >
            <AircraftIdentityEditor aircraft={aircraft} aircraftTypes={aircraftTypes} />
          </SettingsCard>

          <SettingsCard
            title="Times"
            description="Baseline is what you enter; current times come from Avianis."
          >
            <AircraftBaselineEditor aircraft={aircraft} />
          </SettingsCard>

          <SettingsCard
            title="Utilization rates"
            description="How fast this tail accrues time — drives due-list forecasting."
          >
            <UtilizationRatesEditor aircraft={aircraft} />
          </SettingsCard>

          <SettingsCard
            title="Lifecycle timeline"
            description="Modifications, inspections, and component changes over time."
            status={
              <button
                type="button"
                onClick={() => setShowTimeline((v) => !v)}
                aria-expanded={showTimeline}
                className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-white/75 transition-colors hover:bg-white/5"
              >
                {showTimeline ? 'Hide' : 'Show'}
              </button>
            }
          >
            {showTimeline ? <LifecycleTimeline aircraftId={aircraft._id} /> : null}
          </SettingsCard>
        </>
      )}

      {subTab === 'modifications' && isModsEnabled && (
        <ModificationsTab
          aircraftId={aircraft._id}
          projectId={projectId}
          tailNumber={aircraft.tailNumber}
          make={aircraft.make}
          model={aircraft.model}
          serial={aircraft.serial}
        />
      )}

      {subTab === 'ask' && isAskCitationsEnabled && (
        <SettingsCard
          title={`Ask about ${aircraft.tailNumber}`}
          description="Answers cite this aircraft's logbook records and the company manuals."
        >
          <AskPanel
            projectId={projectId}
            scope={{ tailNumber: aircraft.tailNumber }}
            isDarkMode
            placeholder={`Ask about ${aircraft.tailNumber}… e.g. "when was the last annual?"`}
            contextLabel={`Scoped to ${aircraft.tailNumber} — answers cite logbook records and company manuals.`}
            enableRecordTools={isAskRecordToolsEnabled}
          />
        </SettingsCard>
      )}
    </div>
  );
}
