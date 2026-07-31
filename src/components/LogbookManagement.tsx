import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import { useNow } from '../hooks/useNow';
import {
  useAircraftAssets,
  useAircraftTypes,
  useCreateAircraftAsset,
  useLogbookEntries,
  useAircraftComponents,
  useComplianceFindings,
} from '../hooks/useConvexData';
import { AircraftTypesPanelModal } from './aircraft/AircraftTypesPanel';
import AddAircraftModal from './aircraft/AddAircraftModal';
import type { AircraftType } from '../types/aircraftType';
import InspectionSchedule from './InspectionSchedule';
import LogbooksLibraryTab from './LogbooksLibraryTab';
import LogbookSearchTab from './LogbookSearchTab';
import LogbookConfigurationTab from './LogbookConfigurationTab';
import LogbookFindingsTab from './LogbookFindingsTab';
import LogbookTimelineTab from './LogbookTimelineTab';
import LogbookDueListTab from './LogbookDueListTab';
import {
  type AircraftAsset,
  type LogbookEntry,
  type AircraftComponent,
  type ComplianceFinding,
} from '../types/logbook';
import { calcTTL, type Tab } from '../utils/logbookUtils';
import {
  FiPlus,
  FiSearch,
  FiAlertTriangle,
  FiClock,
  FiSettings,
  FiUpload,
  FiChevronDown,
  FiArchive,
  FiList,
  FiCalendar,
  FiLayers,
} from 'react-icons/fi';

