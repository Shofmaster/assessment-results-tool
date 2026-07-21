import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  useLogbookEntries,
  useComplianceFindings,
  useUpdateLogbookEntry,
  useRemoveLogbookEntry,
  useDefaultClaudeModel,
  useDocumentChunksSearch,
} from '../hooks/useConvexData';
import { createClaudeMessage } from '../services/claudeProxy';
import { DEFAULT_CLAUDE_MODEL } from '../constants/claude';
import { LOGBOOK_SEARCH_TOP_K } from '../constants/search';
import {
  LOGBOOK_ENTRY_TYPE_ORDER,
  getLogbookEntryTypeLabel,
  getAllAdSbReferences,
  hasAdReference,
  hasSbReference,
  type LogbookEntry,
  type ComplianceFinding,
  type AircraftAsset,
} from '../types/logbook';
import { getLogbookBookVolumeLabel } from '../types/technicalPublication';
import {
  filterEntriesByLocation,
  compareEntryDate,
  groupEntriesByType,
  type ArrangeBy,
  type EntryLocation,
  nDaysAgo,
} from '../utils/logbookUtils';
import {
  FiSearch,
  FiX,
  FiChevronDown,
  FiChevronRight,
  FiEdit,
  FiTrash2,
  FiPlay,
  FiUpload,
  FiCheck,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useConfirmDialog } from './confirm/ConfirmDialogProvider';

/* ─── Search mode ─────────────────────────────────────────────────────── */

type SearchMode = 'all' | 'ad' | 'sb' | 'part' | 'cert' | 'ata';

const SEARCH_MODE_LABELS: Record<SearchMode, string> = {
  all: 'All Fields',
  ad: 'AD #',
  sb: 'SB #',
  part: 'Part / SN',
  cert: 'Cert #',
  ata: 'ATA',
};

function formatAiSearchError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/session token|missing or malformed authorization|sign in again/i.test(msg)) {
    return 'Your session expired — please refresh the page or sign in again.';
  }
  if (/503|CLERK_SECRET_KEY|server auth is not configured/i.test(msg)) {
    return 'AI is temporarily unavailable (server auth not configured).';
  }
  return `AI search failed: ${msg}`;
}

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

/* ─── Search history helpers ──────────────────────────────────────────── */

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

