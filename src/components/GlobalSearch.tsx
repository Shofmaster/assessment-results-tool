import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from 'convex/react';
import { FiBook, FiFileText, FiSearch, FiAlertTriangle, FiClipboard, FiX } from 'react-icons/fi';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useAppStore } from '../store/appStore';
import {
  useComplianceScopeCompanyId,
  useDocumentChunksSearch,
  useProjects,
  useIsAdmin,
  useIsAerogapEmployee,
  useIsLogbookEnabled,
  useIsFeatureEnabled,
  useIsQualityCommandHubAvailable,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import { getSearchNavActions, type NavFlags } from '../config/navConfig';
import { useTheme } from '../context/ThemeContext';
import { LIBRARY_SEARCH_TOP_K } from '../constants/search';
import { highlightSearchTerms, matchTypeLabel, formatSearchScore } from '../utils/searchHighlight';
import type { SearchChunk } from '../services/driveSearchService';

const RECENT_KEY = 'aerogap-global-search-recent';
const MAX_RECENT = 12;

type GlobalSearchProps = {
  open: boolean;
  onClose: () => void;
};

type PaletteMode = 'instant' | 'content';

type NavAction = { label: string; path: string; keywords?: string[] };

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function saveRecent(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;
  const next = [trimmed, ...loadRecent().filter((q) => q.toLowerCase() !== trimmed.toLowerCase())].slice(
    0,
    MAX_RECENT,
  );
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

function typeIcon(type: string) {
  switch (type) {
    case 'publication':
      return <FiBook className="shrink-0" />;
    case 'logbookEntry':
      return <FiClipboard className="shrink-0" />;
    case 'discrepancy':
      return <FiAlertTriangle className="shrink-0" />;
    default:
      return <FiFileText className="shrink-0" />;
  }
}

function typeLabel(type: string): string {
  switch (type) {
    case 'publication':
      return 'Publication';
    case 'logbookEntry':
      return 'Logbook entry';
    case 'discrepancy':
      return 'Discrepancy';
    case 'document':
      return 'Document';
    default:
      return 'Result';
  }
}

export default function GlobalSearch({ open, onClose }: GlobalSearchProps) {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const inputRef = useRef<HTMLInputElement>(null);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const companyId = useComplianceScopeCompanyId();
  const projects = useProjects() as Array<{ _id: string; companyId?: string }> | undefined;
  const chunkSearch = useDocumentChunksSearch();
  const isAdmin = useIsAdmin();
  const isAerogapEmployee = useIsAerogapEmployee();
  const isLogbookEnabled = useIsLogbookEnabled();
  const isQualityHub = useIsQualityCommandHubAvailable();
  const isLibrary = useIsFeatureEnabled(FEATURE_KEYS.LIBRARY);
  const isPaperwork = useIsFeatureEnabled(FEATURE_KEYS.PAPERWORK_REVIEW);
  const isRevisions = useIsFeatureEnabled(FEATURE_KEYS.REVISIONS);
  const isSchedule = useIsFeatureEnabled(FEATURE_KEYS.SCHEDULE);
  const isChecklists = useIsFeatureEnabled(FEATURE_KEYS.CHECKLISTS);
  const isGuidedAudit = useIsFeatureEnabled(FEATURE_KEYS.GUIDED_AUDIT);
  const isEntityIssues = useIsFeatureEnabled(FEATURE_KEYS.ENTITY_ISSUES);
  const isAuditSim = useIsFeatureEnabled(FEATURE_KEYS.AUDIT_SIMULATION);
  const isReportBuilder = useIsFeatureEnabled(FEATURE_KEYS.REPORT_BUILDER);
  const isDct = useIsFeatureEnabled(FEATURE_KEYS.DCT_COMPLIANCE);
  const isManualWriter = useIsFeatureEnabled(FEATURE_KEYS.MANUAL_WRITER);
  const isManualMgmt = useIsFeatureEnabled(FEATURE_KEYS.MANUAL_MANAGEMENT);
  const isForm337 = useIsFeatureEnabled(FEATURE_KEYS.FORM_337);
  const isAnalytics = useIsFeatureEnabled(FEATURE_KEYS.ANALYTICS);
  const isAnalysis = useIsFeatureEnabled(FEATURE_KEYS.ANALYSIS);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [mode, setMode] = useState<PaletteMode>('instant');
  const [contentResults, setContentResults] = useState<SearchChunk[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());

  const navActions = useMemo(() => {
    const flags: NavFlags = {
      guidedAudit: Boolean(isGuidedAudit),
      checklists: Boolean(isChecklists),
      paperworkReview: Boolean(isPaperwork),
      auditSimulation: Boolean(isAuditSim),
      entityIssues: Boolean(isEntityIssues),
      reportBuilder: Boolean(isReportBuilder),
      library: Boolean(isLibrary),
      revisions: Boolean(isRevisions),
      manualManagement: Boolean(isManualMgmt),
      schedule: Boolean(isSchedule),
      qualityHub: Boolean(isQualityHub),
      dctCompliance: Boolean(isDct),
      manualWriter: Boolean(isManualWriter),
      form337: Boolean(isForm337),
      analysis: Boolean(isAnalysis),
      analytics: Boolean(isAnalytics),
      logbookEnabled: Boolean(isLogbookEnabled),
      aerogapEmployee: Boolean(isAerogapEmployee),
      isAdmin: Boolean(isAdmin),
    };
    return getSearchNavActions(flags) as NavAction[];
  }, [
    isQualityHub,
    isLibrary,
    isPaperwork,
    isRevisions,
    isSchedule,
    isChecklists,
    isGuidedAudit,
    isEntityIssues,
    isAuditSim,
    isReportBuilder,
    isDct,
    isManualWriter,
    isManualMgmt,
    isLogbookEnabled,
    isForm337,
    isAnalytics,
    isAnalysis,
    isAerogapEmployee,
    isAdmin,
  ]);

  const filteredNav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navActions;
    return navActions.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        (a.keywords ?? []).some((k) => k.toLowerCase().includes(q) || q.includes(k.toLowerCase())),
    );
  }, [navActions, query]);

  const scopeProjectId = useMemo(() => {
    if (activeProjectId) return activeProjectId;
    if (!companyId || !projects) return undefined;
    const match = projects.find((p) => String(p.companyId) === String(companyId));
    return match ? String(match._id) : undefined;
  }, [activeProjectId, companyId, projects]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  // Clear the palette when it closes. Adjusted during render so reopening never
  // flashes the previous search before the reset lands.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setQuery('');
      setDebouncedQuery('');
      setMode('instant');
      setContentResults([]);
      setContentError(null);
      setActiveIndex(0);
    }
  }

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  const instantArgs = useMemo(() => {
    if (!debouncedQuery) return 'skip' as const;
    if (companyId) {
      return {
        companyId: companyId as Id<'companies'>,
        projectId: scopeProjectId ? (scopeProjectId as Id<'projects'>) : undefined,
        query: debouncedQuery,
        limit: 8,
      };
    }
    if (scopeProjectId) {
      return {
        projectId: scopeProjectId as Id<'projects'>,
        query: debouncedQuery,
        limit: 8,
      };
    }
    return 'skip' as const;
  }, [debouncedQuery, companyId, scopeProjectId]);

  const instantData = useQuery((api as any).globalSearch.search, instantArgs);
  const instantResults = (instantData?.results ?? []) as Array<{
    type: string;
    id: string;
    title: string;
    snippet: string;
    href: string;
  }>;

  // Monotonic run id so an older, slower content search can't overwrite the
  // results (or clear the spinner) of a newer one.
  const contentRunIdRef = useRef(0);
  const runContentSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    if (!companyId && !scopeProjectId) {
      setContentError('Select a project or company to search document contents.');
      return;
    }
    const runId = ++contentRunIdRef.current;
    setMode('content');
    setContentLoading(true);
    setContentError(null);
    setContentResults([]);
    try {
      const res = await chunkSearch({
        query: trimmed,
        companyId: companyId as Id<'companies'> | undefined,
        projectId: scopeProjectId as Id<'projects'> | undefined,
        topK: LIBRARY_SEARCH_TOP_K,
        categories: [
          'maintenance_manual',
          'parts_catalog',
          'logbook_scan',
          'entity',
          'uploaded',
          'regulatory',
          'sms',
          'reference',
        ],
      });
      if (runId !== contentRunIdRef.current) return;
      setContentResults((res.chunks || []) as SearchChunk[]);
      saveRecent(trimmed);
      setRecent(loadRecent());
    } catch (e: unknown) {
      if (runId !== contentRunIdRef.current) return;
      setContentError(e instanceof Error ? e.message : 'Content search failed.');
    } finally {
      if (runId === contentRunIdRef.current) setContentLoading(false);
    }
  }, [chunkSearch, companyId, query, scopeProjectId]);

  const selectableCount =
    mode === 'content'
      ? contentResults.length
      : debouncedQuery
        ? instantResults.length
        : filteredNav.length;

  // Move the highlight back to the top whenever the result set changes. Adjusted
  // during render so the highlight is never briefly on a row from the old results.
  const resultSetKey = `${debouncedQuery}|${mode}|${contentResults.length}|${instantResults.length}`;
  const [prevResultSetKey, setPrevResultSetKey] = useState(resultSetKey);
  if (prevResultSetKey !== resultSetKey) {
    setPrevResultSetKey(resultSetKey);
    setActiveIndex(0);
  }

  const goToAsk = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    saveRecent(trimmed);
    setRecent(loadRecent());
    onClose();
    navigate('/splash', { state: { askQuery: trimmed, autoSubmit: true } });
  };

  const activateInstant = (href: string) => {
    const trimmed = query.trim();
    if (trimmed) {
      saveRecent(trimmed);
      setRecent(loadRecent());
    }
    onClose();
    navigate(href);
  };

  const activateContentHit = (documentId: string) => {
    activateInstant(`/library?doc=${encodeURIComponent(documentId)}`);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(0, selectableCount - 1)));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        if (mode === 'instant') {
          e.preventDefault();
          if (debouncedQuery) {
            const item = instantResults[activeIndex];
            if (item) activateInstant(item.href);
          } else {
            const item = filteredNav[activeIndex];
            if (item) activateInstant(item.path);
          }
        } else if (mode === 'content' && contentResults[activeIndex]) {
          e.preventDefault();
          activateContentHit(contentResults[activeIndex].documentId);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose, selectableCount, activeIndex, instantResults, mode, debouncedQuery, filteredNav, contentResults]);

  if (!open) return null;

  const hasScope = Boolean(companyId || scopeProjectId);
  const grouped = {
    document: instantResults.filter((r) => r.type === 'document'),
    publication: instantResults.filter((r) => r.type === 'publication'),
    logbookEntry: instantResults.filter((r) => r.type === 'logbookEntry'),
    discrepancy: instantResults.filter((r) => r.type === 'discrepancy'),
  };

  let rowOffset = 0;

  const panelClass = isDarkMode
    ? 'border-white/10 bg-slate-900'
    : 'border-slate-200 bg-white shadow-slate-300/40';
  const headerBorder = isDarkMode ? 'border-white/10' : 'border-slate-200';
  const mutedIcon = isDarkMode ? 'text-white/50' : 'text-slate-400';
  const inputClass = isDarkMode
    ? 'text-white placeholder:text-white/40'
    : 'text-slate-900 placeholder:text-slate-400';
  const closeBtn = isDarkMode
    ? 'text-white/50 hover:text-white hover:bg-white/5'
    : 'text-slate-400 hover:text-slate-700 hover:bg-slate-100';
  const sectionLabel = isDarkMode ? 'text-white/40' : 'text-slate-400';
  const rowIdle = isDarkMode ? 'text-white/80 hover:bg-white/5' : 'text-slate-700 hover:bg-slate-100';
  const rowActive = isDarkMode ? 'bg-sky-500/15 text-white' : 'bg-sky-50 text-slate-900';
  const footerBar = isDarkMode ? 'border-white/10 bg-black/20' : 'border-slate-200 bg-slate-50';
  const footerGhost = isDarkMode
    ? 'border border-white/15 hover:bg-white/5 text-white/80'
    : 'border border-slate-300 hover:bg-slate-100 text-slate-700';
  const footerHint = isDarkMode ? 'text-white/40' : 'text-slate-400';
  const docTitle = isDarkMode ? 'text-sky-200' : 'text-sky-700';
  const docBody = isDarkMode ? 'text-white/80' : 'text-slate-700';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 backdrop-blur-sm p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-2xl rounded-xl border shadow-2xl overflow-hidden ${panelClass}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center gap-2 border-b px-3 py-2 ${headerBorder}`}>
          <FiSearch className={`${mutedIcon} shrink-0`} />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (mode === 'content') setMode('instant');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                void runContentSearch();
              }
            }}
            placeholder={hasScope ? 'Search or jump to…' : 'Jump to…'}
            className={`flex-1 bg-transparent outline-none text-sm py-2 ${inputClass}`}
            aria-label="Search query"
          />
          <button
            type="button"
            onClick={onClose}
            className={`p-2 rounded-lg ${closeBtn}`}
            aria-label="Close search"
          >
            <FiX />
          </button>
        </div>

        <div className="max-h-[min(60vh,520px)] overflow-y-auto scrollbar-thin p-2">
          {hasScope && !debouncedQuery && recent.length > 0 ? (
            <div className="px-2 py-2">
              <div className={`text-xs font-semibold uppercase tracking-wide px-2 mb-1 ${sectionLabel}`}>
                Recent searches
              </div>
              <ul className="space-y-0.5">
                {recent.map((r) => (
                  <li key={r}>
                    <button
                      type="button"
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm ${rowIdle}`}
                      onClick={() => setQuery(r)}
                    >
                      {r}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!debouncedQuery && filteredNav.length > 0 ? (
            <div className="px-2 py-2">
              <div className={`text-xs font-semibold uppercase tracking-wide px-2 mb-1 ${sectionLabel}`}>
                Go to
              </div>
              <ul className="space-y-0.5">
                {filteredNav.map((action, i) => (
                  <li key={action.path}>
                    <button
                      type="button"
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm ${
                        i === activeIndex ? rowActive : rowIdle
                      }`}
                      onClick={() => activateInstant(action.path)}
                    >
                      {action.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {hasScope && debouncedQuery && mode === 'instant' ? (
            <>
              {(['document', 'publication', 'logbookEntry', 'discrepancy'] as const).map((groupKey) => {
                const items = grouped[groupKey];
                if (items.length === 0) return null;
                const startOffset = rowOffset;
                rowOffset += items.length;
                return (
                  <div key={groupKey} className="mb-2">
                    <div className={`text-xs font-semibold uppercase tracking-wide px-2 py-1 ${sectionLabel}`}>
                      {typeLabel(groupKey)}
                    </div>
                    <ul className="space-y-0.5">
                      {items.map((item, i) => {
                        const flatIndex = startOffset + i;
                        return (
                          <li key={`${item.type}-${item.id}`}>
                            <button
                              type="button"
                              className={`w-full flex items-start gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                                flatIndex === activeIndex ? rowActive : rowIdle
                              }`}
                              onClick={() => activateInstant(item.href)}
                            >
                              <span className={`mt-0.5 ${isDarkMode ? 'text-sky-300' : 'text-sky-600'}`}>{typeIcon(item.type)}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block font-medium truncate">
                                  {highlightSearchTerms(item.title, debouncedQuery)}
                                </span>
                                <span className={`block text-xs line-clamp-2 mt-0.5 ${isDarkMode ? 'text-white/70' : 'text-slate-500'}`}>
                                  {highlightSearchTerms(item.snippet, debouncedQuery)}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {instantResults.length === 0 && debouncedQuery ? (
                <p className={`px-3 py-4 text-sm text-center ${isDarkMode ? 'text-white/70' : 'text-slate-500'}`}>No matching records.</p>
              ) : null}
            </>
          ) : null}

          {mode === 'content' ? (
            <div className="px-1 py-1">
              {contentLoading ? (
                <p className="px-3 py-6 text-sm text-white/60 text-center">Searching document contents…</p>
              ) : null}
              {contentError ? (
                <p className="px-3 py-4 text-sm text-rose-300 text-center">{contentError}</p>
              ) : null}
              {!contentLoading && contentResults.length > 0 ? (
                <ul className="space-y-2">
                  {contentResults.map((r, i) => (
                    <li key={`${r.documentId}-${r.chunkIndex}-${i}`}>
                      <button
                        type="button"
                        onClick={() => activateContentHit(r.documentId)}
                        className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                          isDarkMode
                            ? `border-white/10 ${i === activeIndex ? 'bg-sky-500/10' : 'bg-white/5 hover:bg-white/10'}`
                            : `border-slate-200 ${i === activeIndex ? 'bg-sky-50' : 'bg-white hover:bg-slate-50'}`
                        }`}
                        title={`Open ${r.docName} in Library`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className={`truncate font-medium ${docTitle}`}>{r.docName}</div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {r.matchType ? (
                              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-white/10 text-white/60">
                                {matchTypeLabel(r.matchType)}
                              </span>
                            ) : null}
                            <span className="text-xs tabular-nums text-white/50">
                              {formatSearchScore(r.score, r.rerankScore)}
                            </span>
                          </div>
                        </div>
                        <div className={`mt-1 whitespace-pre-wrap line-clamp-4 ${docBody}`}>
                          {highlightSearchTerms(r.text, query)}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!contentLoading && !contentError && contentResults.length === 0 && debouncedQuery ? (
                <p className="px-3 py-4 text-sm text-white/50 text-center">No passages found in document contents.</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {hasScope ? (
          <div className={`flex flex-wrap items-center gap-2 border-t px-3 py-2 ${footerBar}`}>
            <button
              type="button"
              onClick={() => void runContentSearch()}
              disabled={!query.trim() || contentLoading}
              className="rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-white"
            >
              Search document contents
            </button>
            <button
              type="button"
              onClick={goToAsk}
              disabled={!query.trim()}
              className={`rounded-lg disabled:opacity-40 px-3 py-1.5 text-xs font-medium ${footerGhost}`}
            >
              Ask an Expert
            </button>
            <span className={`ml-auto text-[10px] hidden sm:inline ${footerHint}`}>
              Enter open · Shift+Enter search contents · Esc close
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function useGlobalSearchPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return {
    open,
    openSearch: () => setOpen(true),
    closeSearch: () => setOpen(false),
  };
}