export default function LogbookManagement() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('library');
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | undefined>(undefined);
  const [showAddAircraft, setShowAddAircraft] = useState(false);
  const [showTypesPanel, setShowTypesPanel] = useState(false);

  const aircraft = (useAircraftAssets(activeProjectId ?? undefined) ?? []) as AircraftAsset[];
  const aircraftTypes = (useAircraftTypes(activeProjectId ?? undefined) ?? []) as AircraftType[];
  const typeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of aircraftTypes) m.set(t._id, t.name);
    return m;
  }, [aircraftTypes]);
  const createAircraft = useCreateAircraftAsset();

  const selectedAircraft = aircraft.find((a) => a._id === selectedAircraftId) ?? aircraft[0];
  const effectiveAircraftId = selectedAircraft?._id;

  // Lifted to root so status bar and ConfigurationTab can share
  const allEntries = (useLogbookEntries(activeProjectId ?? undefined, effectiveAircraftId) ?? []) as LogbookEntry[];
  const allFindings = (useComplianceFindings(activeProjectId ?? undefined, effectiveAircraftId) ?? []) as ComplianceFinding[];
  const installedComponents = (useAircraftComponents(activeProjectId ?? undefined, effectiveAircraftId, 'installed') ?? []) as AircraftComponent[];

  const currentTT = useMemo(() => {
    const vals = allEntries.map((e) => e.totalTimeAtEntry ?? 0).filter((v) => v > 0);
    const baseline = selectedAircraft?.baselineTotalTime ?? 0;
    return vals.length > 0 ? Math.max(baseline, ...vals) : baseline;
  }, [allEntries, selectedAircraft]);

  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (!requestedTab) return;
    if (requestedTab === tab) return;
    if (requestedTab === 'library' || requestedTab === 'search' || requestedTab === 'configuration' || requestedTab === 'findings' || requestedTab === 'timeline' || requestedTab === 'due_list' || requestedTab === 'schedule') {
      setTab(requestedTab);
    }
  }, [searchParams, tab]);

  const handleTabChange = (nextTab: Tab) => {
    setTab(nextTab);
    const next = new URLSearchParams(searchParams);
    if (nextTab === 'library') {
      next.delete('tab');
    } else {
      next.set('tab', nextTab);
    }
    setSearchParams(next, { replace: true });
  };

  if (!activeProjectId) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center">
          <FiArchive className="text-4xl text-white/30 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-white/80 mb-1">No Project Selected</h2>
          <p className="text-sm text-white/50">Select or create a project to begin managing logbooks.</p>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; Icon: typeof FiSearch }[] = [
    { key: 'library', label: 'Logbooks Library', Icon: FiUpload },
    { key: 'search', label: 'Logbook Search', Icon: FiSearch },
    { key: 'schedule', label: 'Schedule', Icon: FiCalendar },
    { key: 'due_list', label: 'Due List', Icon: FiList },
    { key: 'configuration', label: 'Aircraft Config', Icon: FiLayers },
    { key: 'findings', label: 'Compliance', Icon: FiAlertTriangle },
    { key: 'timeline', label: 'Timeline', Icon: FiClock },
  ];

  return (
    <div className="logbook-route flex flex-col h-full min-h-0 rounded-2xl border border-amber-200/70 bg-[#f7f2e7] text-stone-800 shadow-[0_18px_36px_rgba(0,0,0,0.22)] overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-amber-300/70 bg-[#f2e7cf]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-semibold text-stone-900 font-['Source_Serif_4',serif]">Logbook Management</h1>
            <p className="text-sm text-stone-600 mt-1">Aircraft maintenance records, configuration tracking, and compliance analysis</p>
          </div>
        </div>
        {effectiveAircraftId && (
          <AircraftStatusBar
            currentTT={currentTT}
            entries={allEntries}
            findings={allFindings}
            components={installedComponents}
          />
        )}

        {/* Aircraft Selector + Tabs */}
        <div className="flex flex-wrap items-center gap-4">
          <AircraftSelector
            aircraft={aircraft}
            typeNameById={typeNameById}
            selected={effectiveAircraftId}
            onSelect={setSelectedAircraftId}
            onAdd={() => setShowAddAircraft(true)}
            onManageTypes={() => setShowTypesPanel(true)}
          />
          <div className="flex gap-1 rounded-lg p-1 bg-[#dbc8a7] border border-amber-300/80">
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => handleTabChange(key)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  tab === key
                    ? 'bg-[#fffaf0] text-stone-900 border border-amber-300 shadow-sm'
                    : 'text-stone-600 hover:text-stone-800 hover:bg-[#f3e7d2]'
                }`}
              >
                <Icon className="text-sm" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-auto p-6 bg-[repeating-linear-gradient(to_bottom,_#f7f2e7_0px,_#f7f2e7_30px,_#e6dcc7_31px)] border-l-2 border-[#b7534f]/70">
        {!effectiveAircraftId ? (
          <EmptyAircraftState onAdd={() => setShowAddAircraft(true)} />
        ) : (
          <>
            {tab === 'library' && <LogbooksLibraryTab projectId={activeProjectId} aircraftId={effectiveAircraftId} />}
            {tab === 'search' && <LogbookSearchTab projectId={activeProjectId} aircraftId={effectiveAircraftId} aircraft={selectedAircraft} />}
            {tab === 'schedule' && <InspectionSchedule />}
            {tab === 'due_list' && <LogbookDueListTab projectId={activeProjectId} aircraftId={effectiveAircraftId} currentTT={currentTT} aircraft={selectedAircraft} />}
            {tab === 'configuration' && <LogbookConfigurationTab projectId={activeProjectId} aircraftId={effectiveAircraftId} aircraft={selectedAircraft!} currentTT={currentTT} entries={allEntries} />}
            {tab === 'findings' && <LogbookFindingsTab projectId={activeProjectId} aircraftId={effectiveAircraftId} />}
            {tab === 'timeline' && <LogbookTimelineTab projectId={activeProjectId} aircraftId={effectiveAircraftId} />}
          </>
        )}
      </div>

      {/* Add Aircraft Modal */}
      {showAddAircraft && (
        <AddAircraftModal
          projectId={activeProjectId}
          aircraftTypes={aircraftTypes}
          onCreate={createAircraft}
          onClose={() => setShowAddAircraft(false)}
          onCreated={(id) => {
            setSelectedAircraftId(id);
            setShowAddAircraft(false);
          }}
        />
      )}

      <AircraftTypesPanelModal
        projectId={activeProjectId}
        open={showTypesPanel}
        onClose={() => setShowTypesPanel(false)}
      />
    </div>
  );
}

/* ─── Aircraft Selector ──────────────────────────────────────────────── */

function AircraftSelector({
  aircraft,
  typeNameById,
  selected,
  onSelect,
  onAdd,
  onManageTypes,
}: {
  aircraft: AircraftAsset[];
  typeNameById: Map<string, string>;
  selected?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onManageTypes: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = aircraft.find((a) => a._id === selected);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#fff8eb] hover:bg-[#fffdf6] border border-amber-300/80 transition-colors min-w-[230px] text-stone-700"
      >
        <FiSettings className="text-sky-700/80 flex-shrink-0" />
        <span className="text-sm font-medium text-stone-700 truncate">
          {current
            ? `${current.tailNumber}${current.aircraftTypeId && typeNameById.get(current.aircraftTypeId) ? ` · ${typeNameById.get(current.aircraftTypeId)}` : ''} — ${[current.make, current.model].filter(Boolean).join(' ')}`.trim()
            : 'Select Aircraft'}
        </span>
        <FiChevronDown className={`text-stone-500 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg bg-[#fffaf2] border border-amber-300 shadow-xl shadow-black/20 overflow-hidden">
          <div className="max-h-56 overflow-auto">
            {aircraft.map((a) => (
              <button
                key={a._id}
                type="button"
                onClick={() => { onSelect(a._id); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  a._id === selected ? 'bg-sky-100 text-sky-900' : 'text-stone-700 hover:bg-amber-50 hover:text-stone-900'
                }`}
              >
                <div className="font-medium">{a.tailNumber}</div>
                <div className="text-xs text-stone-500">
                  {[a.aircraftTypeId ? typeNameById.get(a.aircraftTypeId) : null, a.make, a.model, a.serial]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </button>
            ))}
          </div>
          <div className="border-t border-amber-200">
            <button
              type="button"
              onClick={() => { onManageTypes(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-stone-600 hover:bg-amber-50 transition-colors"
            >
              <FiLayers className="text-xs" /> Manage aircraft types
            </button>
            <button
              type="button"
              onClick={() => { onAdd(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-sky-800 hover:bg-amber-50 transition-colors"
            >
              <FiPlus className="text-xs" /> Add Aircraft
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Aircraft Status Bar ────────────────────────────────────────────── */

function AircraftStatusBar({
  currentTT,
  entries,
  findings,
  components,
}: {
  currentTT: number;
  entries: LogbookEntry[];
  findings: ComplianceFinding[];
  components: AircraftComponent[];
}) {
  const lastEntry = useMemo(() => {
    return [...entries]
      .filter((e) => e.entryDate)
      .sort((a, b) => b.entryDate!.localeCompare(a.entryDate!))
      .at(0);
  }, [entries]);

  // Hourly is plenty for a day count, and keeps this off a per-minute re-render.
  const now = useNow(60 * 60 * 1000);
  const daysSince = lastEntry
    ? Math.round((now - new Date(lastEntry.entryDate!).getTime()) / 86400000)
    : null;

  const openFindings = findings.filter((f) => f.status === 'open');
  const criticalCount = openFindings.filter((f) => f.severity === 'critical').length;

  const llpWarnings = components.filter((c) => {
    const ttl = calcTTL(c, currentTT);
    return ttl !== null && !ttl.manualCheck && ttl.remainingPct < 0.10;
  }).length;

  const stats = [
    {
      label: 'Total Time',
      value: currentTT > 0 ? `${currentTT.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs` : '—',
      urgent: false,
    },
    {
      label: 'Last Entry',
      value: daysSince !== null ? `${daysSince}d ago` : '—',
      urgent: daysSince !== null && daysSince > 180,
    },
    {
      label: 'Open Findings',
      value: openFindings.length > 0 ? `${openFindings.length}${criticalCount > 0 ? ` (${criticalCount} critical)` : ''}` : 'None',
      urgent: criticalCount > 0,
    },
    {
      label: 'LLP Warnings',
      value: llpWarnings > 0 ? `${llpWarnings} near limit` : 'None',
      urgent: llpWarnings > 0,
    },
  ];

  return (
    <div className="flex flex-wrap gap-3 mt-3">
      {stats.map(({ label, value, urgent }) => (
        <div
          key={label}
          className={`flex flex-col px-3 py-1.5 rounded-lg border text-xs ${
            urgent
              ? 'bg-red-50 border-red-300 text-red-800'
              : 'bg-[#fffdf7] border-amber-300/80 text-stone-700'
          }`}
        >
          <span className={`text-[10px] uppercase tracking-wide font-medium ${urgent ? 'text-red-600' : 'text-stone-500'}`}>{label}</span>
          <span className="font-semibold mt-0.5">{value}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyAircraftState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center text-stone-700">
      <FiArchive className="text-5xl text-amber-800/35 mb-4" />
      <h3 className="text-lg font-semibold text-stone-800 mb-2 font-['Source_Serif_4',serif]">No Aircraft Added</h3>
      <p className="text-sm text-stone-600 mb-6 max-w-md">Add an aircraft to begin uploading logbook scans, tracking configuration, and running compliance checks.</p>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-sky-700 text-white border border-sky-900/20 rounded-lg hover:bg-sky-800"
      >
        <FiPlus /> Add Aircraft
      </button>
    </div>
  );
}