export default function LogbookSearchTab({ projectId, aircraftId, aircraft }: { projectId: string; aircraftId: string; aircraft?: AircraftAsset }) {
  const entries = (useLogbookEntries(projectId, aircraftId) ?? []) as LogbookEntry[];
  const findings = (useComplianceFindings(projectId, aircraftId) ?? []) as ComplianceFinding[];
  const updateEntry = useUpdateLogbookEntry();
  const removeEntry = useRemoveLogbookEntry();
  const confirmDialog = useConfirmDialog();
  const claudeModel = useDefaultClaudeModel();
  const chunkSearch = useDocumentChunksSearch();

  const [search, setSearch] = useState('');
  const [searchMode, setSearchMode] = useState<SearchMode>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [bookVolumeFilter, setBookVolumeFilter] = useState('');
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
  const [libQuery, setLibQuery] = useState('');
  const [libChunks, setLibChunks] = useState<Array<{ docName: string; text: string; score: number }>>([]);
  const [libBusy, setLibBusy] = useState(false);

  const runNlSearch = useCallback(async () => {
    if (!search.trim() || entries.length === 0) return;
    const q = search.trim();
    if (/last\s+100|100\s*[- ]?hour|last\s+inspection/i.test(q)) {
      setTypeFilter('inspection');
      setBookVolumeFilter('');
      setNlMatchedIds(null);
      setNlMode(false);
      if (/100/i.test(q)) {
        const only100 = entries.filter((e) => e.inspectionType === '100_hour');
        if (only100.length) setNlMatchedIds(new Set(only100.map((e) => e._id)));
      }
      saveSearchToHistory(aircraftId, search);
      setSearchHistory(loadSearchHistory(aircraftId));
      return;
    }
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
    } catch (err: unknown) {
      toast.error(formatAiSearchError(err));
    } finally {
      setNlLoading(false);
    }
  }, [search, entries, claudeModel, aircraftId]);

  const runLibrarySemantic = useCallback(async () => {
    if (!libQuery.trim()) return;
    setLibBusy(true);
    setLibChunks([]);
    try {
      const res = await chunkSearch({
        projectId: projectId as any,
        query: libQuery.trim(),
        categories: ['maintenance_manual', 'parts_catalog', 'logbook_scan'],
        topK: LOGBOOK_SEARCH_TOP_K,
      });
      setLibChunks(((res as any).chunks || []) as any[]);
    } catch (err: any) {
      toast.error(err?.message || 'Library search failed');
    } finally {
      setLibBusy(false);
    }
  }, [libQuery, projectId, chunkSearch]);

  const filtered = useMemo(() => {
    let result = filterEntriesByLocation(entries, locationFilter);
    if (typeFilter) result = result.filter((e) => e.entryType === typeFilter);
    if (bookVolumeFilter) {
      result = result.filter((e) => (e.bookVolume ?? 'airframe') === bookVolumeFilter);
    }
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
  }, [entries, locationFilter, search, searchMode, typeFilter, bookVolumeFilter, dateFrom, dateTo, nlMatchedIds]);

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
  const isFiltered = !!(search || typeFilter || bookVolumeFilter || dateFrom || dateTo || nlMatchedIds || locationFilter !== 'full');

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

        <select
          value={bookVolumeFilter}
          onChange={(e) => setBookVolumeFilter(e.target.value)}
          className="px-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-700 focus:outline-none focus:border-sky-600"
        >
          <option value="">All log volumes</option>
          {['airframe', 'engine_1', 'engine_2', 'prop_1', 'prop_2', 'apu', 'other'].map((v) => (
            <option key={v} value={v}>
              {getLogbookBookVolumeLabel(v)}
            </option>
          ))}
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
            onClick={() => { setSearch(''); setTypeFilter(''); setBookVolumeFilter(''); setDateFrom(''); setDateTo(''); setLocationFilter('full'); setSearchMode('all'); setNlMatchedIds(null); }}
            className="px-2.5 py-1 text-[11px] rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors ml-1"
          >
            Clear all filters ×
          </button>
        )}
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3 text-xs text-stone-700 space-y-2">
        <div className="font-semibold text-stone-600">Company Library (manuals / IPC / scans)</div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="text"
            value={libQuery}
            onChange={(e) => setLibQuery(e.target.value)}
            placeholder="Semantic search across uploaded manuals…"
            className="flex-1 min-w-[200px] px-3 py-2 bg-white border border-sky-200 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={() => void runLibrarySemantic()}
            disabled={libBusy}
            className="px-3 py-2 rounded-lg bg-sky-700 text-white text-sm font-medium disabled:opacity-50"
          >
            {libBusy ? 'Searching…' : 'Search library'}
          </button>
        </div>
        {libChunks.length > 0 ? (
          <ul className="max-h-40 overflow-y-auto space-y-2 mt-2">
            {libChunks.map((c, i) => (
              <li key={i} className="border border-sky-100 rounded-lg p-2 bg-white/90">
                <div className="font-medium text-sky-900">{c.docName}</div>
                <div className="text-stone-600 line-clamp-3 whitespace-pre-wrap">{c.text}</div>
              </li>
            ))}
          </ul>
        ) : null}
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
                    onDelete={async () => {
                      const ok = await confirmDialog({
                        title: 'Delete logbook entry?',
                        message: 'Permanently delete this logbook entry?',
                        confirmLabel: 'Delete',
                      });
                      if (ok)
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
              onDelete={async () => {
                const ok = await confirmDialog({
                  title: 'Delete logbook entry?',
                  message: 'Permanently delete this logbook entry?',
                  confirmLabel: 'Delete',
                });
                if (ok)
                  removeEntry({ entryId: entry._id as any }).catch((err: any) => toast.error(err?.message || 'Failed to delete entry'));
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── LogbookEntryCard ───────────────────────────────────────────────── */

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

/* ─── DetailRow ──────────────────────────────────────────────────────── */

function DetailRow({ label, value, highlight = '' }: { label: string; value?: string; highlight?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-xs">
      <span className="text-stone-500 w-28 flex-shrink-0">{label}</span>
      <span className="text-stone-700">{highlight ? highlightText(value, highlight) : value}</span>
    </div>
  );
}
