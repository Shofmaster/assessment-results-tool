import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useConvex, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAppStore } from '../store/appStore';
import {
  useAircraftAssets,
  useCreateAircraftAsset,
  useLogbookEntries,
  useLogbookDraftEntries,
  useAddLogbookDraftEntries,
  useRemoveLogbookDraftEntriesBySourceDocument,
  useImportSelectedLogbookDraftEntries,
  useAddDocument,
  useRemoveDocument,
  useGenerateUploadUrl,
  useAircraftComponents,
  useAddAircraftComponent,
  useComplianceFindings,
  useAddComplianceFindings,
  useUpdateComplianceFindingStatus,
  useComplianceRules,
  useSeedComplianceRules,
  useDocuments,
  useDefaultClaudeModel,
  useIsAdmin,
  useAddEntityIssue,
  useConvertFindingToIssue,
  useInspectionScheduleItems,
  useUpdateInspectionScheduleLastPerformed,
  useSeedRulePack,
  useUpdateDocumentExtractedText,
  useUpdateLogbookEntry,
  useRemoveLogbookEntry,
  useRemoveSelectedLogbookDraftEntries,
  useAddLogbookEntries,
} from '../hooks/useConvexData';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { parseLogbookText } from '../services/logbookEntryParser';
import type { LogbookParseDiagnostics } from '../services/logbookEntryParser';
import { DocumentExtractor } from '../services/documentExtractor';
import { runComplianceChecks, detectTimeDiscrepancies } from '../services/complianceEngine';
import { findingToIssueArgs, buildScheduleUpdates } from '../services/logbookIntegration';
import { detectChronicIssues } from '../services/chronicIssueDetector';
import type { ChronicIssueCluster, ChronicIssueResult } from '../services/chronicIssueDetector';
import { parseCSV, autoDetectMapping, buildPreview, mapAllRows } from '../services/csvImporter';
import type { ParsedCSV, ColumnMapping, MappableField, ImportPreviewRow } from '../services/csvImporter';
import { ALL_RULE_PACKS, RULE_PACK_LABELS } from '../data/regulatoryRulePacks';
import {
  LOGBOOK_ENTRY_TYPE_ORDER,
  getLogbookEntryTypeLabel,
  getAllAdSbReferences,
  hasAdReference,
  hasSbReference,
  type AircraftAsset,
  type LogbookEntry,
  type AircraftComponent,
  type ComplianceFinding,
  type ComplianceRule,
  type LogbookGapWarning,
  type LogbookContinuityWarning,
} from '../types/logbook';
import type { InspectionScheduleItem } from '../types/inspectionSchedule';
import {
  FiPlus,
  FiSearch,
  FiAlertTriangle,
  FiClock,
  FiSettings,
  FiUpload,
  FiCheck,
  FiX,
  FiChevronDown,
  FiChevronRight,
  FiEdit,
  FiTrash2,
  FiPlay,
  FiTool,
  FiLayers,
  FiArchive,
  FiFile,
  FiList,
  FiCalendar,
  FiFilter,
  FiRefreshCw,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { fetchFaaRegistryViaApi, parseTailForFaaQuery } from '../services/faaRegistryLookup';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';

type Tab = 'library' | 'search' | 'configuration' | 'findings' | 'timeline' | 'due_list';
type ArrangeBy = 'date_desc' | 'date_asc' | 'type_sections';
type EntryLocation = 'full' | 'ad' | 'sb';

type EntrySection = {
  key: string;
  label: string;
  entries: LogbookEntry[];
};

function compareEntryDate(a: LogbookEntry, b: LogbookEntry, order: 'asc' | 'desc') {
  const aDate = a.entryDate ?? '';
  const bDate = b.entryDate ?? '';
  if (!aDate && bDate) return 1;
  if (aDate && !bDate) return -1;
  const dateSort = order === 'asc' ? aDate.localeCompare(bDate) : bDate.localeCompare(aDate);
  if (dateSort !== 0) return dateSort;
  return a._id.localeCompare(b._id);
}

function groupEntriesByType(entries: LogbookEntry[], order: 'asc' | 'desc'): EntrySection[] {
  const buckets = new Map<string, LogbookEntry[]>();
  for (const entry of entries) {
    const key = entry.entryType ?? 'other';
    const list = buckets.get(key) ?? [];
    list.push(entry);
    buckets.set(key, list);
  }

  const sections: EntrySection[] = [];
  for (const typeKey of LOGBOOK_ENTRY_TYPE_ORDER) {
    const list = buckets.get(typeKey);
    if (!list || list.length === 0) continue;
    sections.push({
      key: typeKey,
      label: getLogbookEntryTypeLabel(typeKey),
      entries: [...list].sort((a, b) => compareEntryDate(a, b, order)),
    });
    buckets.delete(typeKey);
  }

  for (const [key, list] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    sections.push({
      key,
      label: getLogbookEntryTypeLabel(key),
      entries: [...list].sort((a, b) => compareEntryDate(a, b, order)),
    });
  }

  return sections;
}

function filterEntriesByLocation(entries: LogbookEntry[], location: EntryLocation): LogbookEntry[] {
  if (location === 'ad') return entries.filter((entry) => hasAdReference(entry));
  if (location === 'sb') return entries.filter((entry) => hasSbReference(entry));
  return entries;
}

type TTLUnit = 'hours' | 'cycles' | 'landings' | 'calendar_months';

type TTLResult =
  | { manualCheck: true; unit: string; lifeLimit: number }
  | { manualCheck: false; unit: TTLUnit; currentUsed: number; remaining: number; remainingPct: number; lifeLimit: number };

function calcTTL(component: AircraftComponent, currentAircraftTime: number | undefined): TTLResult | null {
  if (!component.isLifeLimited || !component.lifeLimit) return null;
  const unit = (component.lifeLimitUnit ?? 'hours') as TTLUnit;

  if (unit === 'hours') {
    const timeAtInstall = component.aircraftTimeAtInstall ?? 0;
    const tsnAtInstall = component.tsnAtInstall ?? 0;
    const usedSinceInstall = Math.max(0, (currentAircraftTime ?? 0) - timeAtInstall);
    const currentUsed = tsnAtInstall + usedSinceInstall;
    const remaining = component.lifeLimit - currentUsed;
    return { manualCheck: false, unit, currentUsed, remaining, remainingPct: remaining / component.lifeLimit, lifeLimit: component.lifeLimit };
  }

  if (unit === 'calendar_months') {
    if (!component.installDate) return { manualCheck: true, unit, lifeLimit: component.lifeLimit };
    const monthsInstalled = (Date.now() - new Date(component.installDate).getTime()) / (1000 * 60 * 60 * 24 * 30.4375);
    const remaining = component.lifeLimit - monthsInstalled;
    return { manualCheck: false, unit, currentUsed: monthsInstalled, remaining, remainingPct: remaining / component.lifeLimit, lifeLimit: component.lifeLimit };
  }

  // cycles / landings — require schema data not yet stored; flag for manual check
  return { manualCheck: true, unit, lifeLimit: component.lifeLimit };
}

/** Average aircraft hours per month, computed over the last `windowDays` of logbook entries. */
function calcUtilizationRate(entries: LogbookEntry[], windowDays = 180): number | null {
  const cutoff = nDaysAgo(windowDays); // reuse helper defined above
  const relevant = entries
    .filter((e) => e.entryDate && e.entryDate >= cutoff && e.totalTimeAtEntry !== undefined)
    .sort((a, b) => a.entryDate!.localeCompare(b.entryDate!));
  if (relevant.length < 2) return null;
  const first = relevant[0];
  const last = relevant[relevant.length - 1];
  const ttDelta = last.totalTimeAtEntry! - first.totalTimeAtEntry!;
  const d = daysBetween(first.entryDate!, last.entryDate!);
  if (d <= 0 || ttDelta <= 0) return null;
  return ttDelta / (d / 30.4375);
}

/** Format months as "Xmo" or "Xyr Ymo". */
function fmtMonths(m: number): string {
  if (m < 0) return 'overdue';
  const mo = Math.round(m);
  if (mo < 12) return `${mo} mo`;
  const yr = Math.floor(mo / 12);
  const rem = mo % 12;
  return rem > 0 ? `${yr}yr ${rem}mo` : `${yr}yr`;
}

export default function LogbookManagement() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const [tab, setTab] = useState<Tab>('library');
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | undefined>(undefined);
  const [showAddAircraft, setShowAddAircraft] = useState(false);

  const aircraft = (useAircraftAssets(activeProjectId ?? undefined) ?? []) as AircraftAsset[];
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
            selected={effectiveAircraftId}
            onSelect={setSelectedAircraftId}
            onAdd={() => setShowAddAircraft(true)}
          />
          <div className="flex gap-1 rounded-lg p-1 bg-[#dbc8a7] border border-amber-300/80">
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
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
            {tab === 'due_list' && <DueListTab projectId={activeProjectId} aircraftId={effectiveAircraftId} currentTT={currentTT} aircraft={selectedAircraft} />}
            {tab === 'configuration' && <ConfigurationTab projectId={activeProjectId} aircraftId={effectiveAircraftId} aircraft={selectedAircraft!} currentTT={currentTT} entries={allEntries} />}
            {tab === 'findings' && <FindingsTab projectId={activeProjectId} aircraftId={effectiveAircraftId} />}
            {tab === 'timeline' && <TimelineTab projectId={activeProjectId} aircraftId={effectiveAircraftId} />}
          </>
        )}
      </div>

      {/* Add Aircraft Modal */}
      {showAddAircraft && (
        <AddAircraftModal
          projectId={activeProjectId}
          onCreate={createAircraft}
          onClose={() => setShowAddAircraft(false)}
          onCreated={(id) => {
            setSelectedAircraftId(id);
            setShowAddAircraft(false);
          }}
        />
      )}
    </div>
  );
}

/* ─── Aircraft Selector ──────────────────────────────────────────────── */

