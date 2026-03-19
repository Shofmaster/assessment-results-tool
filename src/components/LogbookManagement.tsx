import { useState, useMemo, useCallback } from 'react';
import { useAppStore } from '../store/appStore';
import {
  useAircraftAssets,
  useCreateAircraftAsset,
  useUpdateAircraftAsset,
  useRemoveAircraftAsset,
  useLogbookEntries,
  useAddLogbookEntries,
  useUpdateLogbookEntry,
  useAircraftComponents,
  useAddAircraftComponent,
  useUpdateAircraftComponent,
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
} from '../hooks/useConvexData';
import { parseLogbookText } from '../services/logbookEntryParser';
import { runComplianceChecks, detectTimeDiscrepancies } from '../services/complianceEngine';
import { findingToIssueArgs, buildScheduleUpdates } from '../services/logbookIntegration';
import { ALL_RULE_PACKS, RULE_PACK_LABELS } from '../data/regulatoryRulePacks';
import type { AircraftAsset, LogbookEntry, AircraftComponent, ComplianceFinding, ComplianceRule } from '../types/logbook';
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
} from 'react-icons/fi';
import { toast } from 'sonner';

type Tab = 'search' | 'configuration' | 'findings' | 'timeline';

export default function LogbookManagement() {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const [tab, setTab] = useState<Tab>('search');
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | undefined>(undefined);
  const [showAddAircraft, setShowAddAircraft] = useState(false);

  const aircraft = (useAircraftAssets(activeProjectId ?? undefined) ?? []) as AircraftAsset[];
  const createAircraft = useCreateAircraftAsset();

  const selectedAircraft = aircraft.find((a) => a._id === selectedAircraftId) ?? aircraft[0];
  const effectiveAircraftId = selectedAircraft?._id;

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
    { key: 'search', label: 'Logbook Search', Icon: FiSearch },
    { key: 'configuration', label: 'Aircraft Config', Icon: FiLayers },
    { key: 'findings', label: 'Compliance', Icon: FiAlertTriangle },
    { key: 'timeline', label: 'Timeline', Icon: FiClock },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Logbook Management</h1>
            <p className="text-sm text-white/60 mt-1">Aircraft maintenance records, configuration tracking, and compliance analysis</p>
          </div>
        </div>

        {/* Aircraft Selector + Tabs */}
        <div className="flex flex-wrap items-center gap-4">
          <AircraftSelector
            aircraft={aircraft}
            selected={effectiveAircraftId}
            onSelect={setSelectedAircraftId}
            onAdd={() => setShowAddAircraft(true)}
          />
          <div className="flex gap-1 bg-white/[0.04] rounded-lg p-1">
            {tabs.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium rounded-md transition-all ${
                  tab === key
                    ? 'bg-sky/20 text-white border border-sky-light/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
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
      <div className="flex-1 min-h-0 overflow-auto p-6">
        {!effectiveAircraftId ? (
          <EmptyAircraftState onAdd={() => setShowAddAircraft(true)} />
        ) : (
          <>
            {tab === 'search' && <LogbookSearchTab projectId={activeProjectId} aircraftId={effectiveAircraftId} />}
            {tab === 'configuration' && <ConfigurationTab projectId={activeProjectId} aircraftId={effectiveAircraftId} aircraft={selectedAircraft!} />}
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
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/10 transition-colors min-w-[200px]"
      >
        <FiSettings className="text-sky-lighter/70 flex-shrink-0" />
        <span className="text-sm font-medium text-white/80 truncate">
          {current ? `${current.tailNumber} — ${current.make ?? ''} ${current.model ?? ''}`.trim() : 'Select Aircraft'}
        </span>
        <FiChevronDown className={`text-white/40 ml-auto transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-72 rounded-lg bg-navy-800/95 backdrop-blur-lg border border-white/[0.08] shadow-xl shadow-black/30 overflow-hidden">
          <div className="max-h-56 overflow-auto">
            {aircraft.map((a) => (
              <button
                key={a._id}
                type="button"
                onClick={() => { onSelect(a._id); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                  a._id === selected ? 'bg-sky/20 text-sky-lighter' : 'text-white/70 hover:bg-white/5 hover:text-white'
                }`}
              >
                <div className="font-medium">{a.tailNumber}</div>
                <div className="text-xs text-white/50">{[a.make, a.model, a.serial].filter(Boolean).join(' · ')}</div>
              </button>
            ))}
          </div>
          <div className="border-t border-white/10">
            <button
              type="button"
              onClick={() => { onAdd(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-sky-lighter hover:bg-white/5 transition-colors"
            >
              <FiPlus className="text-xs" /> Add Aircraft
            </button>
          </div>
        </div>
      )}
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
      <div className="bg-navy-800 border border-white/10 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Add Aircraft</h2>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white"><FiX /></button>
        </div>
        <div className="space-y-3">
          {([
            ['tailNumber', 'Tail Number *'],
            ['make', 'Make (e.g. Cessna)'],
            ['model', 'Model (e.g. 172S)'],
            ['serial', 'Serial Number'],
            ['operator', 'Operator'],
            ['year', 'Year'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs text-white/60 mb-1">{label}</label>
              <input
                type={key === 'year' ? 'number' : 'text'}
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-sky-light/50"
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-white/70 hover:text-white">Cancel</button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium bg-sky/20 text-sky-lighter border border-sky-light/30 rounded-lg hover:bg-sky/30 disabled:opacity-50"
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
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <FiArchive className="text-5xl text-white/20 mb-4" />
      <h3 className="text-lg font-semibold text-white/70 mb-2">No Aircraft Added</h3>
      <p className="text-sm text-white/50 mb-6 max-w-md">Add an aircraft to begin uploading logbook scans, tracking configuration, and running compliance checks.</p>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-sky/20 text-sky-lighter border border-sky-light/30 rounded-lg hover:bg-sky/30"
      >
        <FiPlus /> Add Aircraft
      </button>
    </div>
  );
}

/* ─── Logbook Search Tab ─────────────────────────────────────────────── */

function LogbookSearchTab({ projectId, aircraftId }: { projectId: string; aircraftId: string }) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const documents = (useDocuments(projectId, 'entity') ?? []) as any[];
  const addEntries = useAddLogbookEntries();
  const model = useDefaultClaudeModel();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState('');
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = entries;
    if (typeFilter) result = result.filter((e) => e.entryType === typeFilter);
    if (search) {
      const lower = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.rawText.toLowerCase().includes(lower) ||
          (e.workPerformed && e.workPerformed.toLowerCase().includes(lower)) ||
          (e.signerName && e.signerName.toLowerCase().includes(lower)) ||
          (e.adSbReferences && e.adSbReferences.some((r) => r.toLowerCase().includes(lower)))
      );
    }
    return result.sort((a, b) => (b.entryDate ?? '').localeCompare(a.entryDate ?? ''));
  }, [entries, search, typeFilter]);

  const handleParseDocument = async (doc: any) => {
    if (!doc.extractedText) {
      toast.error('Document has no extracted text. Upload and extract it first via Library.');
      return;
    }
    setParsing(true);
    setParseProgress('Parsing logbook entries...');
    try {
      const result = await parseLogbookText(doc.extractedText, {
        sourceDocumentId: doc._id,
        model,
        onProgress: (chunk, total) => setParseProgress(`Processing chunk ${chunk}/${total}...`),
      });
      if (result.entries.length === 0) {
        toast.info('No logbook entries found in this document.');
        return;
      }
      await addEntries({
        projectId: projectId as any,
        entries: result.entries.map((e) => ({
          aircraftId: aircraftId as any,
          sourceDocumentId: doc._id,
          sourcePage: e.sourcePage,
          rawText: e.rawText,
          entryDate: e.entryDate,
          workPerformed: e.workPerformed,
          ataChapter: e.ataChapter,
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
        })),
      });
      toast.success(`Parsed ${result.entries.length} entries from "${doc.name}"`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to parse logbook');
    } finally {
      setParsing(false);
      setParseProgress('');
    }
  };

  return (
    <div className="space-y-4">
      {/* Search + Parse Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search entries (text, signer, AD/SB...)"
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-sky-light/50"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/80 focus:outline-none"
        >
          <option value="">All Types</option>
          <option value="maintenance">Maintenance</option>
          <option value="inspection">Inspection</option>
          <option value="alteration">Alteration</option>
          <option value="preventive">Preventive</option>
          <option value="ad_compliance">AD Compliance</option>
          <option value="other">Other</option>
        </select>

        {/* Parse from document */}
        <div className="relative group">
          <button
            type="button"
            disabled={parsing || documents.length === 0}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-sky/10 text-sky-lighter border border-sky-light/20 rounded-lg hover:bg-sky/20 disabled:opacity-50"
          >
            <FiUpload /> {parsing ? parseProgress : 'Parse Logbook'}
          </button>
          {!parsing && documents.length > 0 && (
            <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-72 bg-navy-800/95 backdrop-blur-lg border border-white/[0.08] rounded-lg shadow-xl z-50 max-h-48 overflow-auto">
              {documents.map((doc: any) => (
                <button
                  key={doc._id}
                  type="button"
                  onClick={() => handleParseDocument(doc)}
                  className="w-full text-left px-4 py-2 text-sm text-white/70 hover:bg-white/5 hover:text-white truncate"
                >
                  {doc.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Entry Count */}
      <div className="text-xs text-white/50">
        {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}{search || typeFilter ? ' (filtered)' : ''}
      </div>

      {/* Entries List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          <FiSearch className="text-3xl mx-auto mb-2" />
          <p className="text-sm">{entries.length === 0 ? 'No entries yet. Parse a logbook document to get started.' : 'No entries match your search.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((entry) => (
            <LogbookEntryCard
              key={entry._id}
              entry={entry}
              expanded={expandedEntry === entry._id}
              onToggle={() => setExpandedEntry(expandedEntry === entry._id ? null : entry._id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function LogbookEntryCard({ entry, expanded, onToggle }: { entry: LogbookEntry; expanded: boolean; onToggle: () => void }) {
  const confidenceColor = (entry.confidence ?? 0) >= 0.8 ? 'text-green-400' : (entry.confidence ?? 0) >= 0.5 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors"
      >
        {expanded ? <FiChevronDown className="text-white/40 flex-shrink-0" /> : <FiChevronRight className="text-white/40 flex-shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-white">{entry.entryDate ?? 'No date'}</span>
            {entry.entryType && (
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-sky/10 text-sky-lighter border border-sky-light/20">
                {entry.entryType.replace('_', ' ')}
              </span>
            )}
            {entry.hasReturnToService && (
              <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-green-500/10 text-green-400 border border-green-400/20">RTS</span>
            )}
            {entry.confidence !== undefined && (
              <span className={`text-[10px] font-mono ${confidenceColor}`}>{Math.round(entry.confidence * 100)}%</span>
            )}
          </div>
          <p className="text-xs text-white/50 truncate mt-0.5">{entry.workPerformed ?? entry.rawText.slice(0, 120)}</p>
        </div>
        <div className="text-right flex-shrink-0 hidden sm:block">
          {entry.totalTimeAtEntry !== undefined && <div className="text-xs text-white/50">TT: {entry.totalTimeAtEntry}</div>}
          {entry.signerName && <div className="text-xs text-white/40">{entry.signerName}</div>}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 space-y-2">
          <DetailRow label="Work Performed" value={entry.workPerformed} />
          <DetailRow label="Signer" value={[entry.signerName, entry.signerCertType, entry.signerCertNumber].filter(Boolean).join(' — ')} />
          <DetailRow label="RTS Statement" value={entry.returnToServiceStatement} />
          <DetailRow label="ATA Chapter" value={entry.ataChapter} />
          <DetailRow label="AD/SB References" value={entry.adSbReferences?.join(', ')} />
          <DetailRow label="Total Time" value={entry.totalTimeAtEntry?.toString()} />
          <DetailRow label="Cycles" value={entry.totalCyclesAtEntry?.toString()} />
          <DetailRow label="Landings" value={entry.totalLandingsAtEntry?.toString()} />
          {entry.userVerified && <div className="flex items-center gap-1 text-xs text-green-400"><FiCheck /> User verified</div>}
          <details className="mt-2">
            <summary className="text-xs text-white/40 cursor-pointer">Raw OCR text</summary>
            <pre className="mt-1 text-xs text-white/50 whitespace-pre-wrap bg-white/[0.02] rounded p-2 max-h-48 overflow-auto">{entry.rawText}</pre>
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
      <span className="text-white/40 w-28 flex-shrink-0">{label}</span>
      <span className="text-white/80">{value}</span>
    </div>
  );
}

/* ─── Configuration Tab ──────────────────────────────────────────────── */

function ConfigurationTab({ projectId, aircraftId, aircraft }: { projectId: string; aircraftId: string; aircraft: AircraftAsset }) {
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
    <div className="space-y-6">
      {/* Aircraft Summary */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Aircraft Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
          <div><span className="text-white/40 block">Tail</span><span className="text-white font-medium">{aircraft.tailNumber}</span></div>
          <div><span className="text-white/40 block">Make/Model</span><span className="text-white">{[aircraft.make, aircraft.model].filter(Boolean).join(' ')}</span></div>
          <div><span className="text-white/40 block">Serial</span><span className="text-white">{aircraft.serial ?? '—'}</span></div>
          <div><span className="text-white/40 block">Baseline TT</span><span className="text-white">{aircraft.baselineTotalTime ?? '—'}</span></div>
        </div>
      </div>

      {/* Installed Components */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Installed Components ({components.length})</h3>
          <button
            type="button"
            onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1 text-xs text-sky-lighter hover:text-white transition-colors"
          >
            <FiPlus /> Add Component
          </button>
        </div>

        {showAdd && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4 mb-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {([['partNumber', 'Part Number *'], ['serialNumber', 'Serial Number'], ['description', 'Description *'], ['ataChapter', 'ATA Chapter'], ['position', 'Position']] as const).map(([key, label]) => (
                <div key={key} className={key === 'description' ? 'col-span-2' : ''}>
                  <input
                    type="text"
                    value={addForm[key]}
                    onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                    placeholder={label}
                    className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-sky-light/50"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAdd(false)} className="text-xs text-white/50 hover:text-white">Cancel</button>
              <button type="button" onClick={handleAdd} disabled={saving} className="px-3 py-1 text-xs bg-sky/20 text-sky-lighter border border-sky-light/30 rounded hover:bg-sky/30 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        )}

        {components.length === 0 ? (
          <p className="text-xs text-white/40 py-4 text-center">No components tracked yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/40 border-b border-white/[0.06]">
                  <th className="text-left py-2 px-2 font-medium">Part #</th>
                  <th className="text-left py-2 px-2 font-medium">Serial #</th>
                  <th className="text-left py-2 px-2 font-medium">Description</th>
                  <th className="text-left py-2 px-2 font-medium">ATA</th>
                  <th className="text-left py-2 px-2 font-medium">Position</th>
                  <th className="text-left py-2 px-2 font-medium">TSN Install</th>
                  <th className="text-left py-2 px-2 font-medium">Install Date</th>
                </tr>
              </thead>
              <tbody>
                {components.map((c) => (
                  <tr key={c._id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="py-2 px-2 text-white font-mono">{c.partNumber}</td>
                    <td className="py-2 px-2 text-white/70 font-mono">{c.serialNumber ?? '—'}</td>
                    <td className="py-2 px-2 text-white/70">{c.description}</td>
                    <td className="py-2 px-2 text-white/50">{c.ataChapter ?? '—'}</td>
                    <td className="py-2 px-2 text-white/50">{c.position ?? '—'}</td>
                    <td className="py-2 px-2 text-white/50">{c.tsnAtInstall ?? '—'}</td>
                    <td className="py-2 px-2 text-white/50">{c.installDate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Removed Components */}
      {removedComponents.length > 0 && (
        <details>
          <summary className="text-xs text-white/40 cursor-pointer mb-2">Removed Components ({removedComponents.length})</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-white/30 border-b border-white/[0.04]">
                  <th className="text-left py-1 px-2 font-medium">Part #</th>
                  <th className="text-left py-1 px-2 font-medium">Serial #</th>
                  <th className="text-left py-1 px-2 font-medium">Description</th>
                  <th className="text-left py-1 px-2 font-medium">Removed</th>
                </tr>
              </thead>
              <tbody>
                {removedComponents.map((c) => (
                  <tr key={c._id} className="border-b border-white/[0.04] text-white/40">
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

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRunChecks}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-sky/20 text-sky-lighter border border-sky-light/30 rounded-lg hover:bg-sky/30 disabled:opacity-50"
        >
          <FiPlay /> {running ? 'Running...' : 'Run Compliance Checks'}
        </button>
        <button
          type="button"
          onClick={handleSyncSchedule}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-2 text-sm text-white/70 border border-white/10 rounded-lg hover:bg-white/5 disabled:opacity-50"
        >
          <FiClock /> {syncing ? 'Syncing...' : 'Sync Schedule'}
        </button>
        {isAdmin && (
          <div className="relative group">
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-xs text-white/60 border border-white/10 rounded-lg hover:bg-white/5"
            >
              <FiTool /> Seed Rules
            </button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-1 w-72 bg-navy-800/95 backdrop-blur-lg border border-white/[0.08] rounded-lg shadow-xl z-50">
              {!loadedPacks.has('part43') && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const result = await seedRules();
                      toast.success(`Seeded ${result.seeded} Part 43/91 rules`);
                    } catch (err: any) { toast.error(err.message); }
                  }}
                  className="w-full text-left px-4 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white"
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
                  className="w-full text-left px-4 py-2 text-xs text-white/70 hover:bg-white/5 hover:text-white disabled:opacity-40 disabled:cursor-default"
                >
                  {RULE_PACK_LABELS[packId] ?? packId}
                  {loadedPacks.has(packId) && <span className="ml-2 text-green-400/70">(loaded)</span>}
                </button>
              ))}
            </div>
          </div>
        )}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="ml-auto px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white/80 focus:outline-none"
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
        {([['critical', 'bg-red-500/10 text-red-400 border-red-400/20'], ['major', 'bg-orange-500/10 text-orange-400 border-orange-400/20'], ['minor', 'bg-yellow-500/10 text-yellow-400 border-yellow-400/20']] as const).map(([sev, cls]) => (
          <div key={sev} className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${cls}`}>
            {severityCounts[sev]} {sev}
          </div>
        ))}
      </div>

      {/* Findings List */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-white/40">
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
    critical: 'border-l-red-500 bg-red-500/[0.03]',
    major: 'border-l-orange-500 bg-orange-500/[0.03]',
    minor: 'border-l-yellow-500 bg-yellow-500/[0.03]',
  };

  return (
    <div className={`border border-white/[0.06] border-l-2 ${severityColors[finding.severity] ?? ''} rounded-lg p-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded ${
              finding.severity === 'critical' ? 'bg-red-500/10 text-red-400' :
              finding.severity === 'major' ? 'bg-orange-500/10 text-orange-400' :
              'bg-yellow-500/10 text-yellow-400'
            }`}>{finding.severity}</span>
            <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-white/5 text-white/50">{finding.findingType.replace('_', ' ')}</span>
            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${
              finding.status === 'open' ? 'bg-sky/10 text-sky-lighter' :
              finding.status === 'resolved' ? 'bg-green-500/10 text-green-400' :
              finding.status === 'false_positive' ? 'bg-white/5 text-white/40' :
              'bg-yellow-500/10 text-yellow-400'
            }`}>{finding.status}</span>
          </div>
          <h4 className="text-sm font-medium text-white mb-1">{finding.title}</h4>
          <p className="text-xs text-white/60 mb-2">{finding.description}</p>
          <div className="text-[11px] text-sky-lighter/70 font-mono">{finding.citation}</div>
        </div>
        {finding.status === 'open' && (
          <div className="flex gap-1 flex-shrink-0">
            {!finding.convertedToIssueId && (
              <button
                type="button"
                onClick={() => onConvertToIssue(finding)}
                className="p-1.5 text-white/40 hover:text-sky-lighter hover:bg-sky/10 rounded transition-colors"
                title="Convert to CAR"
              >
                <FiAlertTriangle className="text-sm" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onUpdateStatus({ findingId: finding._id as any, status: 'acknowledged' })}
              className="p-1.5 text-white/40 hover:text-yellow-400 hover:bg-yellow-500/10 rounded transition-colors"
              title="Acknowledge"
            >
              <FiCheck className="text-sm" />
            </button>
            <button
              type="button"
              onClick={() => onUpdateStatus({ findingId: finding._id as any, status: 'false_positive' })}
              className="p-1.5 text-white/40 hover:text-white/60 hover:bg-white/5 rounded transition-colors"
              title="Mark false positive"
            >
              <FiX className="text-sm" />
            </button>
          </div>
        )}
      </div>
      {finding.evidenceSnippet && (
        <pre className="mt-2 text-[10px] text-white/40 bg-white/[0.02] rounded p-2 whitespace-pre-wrap">{finding.evidenceSnippet}</pre>
      )}
    </div>
  );
}

/* ─── Timeline Tab ───────────────────────────────────────────────────── */

function TimelineTab({ projectId, aircraftId }: { projectId: string; aircraftId: string }) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];

  const sorted = useMemo(
    () => [...entries].filter((e) => e.entryDate).sort((a, b) => a.entryDate!.localeCompare(b.entryDate!)),
    [entries]
  );

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 text-white/40">
        <FiClock className="text-3xl mx-auto mb-2" />
        <p className="text-sm">No dated entries to display. Parse logbook documents to build the timeline.</p>
      </div>
    );
  }

  let prevTime: number | undefined;

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[80px_1fr_80px_80px_80px] gap-2 text-[10px] text-white/40 font-semibold uppercase px-3 pb-2 border-b border-white/[0.06]">
        <span>Date</span>
        <span>Work Performed</span>
        <span className="text-right">TT</span>
        <span className="text-right">Cycles</span>
        <span className="text-right">Landings</span>
      </div>
      {sorted.map((entry) => {
        const timeDelta = prevTime !== undefined && entry.totalTimeAtEntry !== undefined
          ? entry.totalTimeAtEntry - prevTime
          : undefined;
        prevTime = entry.totalTimeAtEntry;

        return (
          <div key={entry._id} className="grid grid-cols-[80px_1fr_80px_80px_80px] gap-2 items-start px-3 py-2 hover:bg-white/[0.02] rounded text-xs">
            <span className="text-white/70 font-mono">{entry.entryDate}</span>
            <span className="text-white/80 truncate">{entry.workPerformed ?? entry.rawText.slice(0, 80)}</span>
            <span className="text-right text-white/60 font-mono">
              {entry.totalTimeAtEntry ?? '—'}
              {timeDelta !== undefined && timeDelta > 0 && (
                <span className="text-sky-lighter/60 ml-1">(+{timeDelta.toFixed(1)})</span>
              )}
            </span>
            <span className="text-right text-white/60 font-mono">{entry.totalCyclesAtEntry ?? '—'}</span>
            <span className="text-right text-white/60 font-mono">{entry.totalLandingsAtEntry ?? '—'}</span>
          </div>
        );
      })}
    </div>
  );
}
