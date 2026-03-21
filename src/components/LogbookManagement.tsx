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
  useAddLogbookEntries,
} from '../hooks/useConvexData';
import { parseLogbookText } from '../services/logbookEntryParser';
import type { LogbookParseDiagnostics } from '../services/logbookEntryParser';
import { DocumentExtractor } from '../services/documentExtractor';
import { runComplianceChecks, detectTimeDiscrepancies } from '../services/complianceEngine';
import { findingToIssueArgs, buildScheduleUpdates } from '../services/logbookIntegration';
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
} from 'react-icons/fi';
import { toast } from 'sonner';
import { fetchFaaRegistryViaApi, parseTailForFaaQuery } from '../services/faaRegistryLookup';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type Tab = 'library' | 'search' | 'configuration' | 'findings' | 'timeline';
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

type TTLResult =
  | { manualCheck: true; unit: string; lifeLimit: number }
  | { manualCheck: false; currentTSN: number; remaining: number; remainingPct: number };

function calcTTL(component: AircraftComponent, currentAircraftTime: number | undefined): TTLResult | null {
  if (!component.isLifeLimited || !component.lifeLimit) return null;
  if (component.lifeLimitUnit !== 'hours') {
    return { manualCheck: true, unit: component.lifeLimitUnit ?? 'units', lifeLimit: component.lifeLimit };
  }
  const timeAtInstall = component.aircraftTimeAtInstall ?? 0;
  const tsnAtInstall = component.tsnAtInstall ?? 0;
  const usedSinceInstall = Math.max(0, (currentAircraftTime ?? 0) - timeAtInstall);
  const currentTSN = tsnAtInstall + usedSinceInstall;
  const remaining = component.lifeLimit - currentTSN;
  const remainingPct = remaining / component.lifeLimit;
  return { manualCheck: false, currentTSN, remaining, remainingPct };
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
            {tab === 'search' && <LogbookSearchTab projectId={activeProjectId} aircraftId={effectiveAircraftId} />}
            {tab === 'configuration' && <ConfigurationTab projectId={activeProjectId} aircraftId={effectiveAircraftId} aircraft={selectedAircraft!} currentTT={currentTT} />}
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
  const model = useDefaultClaudeModel();
  const addDocument = useAddDocument();
  const updateDocumentExtractedText = useUpdateDocumentExtractedText();
  const removeDocument = useRemoveDocument();
  const generateUploadUrl = useGenerateUploadUrl();
  const addDraftEntries = useAddLogbookDraftEntries();
  const removeDraftEntriesBySource = useRemoveLogbookDraftEntriesBySourceDocument();
  const importSelectedDraftEntries = useImportSelectedLogbookDraftEntries();
  const addLogbookEntries = useAddLogbookEntries();

  const [uploading, setUploading] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [parseDiagnosticsByDocument, setParseDiagnosticsByDocument] = useState<Record<string, LogbookParseDiagnostics | undefined>>({});
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set());
  const [docSort, setDocSort] = useState<'date' | 'name'>('date');

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
            onClick={() => setShowManualEntry(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-stone-700 text-white border border-stone-900/20 rounded-lg hover:bg-stone-800"
          >
            <FiPlus />
            Add Entry Manually
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
              const draftCount = draftsByDocument.get(doc._id)?.length ?? 0;
              return (
                <div key={doc._id} className="flex items-center gap-3 rounded-lg border border-amber-200 px-3 py-2">
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
                    <div className="text-[11px] text-stone-500">
                      {draftCount} staged candidate entr{draftCount === 1 ? 'y' : 'ies'}
                    </div>
                  </div>
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
            <div className="flex gap-2 text-[11px]">
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
          <div className="space-y-2 max-h-[500px] overflow-auto">
            {groupedDraftsByDocument.map(({ doc, drafts }) => {
              const allSelected = drafts.every((d) => selectedDraftIds.has(d._id));
              const someSelected = drafts.some((d) => selectedDraftIds.has(d._id));
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
                          if (e.target.checked) drafts.forEach((d) => next.add(d._id));
                          else drafts.forEach((d) => next.delete(d._id));
                          return next;
                        });
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded border-amber-300 flex-shrink-0"
                    />
                    <FiFile className="text-stone-500 flex-shrink-0 text-[11px]" />
                    <span className="text-xs font-medium text-stone-800 truncate flex-1 min-w-0">{doc.name}</span>
                    <span className="text-[11px] text-stone-500 flex-shrink-0 ml-auto">
                      {drafts.filter((d) => selectedDraftIds.has(d._id)).length}/{drafts.length} selected · oldest→newest
                    </span>
                  </summary>
                  <div className="divide-y divide-amber-100">
                    {drafts.map((entry) => {
                      const selected = selectedDraftIds.has(entry._id);
                      return (
                        <label key={entry._id} className="flex items-start gap-3 px-3 py-2 hover:bg-amber-50/50 cursor-pointer">
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
                              {entry.confidence !== undefined && entry.confidence < 0.7 && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 text-amber-800 border border-amber-300" title="Low parse confidence — review carefully">
                                  low confidence
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone-600 mt-1 line-clamp-2">
                              {entry.workPerformed ?? entry.rawText.slice(0, 160)}
                            </p>
                          </div>
                        </label>
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
          onAdd={addLogbookEntries}
          onClose={() => setShowManualEntry(false)}
        />
      )}
    </div>
  );
}

/* ─── Logbook Search Tab ─────────────────────────────────────────────── */

function LogbookSearchTab({ projectId, aircraftId }: { projectId: string; aircraftId: string }) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const findings = (useComplianceFindings(projectId, aircraftId) ?? []) as ComplianceFinding[];
  const updateEntry = useUpdateLogbookEntry();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [arrangeBy, setArrangeBy] = useState<ArrangeBy>('date_desc');
  const [locationFilter, setLocationFilter] = useState<EntryLocation>('full');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = filterEntriesByLocation(entries, locationFilter);
    if (typeFilter) result = result.filter((e) => e.entryType === typeFilter);
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.rawText.toLowerCase().includes(lower) ||
          (e.workPerformed && e.workPerformed.toLowerCase().includes(lower)) ||
          (e.signerName && e.signerName.toLowerCase().includes(lower)) ||
          (e.adReferences && e.adReferences.some((r) => r.toLowerCase().includes(lower))) ||
          (e.sbReferences && e.sbReferences.some((r) => r.toLowerCase().includes(lower))) ||
          (e.adSbReferences && e.adSbReferences.some((r) => r.toLowerCase().includes(lower)))
      );
    }
    return result;
  }, [entries, locationFilter, search, typeFilter]);

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

  return (
    <div className="space-y-4 text-stone-800">
      {/* Search + Parse Controls */}
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
        <div className="relative flex-1 min-w-[240px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries (text, signer, AD/SB...)"
            className="w-full pl-9 pr-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-sky-600"
          />
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
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-700 focus:outline-none focus:border-sky-600"
        >
          <option value="">All Types</option>
          {LOGBOOK_ENTRY_TYPE_ORDER.map((entryType) => (
            <option key={entryType} value={entryType}>
              {getLogbookEntryTypeLabel(entryType)}
            </option>
          ))}
        </select>

      </div>

      {/* Entry Count */}
      <div className="text-xs text-stone-600 font-medium">
        {(arrangeBy === 'type_sections' ? groupedEntries.reduce((sum, section) => sum + section.entries.length, 0) : arrangedEntries.length)}{' '}
        {filtered.length === 1 ? 'entry' : 'entries'}
        {search || typeFilter ? ' (filtered)' : ''}
      </div>

      {/* Entries List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-stone-500">
          <FiSearch className="text-3xl mx-auto mb-2" />
          <p className="text-sm">{entries.length === 0 ? 'No entries yet. Use the Logbooks Library tab to upload, parse, and import entries.' : 'No entries match your search.'}</p>
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
}: {
  entry: LogbookEntry;
  entryFindings?: ComplianceFinding[];
  expanded: boolean;
  onToggle: () => void;
  onUpdate?: (args: any) => Promise<unknown>;
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
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-amber-50/50 transition-colors"
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
            {entry.confidence !== undefined && (
              <span
                className={`text-[10px] font-mono ${confidenceColor}`}
                title="Parser confidence (how certain extraction/parsing was), not a compliance score."
              >
                Parse confidence {Math.round(entry.confidence * 100)}%
              </span>
            )}
          </div>
          <p className="text-xs text-stone-600 truncate mt-0.5 font-['Source_Serif_4',serif]">{entry.workPerformed ?? entry.rawText.slice(0, 120)}</p>
        </div>
        <div className="text-right flex-shrink-0 hidden sm:block">
          {entry.totalTimeAtEntry !== undefined && <div className="text-xs text-stone-600 tabular-nums">TT: {entry.totalTimeAtEntry}</div>}
          {entry.signerName && <div className="text-xs text-stone-500">{entry.signerName}</div>}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-amber-200 pt-3 space-y-2 bg-[#f9f3e7]">
          <DetailRow label="Work Performed" value={entry.workPerformed} />
          <DetailRow label="Signer" value={[entry.signerName, entry.signerCertType, entry.signerCertNumber].filter(Boolean).join(' — ')} />
          <DetailRow label="RTS Statement" value={entry.returnToServiceStatement} />
          <DetailRow label="ATA Chapter" value={entry.ataChapter} />
          <DetailRow label="AD References" value={entry.adReferences?.join(', ')} />
          <DetailRow label="SB References" value={entry.sbReferences?.join(', ')} />
          <DetailRow label="All AD/SB References" value={getAllAdSbReferences(entry).join(', ')} />
          <DetailRow label="Total Time" value={entry.totalTimeAtEntry?.toString()} />
          <DetailRow label="Cycles" value={entry.totalCyclesAtEntry?.toString()} />
          <DetailRow label="Landings" value={entry.totalLandingsAtEntry?.toString()} />
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

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-xs">
      <span className="text-stone-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-stone-700">{value}</span>
    </div>
  );
}

/* ─── Configuration Tab ──────────────────────────────────────────────── */

function ConfigurationTab({ projectId, aircraftId, aircraft, currentTT }: { projectId: string; aircraftId: string; aircraft: AircraftAsset; currentTT?: number }) {
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

  return (
    <div className="space-y-6 text-stone-800">
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
                        {ttl && !ttl.manualCheck ? ttl.currentTSN.toFixed(1) : '—'}
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
  onAdd,
  onClose,
}: {
  projectId: string;
  aircraftId: string;
  onAdd: (args: any) => Promise<any>;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ManualEntryForm>(EMPTY_MANUAL_FORM);
  const [saving, setSaving] = useState(false);

  const set =
    (field: keyof ManualEntryForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

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
              <label className={labelCls}>Entry Type</label>
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
            <textarea
              className={`${inputCls} resize-y min-h-[80px]`}
              value={form.workPerformed}
              onChange={set('workPerformed')}
              placeholder="Describe the maintenance work performed…"
              required
            />
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
              <label className={labelCls}>ATA Chapter</label>
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

function TimelineTab({ projectId, aircraftId }: { projectId: string; aircraftId: string; }) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const [arrangeBy, setArrangeBy] = useState<ArrangeBy>('date_asc');
  const [locationFilter, setLocationFilter] = useState<EntryLocation>('full');
  const [gapThreshold, setGapThreshold] = useState(90);

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

      rows.push(
        <div
          key={entry._id}
          className={`grid grid-cols-[80px_1fr_90px_70px_70px] gap-2 items-start px-3 py-2 hover:bg-amber-50/60 rounded text-xs ${
            continuityWarning ? 'bg-red-50/60' : ''
          }`}
        >
          <span className="text-stone-700 font-mono">{entry.entryDate}</span>
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
      {chartData.length >= 2 && (
        <div className="rounded-lg border border-amber-300/80 bg-[#fffdf7] px-4 pt-3 pb-2 shadow-sm">
          <p className="text-[11px] font-medium text-stone-500 mb-1 uppercase tracking-wide">Total Time Progression</p>
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
      <div className="grid grid-cols-[80px_1fr_90px_70px_70px] gap-2 text-[10px] text-stone-600 font-semibold uppercase px-3 pb-2 border-b border-amber-300">
        <span>Date</span>
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