function AircraftSelector({
  aircraft,
  selected,
  onSelect,
  onAdd,
}: {
  aircraft: AircraftAsset[];
  selected?: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
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
          {current ? `${current.tailNumber} — ${current.make ?? ''} ${current.model ?? ''}`.trim() : 'Select Aircraft'}
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
                <div className="text-xs text-stone-500">{[a.make, a.model, a.serial].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
          <div className="border-t border-amber-200">
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

  const daysSince = lastEntry
    ? Math.round((Date.now() - new Date(lastEntry.entryDate!).getTime()) / 86400000)
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

/* ─── Add Aircraft Modal ─────────────────────────────────────────────── */

function AddAircraftModal({
  projectId,
  onCreate,
  onClose,
  onCreated,
}: {
  projectId: string;
  onCreate: any;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [form, setForm] = useState({ tailNumber: '', make: '', model: '', serial: '', operator: '', year: '' });
  const [saving, setSaving] = useState(false);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryHint, setRegistryHint] = useState<string | null>(null);
  const lookupGen = useRef(0);

  useEffect(() => {
    const tail = form.tailNumber;
    const parsed = parseTailForFaaQuery(tail);
    if (!parsed || parsed.query.length < 3) {
      setRegistryHint(null);
      setRegistryLoading(false);
      return;
    }

    const gen = ++lookupGen.current;
    const ac = new AbortController();
    const t = window.setTimeout(async () => {
      setRegistryLoading(true);
      setRegistryHint(null);
      try {
        const data = await fetchFaaRegistryViaApi(tail, ac.signal);
        if (gen !== lookupGen.current) return;
        if (!data) {
          setRegistryHint('No FAA registry match for this N-number. Enter details manually.');
          return;
        }
        setForm((f) => ({
          ...f,
          tailNumber: data.tailNumber,
          make: f.make.trim() ? f.make : (data.make ?? ''),
          model: f.model.trim() ? f.model : (data.model ?? ''),
          serial: f.serial.trim() ? f.serial : (data.serial ?? ''),
          operator: f.operator.trim() ? f.operator : (data.operator ?? ''),
          year: f.year.trim() ? f.year : (data.year != null ? String(data.year) : ''),
        }));
        setRegistryHint('Loaded from FAA Civil Aircraft Registry — you can edit any field.');
      } catch (e: unknown) {
        if (gen !== lookupGen.current) return;
        if (e instanceof Error && e.name === 'AbortError') return;
        const msg = e instanceof Error ? e.message : 'Lookup failed';
        setRegistryHint(msg);
      } finally {
        if (gen === lookupGen.current) setRegistryLoading(false);
      }
    }, 550);

    return () => {
      window.clearTimeout(t);
      ac.abort();
    };
  }, [form.tailNumber]);

  const handleSave = async () => {
    if (!form.tailNumber.trim()) { toast.error('Tail number is required'); return; }
    setSaving(true);
    try {
      const id = await onCreate({
        projectId: projectId as any,
        tailNumber: form.tailNumber.trim(),
        make: form.make || undefined,
        model: form.model || undefined,
        serial: form.serial || undefined,
        operator: form.operator || undefined,
        year: form.year ? Number(form.year) : undefined,
      });
      toast.success(`Aircraft ${form.tailNumber} added`);
      onCreated(id);
    } catch (err: any) {
      toast.error(err.message || 'Failed to add aircraft');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#fffaf2] border border-amber-300/80 rounded-xl shadow-2xl w-full max-w-md p-6 text-stone-800">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-stone-900 font-['Source_Serif_4',serif]">Add Aircraft</h2>
          <button type="button" onClick={onClose} className="text-stone-500 hover:text-stone-800"><FiX /></button>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-stone-600 leading-relaxed">
            Enter a U.S. N-number — we query the{' '}
            <a
              href="https://registry.faa.gov/AircraftInquiry/Search/NNumberInquiry"
              target="_blank"
              rel="noreferrer"
              className="text-sky-800 hover:text-sky-950 underline underline-offset-2"
            >
              FAA Civil Aircraft Registry
            </a>{' '}
            and fill empty fields. Everything stays editable.
          </p>
          {(registryLoading || registryHint) && (
            <div
              className={`text-xs rounded-lg px-3 py-2 border ${
                registryLoading
                  ? 'border-sky-300 bg-sky-50 text-sky-900'
                  : 'border-amber-300/80 bg-[#fffef9] text-stone-600'
              }`}
            >
              {registryLoading ? 'Looking up FAA registry…' : registryHint}
            </div>
          )}
          {([
            ['tailNumber', 'Tail Number *'],
            ['make', 'Make (e.g. Cessna)'],
            ['model', 'Model (e.g. 172S)'],
            ['serial', 'Serial Number'],
            ['operator', 'Registered owner / operator'],
            ['year', 'Year manufactured'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-stone-600 mb-1">{label}</label>
              <input
                type={key === 'year' ? 'number' : 'text'}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-800 focus:outline-none focus:border-sky-600"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:text-stone-900">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-sky-700 text-white border border-sky-900/20 rounded-lg hover:bg-sky-800 disabled:opacity-50"
          >
            {saving ? 'Adding...' : 'Add Aircraft'}
          </button>
        </div>
      </div>
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

/* ─── Logbooks Library Tab ───────────────────────────────────────────── */

function LogbooksLibraryTab({ projectId, aircraftId }: { projectId: string; aircraftId: string }) {
  const convex = useConvex();
  const logbookDocuments = (useDocuments(projectId, 'logbook') ?? []) as any[];
  const draftEntries = (useLogbookDraftEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const confirmedEntries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const model = useDefaultClaudeModel();
  const addDocument = useAddDocument();
  const updateDocumentExtractedText = useUpdateDocumentExtractedText();
  const removeDocument = useRemoveDocument();
  const generateUploadUrl = useGenerateUploadUrl();
  const addDraftEntries = useAddLogbookDraftEntries();
  const removeDraftEntriesBySource = useRemoveLogbookDraftEntriesBySourceDocument();
  const removeSelectedDraftEntries = useRemoveSelectedLogbookDraftEntries();
  const importSelectedDraftEntries = useImportSelectedLogbookDraftEntries();
  const addLogbookEntries = useAddLogbookEntries();

  const [uploading, setUploading] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [parseDiagnosticsByDocument, setParseDiagnosticsByDocument] = useState<Record<string, LogbookParseDiagnostics | undefined>>({});
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [docSort, setDocSort] = useState<'date' | 'name'>('date');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'needs_review'>('all');
  const [expandedDraftId, setExpandedDraftId] = useState<string | null>(null);

  const sortedDocuments = useMemo(() => {
    return [...logbookDocuments].sort((a, b) =>
      docSort === 'date'
        ? b.extractedAt.localeCompare(a.extractedAt)
        : a.name.localeCompare(b.name)
    );
  }, [logbookDocuments, docSort]);

  const draftsByDocument = useMemo(() => {
    const grouped = new Map<string, LogbookEntry[]>();
    for (const draft of draftEntries) {
      if (!draft.sourceDocumentId) continue;
      const list = grouped.get(draft.sourceDocumentId) ?? [];
      list.push(draft);
      grouped.set(draft.sourceDocumentId, list);
    }
    return grouped;
  }, [draftEntries]);

  const groupedDraftsByDocument = useMemo(() => {
    return sortedDocuments
      .map((doc) => {
        const docDrafts = (draftsByDocument.get(doc._id) ?? [])
          .slice()
          .sort((a, b) => {
            if (!a.entryDate && !b.entryDate) return 0;
            if (!a.entryDate) return 1;
            if (!b.entryDate) return -1;
            return a.entryDate.localeCompare(b.entryDate);
          });
        return { doc, drafts: docDrafts };
      })
      .filter((group) => group.drafts.length > 0);
  }, [sortedDocuments, draftsByDocument]);

  useEffect(() => {
    const validDraftIds = new Set(draftEntries.map((d) => d._id));
    setSelectedDraftIds((prev) => {
      const next = new Set<string>();
      for (const id of prev) {
        if (validDraftIds.has(id)) next.add(id);
      }
      return next;
    });
  }, [draftEntries]);

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.csv';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0) return;
      const extractor = new DocumentExtractor();
      setUploading(true);
      let uploadedCount = 0;
      try {
        for (const file of files) {
          let extractedText = '';
          let extractionMeta: { backend: string; confidence?: number } | undefined;
          let storageId: any = undefined;
          try {
            const uploadUrl = await generateUploadUrl();
            const uploadResult = await fetch(uploadUrl, {
              method: 'POST',
              headers: { 'Content-Type': file.type || 'application/octet-stream' },
              body: file,
            });
            const uploadJson = await uploadResult.json();
            storageId = uploadJson.storageId;
          } catch {
            // Storage upload is best-effort; parsing can still proceed from extracted text.
          }
          try {
            const buffer = await file.arrayBuffer();
            const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, model);
            extractedText = extracted.text;
            extractionMeta = extracted.metadata;
          } catch (err: any) {
            toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
          }
          await addDocument({
            projectId: projectId as any,
            category: 'logbook',
            name: file.name,
            path: file.name,
            source: 'local',
            mimeType: file.type || undefined,
            size: file.size,
            storageId,
            extractedText: extractedText || undefined,
            extractionMeta,
            extractedAt: new Date().toISOString(),
          } as any);
          uploadedCount += 1;
        }
      } finally {
        setUploading(false);
      }
      if (uploadedCount > 0) {
        toast.success(`Added ${uploadedCount} logbook file${uploadedCount === 1 ? '' : 's'}`);
      }
    };
    input.click();
  };

  const fetchFileBuffer = useCallback(async (url: string): Promise<ArrayBuffer> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`File download failed (${response.status})`);
    }
    return response.arrayBuffer();
  }, []);

  const ensureDocumentText = useCallback(async (doc: any): Promise<string> => {
    const existingText = typeof doc?.extractedText === 'string' ? doc.extractedText.trim() : '';
    if (existingText) return doc.extractedText;

    const fileUrl = await convex.query((api as any).fileActions.getProjectDocumentFileUrl, {
      documentId: doc._id as any,
    });
    if (!fileUrl) {
      toast.warning(`"${doc.name}" has no extracted text and no stored file available for re-extraction.`);
      return '';
    }

    setParseProgress(`Extracting text for ${doc.name}...`);
    const fileBuffer = await fetchFileBuffer(fileUrl);
    const extractor = new DocumentExtractor();
    const extracted = await extractor.extractTextWithMetadata(
      fileBuffer,
      doc.name,
      doc.mimeType || 'application/octet-stream',
      model
    );

    const extractedText = (extracted.text ?? '').trim();
    if (!extractedText) {
      toast.warning(`No readable text found in "${doc.name}".`);
      return '';
    }

    await updateDocumentExtractedText({
      documentId: doc._id as any,
      extractedText,
      extractedAt: new Date().toISOString(),
      mimeType: doc.mimeType || undefined,
      size: doc.size || undefined,
      extractionMeta: extracted.metadata,
    } as any);

    return extractedText;
  }, [convex, fetchFileBuffer, model, updateDocumentExtractedText]);

  const parseSelectedDocuments = useCallback(async (documentIds: string[]) => {
    const docsToParse = logbookDocuments.filter((d) => documentIds.includes(d._id));
    if (docsToParse.length === 0) {
      toast.warning('Select at least one logbook file to parse.');
      return;
    }
    setParsing(true);
    try {
      for (let i = 0; i < docsToParse.length; i++) {
        const doc = docsToParse[i];
        setParseProgress(`Parsing ${doc.name} (${i + 1}/${docsToParse.length})...`);
        let textToParse = typeof doc.extractedText === 'string' ? doc.extractedText : '';
        if (!textToParse.trim()) {
          textToParse = await ensureDocumentText(doc);
        }
        if (!textToParse.trim()) {
          continue;
        }
        const result = await parseLogbookText(textToParse, {
          sourceDocumentId: doc._id,
          model,
          ocrConfidenceHint: typeof doc?.extractionMeta?.confidence === 'number' ? doc.extractionMeta.confidence : undefined,
          ocrBackendHint: typeof doc?.extractionMeta?.backend === 'string' ? doc.extractionMeta.backend : undefined,
          onProgress: (chunk, total) => setParseProgress(`Parsing ${doc.name}: chunk ${chunk}/${total}`),
          debug: true,
        });
        setParseDiagnosticsByDocument((prev) => ({ ...prev, [doc._id]: result.diagnostics }));
        if (result.diagnostics) {
          const chunkTable = result.diagnostics.chunks.map((chunk) => ({
            chunk: chunk.chunkIndex,
            strategy: chunk.strategy,
            chars: chunk.charLength,
            lines: chunk.lineCount,
            starts: chunk.estimatedStartDates,
            signatures: chunk.estimatedSignatureEnds,
            parsed: chunk.parsedEntriesCount,
          }));
          console.table(chunkTable);
          if (result.entries.length <= 1) {
            toast.warning(`Parser only found ${result.entries.length} entry in ${doc.name}.`, {
              description: `Strategy: ${result.diagnostics.strategyUsed}. Segments: ${result.diagnostics.totalSegments}. Check diagnostics panel for chunk-level detail.`,
            });
          }
        }
        await removeDraftEntriesBySource({
          projectId: projectId as any,
          aircraftId: aircraftId as any,
          sourceDocumentId: doc._id as any,
        });
        if (result.entries.length === 0) continue;
        const draftPayload = result.entries.map((e) => ({
          sourcePage: e.sourcePage,
          rawText: e.rawText,
          entryDate: e.entryDate,
          workPerformed: e.workPerformed,
          ataChapter: e.ataChapter,
          adReferences: e.adReferences,
          sbReferences: e.sbReferences,
          adSbReferences: e.adSbReferences,
          totalTimeAtEntry: e.totalTimeAtEntry,
          totalCyclesAtEntry: e.totalCyclesAtEntry,
          totalLandingsAtEntry: e.totalLandingsAtEntry,
          signerName: e.signerName,
          signerCertNumber: e.signerCertNumber,
          signerCertType: e.signerCertType,
          returnToServiceStatement: e.returnToServiceStatement,
          hasReturnToService: e.hasReturnToService,
          entryType: e.entryType,
          confidence: e.confidence,
          fieldConfidence: e.fieldConfidence,
        }));
        try {
          await addDraftEntries({
            projectId: projectId as any,
            aircraftId: aircraftId as any,
            sourceDocumentId: doc._id as any,
            entries: draftPayload,
          });
        } catch (err: any) {
          const message = String(err?.message ?? '');
          const hasLegacyValidatorMismatch =
            message.includes('extra field `sbReferences`') ||
            message.includes('extra field `adReferences`');
          if (!hasLegacyValidatorMismatch) throw err;
          // Backward compatibility: some deployed backends still only accept adSbReferences.
          await addDraftEntries({
            projectId: projectId as any,
            aircraftId: aircraftId as any,
            sourceDocumentId: doc._id as any,
            entries: draftPayload.map(({ adReferences: _ad, sbReferences: _sb, ...entry }) => entry),
          });
        }
      }
      toast.success('Parsed selected logbook files into candidate entries.');
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse selected files');
    } finally {
      setParsing(false);
      setParseProgress('');
    }
  }, [addDraftEntries, aircraftId, ensureDocumentText, logbookDocuments, model, projectId, removeDraftEntriesBySource]);

  const handleImportSelected = async () => {
    if (selectedDraftIds.size === 0) {
      toast.warning('Select at least one candidate entry to import.');
      return;
    }
    try {
      const result = await importSelectedDraftEntries({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        draftIds: Array.from(selectedDraftIds) as any,
      });
      setSelectedDraftIds(new Set());
      toast.success(`Imported ${result.imported} logbook entr${result.imported === 1 ? 'y' : 'ies'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to import selected entries');
    }
  };

  const handleDeleteSelectedDrafts = async () => {
    const count = selectedDraftIds.size;
    if (count === 0) {
      toast.warning('Select at least one entry to delete.');
      return;
    }
    if (!confirm(`Permanently delete ${count} staged entr${count === 1 ? 'y' : 'ies'}?`)) return;
    try {
      await removeSelectedDraftEntries({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        draftIds: Array.from(selectedDraftIds) as any,
      });
      setSelectedDraftIds(new Set());
      toast.success(`Deleted ${count} staged entr${count === 1 ? 'y' : 'ies'}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entries');
    }
  };

  const handleDeleteSingleDraft = async (draftId: string) => {
    if (!confirm('Permanently delete this staged entry?')) return;
    try {
      await removeSelectedDraftEntries({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        draftIds: [draftId as any],
      });
      setSelectedDraftIds((prev) => {
        const next = new Set(prev);
        next.delete(draftId);
        return next;
      });
      toast.success('Staged entry deleted');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete entry');
    }
  };

  const handleDeleteDocument = async (doc: any) => {
    if (!confirm(`Delete "${doc.name}" and its staged entries?`)) return;
    try {
      await removeDraftEntriesBySource({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        sourceDocumentId: doc._id as any,
      });
      await removeDocument({ documentId: doc._id as any });
      setSelectedDocumentIds((prev) => {
        const next = new Set(prev);
        next.delete(doc._id);
        return next;
      });
      toast.success('Logbook file removed');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete logbook file');
    }
  };

  return (
    <div className="space-y-4 text-stone-800">
      <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-sky-700 text-white border border-sky-900/20 rounded-lg hover:bg-sky-800 disabled:opacity-50"
          >
            <FiUpload />
            {uploading ? 'Uploading...' : 'Upload Logbooks (PDF/CSV)'}
          </button>
          <button
            type="button"
            onClick={() => parseSelectedDocuments(Array.from(selectedDocumentIds))}
            disabled={parsing || selectedDocumentIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-amber-600 text-white border border-amber-900/20 rounded-lg hover:bg-amber-700 disabled:opacity-50"
          >
            <FiPlay />
            {parsing ? parseProgress || 'Parsing...' : `Parse Selected Files (${selectedDocumentIds.size})`}
          </button>
          <button
            type="button"
            onClick={handleImportSelected}
            disabled={selectedDraftIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-green-700 text-white border border-green-900/20 rounded-lg hover:bg-green-800 disabled:opacity-50"
          >
            <FiCheck />
            Import Selected Entries ({selectedDraftIds.size})
          </button>
          <button
            type="button"
            onClick={handleDeleteSelectedDrafts}
            disabled={selectedDraftIds.size === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-red-700 text-white border border-red-900/20 rounded-lg hover:bg-red-800 disabled:opacity-50"
          >
            <FiTrash2 />
            Delete Selected ({selectedDraftIds.size})
          </button>
          <button
            type="button"
            onClick={() => setShowManualEntry(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-stone-700 text-white border border-stone-900/20 rounded-lg hover:bg-stone-800"
          >
            <FiPlus />
            Add Entry Manually
          </button>
          <button
            type="button"
            onClick={() => setShowBulkImport(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-sky-900 bg-sky-50 border border-sky-300 rounded-lg hover:bg-sky-100"
            title="Import CSV/TSV exports from Bluetail, CAMP, Veryon, or any spreadsheet"
          >
            <FiUpload className="text-sky-700" />
            Bulk Import CSV
          </button>
        </div>
      </div>

      {Object.keys(parseDiagnosticsByDocument).length > 0 && (
        <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-4 shadow-sm">
          <details>
            <summary className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif] cursor-pointer select-none">
              Parsing Diagnostics
            </summary>
            <div className="mt-3 space-y-4">
              {logbookDocuments
                .filter((doc) => parseDiagnosticsByDocument[doc._id])
                .map((doc) => {
                  const diagnostics = parseDiagnosticsByDocument[doc._id];
                  if (!diagnostics) return null;
                  const totalParsed = diagnostics.chunks.reduce((s, c) => s + c.parsedEntriesCount, 0);
                  const zeroYieldCount = diagnostics.chunks.filter((c) => c.parsedEntriesCount === 0).length;
                  return (
                    <div key={doc._id} className="rounded border border-amber-200 px-3 py-2 text-xs text-stone-700">
                      <div className="font-semibold text-stone-800 mb-1">{doc.name}</div>
                      <div className="text-stone-600 mb-2 flex flex-wrap gap-x-4 gap-y-0.5">
                        <span>Strategy: <span className="font-mono text-sky-800">{diagnostics.strategyUsed}</span></span>
                        <span>Segments: <span className="font-mono">{diagnostics.totalSegments}</span></span>
                        <span>Total entries: <span className="font-mono font-semibold text-green-700">{totalParsed}</span></span>
                        {zeroYieldCount > 0 && (
                          <span className="text-amber-700 font-semibold">
                            ⚠ {zeroYieldCount} chunk{zeroYieldCount > 1 ? 's' : ''} yielded 0 entries
                          </span>
                        )}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-[10px] border-collapse">
                          <thead>
                            <tr className="bg-amber-50 text-stone-600 uppercase tracking-wide">
                              <th className="px-2 py-1 text-left font-semibold border border-amber-200">#</th>
                              <th className="px-2 py-1 text-left font-semibold border border-amber-200">Strategy</th>
                              <th className="px-2 py-1 text-right font-semibold border border-amber-200">Chars</th>
                              <th className="px-2 py-1 text-right font-semibold border border-amber-200">Lines</th>
                              <th className="px-2 py-1 text-right font-semibold border border-amber-200">Date Lines</th>
                              <th className="px-2 py-1 text-right font-semibold border border-amber-200">Entries</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diagnostics.chunks.map((chunk) => (
                              <tr key={chunk.chunkIndex} className={chunk.parsedEntriesCount === 0 ? 'bg-amber-50' : 'bg-white'}>
                                <td className="px-2 py-1 border border-amber-200 font-mono">{chunk.chunkIndex}</td>
                                <td className="px-2 py-1 border border-amber-200 font-mono">{chunk.strategy}</td>
                                <td className="px-2 py-1 border border-amber-200 text-right font-mono">{chunk.charLength.toLocaleString()}</td>
                                <td className="px-2 py-1 border border-amber-200 text-right font-mono">{chunk.lineCount}</td>
                                <td className="px-2 py-1 border border-amber-200 text-right font-mono">{chunk.estimatedStartDates}</td>
                                <td className={`px-2 py-1 border border-amber-200 text-right font-mono font-semibold ${chunk.parsedEntriesCount === 0 ? 'text-amber-700' : 'text-green-700'}`}>
                                  {chunk.parsedEntriesCount === 0 ? '⚠ 0' : chunk.parsedEntriesCount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {zeroYieldCount > 0 && (
                        <div className="mt-2 text-amber-700 font-medium">
                          {zeroYieldCount} segment{zeroYieldCount > 1 ? 's' : ''} produced no entries — consider re-parsing or reviewing document quality.
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </details>
        </div>
      )}

      <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">
            Logbook Files ({logbookDocuments.length})
          </h3>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-[11px] text-stone-500">
              <span>Sort:</span>
              <button
                type="button"
                onClick={() => setDocSort('date')}
                className={`px-1.5 py-0.5 rounded transition-colors ${docSort === 'date' ? 'bg-sky-100 text-sky-800 font-medium' : 'hover:text-stone-800'}`}
              >
                Recent
              </button>
              <button
                type="button"
                onClick={() => setDocSort('name')}
                className={`px-1.5 py-0.5 rounded transition-colors ${docSort === 'name' ? 'bg-sky-100 text-sky-800 font-medium' : 'hover:text-stone-800'}`}
              >
                Name
              </button>
            </div>
            <button
              type="button"
              onClick={() => setSelectedDocumentIds(new Set(logbookDocuments.map((d) => d._id)))}
              className="text-xs text-sky-800 hover:text-sky-950"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelectedDocumentIds(new Set())}
              className="text-xs text-stone-500 hover:text-stone-800"
            >
              Clear
            </button>
          </div>
        </div>
        {sortedDocuments.length === 0 ? (
          <p className="text-xs text-stone-500">No logbook files uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedDocuments.map((doc) => {
              const selected = selectedDocumentIds.has(doc._id);
              const docDrafts = draftsByDocument.get(doc._id) ?? [];
              const draftCount = docDrafts.length;
              const avgConfidence = draftCount > 0
                ? docDrafts.reduce((sum, d) => sum + (d.confidence ?? 0), 0) / draftCount
                : undefined;
              const lowCount = docDrafts.filter((d) => (d.confidence ?? 1) < 0.75).length;
              const confColor = avgConfidence === undefined ? 'bg-stone-300'
                : avgConfidence >= 0.8 ? 'bg-green-500'
                : avgConfidence >= 0.6 ? 'bg-amber-400'
                : 'bg-red-500';
              return (
                <div key={doc._id} className="rounded-lg border border-amber-200 px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(e) =>
                        setSelectedDocumentIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(doc._id);
                          else next.delete(doc._id);
                          return next;
                        })
                      }
                      className="rounded border-amber-300"
                    />
                    <FiFile className="text-stone-500 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-stone-800 truncate">{doc.name}</div>
                      <div className="flex items-center gap-3 text-[11px] text-stone-500">
                        <span>{draftCount} staged entr{draftCount === 1 ? 'y' : 'ies'}</span>
                        {lowCount > 0 && (
                          <span className="text-amber-700 font-medium">{lowCount} need review</span>
                        )}
                      </div>
                    </div>
                    {/* Document quality score */}
                    {avgConfidence !== undefined && (
                      <div className="flex-shrink-0 text-right">
                        <div className="text-[10px] text-stone-500 mb-0.5">Doc quality</div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                            <div className={`h-full rounded-full ${confColor}`} style={{ width: `${Math.round(avgConfidence * 100)}%` }} />
                          </div>
                          <span className={`text-[11px] font-bold tabular-nums ${avgConfidence >= 0.8 ? 'text-green-700' : avgConfidence >= 0.6 ? 'text-amber-700' : 'text-red-700'}`}>
                            {Math.round(avgConfidence * 100)}%
                          </span>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => parseSelectedDocuments([doc._id])}
                      disabled={parsing}
                      className="px-2 py-1 text-xs text-amber-900 bg-amber-100 border border-amber-300 rounded hover:bg-amber-200 disabled:opacity-50"
                    >
                      Parse
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDocument(doc)}
                      className="p-1.5 text-stone-500 hover:text-red-700"
                      title="Delete file"
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">
            Staged Candidate Entries ({draftEntries.length})
          </h3>
          {draftEntries.length > 0 && (
            <div className="flex items-center gap-3 text-[11px]">
              {/* Needs Review toggle */}
              {(() => {
                const needsReviewCount = draftEntries.filter((d) => (d.confidence ?? 1) < 0.75).length;
                return needsReviewCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => setReviewFilter((prev) => prev === 'needs_review' ? 'all' : 'needs_review')}
                    className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
                      reviewFilter === 'needs_review'
                        ? 'bg-amber-600 text-white border-amber-800'
                        : 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                    }`}
                  >
                    <FiAlertTriangle className="text-xs" />
                    {needsReviewCount} Need Review
                  </button>
                ) : null;
              })()}
              <button
                type="button"
                onClick={() => setSelectedDraftIds(new Set(draftEntries.map((d) => d._id)))}
                className="text-sky-800 hover:text-sky-950"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedDraftIds(new Set())}
                className="text-stone-500 hover:text-stone-800"
              >
                Clear
              </button>
            </div>
          )}
        </div>
        {draftEntries.length === 0 ? (
          <p className="text-xs text-stone-500">Parse uploaded files to stage entries for selection.</p>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-auto">
            {groupedDraftsByDocument.map(({ doc, drafts }) => {
              const visibleDrafts = reviewFilter === 'needs_review'
                ? [...drafts].filter((d) => (d.confidence ?? 1) < 0.75).sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))
                : drafts;
              if (visibleDrafts.length === 0) return null;
              const allSelected = visibleDrafts.every((d) => selectedDraftIds.has(d._id));
              const someSelected = visibleDrafts.some((d) => selectedDraftIds.has(d._id));
              return (
                <details key={doc._id} open className="rounded-lg border border-amber-200 overflow-hidden">
                  <summary className="flex items-center gap-2 cursor-pointer px-3 py-2 bg-amber-50 hover:bg-amber-100/70 select-none">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                      onChange={(e) => {
                        setSelectedDraftIds((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) visibleDrafts.forEach((d) => next.add(d._id));
                          else visibleDrafts.forEach((d) => next.delete(d._id));
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-amber-300 flex-shrink-0"
                    />
                    <FiFile className="text-stone-500 flex-shrink-0 text-[11px]" />
                    <span className="text-xs font-medium text-stone-800 truncate flex-1 min-w-0">{doc.name}</span>
                    <span className="text-[11px] text-stone-500 flex-shrink-0 ml-auto">
                      {visibleDrafts.filter((d) => selectedDraftIds.has(d._id)).length}/{visibleDrafts.length} selected
                      {reviewFilter === 'needs_review' ? ' · needs review' : ' · oldest→newest'}
                    </span>
                  </summary>
                  <div className="divide-y divide-amber-100">
                    {visibleDrafts.map((entry) => {
                      const selected = selectedDraftIds.has(entry._id);
                      const conf = entry.confidence ?? undefined;
                      const confPct = conf !== undefined ? Math.round(conf * 100) : undefined;
                      const confColor = conf === undefined ? 'text-stone-400'
                        : conf >= 0.8 ? 'text-green-700'
                        : conf >= 0.6 ? 'text-amber-700'
                        : 'text-red-700';
                      const confBarColor = conf === undefined ? 'bg-stone-300'
                        : conf >= 0.8 ? 'bg-green-500'
                        : conf >= 0.6 ? 'bg-amber-400'
                        : 'bg-red-500';
                      const isExpanded = expandedDraftId === entry._id;
                      const fieldConf = entry.fieldConfidence as Record<string, number> | undefined;
                      const FIELD_LABELS: Record<string, string> = {
                        entryDate: 'Date', workPerformed: 'Work Performed', ataChapter: 'ATA Chapter',
                        signerName: 'Signer Name', signerCertNumber: 'Cert #', signerCertType: 'Cert Type',
                        totalTimeAtEntry: 'Total Time', totalCyclesAtEntry: 'Cycles', totalLandingsAtEntry: 'Landings',
                        returnToServiceStatement: 'RTS Statement', hasReturnToService: 'RTS', entryType: 'Entry Type',
                        regulatoryBasis: 'Reg. Basis', inspectionType: 'Inspection Type',
                      };
                      return (
                        <div key={entry._id} className={`px-3 py-2 hover:bg-amber-50/50 ${conf !== undefined && conf < 0.75 ? 'border-l-2 border-amber-400' : ''}`}>
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(e) =>
                                setSelectedDraftIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(entry._id);
                                  else next.delete(entry._id);
                                  return next;
                                })
                              }
                              className="mt-1 rounded border-amber-300 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-stone-700">{entry.entryDate ?? 'No date'}</span>
                                {entry.entryType && (
                                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-sky-100 text-sky-900 border border-sky-200">
                                    {getLogbookEntryTypeLabel(entry.entryType)}
                                  </span>
                                )}
                                {/* Confidence badge */}
                                {confPct !== undefined && (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedDraftId(isExpanded ? null : entry._id)}
                                    title="Click to see field-level confidence"
                                    className={`flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                                      conf! < 0.6 ? 'bg-red-100 text-red-800 border-red-300 hover:bg-red-200'
                                      : conf! < 0.75 ? 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200'
                                      : 'bg-green-100 text-green-800 border-green-200 hover:bg-green-200'
                                    }`}
                                  >
                                    <div className="w-8 h-1 rounded-full bg-stone-200 overflow-hidden">
                                      <div className={`h-full rounded-full ${confBarColor}`} style={{ width: `${confPct}%` }} />
                                    </div>
                                    <span className={`font-mono font-bold ${confColor}`}>{confPct}%</span>
                                    {isExpanded ? <FiChevronDown className="text-[9px]" /> : <FiChevronRight className="text-[9px]" />}
                                  </button>
                                )}
                              </div>
                              <p className="text-xs text-stone-600 mt-1 line-clamp-2">
                                {entry.workPerformed ?? entry.rawText.slice(0, 160)}
                              </p>
                              {/* Field confidence heatmap */}
                              {isExpanded && fieldConf && Object.keys(fieldConf).length > 0 && (
                                <div className="mt-2 rounded border border-amber-200 bg-[#fffcf5] p-2 space-y-1">
                                  <div className="text-[10px] font-semibold text-stone-600 uppercase tracking-wide mb-1.5">Field Confidence</div>
                                  {Object.entries(fieldConf)
                                    .sort(([, a], [, b]) => a - b)
                                    .map(([field, fc]) => {
                                      const pct = Math.round(fc * 100);
                                      const barColor = fc >= 0.8 ? 'bg-green-500' : fc >= 0.6 ? 'bg-amber-400' : 'bg-red-500';
                                      const textColor = fc >= 0.8 ? 'text-green-700' : fc >= 0.6 ? 'text-amber-700' : 'text-red-700';
                                      return (
                                        <div key={field} className="flex items-center gap-2">
                                          <span className="text-[10px] text-stone-500 w-28 flex-shrink-0 truncate">
                                            {FIELD_LABELS[field] ?? field}
                                          </span>
                                          <div className="flex-1 h-1.5 rounded-full bg-stone-200 overflow-hidden">
                                            <div className={`h-full rounded-full ${barColor}`} style={{ width: `${pct}%` }} />
                                          </div>
                                          <span className={`text-[10px] font-mono font-bold w-8 text-right tabular-nums ${textColor}`}>{pct}%</span>
                                        </div>
                                      );
                                    })}
                                </div>
                              )}
                              {isExpanded && (!fieldConf || Object.keys(fieldConf).length === 0) && (
                                <div className="mt-2 text-[10px] text-stone-400 italic">No per-field confidence data available for this entry.</div>
                              )}
                            </div>
                            <button
                              type="button"
                              title="Delete staged entry"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteSingleDraft(entry._id); }}
                              className="flex-shrink-0 p-1 text-stone-400 hover:text-red-600 rounded self-start mt-0.5"
                            >
                              <FiTrash2 className="text-xs" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      {showManualEntry && (
        <AddManualEntryModal
          projectId={projectId}
          aircraftId={aircraftId}
          allEntries={confirmedEntries}
          onAdd={addLogbookEntries}
          onClose={() => setShowManualEntry(false)}
        />
      )}
      {showBulkImport && (
        <BulkImportModal
          projectId={projectId}
          aircraftId={aircraftId}
          onAdd={addLogbookEntries}
          onClose={() => setShowBulkImport(false)}
        />
      )}
    </div>
  );
}

/* ─── Search utilities ───────────────────────────────────────────────── */

type SearchMode = 'all' | 'ad' | 'sb' | 'part' | 'cert' | 'ata';

const SEARCH_MODE_LABELS: Record<SearchMode, string> = {
  all: 'All Fields',
  ad: 'AD #',
  sb: 'SB #',
  part: 'Part / SN',
  cert: 'Cert #',
  ata: 'ATA',
};

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const lower = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lower.indexOf(lowerQuery);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-yellow-200 text-stone-900 rounded-sm px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {highlightText(text.slice(idx + query.length), query)}
    </>
  );
}

/* ─── CSV Export ─────────────────────────────────────────────────────── */

function csvEsc(val: string | number | undefined | null): string {
  if (val === undefined || val === null) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildLogbookCSV(entries: LogbookEntry[], tailNumber?: string): string {
  const BOM = '\uFEFF'; // Excel UTF-8 BOM
  const headers = [
    'Date', 'Entry Type', 'Inspection Type', 'ATA Chapter',
    'Work Performed', 'Total Time (hrs)', 'Total Cycles', 'Total Landings',
    'Signer Name', 'Cert Number', 'Cert Type',
    'AD References', 'SB References',
    'Return to Service', 'Has RTS Statement',
    'Confidence', 'User Verified',
  ];

  const rows = entries.map((e) => [
    csvEsc(e.entryDate),
    csvEsc(e.entryType),
    csvEsc(e.inspectionType),
    csvEsc(e.ataChapter),
    csvEsc(e.workPerformed ?? e.rawText.slice(0, 300)),
    csvEsc(e.totalTimeAtEntry),
    csvEsc(e.totalCyclesAtEntry),
    csvEsc(e.totalLandingsAtEntry),
    csvEsc(e.signerName),
    csvEsc(e.signerCertNumber),
    csvEsc(e.signerCertType),
    csvEsc((e.adReferences ?? e.adSbReferences?.filter((r) => /^AD/i.test(r)) ?? []).join('; ')),
    csvEsc((e.sbReferences ?? e.adSbReferences?.filter((r) => /^SB/i.test(r)) ?? []).join('; ')),
    csvEsc(e.returnToServiceStatement),
    csvEsc(e.hasReturnToService ? 'Yes' : e.hasReturnToService === false ? 'No' : ''),
    csvEsc(e.confidence !== undefined ? e.confidence.toFixed(2) : ''),
    csvEsc(e.userVerified ? 'Yes' : ''),
  ].join(','));

  const meta = tailNumber ? `# Aircraft: ${tailNumber}\n# Exported: ${new Date().toISOString().slice(0, 10)}\n# Entries: ${entries.length}\n` : '';
  return BOM + meta + headers.join(',') + '\n' + rows.join('\n');
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─── Logbook Search Tab — helpers ──────────────────────────────────── */

function nDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function thisYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

const SEARCH_HISTORY_KEY = (aircraftId: string) => `aviation-logbook-search-history-${aircraftId}`;

function loadSearchHistory(aircraftId: string): string[] {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY(aircraftId)) ?? '[]'); }
  catch { return []; }
}

function saveSearchToHistory(aircraftId: string, query: string) {
  if (!query.trim()) return;
  const existing = loadSearchHistory(aircraftId).filter((q) => q !== query.trim());
  const updated = [query.trim(), ...existing].slice(0, 12);
  localStorage.setItem(SEARCH_HISTORY_KEY(aircraftId), JSON.stringify(updated));
}

/* ─── Logbook Search Tab ─────────────────────────────────────────────── */

function LogbookSearchTab({ projectId, aircraftId, aircraft }: { projectId: string; aircraftId: string; aircraft?: AircraftAsset }) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const findings = (useComplianceFindings(projectId, aircraftId) ?? []) as ComplianceFinding[];
  const updateEntry = useUpdateLogbookEntry();
  const removeEntry = useRemoveLogbookEntry();
  const claudeModel = useDefaultClaudeModel();

  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [arrangeBy, setArrangeBy] = useState<ArrangeBy>('date_desc');
  const [locationFilter, setLocationFilter] = useState<EntryLocation>('full');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlMatchedIds, setNlMatchedIds] = useState<Set<string> | null>(null);
  const [nlMode, setNlMode] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => loadSearchHistory(aircraftId));
  const [showHistory, setShowHistory] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const runNlSearch = useCallback(async () => {
    if (!search.trim() || entries.length === 0) return;
    saveSearchToHistory(aircraftId, search);
    setSearchHistory(loadSearchHistory(aircraftId));
    setShowHistory(false);
    setNlLoading(true);
    setNlMatchedIds(null);
    try {
      const summaries = entries.map((e) => ({
        id: e._id,
        date: e.entryDate ?? 'unknown',
        type: e.entryType ?? 'other',
        work: e.workPerformed?.slice(0, 200) ?? '',
        ads: getAllAdSbReferences(e).join(', '),
        signer: e.signerName ?? '',
        certNum: e.signerCertNumber ?? '',
        tt: e.totalTimeAtEntry ?? '',
        parts: e.componentMentions?.map((c) => [c.partNumber, c.serialNumber].filter(Boolean).join('/')).join(', ') ?? '',
        ata: e.ataChapter ?? '',
        inspectionType: e.inspectionType ?? '',
      }));
      const response = await createClaudeMessage({
        model: claudeModel ?? DEFAULT_CLAUDE_MODEL,
        max_tokens: 1024,
        system: `You are an aviation maintenance logbook search assistant. Given a natural language query and a list of logbook entry summaries, return the IDs of all entries that match the query intent. Be thorough — include partial matches and related entries. Return ONLY a valid JSON array of matching entry ID strings, with no explanation. Example: ["id1","id2"]`,
        messages: [{ role: 'user', content: `Query: "${search}"\n\nEntries:\n${JSON.stringify(summaries)}` }],
      }, { timeoutMs: 30000 });
      const textBlock = response.content.find((c) => c.type === 'text' && 'text' in c) as { type: string; text?: string } | undefined;
      const text = textBlock?.text ?? '[]';
      const match = text.match(/\[[\s\S]*?\]/);
      if (match) {
        const ids = JSON.parse(match[0]) as string[];
        setNlMatchedIds(new Set(ids));
        toast.success(`AI found ${ids.length} matching ${ids.length === 1 ? 'entry' : 'entries'}`);
      }
    } catch (err: any) {
      toast.error('AI search failed: ' + (err?.message ?? 'Unknown error'));
    } finally {
      setNlLoading(false);
    }
  }, [search, entries, claudeModel]);

  const filtered = useMemo(() => {
    let result = filterEntriesByLocation(entries, locationFilter);
    if (typeFilter) result = result.filter((e) => e.entryType === typeFilter);
    if (dateFrom) result = result.filter((e) => e.entryDate && e.entryDate >= dateFrom);
    if (dateTo) result = result.filter((e) => e.entryDate && e.entryDate <= dateTo);
    if (nlMatchedIds) {
      result = result.filter((e) => nlMatchedIds.has(e._id));
    } else if (search) {
      const lower = search.toLowerCase();
      result = result.filter((e) => {
        switch (searchMode) {
          case 'ad':
            return (
              (e.adReferences?.some((r) => r.toLowerCase().includes(lower))) ||
              (e.adSbReferences?.some((r) => r.toLowerCase().includes(lower))) ||
              (e.adComplianceDetails?.some((d) => d.adNumber.toLowerCase().includes(lower))) ||
              e.rawText.toLowerCase().includes(lower)
            );
          case 'sb':
            return (
              (e.sbReferences?.some((r) => r.toLowerCase().includes(lower))) ||
              (e.adSbReferences?.some((r) => r.toLowerCase().includes(lower))) ||
              (e.sbComplianceDetails?.some((d) => d.sbNumber.toLowerCase().includes(lower))) ||
              e.rawText.toLowerCase().includes(lower)
            );
          case 'part':
            return (
              (e.componentMentions?.some((c) =>
                (c.partNumber && c.partNumber.toLowerCase().includes(lower)) ||
                (c.serialNumber && c.serialNumber.toLowerCase().includes(lower)) ||
                (c.description && c.description.toLowerCase().includes(lower))
              )) ||
              e.rawText.toLowerCase().includes(lower)
            );
          case 'cert':
            return (
              (e.signerCertNumber && e.signerCertNumber.toLowerCase().includes(lower)) ||
              (e.signerName && e.signerName.toLowerCase().includes(lower))
            );
          case 'ata':
            return (e.ataChapter && e.ataChapter.toLowerCase().includes(lower));
          default:
            return (
              e.rawText.toLowerCase().includes(lower) ||
              (e.workPerformed && e.workPerformed.toLowerCase().includes(lower)) ||
              (e.signerName && e.signerName.toLowerCase().includes(lower)) ||
              (e.signerCertNumber && e.signerCertNumber.toLowerCase().includes(lower)) ||
              (e.ataChapter && e.ataChapter.toLowerCase().includes(lower)) ||
              (e.adReferences?.some((r) => r.toLowerCase().includes(lower))) ||
              (e.sbReferences?.some((r) => r.toLowerCase().includes(lower))) ||
              (e.adSbReferences?.some((r) => r.toLowerCase().includes(lower))) ||
              (e.adComplianceDetails?.some((d) => d.adNumber.toLowerCase().includes(lower))) ||
              (e.sbComplianceDetails?.some((d) => d.sbNumber.toLowerCase().includes(lower))) ||
              (e.componentMentions?.some((c) =>
                (c.partNumber && c.partNumber.toLowerCase().includes(lower)) ||
                (c.serialNumber && c.serialNumber.toLowerCase().includes(lower))
              ))
            );
        }
      });
    }
    return result;
  }, [entries, locationFilter, search, searchMode, typeFilter, dateFrom, dateTo, nlMatchedIds]);

  const locationCounts = useMemo(() => ({
    full: entries.length,
    ad: entries.filter((entry) => hasAdReference(entry)).length,
    sb: entries.filter((entry) => hasSbReference(entry)).length,
  }), [entries]);

  const arrangedEntries = useMemo(() => {
    if (arrangeBy === 'date_asc') return [...filtered].sort((a, b) => compareEntryDate(a, b, 'asc'));
    return [...filtered].sort((a, b) => compareEntryDate(a, b, 'desc'));
  }, [arrangeBy, filtered]);

  const groupedEntries = useMemo(() => {
    if (arrangeBy !== 'type_sections') return [];
    return groupEntriesByType(filtered, 'asc');
  }, [arrangeBy, filtered]);

  const missingFindingsByEntry = useMemo(() => {
    const grouped = new Map<string, ComplianceFinding[]>();
    for (const finding of findings) {
      if (!finding.logbookEntryId) continue;
      if (finding.findingType !== 'missing_field' && finding.findingType !== 'incomplete_signoff') continue;
      const list = grouped.get(finding.logbookEntryId) ?? [];
      list.push(finding);
      grouped.set(finding.logbookEntryId, list);
    }
    return grouped;
  }, [findings]);

  const resultStats = useMemo(() => {
    const ataSet = new Set<string>();
    const signerSet = new Set<string>();
    let minDate = '', maxDate = '';
    for (const e of filtered) {
      if (e.ataChapter) ataSet.add(e.ataChapter);
      if (e.signerName) signerSet.add(e.signerName);
      if (e.entryDate) {
        if (!minDate || e.entryDate < minDate) minDate = e.entryDate;
        if (!maxDate || e.entryDate > maxDate) maxDate = e.entryDate;
      }
    }
    return { ataCount: ataSet.size, signerCount: signerSet.size, minDate, maxDate };
  }, [filtered]);

  const activeSearchQuery = nlMatchedIds ? '' : search;
  const isFiltered = !!(search || typeFilter || dateFrom || dateTo || nlMatchedIds || locationFilter !== 'full');

  return (
    <div className="space-y-4 text-stone-800">
      {/* Row 1: Location filter + main search bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1 text-xs">
          <span className="px-2 text-stone-500">Location</span>
          {([
            ['full', 'Full Logbook'],
            ['ad', 'ADs'],
            ['sb', 'SBs'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLocationFilter(value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                locationFilter === value ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'
              }`}
            >
              {label} ({locationCounts[value]})
            </button>
          ))}
        </div>

        {/* Search bar + history dropdown + AI button */}
        <div className="relative flex-1 min-w-[280px] flex gap-2">
          <div className="relative flex-1">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setNlMatchedIds(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (nlMode) { runNlSearch(); }
                  else { saveSearchToHistory(aircraftId, e.currentTarget.value); setSearchHistory(loadSearchHistory(aircraftId)); setShowHistory(false); }
                }
                if (e.key === 'Escape') setShowHistory(false);
              }}
              onFocus={() => searchHistory.length > 0 && setShowHistory(true)}
              onBlur={() => setTimeout(() => setShowHistory(false), 150)}
              placeholder={
                nlMode
                  ? 'Ask the logbook… e.g. "all annual inspections since 2020 with discrepancies"'
                  : searchMode === 'ad' ? 'AD number… e.g. 2023-15-02'
                  : searchMode === 'sb' ? 'SB number… e.g. SB-1234-R1'
                  : searchMode === 'part' ? 'Part number or serial…'
                  : searchMode === 'cert' ? 'Cert # or signer name…'
                  : searchMode === 'ata' ? 'ATA chapter… e.g. 28 or 72'
                  : 'Search entries…'
              }
              className="w-full pl-9 pr-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-sky-600"
            />
            {/* Search history dropdown */}
            {showHistory && searchHistory.length > 0 && (
              <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-white border border-amber-300 rounded-lg shadow-xl overflow-hidden">
                <div className="px-3 py-1.5 border-b border-amber-100 flex items-center justify-between">
                  <span className="text-[10px] text-stone-500 font-semibold uppercase tracking-wide">Recent searches</span>
                  <button
                    type="button"
                    className="text-[10px] text-stone-400 hover:text-red-600"
                    onMouseDown={(e) => { e.preventDefault(); localStorage.removeItem(SEARCH_HISTORY_KEY(aircraftId)); setSearchHistory([]); setShowHistory(false); }}
                  >
                    Clear history
                  </button>
                </div>
                {searchHistory.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-xs text-stone-700 hover:bg-amber-50 flex items-center gap-2"
                    onMouseDown={(e) => { e.preventDefault(); setSearch(q); setNlMatchedIds(null); setShowHistory(false); }}
                  >
                    <FiSearch className="text-stone-400 flex-shrink-0" />
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            title={nlMode ? 'Switch to keyword search' : 'Switch to AI natural language search'}
            onClick={() => { setNlMode((v) => !v); setNlMatchedIds(null); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
              nlMode
                ? 'bg-violet-700 text-white border-violet-900'
                : 'bg-[#fff8eb] text-stone-700 border-amber-300 hover:bg-amber-100'
            }`}
          >
            <FiPlay className="text-sm" />
            {nlMode ? 'AI On' : 'AI Search'}
          </button>
          {nlMode && (
            <button
              type="button"
              onClick={runNlSearch}
              disabled={nlLoading || !search.trim()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-violet-700 text-white border border-violet-900 hover:bg-violet-800 disabled:opacity-50 transition-colors"
            >
              {nlLoading ? 'Searching…' : 'Go'}
            </button>
          )}
          {nlMatchedIds && (
            <button
              type="button"
              onClick={() => setNlMatchedIds(null)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-violet-800 border border-violet-300 bg-violet-50 hover:bg-violet-100"
              title="Clear AI results"
            >
              <FiX className="text-sm" />
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Search mode chips + arrange + type filter + date range */}
      <div className="flex flex-wrap items-center gap-3">
        {!nlMode && (
          <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1 text-xs">
            <span className="px-2 text-stone-500">Search in</span>
            {(Object.keys(SEARCH_MODE_LABELS) as SearchMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSearchMode(mode)}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  searchMode === mode ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'
                }`}
              >
                {SEARCH_MODE_LABELS[mode]}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 text-xs">
          <span className="text-stone-500">From</span>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
            className="px-2 py-1.5 bg-[#fffef9] border border-amber-300 rounded-lg text-xs text-stone-700 focus:outline-none focus:border-sky-600" />
          <span className="text-stone-500">To</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
            className="px-2 py-1.5 bg-[#fffef9] border border-amber-300 rounded-lg text-xs text-stone-700 focus:outline-none focus:border-sky-600" />
          {(dateFrom || dateTo) && (
            <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }} className="text-stone-400 hover:text-red-600"><FiX /></button>
          )}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1 text-xs">
          <span className="px-2 text-stone-500">Arrange</span>
          {([['date_desc', 'Newest first'], ['date_asc', 'Oldest first'], ['type_sections', 'By type']] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => setArrangeBy(value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${arrangeBy === value ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'}`}>
              {label}
            </button>
          ))}
        </div>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-700 focus:outline-none focus:border-sky-600">
          <option value="">All Types</option>
          {LOGBOOK_ENTRY_TYPE_ORDER.map((t) => <option key={t} value={t}>{getLogbookEntryTypeLabel(t)}</option>)}
        </select>
      </div>

      {/* Row 3: Quick filter presets */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-stone-500 font-semibold uppercase tracking-wide mr-1">Quick filters:</span>
        {([
          ['Last 30 days',   () => { setDateFrom(nDaysAgo(30)); setDateTo(''); }],
          ['Last 90 days',   () => { setDateFrom(nDaysAgo(90)); setDateTo(''); }],
          ['Last 12 months', () => { setDateFrom(nDaysAgo(365)); setDateTo(''); }],
          ['This year',      () => { setDateFrom(thisYearStart()); setDateTo(''); }],
          ['Inspections',    () => setTypeFilter('inspection')],
          ['AD Compliance',  () => { setTypeFilter('ad_compliance'); setLocationFilter('ad'); }],
          ['SB Compliance',  () => { setTypeFilter('sb_compliance'); setLocationFilter('sb'); }],
          ['Engine (ATA 72)',() => { setSearch('72'); setSearchMode('ata'); setNlMatchedIds(null); }],
          ['Fuel (ATA 28)',  () => { setSearch('28'); setSearchMode('ata'); setNlMatchedIds(null); }],
          ['Gear (ATA 32)',  () => { setSearch('32'); setSearchMode('ata'); setNlMatchedIds(null); }],
        ] as [string, () => void][]).map(([label, apply]) => (
          <button
            key={label}
            type="button"
            onClick={apply}
            className="px-2.5 py-1 text-[11px] rounded-full border border-amber-300 bg-[#fff8eb] text-stone-700 hover:bg-amber-100 transition-colors"
          >
            {label}
          </button>
        ))}
        {isFiltered && (
          <button
            type="button"
            onClick={() => { setSearch(''); setTypeFilter(''); setDateFrom(''); setDateTo(''); setLocationFilter('full'); setSearchMode('all'); setNlMatchedIds(null); }}
            className="px-2.5 py-1 text-[11px] rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors ml-1"
          >
            Clear all filters ×
          </button>
        )}
      </div>

      {/* Row 4: Active filter chips */}
      {isFiltered && (
        <div className="flex flex-wrap gap-1.5">
          {search && !nlMatchedIds && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-stone-100 border border-stone-300 text-stone-700">
              🔍 "{search.length > 30 ? search.slice(0, 30) + '…' : search}"
              <button type="button" onClick={() => { setSearch(''); setNlMatchedIds(null); }} className="text-stone-400 hover:text-red-600"><FiX className="text-[10px]" /></button>
            </span>
          )}
          {nlMatchedIds && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-violet-100 border border-violet-300 text-violet-800">
              🤖 AI: "{search}" · {nlMatchedIds.size} match{nlMatchedIds.size !== 1 ? 'es' : ''}
              <button type="button" onClick={() => setNlMatchedIds(null)} className="text-violet-400 hover:text-red-600"><FiX className="text-[10px]" /></button>
            </span>
          )}
          {dateFrom && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-sky-50 border border-sky-200 text-sky-800">
              📅 From {dateFrom}
              <button type="button" onClick={() => setDateFrom('')} className="text-sky-400 hover:text-red-600"><FiX className="text-[10px]" /></button>
            </span>
          )}
          {dateTo && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-sky-50 border border-sky-200 text-sky-800">
              📅 To {dateTo}
              <button type="button" onClick={() => setDateTo('')} className="text-sky-400 hover:text-red-600"><FiX className="text-[10px]" /></button>
            </span>
          )}
          {typeFilter && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-100 border border-amber-300 text-amber-900">
              🏷 {getLogbookEntryTypeLabel(typeFilter)}
              <button type="button" onClick={() => setTypeFilter('')} className="text-amber-400 hover:text-red-600"><FiX className="text-[10px]" /></button>
            </span>
          )}
          {locationFilter !== 'full' && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-green-50 border border-green-200 text-green-800">
              📍 {locationFilter.toUpperCase()}s only
              <button type="button" onClick={() => setLocationFilter('full')} className="text-green-400 hover:text-red-600"><FiX className="text-[10px]" /></button>
            </span>
          )}
        </div>
      )}

      {/* Results stats bar + export */}
      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-lg bg-stone-50 border border-stone-200 text-[11px] text-stone-600">
          <span className="font-semibold text-stone-800">
            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
          </span>
          {resultStats.minDate && resultStats.maxDate && resultStats.minDate !== resultStats.maxDate && (
            <span>📅 {resultStats.minDate} → {resultStats.maxDate}</span>
          )}
          {resultStats.ataCount > 0 && (
            <span>🔧 {resultStats.ataCount} ATA chapter{resultStats.ataCount > 1 ? 's' : ''}</span>
          )}
          {resultStats.signerCount > 0 && (
            <span>✍ {resultStats.signerCount} signer{resultStats.signerCount > 1 ? 's' : ''}</span>
          )}
          {isFiltered && entries.length - filtered.length > 0 && (
            <span className="text-stone-400">{entries.length - filtered.length} hidden by filters</span>
          )}
          <button
            type="button"
            onClick={() => {
              const tail = aircraft?.tailNumber ?? 'aircraft';
              const dateSuffix = new Date().toISOString().slice(0, 10);
              const filename = `logbook-${tail}-${dateSuffix}${isFiltered ? '-filtered' : ''}.csv`;
              const exportEntries = arrangeBy === 'type_sections'
                ? groupedEntries.flatMap((s) => s.entries)
                : arrangedEntries;
              triggerDownload(buildLogbookCSV(exportEntries, aircraft?.tailNumber), filename);
              toast.success(`Exported ${exportEntries.length} entries to ${filename}`);
            }}
            className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded border border-stone-300 bg-white text-stone-700 hover:bg-stone-100 transition-colors text-[11px] font-medium"
            title="Export these entries to CSV (Excel-compatible)"
          >
            <FiUpload className="text-[11px]" />
            Export {filtered.length} to CSV
          </button>
        </div>
      )}

      {/* Entries List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-stone-500">
          <FiSearch className="text-3xl mx-auto mb-2" />
          <p className="text-sm">
            {entries.length === 0
              ? 'No entries yet. Use the Logbooks Library tab to upload, parse, and import entries.'
              : 'No entries match your search.'}
          </p>
        </div>
      ) : arrangeBy === 'type_sections' ? (
        <div className="space-y-4">
          {groupedEntries.map((section) => (
            <section key={section.key} className="rounded-lg border border-amber-300/80 bg-[#fffdf7] shadow-sm">
              <div className="flex items-center justify-between border-b border-amber-200 px-4 py-2 bg-amber-50/80">
                <h3 className="text-sm uppercase tracking-wide text-stone-700 font-semibold">{section.label}</h3>
                <span className="text-xs text-stone-500">{section.entries.length} entries</span>
              </div>
              <div className="divide-y divide-amber-200/80">
                {section.entries.map((entry) => (
                  <LogbookEntryCard
                    key={entry._id}
                    entry={entry}
                    entryFindings={missingFindingsByEntry.get(entry._id) ?? []}
                    expanded={expandedEntry === entry._id}
                    onToggle={() => setExpandedEntry(expandedEntry === entry._id ? null : entry._id)}
                    onUpdate={updateEntry}
                    searchQuery={activeSearchQuery}
                    isNlMatch={nlMatchedIds?.has(entry._id)}
                    onDelete={() => {
                      if (confirm('Permanently delete this logbook entry?'))
                        removeEntry({ entryId: entry._id as any }).catch((err: any) => toast.error(err?.message || 'Failed to delete entry'));
                    }}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-2 rounded-lg border border-amber-300/80 bg-[#fffdf7] p-2 shadow-sm">
          {arrangedEntries.map((entry) => (
            <LogbookEntryCard
              key={entry._id}
              entry={entry}
              entryFindings={missingFindingsByEntry.get(entry._id) ?? []}
              expanded={expandedEntry === entry._id}
              onToggle={() => setExpandedEntry(expandedEntry === entry._id ? null : entry._id)}
              onUpdate={updateEntry}
              searchQuery={activeSearchQuery}
              isNlMatch={nlMatchedIds?.has(entry._id)}
              onDelete={() => {
                if (confirm('Permanently delete this logbook entry?'))
                  removeEntry({ entryId: entry._id as any }).catch((err: any) => toast.error(err?.message || 'Failed to delete entry'));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LogbookEntryCard({
  entry,
  entryFindings = [],
  expanded,
  onToggle,
  onUpdate,
  onDelete,
  searchQuery = '',
  isNlMatch = false,
}: {
  entry: LogbookEntry;
  entryFindings?: ComplianceFinding[];
  expanded: boolean;
  onToggle: () => void;
  onUpdate?: (args: any) => Promise<unknown>;
  onDelete?: () => void;
  searchQuery?: string;
  isNlMatch?: boolean;
}) {
  const confidenceColor = (entry.confidence ?? 0) >= 0.8 ? 'text-green-700' : (entry.confidence ?? 0) >= 0.5 ? 'text-amber-700' : 'text-red-700';
  const [editingRefs, setEditingRefs] = useState(false);
  const [savingRefs, setSavingRefs] = useState(false);
  const [showMissingExplanation, setShowMissingExplanation] = useState(false);
  const [adInput, setAdInput] = useState((entry.adReferences ?? []).join(', '));
  const [sbInput, setSbInput] = useState((entry.sbReferences ?? []).join(', '));

  useEffect(() => {
    if (!editingRefs) {
      setAdInput((entry.adReferences ?? []).join(', '));
      setSbInput((entry.sbReferences ?? []).join(', '));
    }
  }, [editingRefs, entry.adReferences, entry.sbReferences]);

  useEffect(() => {
    if (!expanded) {
      setShowMissingExplanation(false);
    }
  }, [expanded]);

  const saveReferenceOverrides = async () => {
    if (!onUpdate) return;
    const toRefs = (value: string) =>
      Array.from(
        new Set(
          value
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
        )
      );
    const adReferences = toRefs(adInput);
    const sbReferences = toRefs(sbInput);
    const adSbReferences = Array.from(new Set([...adReferences, ...sbReferences]));
    setSavingRefs(true);
    try {
      await onUpdate({
        entryId: entry._id as any,
        adReferences,
        sbReferences,
        adSbReferences,
        userVerified: true,
      });
      setEditingRefs(false);
      toast.success('AD/SB references updated');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update AD/SB references');
    } finally {
      setSavingRefs(false);
    }
  };

  return (
    <div className="overflow-hidden">
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-50/50 transition-colors min-w-0"
        >
          {expanded ? <FiChevronDown className="text-stone-500 flex-shrink-0" /> : <FiChevronRight className="text-stone-500 flex-shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">{entry.entryDate ?? 'No date'}</span>
              {entry.entryType && (
                <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-sky-100 text-sky-900 border border-sky-200">
                  {getLogbookEntryTypeLabel(entry.entryType)}
                </span>
              )}
              {entry.hasReturnToService && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-green-100 text-green-800 border border-green-200">RTS</span>
              )}
              {isNlMatch && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-violet-100 text-violet-800 border border-violet-200">AI match</span>
              )}
              {entry.confidence !== undefined && (
                <span
                  className={`text-[10px] font-mono ${confidenceColor}`}
                  title="Parser confidence (how certain extraction/parsing was), not a compliance score."
                >
                  Parse confidence {Math.round(entry.confidence * 100)}%
                </span>
              )}
            </div>
            <p className="text-xs text-stone-600 truncate mt-0.5 font-['Source_Serif_4',serif]">
              {highlightText(entry.workPerformed ?? entry.rawText.slice(0, 120), searchQuery)}
            </p>
          </div>
          <div className="text-right flex-shrink-0 hidden sm:block">
            {entry.totalTimeAtEntry !== undefined && <div className="text-xs text-stone-600 tabular-nums">TT: {entry.totalTimeAtEntry}</div>}
            {entry.signerName && <div className="text-xs text-stone-500">{entry.signerName}</div>}
          </div>
        </button>
        {onDelete && (
          <button
            type="button"
            title="Delete entry"
            onClick={onDelete}
            className="px-3 text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0"
          >
            <FiTrash2 className="text-sm" />
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-amber-200 pt-3 space-y-2 bg-[#f9f3e7]">
          <DetailRow label="Work Performed" value={entry.workPerformed} highlight={searchQuery} />
          <DetailRow label="Signer" value={[entry.signerName, entry.signerCertType, entry.signerCertNumber].filter(Boolean).join(' — ')} highlight={searchQuery} />
          <DetailRow label="RTS Statement" value={entry.returnToServiceStatement} />
          <DetailRow label="ATA Chapter" value={entry.ataChapter} highlight={searchQuery} />
          <DetailRow label="AD References" value={entry.adReferences?.join(', ')} highlight={searchQuery} />
          <DetailRow label="SB References" value={entry.sbReferences?.join(', ')} highlight={searchQuery} />
          <DetailRow label="All AD/SB References" value={getAllAdSbReferences(entry).join(', ')} highlight={searchQuery} />
          <DetailRow label="Total Time" value={entry.totalTimeAtEntry?.toString()} />
          <DetailRow label="Cycles" value={entry.totalCyclesAtEntry?.toString()} />
          <DetailRow label="Landings" value={entry.totalLandingsAtEntry?.toString()} />
          {entry.componentMentions && entry.componentMentions.length > 0 && (
            <div className="pt-1">
              <div className="text-xs text-stone-500 mb-1">Component Mentions</div>
              <div className="space-y-1">
                {entry.componentMentions.map((c, i) => (
                  <div key={i} className="text-xs text-stone-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    <span className="font-medium capitalize">{c.action}</span>
                    {c.partNumber && <> · P/N: <span className="font-mono">{highlightText(c.partNumber, searchQuery)}</span></>}
                    {c.serialNumber && <> · S/N: <span className="font-mono">{highlightText(c.serialNumber, searchQuery)}</span></>}
                    {c.description && <> · {highlightText(c.description, searchQuery)}</>}
                    {c.tsn !== undefined && <> · TSN: {c.tsn}</>}
                    {c.tso !== undefined && <> · TSO: {c.tso}</>}
                    {c.isLifeLimited && c.lifeLimit && <span className="ml-1 text-red-700 font-medium">LL: {c.lifeLimit} {c.lifeLimitUnit}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="pt-2 border-t border-amber-200 space-y-2">
            <button
              type="button"
              onClick={() => setShowMissingExplanation((prev) => !prev)}
              className="text-xs font-medium text-sky-800 hover:text-sky-950"
            >
              {showMissingExplanation
                ? 'Hide missing info explanation'
                : `Explain missing info${entryFindings.length > 0 ? ` (${entryFindings.length})` : ''}`}
            </button>
            {showMissingExplanation && (
              <div className="space-y-2 text-xs">
                {entryFindings.length === 0 ? (
                  <div className="rounded border border-green-200 bg-green-50 px-2.5 py-2 text-green-800">
                    No missing-field or incomplete-signoff findings are currently recorded for this entry.
                  </div>
                ) : (
                  entryFindings.map((finding) => (
                    <div key={finding._id} className="rounded border border-amber-300 bg-[#fffdf7] px-2.5 py-2">
                      <div className="font-semibold text-stone-800">{finding.title}</div>
                      <div className="text-stone-700 mt-0.5">{finding.description}</div>
                      {finding.citation && <div className="mt-1 text-[11px] text-sky-800 font-mono">{finding.citation}</div>}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          {entry.userVerified && <div className="flex items-center gap-1 text-xs text-green-700"><FiCheck /> User verified</div>}
          {onUpdate && (
            <div className="pt-2 border-t border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-700">Manual AD/SB Override</span>
                {!editingRefs ? (
                  <button
                    type="button"
                    onClick={() => setEditingRefs(true)}
                    className="flex items-center gap-1 text-xs text-sky-800 hover:text-sky-950"
                  >
                    <FiEdit /> Edit
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingRefs(false)}
                    className="text-xs text-stone-500 hover:text-stone-800"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {editingRefs && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={adInput}
                    onChange={(event) => setAdInput(event.target.value)}
                    placeholder="AD references (comma-separated)"
                    className="w-full px-2.5 py-1.5 bg-[#fffef9] border border-amber-300 rounded text-xs text-stone-800 placeholder:text-stone-400"
                  />
                  <input
                    type="text"
                    value={sbInput}
                    onChange={(event) => setSbInput(event.target.value)}
                    placeholder="SB references (comma-separated)"
                    className="w-full px-2.5 py-1.5 bg-[#fffef9] border border-amber-300 rounded text-xs text-stone-800 placeholder:text-stone-400"
                  />
                  <button
                    type="button"
                    onClick={saveReferenceOverrides}
                    disabled={savingRefs}
                    className="px-3 py-1 text-xs font-medium bg-sky-700 text-white border border-sky-900/20 rounded hover:bg-sky-800 disabled:opacity-50"
                  >
                    {savingRefs ? 'Saving...' : 'Save Override'}
                  </button>
                </div>
              )}
            </div>
          )}
          <details className="mt-2">
            <summary className="text-xs text-stone-500 cursor-pointer">Raw OCR text</summary>
            <pre className="mt-1 text-xs text-stone-600 whitespace-pre-wrap bg-[#fffdf7] border border-amber-200 rounded p-2 max-h-48 overflow-auto">{entry.rawText}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, highlight = '' }: { label: string; value?: string; highlight?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-xs">
      <span className="text-stone-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-stone-700">{highlight ? highlightText(value, highlight) : value}</span>
    </div>
  );
}

/* ─── Configuration Tab ──────────────────────────────────────────────── */

function ConfigurationTab({ projectId, aircraftId, aircraft, currentTT, entries }: { projectId: string; aircraftId: string; aircraft: AircraftAsset; currentTT?: number; entries: LogbookEntry[] }) {
  const components = (useAircraftComponents(projectId, aircraftId, 'installed') ?? []) as AircraftComponent[];
  const removedComponents = (useAircraftComponents(projectId, aircraftId, 'removed') ?? []) as AircraftComponent[];
  const addComponent = useAddAircraftComponent();
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ partNumber: '', serialNumber: '', description: '', ataChapter: '', position: '' });
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!addForm.partNumber.trim() || !addForm.description.trim()) {
      toast.error('Part number and description are required');
      return;
    }
    setSaving(true);
    try {
      await addComponent({
        projectId: projectId as any,
        aircraftId: aircraftId as any,
        partNumber: addForm.partNumber.trim(),
        serialNumber: addForm.serialNumber || undefined,
        description: addForm.description.trim(),
        ataChapter: addForm.ataChapter || undefined,
        position: addForm.position || undefined,
      });
      toast.success('Component added');
      setShowAdd(false);
      setAddForm({ partNumber: '', serialNumber: '', description: '', ataChapter: '', position: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to add component');
    } finally {
      setSaving(false);
    }
  };

  // ── Life Limits Dashboard ─────────────────────────────────────────────
  const utilizationRate = useMemo(() => calcUtilizationRate(entries), [entries]);

  const lifeLimitedComponents = useMemo(() => {
    return components
      .filter((c) => c.isLifeLimited && c.lifeLimit)
      .map((c) => ({ c, ttl: calcTTL(c, currentTT) }))
      .filter((x) => x.ttl !== null)
      .sort((a, b) => {
        // Sort by urgency: overdue first, then by remainingPct asc, then manual-check last
        const aR = a.ttl!.manualCheck ? 1 : a.ttl!.remaining <= 0 ? -1 : a.ttl!.remainingPct;
        const bR = b.ttl!.manualCheck ? 1 : b.ttl!.remaining <= 0 ? -1 : b.ttl!.remainingPct;
        return aR - bR;
      }) as { c: AircraftComponent; ttl: TTLResult }[];
  }, [components, currentTT, entries]);

  const overdueCt = lifeLimitedComponents.filter((x) => !x.ttl.manualCheck && x.ttl.remaining <= 0).length;
  const warnCt = lifeLimitedComponents.filter((x) => !x.ttl.manualCheck && x.ttl.remaining > 0 && x.ttl.remainingPct < 0.20).length;

  return (
    <div className="space-y-6 text-stone-800">

      {/* ── Life Limits Dashboard ── */}
      {lifeLimitedComponents.length > 0 && (
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">Life Limits Dashboard</h3>
            <div className="flex gap-2 text-[11px]">
              {overdueCt > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 font-bold">
                  {overdueCt} OVERDUE
                </span>
              )}
              {warnCt > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 font-semibold">
                  {warnCt} within 20%
                </span>
              )}
              <span className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">
                {lifeLimitedComponents.length} life-limited
              </span>
              {utilizationRate !== null && (
                <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200">
                  ≈ {utilizationRate.toFixed(1)} hrs/mo
                </span>
              )}
            </div>
          </div>

          {/* Cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {lifeLimitedComponents.map(({ c, ttl }) => {
              const isManual = ttl.manualCheck;
              const isOverdue = !isManual && ttl.remaining <= 0;
              const pct = isManual ? 0 : Math.min(1, ttl.currentUsed / ttl.lifeLimit);
              const statusLabel = isManual ? 'manual check'
                : isOverdue ? 'OVERDUE'
                : ttl.remainingPct < 0.05 ? 'CRITICAL'
                : ttl.remainingPct < 0.20 ? 'WARNING'
                : 'OK';
              const statusCls = isManual ? 'bg-sky-100 text-sky-800 border-sky-200'
                : isOverdue ? 'bg-red-200 text-red-900 border-red-300'
                : ttl.remainingPct < 0.05 ? 'bg-red-100 text-red-800 border-red-200'
                : ttl.remainingPct < 0.20 ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-green-100 text-green-800 border-green-200';
              const barColor = isOverdue ? 'bg-red-600'
                : !isManual && ttl.remainingPct < 0.05 ? 'bg-red-500'
                : !isManual && ttl.remainingPct < 0.20 ? 'bg-amber-500'
                : 'bg-emerald-500';
              const borderCls = isOverdue ? 'border-red-300' : !isManual && ttl.remainingPct < 0.20 ? 'border-amber-300' : 'border-amber-200/80';

              // Projected expiry (hours-based only)
              let projExpiry: string | null = null;
              if (!isManual && ttl.unit === 'hours' && ttl.remaining > 0 && utilizationRate && utilizationRate > 0) {
                const moRemaining = ttl.remaining / utilizationRate;
                const exp = new Date();
                exp.setMonth(exp.getMonth() + Math.round(moRemaining));
                projExpiry = exp.toISOString().slice(0, 7);
              }

              return (
                <div key={c._id} className={`rounded-lg border ${borderCls} bg-[#fffdf7] p-4 shadow-sm`}>
                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase rounded border ${statusCls}`}>
                          {statusLabel}
                        </span>
                        {c.ataChapter && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-stone-100 text-stone-600 border border-stone-200">
                            ATA {c.ataChapter}
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-stone-900 truncate">{c.description}</p>
                      <p className="text-[10px] text-stone-500 font-mono mt-0.5">
                        P/N {c.partNumber}{c.serialNumber && ` · S/N ${c.serialNumber}`}
                        {c.position && ` · ${c.position}`}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {!isManual && (
                    <div className="mb-2">
                      <div className="w-full h-2.5 rounded-full bg-stone-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(100, pct * 100).toFixed(1)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-stone-500 mt-0.5">
                        <span>{(pct * 100).toFixed(0)}% used</span>
                        <span>{(100 - pct * 100).toFixed(0)}% remaining</span>
                      </div>
                    </div>
                  )}

                  {/* Stats row */}
                  {isManual ? (
                    <p className="text-xs text-stone-600">
                      Life limit: <span className="font-semibold">{ttl.lifeLimit} {ttl.unit.replace('_', ' ')}</span> — verify manually
                    </p>
                  ) : (
                    <div className="space-y-0.5 text-xs text-stone-700">
                      <div className="flex gap-4 tabular-nums flex-wrap">
                        <span>
                          <span className="text-stone-500">Used: </span>
                          <span className="font-semibold">
                            {ttl.unit === 'calendar_months' ? fmtMonths(ttl.currentUsed) : ttl.currentUsed.toFixed(1)}
                          </span>
                        </span>
                        <span>
                          <span className="text-stone-500">Limit: </span>
                          <span className="font-semibold">
                            {ttl.unit === 'calendar_months' ? fmtMonths(ttl.lifeLimit) : `${ttl.lifeLimit} ${ttl.unit}`}
                          </span>
                        </span>
                        <span className={isOverdue ? 'text-red-700 font-bold' : ''}>
                          <span className="text-stone-500">{isOverdue ? 'Over by: ' : 'Remaining: '}</span>
                          <span className="font-semibold">
                            {ttl.unit === 'calendar_months'
                              ? fmtMonths(Math.abs(ttl.remaining))
                              : `${Math.abs(ttl.remaining).toFixed(1)} ${ttl.unit}`}
                          </span>
                        </span>
                      </div>
                      {projExpiry && (
                        <p className="text-[11px] text-stone-500 mt-1">
                          At {utilizationRate!.toFixed(1)} hrs/mo → expires <span className="text-stone-700 font-medium">{projExpiry}</span>
                          {' '}({fmtMonths(ttl.remaining / utilizationRate!)})
                        </p>
                      )}
                      {ttl.unit === 'calendar_months' && c.installDate && (
                        <p className="text-[11px] text-stone-500">Installed {c.installDate}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Aircraft Summary */}
      <div className="bg-[#fffdf7] border border-amber-300/80 rounded-lg p-4 shadow-sm">
        <h3 className="text-sm font-semibold text-stone-900 mb-3 font-['Source_Serif_4',serif]">Aircraft Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div><span className="text-stone-500 block">Tail</span><span className="text-stone-900 font-medium">{aircraft.tailNumber}</span></div>
          <div><span className="text-stone-500 block">Make/Model</span><span className="text-stone-800">{[aircraft.make, aircraft.model].filter(Boolean).join(' ')}</span></div>
          <div><span className="text-stone-500 block">Serial</span><span className="text-stone-800">{aircraft.serial ?? '—'}</span></div>
          <div><span className="text-stone-500 block">Baseline TT</span><span className="text-stone-800">{aircraft.baselineTotalTime ?? '—'}</span></div>
        </div>
      </div>

      {/* Installed Components */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">Installed Components ({components.length})</h3>
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-xs text-sky-800 hover:text-sky-900 transition-colors"
          >
            <FiPlus /> Add Component
          </button>
        </div>

        {showAdd && (
          <div className="bg-[#fffdf7] border border-amber-300/80 rounded-lg p-4 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {([['partNumber', 'Part Number *'], ['serialNumber', 'Serial Number'], ['description', 'Description *'], ['ataChapter', 'ATA Chapter'], ['position', 'Position']] as const).map(([key, label]) => (
                <div key={key} className={key === 'description' ? 'col-span-2' : ''}>
                  <input
                    type="text"
                    value={addForm[key]}
                    onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={label}
                    className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded text-xs text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-sky-600"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-stone-500 hover:text-stone-900">Cancel</button>
              <button type="button" onClick={handleAdd} disabled={saving} className="px-3 py-1 text-xs bg-sky-700 text-white border border-sky-900/20 rounded hover:bg-sky-800 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {components.length === 0 ? (
          <p className="text-xs text-stone-500 py-4 text-center">No components tracked yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-amber-300/80 bg-[#fffdf7]">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-600 border-b border-amber-200">
                  <th className="text-left py-2 px-2 font-medium">Part #</th>
                  <th className="text-left py-2 px-2 font-medium">Serial #</th>
                  <th className="text-left py-2 px-2 font-medium">Description</th>
                  <th className="text-left py-2 px-2 font-medium">ATA</th>
                  <th className="text-left py-2 px-2 font-medium">Position</th>
                  <th className="text-left py-2 px-2 font-medium">TSN Install</th>
                  <th className="text-left py-2 px-2 font-medium">Install Date</th>
                  <th className="text-left py-2 px-2 font-medium">Life Limit</th>
                  <th className="text-left py-2 px-2 font-medium">Current TSN</th>
                  <th className="text-left py-2 px-2 font-medium">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => {
                  const ttl = calcTTL(c, currentTT);
                  return (
                    <tr key={c._id} className={`border-b border-amber-100 hover:bg-amber-50/60 ${ttl && !ttl.manualCheck && ttl.remaining <= 0 ? 'bg-red-50/40' : ''}`}>
                      <td className="py-2 px-2 text-stone-900 font-mono">{c.partNumber}</td>
                      <td className="py-2 px-2 text-stone-700 font-mono">{c.serialNumber ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-700">{c.description}</td>
                      <td className="py-2 px-2 text-stone-600">{c.ataChapter ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-600">{c.position ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-600 tabular-nums">{c.tsnAtInstall ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-600">{c.installDate ?? '—'}</td>
                      <td className="py-2 px-2 text-stone-600 tabular-nums">
                        {c.isLifeLimited && c.lifeLimit ? `${c.lifeLimit} ${c.lifeLimitUnit ?? 'hrs'}` : '—'}
                      </td>
                      <td className="py-2 px-2 text-stone-600 tabular-nums">
                        {ttl && !ttl.manualCheck ? ttl.currentUsed.toFixed(1) : '—'}
                      </td>
                      <td className="py-2 px-2">
                        {!ttl ? (
                          <span className="text-stone-400">—</span>
                        ) : ttl.manualCheck ? (
                          <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 border border-sky-200">
                            Manual check ({ttl.lifeLimit} {ttl.unit})
                          </span>
                        ) : ttl.remaining <= 0 ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-200 font-semibold">
                            OVERDUE {Math.abs(ttl.remaining).toFixed(1)} hrs
                          </span>
                        ) : ttl.remainingPct < 0.05 ? (
                          <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200">
                            {ttl.remaining.toFixed(1)} hrs left
                          </span>
                        ) : ttl.remainingPct < 0.20 ? (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                            {ttl.remaining.toFixed(1)} hrs left
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 border border-green-200">
                            {ttl.remaining.toFixed(1)} hrs left
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Removed Components */}
      {removedComponents.length > 0 && (
        <details className="rounded-lg border border-amber-300/80 bg-[#fffdf7] p-3">
          <summary className="text-xs text-stone-600 cursor-pointer mb-2">Removed Components ({removedComponents.length})</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-500 border-b border-amber-200">
                  <th className="text-left py-1 px-2 font-medium">Part #</th>
                  <th className="text-left py-1 px-2 font-medium">Serial #</th>
                  <th className="text-left py-1 px-2 font-medium">Description</th>
                  <th className="text-left py-1 px-2 font-medium">Removed</th>
                </tr>
              </thead>
              <tbody>
                {removedComponents.map((c) => (
                  <tr key={c._id} className="border-b border-amber-100 text-stone-600">
                    <td className="py-1 px-2 font-mono">{c.partNumber}</td>
                    <td className="py-1 px-2 font-mono">{c.serialNumber ?? '—'}</td>
                    <td className="py-1 px-2">{c.description}</td>
                    <td className="py-1 px-2">{c.removeDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}

/* ─── Compliance Findings Tab ─────────────────────────────────────────── */

function FindingsTab({ projectId, aircraftId }: { projectId: string; aircraftId: string }) {
  const findings = (useComplianceFindings(projectId, aircraftId) ?? []) as ComplianceFinding[];
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const rules = (useComplianceRules() ?? []) as ComplianceRule[];
  const scheduleItems = (useInspectionScheduleItems(projectId) ?? []) as InspectionScheduleItem[];
  const addFindings = useAddComplianceFindings();
  const updateFindingStatus = useUpdateComplianceFindingStatus();
  const addEntityIssue = useAddEntityIssue();
  const convertFindingToIssue = useConvertFindingToIssue();
  const updateScheduleLastPerformed = useUpdateInspectionScheduleLastPerformed();
  const seedRules = useSeedComplianceRules();
  const seedRulePack = useSeedRulePack();
  const isAdmin = useIsAdmin();

  const [running, setRunning] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [chronicResult, setChronicResult] = useState<ChronicIssueResult | null>(null);
  const [analyzingChronic, setAnalyzingChronic] = useState(false);
  const [chronicExpandedIdx, setChronicExpandedIdx] = useState<number | null>(null);

  const loadedPacks = useMemo(() => {
    const packs = new Set<string>();
    for (const r of rules) packs.add(r.regulatoryPack);
    return packs;
  }, [rules]);

  const handleSeedPack = async (packId: string) => {
    const packRules = ALL_RULE_PACKS[packId];
    if (!packRules) return;
    try {
      const result = await seedRulePack({ rules: packRules });
      toast.success(`Seeded ${result.seeded} rules from ${RULE_PACK_LABELS[packId] ?? packId}`);
    } catch (err: any) {
      toast.error(err.message || `Failed to seed ${packId}`);
    }
  };

  const handleConvertToIssue = async (finding: ComplianceFinding) => {
    try {
      const issueArgs = findingToIssueArgs(finding, projectId);
      const issueId = await (addEntityIssue as any)(issueArgs);
      await convertFindingToIssue({ findingId: finding._id as any, issueId: issueId as any });
      toast.success('Finding converted to CAR');
    } catch (err: any) {
      toast.error(err.message || 'Failed to convert finding');
    }
  };

  const handleSyncSchedule = async () => {
    if (entries.length === 0 || scheduleItems.length === 0) {
      toast.info('Need both logbook entries and schedule items to sync.');
      return;
    }
    setSyncing(true);
    try {
      const updates = buildScheduleUpdates(entries, scheduleItems);
      if (updates.length === 0) {
        toast.info('No schedule items matched logbook entries.');
      } else {
        for (const update of updates) {
          await updateScheduleLastPerformed({
            itemId: update.itemId as any,
            lastPerformedAt: update.lastPerformedAt,
          });
        }
        toast.success(`Updated ${updates.length} schedule item(s) from logbook entries`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Schedule sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleDetectChronic = async () => {
    if (entries.length < 2) { toast.error('Need at least 2 logbook entries to detect chronic issues.'); return; }
    setAnalyzingChronic(true);
    setChronicResult(null);
    setChronicExpandedIdx(null);
    try {
      const result = await detectChronicIssues(entries);
      setChronicResult(result);
      if (result.clusters.length === 0) {
        toast.success('No chronic issues detected in this aircraft\'s history.');
      } else {
        toast.success(`Found ${result.clusters.length} chronic issue${result.clusters.length > 1 ? 's' : ''} across ${result.entriesAnalysed} entries.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Chronic issue analysis failed');
    } finally {
      setAnalyzingChronic(false);
    }
  };

  const filtered = useMemo(() => {
    if (!statusFilter) return findings;
    return findings.filter((f) => f.status === statusFilter);
  }, [findings, statusFilter]);

  const handleRunChecks = async () => {
    if (entries.length === 0) { toast.error('No logbook entries to check. Parse a document first.'); return; }
    if (rules.length === 0) { toast.error('No compliance rules loaded. Seed Part 43/91 rules first.'); return; }
    setRunning(true);
    try {
      const ruleFindings = runComplianceChecks(entries, rules, aircraftId);
      const timeFindings = detectTimeDiscrepancies(entries, aircraftId);
      const allFindings = [...ruleFindings, ...timeFindings];

      if (allFindings.length === 0) {
        toast.success('No compliance issues detected.');
      } else {
        await addFindings({
          projectId: projectId as any,
          findings: allFindings.map((f) => ({
            ...f,
            aircraftId: aircraftId as any,
            logbookEntryId: f.logbookEntryId as any,
          })),
        });
        toast.success(`Found ${allFindings.length} compliance finding(s)`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Compliance check failed');
    } finally {
      setRunning(false);
    }
  };

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, major: 0, minor: 0 };
    for (const f of findings.filter((f) => f.status === 'open')) {
      if (f.severity in counts) counts[f.severity as keyof typeof counts]++;
    }
    return counts;
  }, [findings]);

  const adSbMatrix = useMemo(() => {
    const map = new Map<string, { date?: string; entryId: string }[]>();
    for (const entry of entries) {
      for (const ref of getAllAdSbReferences(entry)) {
        const list = map.get(ref) ?? [];
        list.push({ date: entry.entryDate, entryId: entry._id });
        map.set(ref, list);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ref, occurrences]) => ({
        ref,
        latestDate: [...occurrences].map((o) => o.date).filter(Boolean).sort().at(-1),
        count: occurrences.length,
      }));
  }, [entries]);

  return (
    <div className="space-y-4 text-stone-800">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRunChecks}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-sky-700 text-white border border-sky-900/20 rounded-lg hover:bg-sky-800 disabled:opacity-50"
        >
          <FiPlay /> {running ? 'Running...' : 'Run Compliance Checks'}
        </button>
        <button
          type="button"
          onClick={handleSyncSchedule}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 text-sm text-stone-700 border border-amber-300 rounded-lg hover:bg-amber-50 disabled:opacity-50"
        >
          <FiClock /> {syncing ? 'Syncing...' : 'Sync Schedule'}
        </button>
        <button
          type="button"
          onClick={handleDetectChronic}
          disabled={analyzingChronic || entries.length < 2}
          className="flex items-center gap-2 px-3 py-2 text-sm text-violet-900 border border-violet-300 bg-violet-50 rounded-lg hover:bg-violet-100 disabled:opacity-50"
          title="Use AI to find recurring defects across the logbook history"
        >
          <FiRefreshCw className={analyzingChronic ? 'animate-spin' : ''} />
          {analyzingChronic ? 'Analysing…' : 'Detect Chronic Issues'}
        </button>
        {isAdmin && (
          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-xs text-stone-700 border border-amber-300 rounded-lg hover:bg-amber-50"
            >
              <FiTool /> Seed Rules
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-72 bg-[#fffaf2] border border-amber-300 rounded-lg shadow-xl z-50">
              {!loadedPacks.has('part43') && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const result = await seedRules();
                      toast.success(`Seeded ${result.seeded} Part 43/91 rules`);
                    } catch (err: any) { toast.error(err.message); }
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:text-stone-900"
                >
                  Part 43 + Part 91 (core)
                </button>
              )}
              {Object.entries(ALL_RULE_PACKS).map(([packId]) => (
                <button
                  key={packId}
                  type="button"
                  disabled={loadedPacks.has(packId)}
                  onClick={() => handleSeedPack(packId)}
                  className="w-full text-left px-4 py-2 text-xs text-stone-700 hover:bg-amber-50 hover:text-stone-900 disabled:opacity-40 disabled:cursor-default"
                >
                  {RULE_PACK_LABELS[packId] ?? packId}
                  {loadedPacks.has(packId) && <span className="ml-2 text-green-700">(loaded)</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="ml-auto px-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-700 focus:outline-none focus:border-sky-600"
        >
          <option value="">All Status</option>
          <option value="open">Open</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="false_positive">False Positive</option>
        </select>
      </div>

      {/* Severity Summary */}
      <div className="flex gap-4">
        {([['critical', 'bg-red-100 text-red-800 border-red-200'], ['major', 'bg-orange-100 text-orange-800 border-orange-200'], ['minor', 'bg-amber-100 text-amber-800 border-amber-200']] as const).map(([sev, cls]) => (
          <div key={sev} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${cls}`}>
            {severityCounts[sev]} {sev}
          </div>
        ))}
      </div>

      {/* Chronic Issues Panel */}
      {chronicResult && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-violet-200">
            <div className="flex items-center gap-2">
              <FiRefreshCw className="text-violet-700" />
              <span className="text-sm font-semibold text-violet-900 font-['Source_Serif_4',serif]">
                Chronic Issue Analysis
              </span>
              {chronicResult.clusters.length > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-violet-200 text-violet-900 border border-violet-300">
                  {chronicResult.clusters.length} pattern{chronicResult.clusters.length > 1 ? 's' : ''} found
                </span>
              )}
            </div>
            <span className="text-[10px] text-stone-500">
              {chronicResult.entriesAnalysed} entries analysed
              {chronicResult.entriesSkipped > 0 && ` · ${chronicResult.entriesSkipped} skipped (cap)`}
            </span>
          </div>

          {chronicResult.clusters.length === 0 ? (
            <p className="px-4 py-3 text-sm text-stone-600">No recurring defect patterns detected.</p>
          ) : (
            <div className="divide-y divide-violet-200">
              {chronicResult.clusters.map((cluster, idx) => {
                const isExpanded = chronicExpandedIdx === idx;
                const riskCls =
                  cluster.riskLevel === 'high'
                    ? 'bg-red-100 text-red-800 border-red-200'
                    : cluster.riskLevel === 'medium'
                    ? 'bg-orange-100 text-orange-800 border-orange-200'
                    : 'bg-amber-100 text-amber-800 border-amber-200';
                const borderCls =
                  cluster.riskLevel === 'high'
                    ? 'border-l-red-500'
                    : cluster.riskLevel === 'medium'
                    ? 'border-l-orange-500'
                    : 'border-l-amber-500';
                return (
                  <div key={idx} className={`border-l-4 ${borderCls}`}>
                    <button
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-violet-100/60 transition-colors"
                      onClick={() => setChronicExpandedIdx(isExpanded ? null : idx)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${riskCls}`}>
                              {cluster.riskLevel}
                            </span>
                            <span className="text-sm font-semibold text-stone-900">
                              {cluster.theme}
                            </span>
                            <span className="text-[10px] text-stone-500 bg-stone-100 px-1.5 py-0.5 rounded">
                              {cluster.category}{cluster.ataChapter ? ` · ATA ${cluster.ataChapter}` : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-stone-600 flex-wrap">
                            <span className="font-semibold text-violet-800">{cluster.occurrences}× in {cluster.spanDays} days</span>
                            <span>{cluster.firstSeen} → {cluster.lastSeen}</span>
                          </div>
                          <p className="mt-1 text-xs text-stone-700 italic">{cluster.recommendation}</p>
                        </div>
                        <FiChevronRight
                          className={`flex-shrink-0 text-violet-500 transition-transform mt-1 ${isExpanded ? 'rotate-90' : ''}`}
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3 space-y-1.5">
                        <p className="text-[10px] text-stone-500 uppercase tracking-wide font-semibold mb-2">
                          Matching Entries
                        </p>
                        {cluster.entries.map((e) => (
                          <div
                            key={e._id}
                            className="flex gap-3 rounded border border-violet-200 bg-white px-3 py-2 text-xs"
                          >
                            <span className="font-mono text-stone-500 flex-shrink-0 w-24">{e.entryDate ?? '—'}</span>
                            <span className="text-stone-800 flex-1 min-w-0 truncate font-['Source_Serif_4',serif]">
                              {e.workPerformed || e.rawText.slice(0, 100)}
                            </span>
                            {e.totalTimeAtEntry !== undefined && (
                              <span className="font-mono tabular-nums text-stone-500 flex-shrink-0">
                                {e.totalTimeAtEntry.toFixed(1)} hrs
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* AD/SB Compliance Matrix */}
      {adSbMatrix.length > 0 && (
        <details className="rounded-lg border border-amber-300/80 bg-[#fffdf7] shadow-sm">
          <summary className="flex items-center gap-2 cursor-pointer px-4 py-3 select-none text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">
            <FiCheck className="text-green-700 flex-shrink-0" />
            AD/SB References
            <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded bg-green-100 text-green-800 border border-green-200 font-semibold">
              {adSbMatrix.length} documented
            </span>
          </summary>
          <div className="overflow-x-auto px-4 pb-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-stone-500 border-b border-amber-200">
                  <th className="text-left py-2 px-2 font-medium">AD/SB Reference</th>
                  <th className="text-left py-2 px-2 font-medium">Last Complied</th>
                  <th className="text-right py-2 px-2 font-medium">Entries</th>
                  <th className="text-left py-2 px-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {adSbMatrix.map(({ ref, latestDate, count }) => (
                  <tr key={ref} className="border-b border-amber-100 hover:bg-amber-50/50">
                    <td className="py-1.5 px-2 font-mono text-stone-900">{ref}</td>
                    <td className="py-1.5 px-2 text-stone-600">{latestDate ?? '—'}</td>
                    <td className="py-1.5 px-2 text-right text-stone-600 tabular-nums">{count}</td>
                    <td className="py-1.5 px-2">
                      <span className="px-1.5 py-0.5 rounded bg-green-100 text-green-800 border border-green-200 text-[10px] font-medium">
                        Documented
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {/* Findings List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-stone-500">
          <FiAlertTriangle className="text-3xl mx-auto mb-2" />
          <p className="text-sm">{findings.length === 0 ? 'No findings yet. Run compliance checks to analyze entries.' : 'No findings match this filter.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <FindingCard key={f._id} finding={f} onUpdateStatus={updateFindingStatus} onConvertToIssue={handleConvertToIssue} />
          ))}
        </div>
      )}
    </div>
  );
}

function FindingCard({ finding, onUpdateStatus, onConvertToIssue }: { finding: ComplianceFinding; onUpdateStatus: any; onConvertToIssue: (f: ComplianceFinding) => void }) {
  const severityColors: Record<string, string> = {
    critical: 'border-l-red-600 bg-red-50',
    major: 'border-l-orange-600 bg-orange-50',
    minor: 'border-l-amber-600 bg-amber-50',
  };

  return (
    <div className={`border border-amber-300/80 border-l-2 ${severityColors[finding.severity] ?? ''} rounded-lg p-4 shadow-sm`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded ${
              finding.severity === 'critical' ? 'bg-red-100 text-red-800' :
              finding.severity === 'major' ? 'bg-orange-100 text-orange-800' :
              'bg-amber-100 text-amber-800'
            }`}>{finding.severity}</span>
            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-stone-100 text-stone-600">{finding.findingType.replace('_', ' ')}</span>
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
              finding.status === 'open' ? 'bg-sky-100 text-sky-900' :
              finding.status === 'resolved' ? 'bg-green-100 text-green-800' :
              finding.status === 'false_positive' ? 'bg-stone-100 text-stone-500' :
              'bg-amber-100 text-amber-800'
            }`}>{finding.status}</span>
          </div>
          <h4 className="text-sm font-medium text-stone-900 mb-1 font-['Source_Serif_4',serif]">{finding.title}</h4>
          <p className="text-xs text-stone-700 mb-2">{finding.description}</p>
          <div className="text-[11px] text-sky-700 font-mono">{finding.citation}</div>
        </div>
        {finding.status === 'open' && (
          <div className="flex gap-1 flex-shrink-0">
            {!finding.convertedToIssueId && (
              <button
                type="button"
                onClick={() => onConvertToIssue(finding)}
                className="p-1.5 text-stone-500 hover:text-sky-800 hover:bg-sky-100 rounded transition-colors"
                title="Convert to CAR"
              >
                <FiAlertTriangle className="text-sm" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onUpdateStatus({ findingId: finding._id as any, status: 'acknowledged' })}
              className="p-1.5 text-stone-500 hover:text-amber-800 hover:bg-amber-100 rounded transition-colors"
              title="Acknowledge"
            >
              <FiCheck className="text-sm" />
            </button>
            <button
              type="button"
              onClick={() => onUpdateStatus({ findingId: finding._id as any, status: 'false_positive' })}
              className="p-1.5 text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded transition-colors"
              title="Mark false positive"
            >
              <FiX className="text-sm" />
            </button>
          </div>
        )}
      </div>
      {finding.evidenceSnippet && (
        <pre className="mt-2 text-[10px] text-stone-600 bg-[#fffdf7] border border-amber-200 rounded p-2 whitespace-pre-wrap">{finding.evidenceSnippet}</pre>
      )}
    </div>
  );
}

/* ─── Bulk CSV Import Modal ──────────────────────────────────────────── */

const FIELD_LABELS: Record<MappableField, string> = {
  entryDate: 'Entry Date',
  workPerformed: 'Work Performed',
  ataChapter: 'ATA Chapter',
  totalTimeAtEntry: 'Total Time (hrs)',
  totalCyclesAtEntry: 'Cycles',
  totalLandingsAtEntry: 'Landings',
  signerName: 'Signer Name',
  signerCertNumber: 'Cert Number',
  signerCertType: 'Cert Type',
  entryType: 'Entry Type',
  adReferences: 'AD References',
  sbReferences: 'SB References',
  returnToServiceStatement: 'RTS Statement',
};

const ALL_MAPPABLE_FIELDS = Object.keys(FIELD_LABELS) as MappableField[];

function BulkImportModal({
  projectId,
  aircraftId,
  onAdd,
  onClose,
}: {
  projectId: string;
  aircraftId: string;
  onAdd: (args: any) => Promise<any>;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'upload' | 'map' | 'importing'>('upload');
  const [csv, setCsv] = useState<ParsedCSV | null>(null);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [preview, setPreview] = useState<ImportPreviewRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0) { toast.error('Could not parse CSV — check the file format.'); return; }
      const detected = autoDetectMapping(parsed.headers);
      const prev = buildPreview(parsed, detected, aircraftId);
      setCsv(parsed);
      setMapping(detected);
      setPreview(prev);
      setStep('map');
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!csv || !mapping) return;
    setImporting(true);
    try {
      const entries = mapAllRows(csv, mapping, aircraftId);
      if (entries.length === 0) { toast.error('No valid rows to import.'); return; }
      // Batch in chunks of 100
      let imported = 0;
      let errors = 0;
      for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100);
        try {
          await onAdd({ projectId: projectId as any, entries: chunk as any });
          imported += chunk.length;
        } catch {
          errors += chunk.length;
        }
      }
      setImportResult({ imported, errors });
      toast.success(`Imported ${imported} entr${imported === 1 ? 'y' : 'ies'} from ${fileName}`);
      if (errors === 0) setTimeout(onClose, 1500);
    } catch (err: any) {
      toast.error(err.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const inputCls = 'w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-400';

  const mappedCount = mapping ? Object.values(mapping).filter(Boolean).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative bg-[#fffdf7] border border-amber-300 rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto p-6">
        <button type="button" onClick={onClose} className="absolute top-4 right-4 text-stone-500 hover:text-stone-800">
          <FiX className="text-xl" />
        </button>
        <h2 className="text-lg font-semibold text-stone-900 font-['Source_Serif_4',serif] mb-1">
          Bulk Import from CSV
        </h2>
        <p className="text-xs text-stone-500 mb-4">
          Import logbook exports from Bluetail, CAMP, Veryon, or any CSV/TSV spreadsheet.
        </p>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-amber-300 rounded-xl bg-amber-50/40 hover:bg-amber-50 transition-colors p-10 text-center cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <FiUpload className="text-3xl mx-auto text-amber-500 mb-3" />
            <p className="text-sm font-semibold text-stone-700 mb-1">Drop your CSV or TSV file here</p>
            <p className="text-xs text-stone-500">or click to browse — comma, tab, semicolon, and pipe delimiters supported</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {/* Step 2: Column Mapping + Preview */}
        {step === 'map' && csv && mapping && (
          <div className="space-y-4">
            {/* File info */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-sm">
              <FiFile className="text-green-700 flex-shrink-0" />
              <span className="font-medium text-green-900">{fileName}</span>
              <span className="text-green-700 ml-auto">{csv.rows.length} rows · {csv.headers.length} columns · delimiter: {csv.delimiter === '\t' ? 'TAB' : `"${csv.delimiter}"`}</span>
            </div>

            {/* Column mapping */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-stone-700 uppercase tracking-wide">
                  Column Mapping
                </p>
                <span className="text-[10px] text-stone-500">{mappedCount} of {ALL_MAPPABLE_FIELDS.length} fields mapped</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                {ALL_MAPPABLE_FIELDS.map((field) => (
                  <div key={field} className="flex items-center gap-2">
                    <label className="text-[11px] text-stone-600 w-32 flex-shrink-0">{FIELD_LABELS[field]}</label>
                    <select
                      value={mapping[field] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        const newMapping = { ...mapping, [field]: val };
                        setMapping(newMapping);
                        setPreview(buildPreview(csv, newMapping, aircraftId));
                      }}
                      className={inputCls}
                    >
                      <option value="">— not mapped —</option>
                      {csv.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Preview */}
            {preview.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-stone-700 uppercase tracking-wide mb-2">
                  Preview (first {preview.length} rows)
                </p>
                <div className="overflow-x-auto rounded-lg border border-amber-300">
                  <table className="w-full text-[11px]">
                    <thead className="bg-amber-50 border-b border-amber-200">
                      <tr>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">#</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">Date</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium w-72">Work Performed</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">ATA</th>
                        <th className="px-2 py-1.5 text-right text-stone-600 font-medium">TT</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">Signer</th>
                        <th className="px-2 py-1.5 text-left text-stone-600 font-medium">⚠</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row) => (
                        <tr key={row.rowNum} className="border-b border-amber-100 hover:bg-amber-50/40">
                          <td className="px-2 py-1.5 text-stone-400 tabular-nums">{row.rowNum}</td>
                          <td className="px-2 py-1.5 font-mono text-stone-700">{row.mapped.entryDate ?? '—'}</td>
                          <td className="px-2 py-1.5 text-stone-800 max-w-[280px] truncate font-['Source_Serif_4',serif]">{row.mapped.workPerformed ?? '—'}</td>
                          <td className="px-2 py-1.5 text-stone-600">{row.mapped.ataChapter ?? '—'}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-stone-600">
                            {row.mapped.totalTimeAtEntry !== undefined ? row.mapped.totalTimeAtEntry.toFixed(1) : '—'}
                          </td>
                          <td className="px-2 py-1.5 text-stone-600 truncate max-w-[100px]">{row.mapped.signerName ?? '—'}</td>
                          <td className="px-2 py-1.5">
                            {row.warnings.length > 0 && (
                              <span
                                className="text-amber-600 cursor-help"
                                title={row.warnings.join('\n')}
                              >
                                <FiAlertTriangle className="inline" />
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {csv.rows.length > preview.length && (
                  <p className="text-[10px] text-stone-400 mt-1">
                    … and {csv.rows.length - preview.length} more rows
                  </p>
                )}
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className={`px-4 py-3 rounded-lg border text-sm font-medium ${importResult.errors === 0 ? 'bg-green-50 border-green-300 text-green-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
                ✓ Imported {importResult.imported} entries
                {importResult.errors > 0 && ` · ${importResult.errors} failed`}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-between items-center pt-2 border-t border-amber-200">
              <button
                type="button"
                onClick={() => { setCsv(null); setMapping(null); setStep('upload'); setImportResult(null); }}
                className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1"
              >
                ← Use a different file
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-amber-300 text-stone-700 hover:bg-amber-50">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || mappedCount === 0}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-sky-700 text-white rounded-lg hover:bg-sky-800 disabled:opacity-50"
                >
                  <FiUpload />
                  {importing ? `Importing…` : `Import ${csv.rows.length} rows`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Add Manual Entry Modal — Smart Assist Helpers ─────────────────── */

const ATA_KEYWORDS: Array<{ keywords: string[]; chapter: string; label: string }> = [
  { keywords: ['oil', 'lube', 'lubrication'], chapter: '79', label: 'Oil System' },
  { keywords: ['fuel', 'injector', 'carb', 'carburetor', 'fuel pump', 'gascolator'], chapter: '28', label: 'Fuel' },
  { keywords: ['landing gear', 'nose gear', 'main gear', 'brake', 'tire', 'wheel', 'strut', 'oleo'], chapter: '32', label: 'Landing Gear' },
  { keywords: ['engine', 'cylinder', 'piston', 'crankshaft', 'camshaft', 'valve', 'compression'], chapter: '72', label: 'Engine' },
  { keywords: ['propeller', 'prop', 'spinner', 'prop hub'], chapter: '61', label: 'Propeller' },
  { keywords: ['electrical', 'battery', 'alternator', 'generator', 'wiring', 'circuit breaker', 'relay'], chapter: '24', label: 'Electrical' },
  { keywords: ['radio', 'comm', 'gps', 'transponder', 'ads-b', 'adsb', 'elt', 'avionics'], chapter: '34', label: 'Navigation/Avionics' },
  { keywords: ['exhaust', 'muffler', 'manifold', 'heat muff'], chapter: '78', label: 'Exhaust' },
  { keywords: ['ignition', 'magneto', 'spark plug', 'mag check'], chapter: '74', label: 'Ignition' },
  { keywords: ['air filter', 'induction', 'intake', 'airbox', 'air box'], chapter: '73', label: 'Eng Fuel & Control' },
  { keywords: ['flight control', 'aileron', 'elevator', 'rudder', 'flap', 'trim', 'cable tension'], chapter: '27', label: 'Flight Controls' },
  { keywords: ['pitot', 'static', 'altimeter', 'airspeed', 'asi', 'vsi', 'attitude indicator', 'gyro'], chapter: '34', label: 'Instruments' },
  { keywords: ['hydraulic', 'actuator', 'fluid'], chapter: '29', label: 'Hydraulic' },
  { keywords: ['door', 'hinge', 'latch', 'seal', 'window'], chapter: '52', label: 'Doors' },
  { keywords: ['structural', 'spar', 'rib', 'skin', 'corrosion', 'crack'], chapter: '57', label: 'Wings' },
  { keywords: ['cabin', 'seat', 'interior', 'harness', 'belt'], chapter: '25', label: 'Equipment/Furnishings' },
  { keywords: ['antenna', 'com antenna', 'nav antenna'], chapter: '23', label: 'Communications' },
  { keywords: ['cooling', 'cowl', 'baffling', 'baffle', 'cht', 'egt'], chapter: '71', label: 'Powerplant' },
];

/** Suggest ATA chapter based on keywords found in work description. */
function guessAtaChapter(text: string): { chapter: string; label: string } | null {
  const lower = text.toLowerCase();
  for (const entry of ATA_KEYWORDS) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return { chapter: entry.chapter, label: entry.label };
    }
  }
  return null;
}

/** Suggest entry type from keywords in work description. */
function guessEntryType(text: string): string | null {
  if (/annual\s+inspection|annual\s+insp/i.test(text)) return 'inspection';
  if (/100.?hour|100[\s-]hr/i.test(text)) return 'inspection';
  if (/\bad[-\s#]\s*\d{4}[-–]\d/i.test(text) || /airworthiness\s+directive/i.test(text)) return 'ad_compliance';
  if (/\bsb[-\s#]\d|service\s+bulletin/i.test(text)) return 'sb_compliance';
  if (/removed\s+and\s+replaced|r\s*&\s*r\b|installed\s+new|replaced\s+with|replace\s+the/i.test(text)) return 'maintenance';
  if (/\binspected?\b|\binspection\b|found\s+no\s+defects|found\s+airworthy|found\s+serviceable/i.test(text)) return 'inspection';
  if (/\balteration\b|\bstc\b|\bfield\s+approval/i.test(text)) return 'alteration';
  if (/preventive\s+maintenance|pm\s+performed/i.test(text)) return 'preventive_maintenance';
  if (/rebuilt|rebuild|overhaul/i.test(text)) return 'rebuilding';
  return null;
}

interface SavedSigner { name: string; certNumber: string; certType: string }

function loadSavedSigners(aircraftId: string): SavedSigner[] {
  try {
    return JSON.parse(localStorage.getItem(`aviation-logbook-signers-${aircraftId}`) ?? '[]');
  } catch { return []; }
}

function saveSigner(aircraftId: string, signer: SavedSigner) {
  const existing = loadSavedSigners(aircraftId).filter(
    (s) => s.certNumber !== signer.certNumber || s.name !== signer.name,
  );
  const updated = [signer, ...existing].slice(0, 6);
  localStorage.setItem(`aviation-logbook-signers-${aircraftId}`, JSON.stringify(updated));
}

/** Simple keyword-overlap score for fuzzy suggestion matching. */
function scoreSuggestion(query: string, candidate: string): number {
  const tokens = query.toLowerCase().split(/\s+/).filter((t) => t.length >= 3);
  if (tokens.length === 0) return 0;
  const lower = candidate.toLowerCase();
  return tokens.reduce((sum, t) => sum + (lower.includes(t) ? 1 : 0), 0);
}

/* ─── Add Manual Entry Modal ─────────────────────────────────────────── */

type ManualEntryForm = {
  entryDate: string;
  workPerformed: string;
  entryType: string;
  ataChapter: string;
  adReferences: string;
  sbReferences: string;
  totalTimeAtEntry: string;
  totalCyclesAtEntry: string;
  totalLandingsAtEntry: string;
  signerName: string;
  signerCertNumber: string;
  signerCertType: string;
  returnToServiceStatement: string;
  hasReturnToService: boolean;
};

const EMPTY_MANUAL_FORM: ManualEntryForm = {
  entryDate: '',
  workPerformed: '',
  entryType: '',
  ataChapter: '',
  adReferences: '',
  sbReferences: '',
  totalTimeAtEntry: '',
  totalCyclesAtEntry: '',
  totalLandingsAtEntry: '',
  signerName: '',
  signerCertNumber: '',
  signerCertType: '',
  returnToServiceStatement: '',
  hasReturnToService: false,
};

function AddManualEntryModal({
  projectId,
  aircraftId,
  allEntries,
  onAdd,
  onClose,
}: {
  projectId: string;
  aircraftId: string;
  allEntries: LogbookEntry[];
  onAdd: (args: any) => Promise<any>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ManualEntryForm>(EMPTY_MANUAL_FORM);
  const [saving, setSaving] = useState(false);

  // Smart assist state
  const [workSuggestions, setWorkSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [ataSuggestion, setAtaSuggestion] = useState<{ chapter: string; label: string } | null>(null);
  const [typeSuggestion, setTypeSuggestion] = useState<string | null>(null);
  const [savedSigners] = useState<SavedSigner[]>(() => loadSavedSigners(aircraftId));
  const workRef = useRef<HTMLTextAreaElement>(null);

  const set =
    (field: keyof ManualEntryForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleWorkChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setForm((f) => ({ ...f, workPerformed: val }));

    if (val.trim().length >= 3) {
      // Past-entry suggestions
      const scored = allEntries
        .filter((ent) => ent.workPerformed)
        .map((ent) => ({ text: ent.workPerformed!, score: scoreSuggestion(val, ent.workPerformed!) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score);
      const unique = Array.from(new Map(scored.map((s) => [s.text, s])).values())
        .slice(0, 5)
        .map((s) => s.text);
      setWorkSuggestions(unique);
      setShowSuggestions(unique.length > 0);

      // ATA suggestion
      setAtaSuggestion(guessAtaChapter(val));

      // Entry type suggestion (only when not already set)
      if (!form.entryType) setTypeSuggestion(guessEntryType(val));
    } else {
      setWorkSuggestions([]);
      setShowSuggestions(false);
      setAtaSuggestion(null);
      setTypeSuggestion(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const splitRefs = (val: string) =>
        val.split(',').map((r) => r.trim()).filter((r) => r.length > 0);
      const adRefs = splitRefs(form.adReferences);
      const sbRefs = splitRefs(form.sbReferences);

      const entry: Record<string, unknown> = {
        aircraftId: aircraftId as any,
        rawText: form.workPerformed.trim() || '(manually entered)',
        userVerified: true,
        confidence: 1.0,
      };

      if (form.entryDate) entry.entryDate = form.entryDate;
      if (form.workPerformed.trim()) entry.workPerformed = form.workPerformed.trim();
      if (form.entryType) entry.entryType = form.entryType;
      if (form.ataChapter.trim()) entry.ataChapter = form.ataChapter.trim();
      if (adRefs.length > 0) entry.adReferences = adRefs;
      if (sbRefs.length > 0) entry.sbReferences = sbRefs;
      if (adRefs.length > 0 || sbRefs.length > 0) {
        entry.adSbReferences = Array.from(new Set([...adRefs, ...sbRefs]));
      }

      const tt = parseFloat(form.totalTimeAtEntry);
      if (!isNaN(tt)) entry.totalTimeAtEntry = tt;
      const tc = parseInt(form.totalCyclesAtEntry, 10);
      if (!isNaN(tc)) entry.totalCyclesAtEntry = tc;
      const tl = parseInt(form.totalLandingsAtEntry, 10);
      if (!isNaN(tl)) entry.totalLandingsAtEntry = tl;

      if (form.signerName.trim()) entry.signerName = form.signerName.trim();
      if (form.signerCertNumber.trim()) entry.signerCertNumber = form.signerCertNumber.trim();
      if (form.signerCertType.trim()) entry.signerCertType = form.signerCertType.trim();
      if (form.returnToServiceStatement.trim())
        entry.returnToServiceStatement = form.returnToServiceStatement.trim();
      entry.hasReturnToService = form.hasReturnToService;

      await onAdd({ projectId: projectId as any, entries: [entry] });
      // Persist signer for quick-fill
      if (form.signerName.trim() && form.signerCertNumber.trim()) {
        saveSigner(aircraftId, {
          name: form.signerName.trim(),
          certNumber: form.signerCertNumber.trim(),
          certType: form.signerCertType.trim(),
        });
      }
      toast.success('Logbook entry created');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create entry');
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    'w-full rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400';
  const labelCls = 'block text-xs font-medium text-stone-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative bg-[#fffdf7] border border-amber-300 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-stone-500 hover:text-stone-800"
        >
          <FiX className="text-xl" />
        </button>
        <h2 className="text-lg font-semibold text-stone-900 font-['Source_Serif_4',serif] mb-4">
          Add Logbook Entry Manually
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Entry Date</label>
              <input type="date" className={inputCls} value={form.entryDate} onChange={set('entryDate')} />
            </div>
            <div>
              <label className={labelCls}>
                Entry Type
                {typeSuggestion && !form.entryType && (
                  <button
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, entryType: typeSuggestion })); setTypeSuggestion(null); }}
                    className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 font-medium"
                    title="Auto-detected from work description"
                  >
                    Use: {getLogbookEntryTypeLabel(typeSuggestion)} ✦
                  </button>
                )}
              </label>
              <select className={inputCls} value={form.entryType} onChange={set('entryType')}>
                <option value="">Select type…</option>
                {LOGBOOK_ENTRY_TYPE_ORDER.map((t) => (
                  <option key={t} value={t}>
                    {getLogbookEntryTypeLabel(t)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>
              Work Performed <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <textarea
                ref={workRef}
                className={`${inputCls} resize-y min-h-[80px]`}
                value={form.workPerformed}
                onChange={handleWorkChange}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                onFocus={() => workSuggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Describe the maintenance work performed…"
                required
              />
              {showSuggestions && workSuggestions.length > 0 && (
                <div className="absolute z-30 left-0 right-0 top-full mt-0.5 bg-white border border-amber-300 rounded-lg shadow-xl overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-amber-100 text-[10px] text-stone-500 font-semibold uppercase tracking-wide">
                    Similar past entries — click to reuse
                  </div>
                  {workSuggestions.map((s, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-full text-left px-3 py-2 text-xs text-stone-800 hover:bg-amber-50 border-b border-amber-50 last:border-0 truncate font-['Source_Serif_4',serif]"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setForm((f) => ({ ...f, workPerformed: s }));
                        setShowSuggestions(false);
                        // Cascade smart hints on selection
                        const ata = guessAtaChapter(s);
                        if (ata) setAtaSuggestion(ata);
                        const type = guessEntryType(s);
                        if (type && !form.entryType) setTypeSuggestion(type);
                      }}
                    >
                      {s.length > 110 ? s.slice(0, 110) + '…' : s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className={labelCls}>Return-to-Service Statement</label>
            <textarea
              className={`${inputCls} resize-y min-h-[60px]`}
              value={form.returnToServiceStatement}
              onChange={set('returnToServiceStatement')}
              placeholder="e.g. Aircraft returned to service per 14 CFR §43.9"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="hasRts"
              checked={form.hasReturnToService}
              onChange={(e) => setForm((f) => ({ ...f, hasReturnToService: e.target.checked }))}
              className="rounded border-amber-300"
            />
            <label htmlFor="hasRts" className="text-sm text-stone-700">
              Has return-to-service statement
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>
                ATA Chapter
                {ataSuggestion && !form.ataChapter && (
                  <button
                    type="button"
                    onClick={() => { setForm((f) => ({ ...f, ataChapter: ataSuggestion.chapter })); setAtaSuggestion(null); }}
                    className="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 font-medium"
                    title="Detected from work description"
                  >
                    Use: ATA {ataSuggestion.chapter} ({ataSuggestion.label}) ✦
                  </button>
                )}
              </label>
              <input
                type="text"
                className={inputCls}
                value={form.ataChapter}
                onChange={set('ataChapter')}
                placeholder="e.g. 71"
              />
            </div>
            <div>
              <label className={labelCls}>AD References (comma-separated)</label>
              <input
                type="text"
                className={inputCls}
                value={form.adReferences}
                onChange={set('adReferences')}
                placeholder="e.g. AD 2023-15-02, AD 2021-07-10"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>SB References (comma-separated)</label>
            <input
              type="text"
              className={inputCls}
              value={form.sbReferences}
              onChange={set('sbReferences')}
              placeholder="e.g. SB-1234-R1, SB-5678"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Total Time (hrs)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                className={inputCls}
                value={form.totalTimeAtEntry}
                onChange={set('totalTimeAtEntry')}
                placeholder="e.g. 4215.3"
              />
            </div>
            <div>
              <label className={labelCls}>Total Cycles</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={form.totalCyclesAtEntry}
                onChange={set('totalCyclesAtEntry')}
                placeholder="e.g. 3100"
              />
            </div>
            <div>
              <label className={labelCls}>Total Landings</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                value={form.totalLandingsAtEntry}
                onChange={set('totalLandingsAtEntry')}
                placeholder="e.g. 3100"
              />
            </div>
          </div>

          {savedSigners.length > 0 && (
            <div>
              <p className="text-[10px] text-stone-500 font-semibold uppercase tracking-wide mb-1.5">
                Recent Signers — click to fill
              </p>
              <div className="flex flex-wrap gap-1.5">
                {savedSigners.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, signerName: s.name, signerCertNumber: s.certNumber, signerCertType: s.certType }))}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-amber-300 bg-[#fff8eb] text-stone-700 hover:bg-amber-100 transition-colors"
                  >
                    <FiCheck className="text-green-600 text-[10px]" />
                    {s.name}
                    {s.certNumber && <span className="text-stone-400 font-mono">#{s.certNumber}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Signer Name</label>
              <input
                type="text"
                className={inputCls}
                value={form.signerName}
                onChange={set('signerName')}
                placeholder="A&P / IA name"
              />
            </div>
            <div>
              <label className={labelCls}>Cert Number</label>
              <input
                type="text"
                className={inputCls}
                value={form.signerCertNumber}
                onChange={set('signerCertNumber')}
                placeholder="e.g. 3912345"
              />
            </div>
            <div>
              <label className={labelCls}>Cert Type</label>
              <input
                type="text"
                className={inputCls}
                value={form.signerCertType}
                onChange={set('signerCertType')}
                placeholder="e.g. A&P, IA"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-amber-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-amber-300 text-stone-700 hover:bg-amber-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !form.workPerformed.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50"
            >
              <FiCheck />
              {saving ? 'Saving…' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Timeline Tab ───────────────────────────────────────────────────── */

const LOGBOOK_COLORS = ['#0369a1', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2', '#be185d', '#65a30d'];

function TimelineTab({ projectId, aircraftId }: { projectId: string; aircraftId: string; }) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const documents = (useDocuments(projectId, 'logbook') ?? []) as any[];
  const [arrangeBy, setArrangeBy] = useState<ArrangeBy>('date_asc');
  const [locationFilter, setLocationFilter] = useState<EntryLocation>('full');
  const [gapThreshold, setGapThreshold] = useState(90);
  const [multiLogbookView, setMultiLogbookView] = useState(false);
  const [crossCheckThreshold, setCrossCheckThreshold] = useState(5);

  const gaps = (useQuery(
    (api as any).logbookEntries.detectGaps,
    { projectId: projectId as any, aircraftId: aircraftId as any, thresholdDays: gapThreshold }
  ) ?? []) as LogbookGapWarning[];

  const continuityWarnings = (useQuery(
    (api as any).logbookEntries.checkContinuity,
    { projectId: projectId as any, aircraftId: aircraftId as any }
  ) ?? []) as LogbookContinuityWarning[];

  const gapMap = useMemo(() => {
    const m = new Map<string, LogbookGapWarning>();
    for (const g of gaps) m.set(g.beforeEntryId, g);
    return m;
  }, [gaps]);

  const continuityMap = useMemo(() => {
    const m = new Map<string, LogbookContinuityWarning>();
    for (const w of continuityWarnings) m.set(w.entryId, w);
    return m;
  }, [continuityWarnings]);

  const locationFiltered = useMemo(
    () => filterEntriesByLocation(entries, locationFilter),
    [entries, locationFilter]
  );

  const sorted = useMemo(() => {
    const dated = [...locationFiltered].filter((e) => e.entryDate);
    if (arrangeBy === 'date_desc') return dated.sort((a, b) => compareEntryDate(a, b, 'desc'));
    return dated.sort((a, b) => compareEntryDate(a, b, 'asc'));
  }, [arrangeBy, locationFiltered]);

  const grouped = useMemo(() => {
    if (arrangeBy !== 'type_sections') return [];
    return groupEntriesByType(locationFiltered.filter((e) => e.entryDate), 'asc');
  }, [arrangeBy, locationFiltered]);

  const chartData = useMemo(() => {
    return entries
      .filter((e) => e.entryDate && e.totalTimeAtEntry !== undefined)
      .sort((a, b) => a.entryDate!.localeCompare(b.entryDate!))
      .map((e) => ({ label: e.entryDate!.slice(0, 7), hours: e.totalTimeAtEntry! }));
  }, [entries]);

  // ── Multi-logbook support ─────────────────────────────────────────────────

  const docNameMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const doc of documents) m.set(doc._id, doc.name as string);
    return m;
  }, [documents]);

  const docGroups = useMemo(() => {
    const groups = new Map<string, LogbookEntry[]>();
    for (const entry of entries) {
      const key = entry.sourceDocumentId ?? '__unknown__';
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    return groups;
  }, [entries]);

  const docIds = useMemo(() => [...docGroups.keys()], [docGroups]);

  const multiChartData = useMemo(() => {
    if (!multiLogbookView || docGroups.size <= 1) return [];
    const allMonths = new Set<string>();
    for (const [, docEntries] of docGroups) {
      for (const e of docEntries) {
        if (e.entryDate && e.totalTimeAtEntry !== undefined) allMonths.add(e.entryDate.slice(0, 7));
      }
    }
    const sortedMonths = [...allMonths].sort();
    return sortedMonths.map((month) => {
      const point: Record<string, string | number | undefined> = { date: month };
      for (const [docId, docEntries] of docGroups) {
        const relevant = docEntries
          .filter((e) => e.entryDate && e.entryDate.slice(0, 7) <= month && e.totalTimeAtEntry !== undefined)
          .sort((a, b) => b.entryDate!.localeCompare(a.entryDate!));
        if (relevant.length > 0) point[docId] = relevant[0].totalTimeAtEntry;
      }
      return point;
    });
  }, [multiLogbookView, docGroups]);

  const crossLogbookDiscrepancies = useMemo(() => {
    if (docIds.length < 2) return [];
    const results: Array<{
      dateA: string; ttA: number; docAId: string;
      dateB: string; ttB: number; docBId: string;
      ttDiff: number; daysDiff: number;
    }> = [];
    for (let i = 0; i < docIds.length; i++) {
      for (let j = i + 1; j < docIds.length; j++) {
        const aEntries = (docGroups.get(docIds[i]) ?? []).filter((e) => e.entryDate && e.totalTimeAtEntry !== undefined);
        const bEntries = (docGroups.get(docIds[j]) ?? []).filter((e) => e.entryDate && e.totalTimeAtEntry !== undefined);
        for (const eA of aEntries) {
          for (const eB of bEntries) {
            const dDiff = Math.abs(daysBetween(eA.entryDate!, eB.entryDate!));
            if (dDiff > 14) continue;
            const ttDiff = Math.abs(eA.totalTimeAtEntry! - eB.totalTimeAtEntry!);
            if (ttDiff >= crossCheckThreshold) {
              results.push({ dateA: eA.entryDate!, ttA: eA.totalTimeAtEntry!, docAId: docIds[i], dateB: eB.entryDate!, ttB: eB.totalTimeAtEntry!, docBId: docIds[j], ttDiff, daysDiff: dDiff });
            }
          }
        }
      }
    }
    // Deduplicate by keeping one per unique (docA, docB, approximate date range)
    const seen = new Set<string>();
    return results.filter((r) => {
      const key = `${r.docAId}-${r.docBId}-${r.dateA.slice(0, 7)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => b.ttDiff - a.ttDiff);
  }, [docIds, docGroups, crossCheckThreshold]);

  if (arrangeBy === 'type_sections' ? grouped.length === 0 : sorted.length === 0) {
    return (
      <div className="text-center py-12 text-stone-500">
        <FiClock className="text-3xl mx-auto mb-2" />
        <p className="text-sm">No dated entries to display. Parse logbook documents to build the timeline.</p>
      </div>
    );
  }

  // showGaps only makes sense in chronological ascending order
  const showGaps = arrangeBy === 'date_asc';

  const renderTimelineRows = (timelineEntries: LogbookEntry[], withGaps = false) => {
    let prevTime: number | undefined;
    const rows: JSX.Element[] = [];

    for (const entry of timelineEntries) {
      const timeDelta =
        prevTime !== undefined && entry.totalTimeAtEntry !== undefined
          ? entry.totalTimeAtEntry - prevTime
          : undefined;
      prevTime = entry.totalTimeAtEntry;

      const continuityWarning = continuityMap.get(entry._id);
      const gapAfterEntry = withGaps ? gapMap.get(entry._id) : undefined;

      const docId = entry.sourceDocumentId ?? '__unknown__';
      const docIdx = docIds.indexOf(docId);
      const docColor = multiLogbookView && docIdx >= 0 ? LOGBOOK_COLORS[docIdx % LOGBOOK_COLORS.length] : undefined;
      const docLabel = docId !== '__unknown__' ? (docNameMap.get(docId) ?? docId) : 'Unknown';
      const shortDocLabel = docLabel.length > 16 ? docLabel.slice(0, 16) + '…' : docLabel;

      rows.push(
        <div
          key={entry._id}
          className={`grid gap-2 items-start px-3 py-2 hover:bg-amber-50/60 rounded text-xs ${multiLogbookView ? 'grid-cols-[80px_120px_1fr_90px_70px_70px]' : 'grid-cols-[80px_1fr_90px_70px_70px]'} ${continuityWarning ? 'bg-red-50/60' : ''}`}
          style={docColor ? { borderLeft: `3px solid ${docColor}` } : undefined}
        >
          <span className="text-stone-700 font-mono">{entry.entryDate}</span>
          {multiLogbookView && (
            <span className="text-[10px] truncate font-medium" style={{ color: docColor ?? '#78716c' }} title={docLabel}>
              {shortDocLabel}
            </span>
          )}
          <span className="min-w-0">
            <span className="text-stone-800 truncate block font-['Source_Serif_4',serif]">
              {entry.workPerformed ?? entry.rawText.slice(0, 80)}
            </span>
            {continuityWarning && (
              <span
                className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-800 border border-red-300 font-semibold"
                title={`Total time ${continuityWarning.deltaHours < 0 ? 'decreased' : 'jumped'} from ${continuityWarning.previousTotalTime} to ${continuityWarning.currentTotalTime} hrs`}
              >
                <FiAlertTriangle className="text-[10px]" />
                TT {continuityWarning.deltaHours < 0 ? '↓' : '↑'} {Math.abs(continuityWarning.deltaHours).toFixed(1)} hrs
              </span>
            )}
          </span>
          <span className="text-right text-stone-600 font-mono tabular-nums">
            {entry.totalTimeAtEntry ?? '—'}
            {timeDelta !== undefined && timeDelta > 0 && (
              <span className="text-sky-700 ml-1">(+{timeDelta.toFixed(1)})</span>
            )}
          </span>
          <span className="text-right text-stone-600 font-mono tabular-nums">{entry.totalCyclesAtEntry ?? '—'}</span>
          <span className="text-right text-stone-600 font-mono tabular-nums">{entry.totalLandingsAtEntry ?? '—'}</span>
        </div>
      );

      if (gapAfterEntry) {
        rows.push(
          <div
            key={`gap-${entry._id}`}
            className="flex items-center gap-2 mx-1 my-0.5 px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-100 text-xs text-amber-900"
          >
            <FiAlertTriangle className="text-amber-600 flex-shrink-0" />
            <span className="font-semibold">{gapAfterEntry.gapDays}-day gap</span>
            <span className="text-amber-700">
              {gapAfterEntry.beforeDate} → {gapAfterEntry.afterDate}
            </span>
          </div>
        );
      }
    }

    return rows;
  };

  return (
    <div className="space-y-3 text-stone-800">
      {/* Total Time Progression Chart */}
      {(chartData.length >= 2 || multiChartData.length >= 2) && (
        <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] px-4 pt-3 pb-2 shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[11px] font-medium text-stone-500 uppercase tracking-wide">Total Time Progression</p>
            {docIds.length > 1 && (
              <button
                type="button"
                onClick={() => setMultiLogbookView((v) => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-medium transition-colors ${
                  multiLogbookView
                    ? 'bg-sky-700 text-white border-sky-900'
                    : 'bg-[#fff8eb] text-stone-700 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <FiLayers className="text-xs" />
                {multiLogbookView ? `Multi-Logbook (${docIds.length})` : 'Multi-Logbook View'}
              </button>
            )}
          </div>
          {multiLogbookView && multiChartData.length >= 2 ? (
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={multiChartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#78716c' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#78716c' }} width={52} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: '#fffdf7', border: '1px solid #d97706', borderRadius: 6 }}
                  formatter={(val, name) => [
                    typeof val === 'number' ? `${val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs` : String(val),
                    docNameMap.get(String(name)) ?? String(name),
                  ]}
                  labelStyle={{ color: '#57534e', fontWeight: 600 }}
                />
                <Legend
                  formatter={(value) => {
                    const name = docNameMap.get(value) ?? value;
                    return <span style={{ fontSize: 10 }}>{name.length > 24 ? name.slice(0, 24) + '…' : name}</span>;
                  }}
                />
                {docIds.map((docId, idx) => (
                  <Line
                    key={docId}
                    type="monotone"
                    dataKey={docId}
                    stroke={LOGBOOK_COLORS[idx % LOGBOOK_COLORS.length]}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="ttGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0369a1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0369a1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#78716c' }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#78716c' }} width={52} tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip
                  contentStyle={{ fontSize: 11, background: '#fffdf7', border: '1px solid #d97706', borderRadius: 6 }}
                  formatter={(val) => [typeof val === 'number' ? `${val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs` : String(val), 'Total Time']}
                  labelStyle={{ color: '#57534e', fontWeight: 600 }}
                />
                <Area type="monotone" dataKey="hours" stroke="#0369a1" fill="url(#ttGradient)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* Cross-logbook consistency panel */}
      {multiLogbookView && crossLogbookDiscrepancies.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <FiAlertTriangle />
              {crossLogbookDiscrepancies.length} Cross-Logbook Total-Time Discrepanc{crossLogbookDiscrepancies.length > 1 ? 'ies' : 'y'}
            </div>
            <div className="flex items-center gap-2 text-xs text-stone-600">
              <label className="whitespace-nowrap">Threshold (hrs):</label>
              <input
                type="number"
                min="0.5"
                step="0.5"
                value={crossCheckThreshold}
                onChange={(e) => setCrossCheckThreshold(Math.max(0.5, parseFloat(e.target.value) || 5))}
                className="w-14 rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-stone-800 focus:outline-none"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            {crossLogbookDiscrepancies.map((d, i) => {
              const nameA = docNameMap.get(d.docAId) ?? d.docAId;
              const nameB = docNameMap.get(d.docBId) ?? d.docBId;
              const colorA = LOGBOOK_COLORS[docIds.indexOf(d.docAId) % LOGBOOK_COLORS.length];
              const colorB = LOGBOOK_COLORS[docIds.indexOf(d.docBId) % LOGBOOK_COLORS.length];
              return (
                <div key={i} className="flex flex-wrap items-start gap-3 rounded border border-red-200 bg-white px-3 py-2 text-xs">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-stone-700">{d.dateA}</span>
                      <span style={{ color: colorA }} className="font-semibold truncate max-w-[120px]" title={nameA}>{nameA.length > 18 ? nameA.slice(0, 18) + '…' : nameA}</span>
                      <span className="text-stone-500">TT:</span>
                      <span className="font-mono font-bold text-stone-800">{d.ttA.toFixed(1)} hrs</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                      <span className="font-mono font-bold text-stone-700">{d.dateB}</span>
                      <span style={{ color: colorB }} className="font-semibold truncate max-w-[120px]" title={nameB}>{nameB.length > 18 ? nameB.slice(0, 18) + '…' : nameB}</span>
                      <span className="text-stone-500">TT:</span>
                      <span className="font-mono font-bold text-stone-800">{d.ttB.toFixed(1)} hrs</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-bold text-red-700 tabular-nums">Δ {d.ttDiff.toFixed(1)} hrs</div>
                    {d.daysDiff > 0 && <div className="text-stone-400 tabular-nums">{d.daysDiff}d apart</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Warning summary banners */}
      {(gaps.length > 0 || continuityWarnings.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {gaps.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-400 bg-amber-100 text-xs text-amber-900 font-semibold">
              <FiAlertTriangle />
              {gaps.length} gap{gaps.length > 1 ? 's' : ''} &gt; {gapThreshold} days
            </div>
          )}
          {continuityWarnings.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-400 bg-red-50 text-xs text-red-800 font-semibold">
              <FiAlertTriangle />
              {continuityWarnings.length} total-time inconsistenc{continuityWarnings.length > 1 ? 'ies' : 'y'}
            </div>
          )}
        </div>
      )}

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1 text-xs">
          <span className="px-2 text-stone-500">Location</span>
          {([
            ['full', 'Full Logbook'],
            ['ad', 'ADs'],
            ['sb', 'SBs'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setLocationFilter(value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                locationFilter === value ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1 text-xs">
          <span className="px-2 text-stone-500">Arrange</span>
          {([
            ['date_desc', 'Newest first'],
            ['date_asc', 'Oldest first'],
            ['type_sections', 'By entry type'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setArrangeBy(value)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                arrangeBy === value ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs text-stone-600">
          <label htmlFor="gapThreshold" className="whitespace-nowrap">
            Gap threshold (days):
          </label>
          <input
            id="gapThreshold"
            type="number"
            min="1"
            max="3650"
            value={gapThreshold}
            onChange={(e) => setGapThreshold(Math.max(1, parseInt(e.target.value, 10) || 90))}
            className="w-16 rounded border border-amber-300 bg-white px-2 py-1 text-xs text-stone-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Column headers */}
      <div className={`grid gap-2 text-[10px] text-stone-600 font-semibold uppercase px-3 pb-2 border-b border-amber-300 ${multiLogbookView ? 'grid-cols-[80px_120px_1fr_90px_70px_70px]' : 'grid-cols-[80px_1fr_90px_70px_70px]'}`}>
        <span>Date</span>
        {multiLogbookView && <span>Source</span>}
        <span>Work Performed</span>
        <span className="text-right">TT (hrs)</span>
        <span className="text-right">Cycles</span>
        <span className="text-right">Landings</span>
      </div>

      {arrangeBy === 'type_sections' ? (
        <div className="space-y-4">
          {grouped.map((section) => (
            <section
              key={section.key}
              className="rounded-lg border border-amber-300/80 bg-[#fffdf7] shadow-sm p-2"
            >
              <h3 className="px-2 pb-2 text-xs uppercase tracking-wide text-stone-700 font-semibold">
                {section.label}
              </h3>
              <div className="space-y-1">{renderTimelineRows(section.entries, false)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="space-y-1 rounded-lg border border-amber-300/80 bg-[#fffdf7] p-2 shadow-sm">
          {renderTimelineRows(sorted, showGaps)}
        </div>
      )}
    </div>
  );
}

/* ─── Due List Tab ───────────────────────────────────────────────────── */

type DueStatus = 'overdue' | 'due_soon' | 'ok' | 'unknown';
type DueCategory = 'AD' | 'SB' | 'Inspection' | 'Regulatory Check' | 'Component Life' | 'Other';

interface DueItem {
  id: string;
  title: string;
  category: DueCategory;
  referenceNumber?: string;
  lastPerformedDate?: string;
  lastPerformedTT?: number;
  /** Calendar due date (ISO string) */
  dueDate?: string;
  /** Aircraft TT at which this item is due */
  dueAtHours?: number;
  hoursRemaining?: number;
  daysRemaining?: number;
  status: DueStatus;
  sourceEntryId?: string;
  sourceComponentId?: string;
  notes?: string;
}

function addCalendarMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function computeDueStatus(item: Omit<DueItem, 'status'>, today: string, currentTT: number): DueStatus {
  let hoursBased = false;
  let dateBased = false;

  if (item.dueAtHours !== undefined) {
    hoursBased = true;
    const rem = item.dueAtHours - currentTT;
    if (rem < 0) return 'overdue';
    if (rem <= 50) return 'due_soon';
  }
  if (item.dueDate) {
    dateBased = true;
    const days = daysBetween(today, item.dueDate);
    if (days < 0) return 'overdue';
    if (days <= 30) return 'due_soon';
  }
  if (!hoursBased && !dateBased) return 'unknown';
  return 'ok';
}

function buildDueItems(entries: LogbookEntry[], components: AircraftComponent[], currentTT: number): DueItem[] {
  const today = new Date().toISOString().slice(0, 10);
  const items: DueItem[] = [];

  // ── 1. Inspection entries: deduplicate by inspectionType, use latest ──────
  const latestByInspectionType = new Map<string, LogbookEntry>();
  for (const e of entries) {
    if (e.inspectionType) {
      const existing = latestByInspectionType.get(e.inspectionType);
      if (!existing || (e.entryDate ?? '') > (existing.entryDate ?? '')) {
        latestByInspectionType.set(e.inspectionType, e);
      }
    }
  }
  for (const [type, entry] of latestByInspectionType) {
    let dueDate: string | undefined;
    let dueAtHours: number | undefined;
    const label =
      type === 'annual' ? 'Annual Inspection'
      : type === '100_hour' ? '100-Hour Inspection'
      : type === 'progressive' ? 'Progressive Inspection'
      : type === 'condition' ? 'Condition Inspection'
      : type === 'phase' ? 'Phase Inspection'
      : type === 'ica' ? 'ICA Inspection'
      : type === 'conformity' ? 'Conformity Inspection'
      : type === 'pre_purchase' ? 'Pre-Purchase Inspection'
      : 'Inspection';

    if (entry.nextDueDate) {
      dueDate = entry.nextDueDate;
    } else if (entry.recurrenceInterval && entry.recurrenceUnit && entry.entryDate) {
      if (entry.recurrenceUnit === 'calendar_months') {
        dueDate = addCalendarMonths(entry.entryDate, entry.recurrenceInterval);
      } else if (entry.recurrenceUnit === 'hours' && entry.totalTimeAtEntry !== undefined) {
        dueAtHours = entry.totalTimeAtEntry + entry.recurrenceInterval;
      }
    } else if (type === 'annual' && entry.entryDate) {
      dueDate = addCalendarMonths(entry.entryDate, 12);
    } else if (type === '100_hour' && entry.totalTimeAtEntry !== undefined) {
      dueAtHours = entry.totalTimeAtEntry + 100;
    } else if (type === 'condition' && entry.entryDate) {
      dueDate = addCalendarMonths(entry.entryDate, 12);
    }

    const partial: Omit<DueItem, 'status'> = {
      id: `insp-${type}`,
      title: label,
      category: 'Inspection',
      lastPerformedDate: entry.entryDate,
      lastPerformedTT: entry.totalTimeAtEntry,
      dueDate,
      dueAtHours,
      hoursRemaining: dueAtHours !== undefined ? dueAtHours - currentTT : undefined,
      daysRemaining: dueDate ? daysBetween(today, dueDate) : undefined,
      sourceEntryId: entry._id,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 2. Regulatory checks: deduplicate by regulatoryBasis ────────────────
  const latestByRegBasis = new Map<string, LogbookEntry>();
  for (const e of entries) {
    if (e.entryType === 'regulatory_check' && e.regulatoryBasis) {
      const existing = latestByRegBasis.get(e.regulatoryBasis);
      if (!existing || (e.entryDate ?? '') > (existing.entryDate ?? '')) {
        latestByRegBasis.set(e.regulatoryBasis, e);
      }
    }
  }
  for (const [basis, entry] of latestByRegBasis) {
    let dueDate: string | undefined;
    let dueAtHours: number | undefined;
    if (entry.nextDueDate) {
      dueDate = entry.nextDueDate;
    } else if (entry.recurrenceInterval && entry.recurrenceUnit && entry.entryDate) {
      if (entry.recurrenceUnit === 'calendar_months') {
        dueDate = addCalendarMonths(entry.entryDate, entry.recurrenceInterval);
      } else if (entry.recurrenceUnit === 'hours' && entry.totalTimeAtEntry !== undefined) {
        dueAtHours = entry.totalTimeAtEntry + entry.recurrenceInterval;
      }
    } else if (entry.entryDate) {
      // Default FAA recurrence intervals for known checks
      const defaultMonths: Record<string, number> = { '91.413': 24, '91.411': 24, '91.207': 12 };
      const months = defaultMonths[basis];
      if (months) dueDate = addCalendarMonths(entry.entryDate, months);
    }

    const partial: Omit<DueItem, 'status'> = {
      id: `regcheck-${basis}`,
      title: `${basis} Check`,
      category: 'Regulatory Check',
      referenceNumber: `14 CFR §${basis}`,
      lastPerformedDate: entry.entryDate,
      lastPerformedTT: entry.totalTimeAtEntry,
      dueDate,
      dueAtHours,
      hoursRemaining: dueAtHours !== undefined ? dueAtHours - currentTT : undefined,
      daysRemaining: dueDate ? daysBetween(today, dueDate) : undefined,
      sourceEntryId: entry._id,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 3. Recurring AD compliance: deduplicate by adNumber ─────────────────
  const latestAdEntry = new Map<string, { entry: LogbookEntry; detail: typeof entries[0]['adComplianceDetails'] extends (infer T)[] | undefined ? T : never }>();
  for (const e of entries) {
    for (const ad of e.adComplianceDetails ?? []) {
      if (ad.complianceMethod !== 'recurring') continue;
      const existing = latestAdEntry.get(ad.adNumber);
      if (!existing || (e.entryDate ?? '') > (existing.entry.entryDate ?? '')) {
        latestAdEntry.set(ad.adNumber, { entry: e, detail: ad });
      }
    }
  }
  for (const [adNumber, { entry, detail }] of latestAdEntry) {
    let dueDate: string | undefined;
    let dueAtHours: number | undefined;
    if (detail.nextDueHint) {
      // nextDueHint is free text — use as notes; also try to parse as a date
      const parsedDate = detail.nextDueHint.match(/\d{4}-\d{2}-\d{2}/)?.[0];
      if (parsedDate) dueDate = parsedDate;
    }
    if (!dueDate && !dueAtHours && detail.recurrenceInterval && detail.recurrenceUnit) {
      if (detail.recurrenceUnit === 'calendar_months' && entry.entryDate) {
        dueDate = addCalendarMonths(entry.entryDate, detail.recurrenceInterval);
      } else if (detail.recurrenceUnit === 'hours' && entry.totalTimeAtEntry !== undefined) {
        dueAtHours = entry.totalTimeAtEntry + detail.recurrenceInterval;
      }
    }

    const partial: Omit<DueItem, 'status'> = {
      id: `ad-${adNumber}`,
      title: `AD ${adNumber}`,
      category: 'AD',
      referenceNumber: adNumber,
      lastPerformedDate: entry.entryDate,
      lastPerformedTT: entry.totalTimeAtEntry,
      dueDate,
      dueAtHours,
      hoursRemaining: dueAtHours !== undefined ? dueAtHours - currentTT : undefined,
      daysRemaining: dueDate ? daysBetween(today, dueDate) : undefined,
      sourceEntryId: entry._id,
      notes: detail.nextDueHint,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 4. Recurring SB compliance: deduplicate by sbNumber ─────────────────
  const latestSbEntry = new Map<string, { entry: LogbookEntry; detail: typeof entries[0]['sbComplianceDetails'] extends (infer T)[] | undefined ? T : never }>();
  for (const e of entries) {
    for (const sb of e.sbComplianceDetails ?? []) {
      if (!sb.recurrenceInterval) continue;
      const existing = latestSbEntry.get(sb.sbNumber);
      if (!existing || (e.entryDate ?? '') > (existing.entry.entryDate ?? '')) {
        latestSbEntry.set(sb.sbNumber, { entry: e, detail: sb });
      }
    }
  }
  for (const [sbNumber, { entry, detail }] of latestSbEntry) {
    let dueDate: string | undefined;
    let dueAtHours: number | undefined;
    if (detail.recurrenceInterval && detail.recurrenceUnit) {
      if (detail.recurrenceUnit === 'calendar_months' && entry.entryDate) {
        dueDate = addCalendarMonths(entry.entryDate, detail.recurrenceInterval);
      } else if (detail.recurrenceUnit === 'hours' && entry.totalTimeAtEntry !== undefined) {
        dueAtHours = entry.totalTimeAtEntry + detail.recurrenceInterval;
      }
    }

    const partial: Omit<DueItem, 'status'> = {
      id: `sb-${sbNumber}`,
      title: `SB ${sbNumber}`,
      category: 'SB',
      referenceNumber: sbNumber,
      lastPerformedDate: entry.entryDate,
      lastPerformedTT: entry.totalTimeAtEntry,
      dueDate,
      dueAtHours,
      hoursRemaining: dueAtHours !== undefined ? dueAtHours - currentTT : undefined,
      daysRemaining: dueDate ? daysBetween(today, dueDate) : undefined,
      sourceEntryId: entry._id,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 5. Top-level nextDueDate on entries (not already captured above) ─────
  for (const e of entries) {
    if (!e.nextDueDate) continue;
    if (e.inspectionType || e.entryType === 'regulatory_check') continue; // already handled
    if ((e.adComplianceDetails?.length ?? 0) > 0 || (e.sbComplianceDetails?.length ?? 0) > 0) continue;

    const partial: Omit<DueItem, 'status'> = {
      id: `entry-due-${e._id}`,
      title: e.workPerformed?.slice(0, 60) ?? getLogbookEntryTypeLabel(e.entryType),
      category: e.entryType === 'ad_compliance' ? 'AD' : e.entryType === 'sb_compliance' ? 'SB' : 'Other',
      lastPerformedDate: e.entryDate,
      lastPerformedTT: e.totalTimeAtEntry,
      dueDate: e.nextDueDate,
      daysRemaining: daysBetween(today, e.nextDueDate),
      sourceEntryId: e._id,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  // ── 6. Life-limited components ───────────────────────────────────────────
  for (const comp of components) {
    if (!comp.isLifeLimited || !comp.lifeLimit) continue;
    if (comp.lifeLimitUnit !== 'hours') {
      // Non-hour life limits — show as unknown (manual check)
      items.push({
        id: `comp-${comp._id}`,
        title: comp.description,
        category: 'Component Life',
        referenceNumber: comp.partNumber,
        lastPerformedDate: comp.installDate,
        dueAtHours: undefined,
        status: 'unknown',
        sourceComponentId: comp._id,
        notes: `Life limit: ${comp.lifeLimit} ${comp.lifeLimitUnit ?? 'units'} — manual check required`,
      });
      continue;
    }
    const tsnAtInstall = comp.tsnAtInstall ?? 0;
    const timeAtInstall = comp.aircraftTimeAtInstall ?? 0;
    const usedSinceInstall = Math.max(0, currentTT - timeAtInstall);
    const currentTSN = tsnAtInstall + usedSinceInstall;
    const hoursRemaining = comp.lifeLimit - currentTSN;
    const dueAtHours = currentTT + hoursRemaining;

    const partial: Omit<DueItem, 'status'> = {
      id: `comp-${comp._id}`,
      title: comp.description,
      category: 'Component Life',
      referenceNumber: `P/N ${comp.partNumber}${comp.serialNumber ? ` S/N ${comp.serialNumber}` : ''}`,
      lastPerformedDate: comp.installDate,
      lastPerformedTT: comp.aircraftTimeAtInstall,
      dueAtHours,
      hoursRemaining,
      sourceComponentId: comp._id,
      notes: `Life limit: ${comp.lifeLimit} hrs · Current TSN: ${currentTSN.toFixed(1)} hrs`,
    };
    items.push({ ...partial, status: computeDueStatus(partial, today, currentTT) });
  }

  return items;
}

const DUE_STATUS_ORDER: DueStatus[] = ['overdue', 'due_soon', 'ok', 'unknown'];
const CATEGORY_ORDER: DueCategory[] = ['Inspection', 'AD', 'SB', 'Regulatory Check', 'Component Life', 'Other'];

function DueListTab({
  projectId,
  aircraftId,
  currentTT,
  aircraft,
}: {
  projectId: string;
  aircraftId: string;
  currentTT: number;
  aircraft?: AircraftAsset;
}) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const components = (useAircraftComponents(projectId, aircraftId, 'installed') ?? []) as AircraftComponent[];

  const [statusFilter, setStatusFilter] = useState<DueStatus | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<DueCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'status' | 'category' | 'due_date'>('status');

  const allItems = useMemo(() => buildDueItems(entries, components, currentTT), [entries, components, currentTT]);

  const filtered = useMemo(() => {
    let result = allItems;
    if (statusFilter !== 'all') result = result.filter((i) => i.status === statusFilter);
    if (categoryFilter !== 'all') result = result.filter((i) => i.category === categoryFilter);
    return result;
  }, [allItems, statusFilter, categoryFilter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (sortBy === 'status') {
        const si = DUE_STATUS_ORDER.indexOf(a.status) - DUE_STATUS_ORDER.indexOf(b.status);
        if (si !== 0) return si;
      }
      if (sortBy === 'category') {
        const ci = CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
        if (ci !== 0) return ci;
      }
      // Secondary: sort by due soonest (hours then date)
      const aHrs = a.hoursRemaining ?? a.daysRemaining ?? Infinity;
      const bHrs = b.hoursRemaining ?? b.daysRemaining ?? Infinity;
      return aHrs - bHrs;
    });
  }, [filtered, sortBy]);

  const counts = useMemo(() => ({
    overdue: allItems.filter((i) => i.status === 'overdue').length,
    due_soon: allItems.filter((i) => i.status === 'due_soon').length,
    ok: allItems.filter((i) => i.status === 'ok').length,
    unknown: allItems.filter((i) => i.status === 'unknown').length,
  }), [allItems]);

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-stone-500">
        <FiList className="text-3xl mx-auto mb-2" />
        <p className="text-sm">No logbook entries yet. Parse logbook documents to build the due list.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-stone-800">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-3">
        {([
          ['overdue', 'Overdue', 'bg-red-100 border-red-300 text-red-800'],
          ['due_soon', 'Due Soon', 'bg-amber-100 border-amber-300 text-amber-800'],
          ['ok', 'OK', 'bg-green-100 border-green-300 text-green-700'],
          ['unknown', 'Manual Check', 'bg-stone-100 border-stone-300 text-stone-600'],
        ] as const).map(([status, label, cls]) => (
          <button
            key={status}
            type="button"
            onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${cls} ${statusFilter === status ? 'ring-2 ring-offset-1 ring-stone-400' : 'opacity-80 hover:opacity-100'}`}
          >
            {label}
            <span className="ml-1 font-bold">{counts[status]}</span>
          </button>
        ))}
      </div>

      {/* Filters + sort */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1">
          <FiFilter className="ml-1 text-stone-500" />
          <span className="px-1 text-stone-500">Category</span>
          {(['all', ...CATEGORY_ORDER] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-md px-2.5 py-1 transition-colors ${categoryFilter === cat ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'}`}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-amber-300 bg-[#fff8eb] p-1">
          <span className="px-2 text-stone-500">Sort</span>
          {([['status', 'By urgency'], ['category', 'By category'], ['due_date', 'By due date']] as const).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setSortBy(val)}
              className={`rounded-md px-2.5 py-1 transition-colors ${sortBy === val ? 'bg-sky-700 text-white' : 'text-stone-600 hover:bg-amber-100'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-stone-500">{sorted.length} item{sorted.length !== 1 ? 's' : ''}{statusFilter !== 'all' || categoryFilter !== 'all' ? ' (filtered)' : ''}</span>
      </div>

      {/* Due items */}
      {sorted.length === 0 ? (
        <div className="text-center py-8 text-stone-500 text-sm">No items match the selected filters.</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((item) => (
            <DueItemCard key={item.id} item={item} currentTT={currentTT} />
          ))}
        </div>
      )}

      {/* Horizon summary */}
      <div className="rounded-lg border border-amber-300/70 bg-[#fffdf7] p-4 text-xs text-stone-600 space-y-1">
        <div className="font-semibold text-stone-700 mb-2 flex items-center gap-1.5"><FiCalendar /> Maintenance Horizon</div>
        {[30, 90, 180, 365].map((days) => {
          const n = allItems.filter((i) => {
            if (i.status === 'overdue') return true;
            if (i.daysRemaining !== undefined && i.daysRemaining <= days) return true;
            if (i.hoursRemaining !== undefined && currentTT > 0) {
              // rough: assume 1 hr/day utilization as a proxy
              return i.hoursRemaining <= days;
            }
            return false;
          }).length;
          return (
            <div key={days} className="flex items-center justify-between">
              <span>Due within {days} days</span>
              <span className={`font-semibold tabular-nums ${n > 0 ? 'text-amber-700' : 'text-green-700'}`}>{n} item{n !== 1 ? 's' : ''}</span>
            </div>
          );
        })}
        {aircraft?.baselineTotalTime !== undefined && (
          <div className="pt-1 border-t border-amber-200 flex items-center justify-between">
            <span>Current aircraft TT</span>
            <span className="font-semibold tabular-nums">{currentTT.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} hrs</span>
          </div>
        )}
      </div>
    </div>
  );
}

function DueItemCard({ item, currentTT }: { item: DueItem; currentTT: number }) {
  const statusStyles: Record<DueStatus, string> = {
    overdue:  'border-red-400 bg-red-50',
    due_soon: 'border-amber-400 bg-amber-50',
    ok:       'border-green-300 bg-green-50/40',
    unknown:  'border-stone-300 bg-stone-50',
  };
  const statusBadge: Record<DueStatus, { label: string; cls: string }> = {
    overdue:  { label: 'OVERDUE',   cls: 'bg-red-200 text-red-900 border border-red-400' },
    due_soon: { label: 'DUE SOON',  cls: 'bg-amber-200 text-amber-900 border border-amber-400' },
    ok:       { label: 'OK',        cls: 'bg-green-200 text-green-900 border border-green-300' },
    unknown:  { label: 'CHECK',     cls: 'bg-stone-200 text-stone-700 border border-stone-300' },
  };
  const categoryColors: Record<DueCategory, string> = {
    'AD': 'bg-red-100 text-red-800 border-red-200',
    'SB': 'bg-blue-100 text-blue-800 border-blue-200',
    'Inspection': 'bg-sky-100 text-sky-800 border-sky-200',
    'Regulatory Check': 'bg-purple-100 text-purple-800 border-purple-200',
    'Component Life': 'bg-orange-100 text-orange-800 border-orange-200',
    'Other': 'bg-stone-100 text-stone-700 border-stone-200',
  };

  const badge = statusBadge[item.status];

  return (
    <div className={`rounded-lg border px-4 py-3 flex flex-wrap items-start gap-3 ${statusStyles[item.status]}`}>
      {/* Left: title + badges */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${badge.cls}`}>{badge.label}</span>
          <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded border ${categoryColors[item.category]}`}>{item.category}</span>
          {item.referenceNumber && (
            <span className="text-[10px] font-mono text-stone-600 bg-stone-100 border border-stone-200 rounded px-1.5 py-0.5">{item.referenceNumber}</span>
          )}
        </div>
        <div className="text-sm font-semibold text-stone-900 font-['Source_Serif_4',serif]">{item.title}</div>
        {item.notes && <div className="text-xs text-stone-500 mt-0.5 italic">{item.notes}</div>}
        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-stone-500">
          {item.lastPerformedDate && (
            <span>Last: <span className="font-medium text-stone-700">{item.lastPerformedDate}</span></span>
          )}
          {item.lastPerformedTT !== undefined && (
            <span>At: <span className="font-medium text-stone-700 tabular-nums">{item.lastPerformedTT.toFixed(1)} hrs</span></span>
          )}
        </div>
      </div>

      {/* Right: due date / hours */}
      <div className="text-right flex-shrink-0 space-y-1">
        {item.dueDate && (
          <div>
            <div className="text-[10px] text-stone-500 uppercase tracking-wide">Due by</div>
            <div className="text-sm font-bold tabular-nums text-stone-800">{item.dueDate}</div>
            {item.daysRemaining !== undefined && (
              <div className={`text-xs font-medium tabular-nums ${item.daysRemaining < 0 ? 'text-red-700' : item.daysRemaining <= 30 ? 'text-amber-700' : 'text-green-700'}`}>
                {item.daysRemaining < 0 ? `${Math.abs(item.daysRemaining)}d overdue` : `${item.daysRemaining}d remaining`}
              </div>
            )}
          </div>
        )}
        {item.dueAtHours !== undefined && (
          <div>
            <div className="text-[10px] text-stone-500 uppercase tracking-wide">Due at</div>
            <div className="text-sm font-bold tabular-nums text-stone-800">{item.dueAtHours.toFixed(1)} hrs</div>
            {item.hoursRemaining !== undefined && (
              <div className={`text-xs font-medium tabular-nums ${item.hoursRemaining < 0 ? 'text-red-700' : item.hoursRemaining <= 50 ? 'text-amber-700' : 'text-green-700'}`}>
                {item.hoursRemaining < 0 ? `${Math.abs(item.hoursRemaining).toFixed(1)} hrs overdue` : `${item.hoursRemaining.toFixed(1)} hrs remaining`}
              </div>
            )}
          </div>
        )}
        {item.status === 'unknown' && (
          <div className="text-xs text-stone-400 italic">Manual check required</div>
        )}
      </div>
    </div>
  );
}
