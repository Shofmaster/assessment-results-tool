import { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiCalendar,
  FiSearch,
  FiAlertTriangle,
  FiTrash2,
  FiEdit2,
  FiX,
  FiFile,
  FiDownload,
  FiChevronUp,
  FiChevronDown,
  FiChevronsUp,
} from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useInspectionScheduleItems,
  useAddInspectionScheduleItems,
  useUpdateInspectionScheduleLastPerformed,
  useUpdateInspectionScheduleItem,
  useRemoveInspectionScheduleItem,
  useRemoveInspectionScheduleItems,
  useNormalizeInspectionScheduleItems,
  useDefaultClaudeModel,
  useIsAdmin,
} from '../hooks/useConvexData';
import { RecurringInspectionExtractor } from '../services/recurringInspectionExtractor';
import type { ExtractedInspectionItem, InspectionScheduleItem } from '../types/inspectionSchedule';
import {
  computeNextDue,
  getDueStatus,
  type DueStatus,
} from '../types/inspectionSchedule';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard, Badge, Input, Select } from './ui';
import { toast } from 'sonner';
import { getConvexErrorMessage } from '../utils/convexError';
import {
  exportScheduleMonthByMonth,
  exportOverdueListing,
  exportToGoogleCalendar,
} from '../utils/exportInspectionSchedule';

const CATEGORIES = ['calibration', 'audit', 'training', 'surveillance', 'facility', 'ad_compliance', 'other'] as const;

const DOCUMENT_COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#06B6D4',
  '#EC4899',
  '#84CC16',
] as const;

function getDocumentColor(sourceDocId: string | undefined, sourceDocName: string | undefined): string {
  const key = sourceDocId || sourceDocName || 'none';
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  return DOCUMENT_COLORS[Math.abs(hash) % DOCUMENT_COLORS.length];
}

function formatInterval(item: {
  intervalType: string;
  intervalMonths?: number;
  intervalDays?: number;
  intervalValue?: number;
}): string {
  if (item.intervalType === 'calendar') {
    if (item.intervalMonths) {
      if (item.intervalMonths === 3) return 'Quarterly';
      if (item.intervalMonths === 6) return 'Semi-annual';
      if (item.intervalMonths === 12) return 'Annual';
      return `Every ${item.intervalMonths} months`;
    }
    if (item.intervalDays) return `Every ${item.intervalDays} days`;
  }
  if (item.intervalType === 'hours' && item.intervalValue) return `Every ${item.intervalValue} hours`;
  if (item.intervalType === 'cycles' && item.intervalValue) return `Every ${item.intervalValue} cycles`;
  return '—';
}

export default function InspectionSchedule() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const navigate = useNavigate();
  const defaultModel = useDefaultClaudeModel();

  const entityDocs = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const items = (useInspectionScheduleItems(activeProjectId || undefined) || []) as InspectionScheduleItem[];
  const addItems = useAddInspectionScheduleItems();
  const updateLastPerformed = useUpdateInspectionScheduleLastPerformed();
  const updateItem = useUpdateInspectionScheduleItem();
  const removeItem = useRemoveInspectionScheduleItem();
  const removeItems = useRemoveInspectionScheduleItems();
  const normalizeItems = useNormalizeInspectionScheduleItems();
  const isAdmin = useIsAdmin();

  const docsWithText = useMemo(
    () => (entityDocs.filter((d: any) => d.extractedText?.trim()) as any[]),
    [entityDocs]
  );

  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<Array<ExtractedInspectionItem & { documentId: string; documentName: string; selected: boolean }> | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [setDateItemId, setSetDateItemId] = useState<string | null>(null);
  const [dateInputValue, setDateInputValue] = useState('');
  const [isRepairingData, setIsRepairingData] = useState(false);
  const [activeView, setActiveView] = useState<'table' | 'calendar'>('table');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  type SortColumn = 'title' | 'category' | 'interval' | 'lastPerformed' | 'nextDue' | 'source';
  type SortDir = 'asc' | 'desc';
  const [sortColumn, setSortColumn] = useState<SortColumn>('nextDue');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(col);
      setSortDir('asc');
    }
  };

  // Default all docs selected when doc list changes
  useEffect(() => {
    if (docsWithText.length > 0) {
      setSelectedDocIds(new Set(docsWithText.map((d: any) => d._id)));
    }
  }, [docsWithText.length]);

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📋</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Choose a project from the sidebar to view and manage its recurring inspection schedule.</p>
          <Button size="lg" onClick={() => navigate('/projects')} className="mx-auto">
            Go to Projects
          </Button>
        </GlassCard>
      </div>
    );
  }

  const handleScan = async () => {
    const toScan = docsWithText.filter((d: any) => selectedDocIds.has(d._id));
    if (toScan.length === 0) {
      toast.error('Select at least one document to scan.');
      return;
    }
    setIsScanning(true);
    setScanProgress('Starting scan...');
    setReviewItems(null);

    try {
      const extractor = new RecurringInspectionExtractor();
      const results = await extractor.extractFromDocuments(
        toScan.map((d: any) => ({ id: d._id, name: d.name, extractedText: d.extractedText })),
        defaultModel,
        (idx, name, msg) => setScanProgress(msg || `Scanning ${name}...`)
      );

      const flat: Array<ExtractedInspectionItem & { documentId: string; documentName: string; selected: boolean }> = [];
      for (const r of results) {
        for (const it of r.items) {
          flat.push({
            ...it,
            documentId: r.documentId,
            documentName: r.documentName,
            selected: it.confidence !== 'low',
          });
        }
      }

      // Second pass: scan all selected docs for completion dates matching extracted items
      if (flat.length > 0) {
        const completionDates = await extractor.findCompletionDates(
          flat,
          toScan.map((d: any) => ({ id: d._id, name: d.name, extractedText: d.extractedText })),
          defaultModel,
          (msg) => setScanProgress(msg)
        );
        if (completionDates.size > 0) {
          for (const item of flat) {
            if (!item.lastPerformedAt) {
              const found = completionDates.get(item.title);
              if (found) item.lastPerformedAt = found;
            }
          }
        }
      }

      setReviewItems(flat);
      setScanProgress(null);
      toast.success(`Found ${flat.length} recurring inspection requirement${flat.length !== 1 ? 's' : ''}`);
    } catch (err) {
      setScanProgress(null);
      toast.error(`Scan failed: ${getConvexErrorMessage(err)}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleToggleReviewItem = (index: number) => {
    setReviewItems((prev) =>
      prev
        ? prev.map((it, i) => (i === index ? { ...it, selected: !it.selected } : it))
        : null
    );
  };

  type ReviewItem = NonNullable<typeof reviewItems>[number];
  const toItemPayload = (it: ReviewItem) => ({
    sourceDocumentId: it.documentId as any,
    sourceDocumentName: it.documentName,
    title: it.title,
    description: it.description,
    category: it.category,
    intervalType: it.intervalType,
    intervalMonths: it.intervalMonths,
    intervalDays: it.intervalDays,
    intervalValue: it.intervalValue,
    regulationRef: it.regulationRef,
    isRegulatory: it.isRegulatory,
    lastPerformedAt: it.lastPerformedAt || undefined,
    lastPerformedSource: it.lastPerformedAt ? 'document' : undefined,
    documentExcerpt: it.documentExcerpt,
  });

  const handleSaveSelected = async () => {
    if (!reviewItems || !activeProjectId) return;
    const toSave = reviewItems.filter((it) => it.selected);
    if (toSave.length === 0) {
      toast.warning('No items selected to save');
      return;
    }

    try {
      await addItems({
        projectId: activeProjectId as any,
        items: toSave.map(toItemPayload),
      });
      setReviewItems(null);
      toast.success(`Saved ${toSave.length} inspection schedule item${toSave.length !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error(`Save failed: ${getConvexErrorMessage(err)}`);
    }
  };

  const handleSaveFromDocument = async (documentId: string) => {
    if (!reviewItems || !activeProjectId) return;
    const toSave = reviewItems.filter((it) => it.documentId === documentId && it.selected);
    if (toSave.length === 0) {
      toast.warning('No items selected from this document');
      return;
    }

    try {
      await addItems({
        projectId: activeProjectId as any,
        items: toSave.map(toItemPayload),
      });
      setReviewItems((prev) => {
        if (!prev) return null;
        const next = prev.filter((it) => !(it.documentId === documentId && it.selected));
        return next.length === 0 ? null : next;
      });
      toast.success(`Saved ${toSave.length} item${toSave.length !== 1 ? 's' : ''} from ${toSave[0]?.documentName}`);
    } catch (err) {
      toast.error(`Save failed: ${getConvexErrorMessage(err)}`);
    }
  };

  const handleCloseReview = () => {
    setReviewItems(null);
  };

  const handleToggleDocSelection = (docId: string) => {
    setSelectedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleSelectAllDocs = () => {
    setSelectedDocIds(new Set(docsWithText.map((d: any) => d._id)));
  };

  const handleDeselectAllDocs = () => {
    setSelectedDocIds(new Set());
  };

  const handleSetLastPerformed = async (itemId: string) => {
    if (!dateInputValue) return;
    try {
      await updateLastPerformed({ itemId: itemId as any, lastPerformedAt: dateInputValue });
      setSetDateItemId(null);
      setDateInputValue('');
      toast.success('Last performed date updated');
    } catch (err) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const handleRemove = async (item: InspectionScheduleItem) => {
    if (!confirm(`Remove "${item.title}" from the schedule?`)) return;
    try {
      await removeItem({ itemId: item._id as any });
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(item._id);
        return next;
      });
      toast.success('Item removed');
    } catch (err) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const handleToggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const handleSelectAllItems = () => {
    setSelectedItemIds(new Set(sortedItems.map((i) => i._id)));
  };

  const handleDeselectAllItems = () => {
    setSelectedItemIds(new Set());
  };

  const handleRemoveSelected = async () => {
    const count = selectedItemIds.size;
    if (count === 0) return;
    if (!confirm(`Remove ${count} item${count !== 1 ? 's' : ''} from the schedule?`)) return;
    try {
      await removeItems({ itemIds: Array.from(selectedItemIds) as any[] });
      setSelectedItemIds(new Set());
      toast.success(`${count} item${count !== 1 ? 's' : ''} removed`);
    } catch (err) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const handleRepairData = async () => {
    if (!activeProjectId) return;
    setIsRepairingData(true);
    try {
      const result = await normalizeItems({ projectId: activeProjectId as any });
      toast.success(`Repair complete: scanned ${result.scanned}, updated ${result.updated}`);
    } catch (err) {
      toast.error(`Repair failed: ${getConvexErrorMessage(err)}`);
    } finally {
      setIsRepairingData(false);
    }
  };

  // Compute stats
  const itemsWithNextDue = items.map((it) => ({
    ...it,
    nextDue: computeNextDue(it),
    status: getDueStatus(computeNextDue(it)),
  }));
  const overdueCount = itemsWithNextDue.filter((i) => i.status === 'overdue').length;
  const dueSoonCount = itemsWithNextDue.filter((i) => i.status === 'due_soon').length;
  const noDateCount = itemsWithNextDue.filter((i) => i.status === 'no_date').length;
  const onTrackCount = itemsWithNextDue.filter((i) => i.status === 'on_track').length;

  const filteredItems = categoryFilter
    ? itemsWithNextDue.filter((i) => i.category === categoryFilter)
    : itemsWithNextDue;

  const getIntervalSortValue = (item: (typeof itemsWithNextDue)[0]): number => {
    if (item.intervalType === 'calendar') {
      if (item.intervalMonths) return item.intervalMonths * 30;
      if (item.intervalDays) return item.intervalDays;
    }
    if (item.intervalType === 'hours' && item.intervalValue) return item.intervalValue * 0.041667; // hours → fractional days
    if (item.intervalType === 'cycles' && item.intervalValue) return item.intervalValue;
    return Infinity;
  };

  const sortedItems = [...filteredItems].sort((a, b) => {
    let cmp = 0;
    switch (sortColumn) {
      case 'title':
        cmp = (a.title ?? '').localeCompare(b.title ?? '');
        break;
      case 'category':
        cmp = (a.category ?? '').localeCompare(b.category ?? '');
        break;
      case 'interval':
        cmp = getIntervalSortValue(a) - getIntervalSortValue(b);
        break;
      case 'lastPerformed':
        if (!a.lastPerformedAt && !b.lastPerformedAt) cmp = 0;
        else if (!a.lastPerformedAt) cmp = 1;
        else if (!b.lastPerformedAt) cmp = -1;
        else cmp = new Date(a.lastPerformedAt).getTime() - new Date(b.lastPerformedAt).getTime();
        break;
      case 'nextDue':
        if (!a.nextDue && !b.nextDue) cmp = 0;
        else if (!a.nextDue) cmp = 1;
        else if (!b.nextDue) cmp = -1;
        else cmp = new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime();
        break;
      case 'source':
        cmp = (a.sourceDocumentName ?? '').localeCompare(b.sourceDocumentName ?? '');
        break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Recurring Inspection Schedule
        </h1>
        <p className="text-white/60 text-lg">
          Scan entity documents for recurring inspection requirements, track last-performed dates, and view upcoming due dates
        </p>
      </div>

      {/* Summary stats */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="glass rounded-xl p-4 bg-gradient-to-br from-white/10 to-white/5">
            <div className="text-3xl font-display font-bold text-white">{items.length}</div>
            <div className="text-sm text-white/60 mt-1">Items on schedule</div>
          </div>
          <div className="glass rounded-xl p-4 bg-gradient-to-br from-red-500/20 to-red-500/5">
            <div className="text-3xl font-display font-bold text-red-400">{overdueCount}</div>
            <div className="text-sm text-white/60 mt-1">Overdue</div>
          </div>
          <div className="glass rounded-xl p-4 bg-gradient-to-br from-amber-500/20 to-amber-500/5">
            <div className="text-3xl font-display font-bold text-amber-400">{dueSoonCount + noDateCount}</div>
            <div className="text-sm text-white/60 mt-1">Due soon / Need date</div>
          </div>
          <div className="glass rounded-xl p-4 bg-gradient-to-br from-green-500/20 to-green-500/5">
            <div className="text-3xl font-display font-bold text-green-400">{onTrackCount}</div>
            <div className="text-sm text-white/60 mt-1">On track</div>
          </div>
        </div>
      )}

      {/* Header + Scan + Document picker */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          {docsWithText.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm text-white/70">Select documents to scan:</span>
                <button
                  type="button"
                  onClick={handleSelectAllDocs}
                  className="text-sm text-sky-lighter hover:underline"
                >
                  Select all
                </button>
                <span className="text-white/40">|</span>
                <button
                  type="button"
                  onClick={handleDeselectAllDocs}
                  className="text-sm text-sky-lighter hover:underline"
                >
                  Deselect all
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                {docsWithText.map((d: any) => (
                  <label key={d._id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDocIds.has(d._id)}
                      onChange={() => handleToggleDocSelection(d._id)}
                      className="rounded border-white/30 bg-white/10"
                    />
                    <span className="text-white/80 truncate max-w-[180px]" title={d.name}>
                      {d.name}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <Button
            size="lg"
            onClick={handleScan}
            disabled={isScanning || selectedDocIds.size === 0}
            loading={isScanning}
            icon={!isScanning ? <FiSearch /> : undefined}
          >
            {isScanning ? (scanProgress || 'Scanning...') : 'Scan Selected'}
          </Button>
          {docsWithText.length === 0 && (
            <span className="text-sm text-white/60">Add entity documents in Library and extract text first</span>
          )}
          {selectedDocIds.size === 0 && docsWithText.length > 0 && (
            <span className="text-sm text-amber-400/80">Select at least one document</span>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="secondary"
              onClick={handleRepairData}
              disabled={isRepairingData}
              loading={isRepairingData}
            >
              Repair Schedule Data
            </Button>
          )}
        </div>
        {items.length > 0 && (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveView('table')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeView === 'table' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setActiveView('calendar')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeView === 'calendar' ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                Calendar
              </button>
            </div>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              selectSize="sm"
              className="w-44"
            >
              <option value="">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => exportScheduleMonthByMonth(itemsWithNextDue)}
                icon={<FiDownload />}
              >
                Export calendar
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => exportOverdueListing(itemsWithNextDue)}
                disabled={overdueCount === 0}
                icon={<FiDownload />}
              >
                Export overdue
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => exportToGoogleCalendar(itemsWithNextDue)}
                icon={<FiDownload />}
              >
                Export to Google Calendar
              </Button>
            </div>
          </>
        )}
      </div>

      {/* Schedule table or calendar */}
      <GlassCard>
        <h2 className="text-xl font-display font-bold mb-4">Schedule ({sortedItems.length})</h2>

        {items.length === 0 ? (
          <div className="text-center py-16">
            <FiCalendar className="text-6xl text-white/20 mx-auto mb-4" />
            <p className="text-white/60 text-lg">No recurring inspections found</p>
            <p className="text-white/70 text-sm mt-2 max-w-md mx-auto">
              Scan your entity documents to extract schedule requirements. Documents like Repair Station Manuals, quality procedures, and calibration policies often contain recurring inspection intervals.
            </p>
          </div>
        ) : activeView === 'calendar' ? (
          <ScheduleCalendarView items={sortedItems} getDocumentColor={getDocumentColor} />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            {selectedItemIds.size > 0 && (
              <div className="flex items-center justify-between gap-4 mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                <span className="text-sm text-white/90">
                  {selectedItemIds.size} item{selectedItemIds.size !== 1 ? 's' : ''} selected
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleDeselectAllItems}
                    className="text-sm text-sky-lighter hover:underline"
                  >
                    Deselect all
                  </button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveSelected}
                    icon={<FiTrash2 />}
                  >
                    Delete selected
                  </Button>
                </div>
              </div>
            )}
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="w-10 py-3 px-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sortedItems.length > 0 && selectedItemIds.size === sortedItems.length}
                        onChange={(e) => (e.target.checked ? handleSelectAllItems() : handleDeselectAllItems())}
                        className="rounded border-white/30 bg-white/10"
                        title={selectedItemIds.size === sortedItems.length ? 'Deselect all' : 'Select all'}
                      />
                    </label>
                  </th>
                  {(
                    [
                      { col: 'title' as const, label: 'Title' },
                      { col: 'category' as const, label: 'Category' },
                      { col: 'interval' as const, label: 'Interval' },
                      { col: 'lastPerformed' as const, label: 'Last Performed' },
                      { col: 'nextDue' as const, label: 'Next Due' },
                      { col: 'source' as const, label: 'Source' },
                    ] as const
                  ).map(({ col, label }) => (
                    <th
                      key={col}
                      className="text-left py-3 px-4 text-sm font-medium text-white/70 cursor-pointer select-none hover:text-white/90 whitespace-nowrap"
                      onClick={() => handleSort(col)}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {sortColumn === col ? (
                          sortDir === 'asc' ? (
                            <FiChevronUp className="text-sky-lighter shrink-0" />
                          ) : (
                            <FiChevronDown className="text-sky-lighter shrink-0" />
                          )
                        ) : (
                          <FiChevronsUp className="text-white/20 shrink-0" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="text-right py-3 px-4 text-sm font-medium text-white/70">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <ScheduleRow
                    key={item._id}
                    item={item}
                    selected={selectedItemIds.has(item._id)}
                    onSelect={() => handleToggleItemSelection(item._id)}
                    onSetDate={() => {
                      setSetDateItemId(item._id);
                      setDateInputValue(item.lastPerformedAt || new Date().toISOString().slice(0, 10));
                    }}
                    onEdit={() => setEditItemId(item._id)}
                    onRemove={() => handleRemove(item)}
                    setDateItemId={setDateItemId}
                    dateInputValue={dateInputValue}
                    onDateChange={setDateInputValue}
                    onDateSubmit={() => handleSetLastPerformed(item._id)}
                    onDateCancel={() => {
                      setSetDateItemId(null);
                      setDateInputValue('');
                    }}
                    editItemId={editItemId}
                    onEditSave={async (updates) => {
                      await updateItem({ itemId: item._id as any, ...updates });
                      setEditItemId(null);
                    }}
                    onEditCancel={() => setEditItemId(null)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {/* Review modal */}
      {reviewItems !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
        >
          <div className="glass rounded-2xl border border-white/10 max-w-3xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
              <h2 id="review-modal-title" className="text-xl font-display font-bold text-white">
                Review Extracted Items ({reviewItems.filter((i) => i.selected).length} selected)
              </h2>
              <button
                onClick={handleCloseReview}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                aria-label="Close"
              >
                <FiX className="text-xl" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {(() => {
                const byDoc = new Map<string, { docName: string; items: Array<{ item: ReviewItem; idx: number }> }>();
                reviewItems.forEach((it, idx) => {
                  const key = it.documentId;
                  if (!byDoc.has(key)) byDoc.set(key, { docName: it.documentName, items: [] });
                  byDoc.get(key)!.items.push({ item: it, idx });
                });
                return Array.from(byDoc.entries()).map(([docId, { docName, items }]) => (
                  <div key={docId} className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-white/90">{docName}</span>
                      <Button
                        size="sm"
                        onClick={() => handleSaveFromDocument(docId)}
                        disabled={items.filter((x) => x.item.selected).length === 0}
                      >
                        Add selected
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {items.map(({ item: it, idx }) => (
                        <div
                          key={idx}
                          className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                            it.selected ? 'bg-white/5 border-white/10' : 'bg-white/[0.02] border-white/5 opacity-70'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={it.selected}
                            onChange={() => handleToggleReviewItem(idx)}
                            className="mt-1.5 rounded border-white/30 bg-white/10"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-white">{it.title}</span>
                              {it.confidence === 'low' && (
                                <Badge variant="warning" size="sm" className="flex items-center gap-1">
                                  <FiAlertTriangle className="text-xs" />
                                  Low confidence
                                </Badge>
                              )}
                              {it.category && (
                                <Badge size="sm" variant="default">
                                  {it.category}
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-white/60 mt-0.5">
                              {formatInterval(it)} {it.regulationRef && `· ${it.regulationRef}`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ));
              })()}
            </div>
            <div className="p-4 sm:p-6 border-t border-white/10 flex justify-end gap-3">
              <Button variant="secondary" onClick={handleCloseReview}>
                Cancel
              </Button>
              <Button onClick={handleSaveSelected}>
                Add All Selected
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleCalendarView({
  items,
  getDocumentColor,
}: {
  items: Array<InspectionScheduleItem & { nextDue: string | null; status: DueStatus }>;
  getDocumentColor: (docId?: string, docName?: string) => string;
}) {
  const itemsWithDue = items.filter((i) => i.nextDue);
  const today = new Date();
  const monthCount = 6;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const byDate = new Map<string, typeof itemsWithDue>();
  for (const item of itemsWithDue) {
    const key = item.nextDue!;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key)!.push(item);
  }

  const docLegend = Array.from(
    new Map(
      itemsWithDue
        .filter((i) => i.sourceDocumentId || i.sourceDocumentName)
        .map((i) => [(i.sourceDocumentId || i.sourceDocumentName) as string, i.sourceDocumentName || 'Unknown'])
    ).entries()
  );

  return (
    <div className="space-y-6">
      {docLegend.length > 0 && (
        <div className="flex flex-wrap gap-4 text-sm">
          {docLegend.map(([id, name]) => (
            <div key={id} className="flex items-center gap-2">
              <span
                className="w-4 h-4 rounded flex-shrink-0"
                style={{ backgroundColor: getDocumentColor(id as string, name) }}
              />
              <span className="text-white/70 truncate max-w-[200px]" title={name}>
                {name}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {Array.from({ length: monthCount }, (_, m) => {
          const d = new Date(today.getFullYear(), today.getMonth() + m, 1);
          const year = d.getFullYear();
          const month = d.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDay = new Date(year, month, 1).getDay();

          return (
            <div key={m} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <h3 className="font-display font-bold text-white mb-3">
                {monthNames[month]} {year}
              </h3>
              <div className="grid grid-cols-7 gap-1 text-xs">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dow) => (
                  <div key={dow} className="text-white/50 text-center font-medium">
                    {dow}
                  </div>
                ))}
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, day) => {
                  const date = new Date(year, month, day + 1);
                  const key = date.toISOString().slice(0, 10);
                  const dayItems = byDate.get(key) || [];

                  return (
                    <div
                      key={day}
                      className={`min-h-[60px] p-1 rounded border ${
                        date.toDateString() === today.toDateString()
                          ? 'border-sky-lighter/50 bg-sky-500/10'
                          : 'border-white/5'
                      }`}
                    >
                      <span className="text-white/70">{day + 1}</span>
                      <div className="mt-0.5 space-y-0.5">
                        {dayItems.slice(0, 3).map((item) => (
                          <div
                            key={item._id}
                            className="text-[10px] truncate px-1 py-0.5 rounded"
                            style={{
                              backgroundColor: `${getDocumentColor(item.sourceDocumentId, item.sourceDocumentName)}40`,
                              borderLeft: `3px solid ${getDocumentColor(item.sourceDocumentId, item.sourceDocumentName)}`,
                            }}
                            title={`${item.title} (${item.sourceDocumentName || '—'})`}
                          >
                            {item.title}
                          </div>
                        ))}
                        {dayItems.length > 3 && (
                          <span className="text-[10px] text-white/50">+{dayItems.length - 3} more</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScheduleRow({
  item,
  selected,
  onSelect,
  onSetDate,
  onEdit,
  onRemove,
  setDateItemId,
  dateInputValue,
  onDateChange,
  onDateSubmit,
  onDateCancel,
  editItemId,
  onEditSave,
  onEditCancel,
}: {
  item: InspectionScheduleItem & { nextDue: string | null; status: DueStatus };
  selected?: boolean;
  onSelect?: () => void;
  onSetDate: () => void;
  onEdit: () => void;
  onRemove: () => void;
  setDateItemId: string | null;
  dateInputValue: string;
  onDateChange: (v: string) => void;
  onDateSubmit: () => void;
  onDateCancel: () => void;
  editItemId: string | null;
  onEditSave: (updates: Partial<InspectionScheduleItem>) => Promise<void>;
  onEditCancel: () => void;
}) {
  const [editTitle, setEditTitle] = useState(item.title);
  const [editCategory, setEditCategory] = useState(item.category ?? '');
  const [editIntervalMonths, setEditIntervalMonths] = useState(String(item.intervalMonths ?? ''));
  const [saving, setSaving] = useState(false);
  const isEditing = editItemId === item._id;
  const isSettingDate = setDateItemId === item._id;

  const statusColors: Record<DueStatus, string> = {
    overdue: 'text-red-400',
    due_soon: 'text-amber-400',
    on_track: 'text-green-400',
    no_date: 'text-white/50',
  };
  const statusLabels: Record<DueStatus, string> = {
    overdue: 'Overdue',
    due_soon: 'Due soon',
    on_track: 'On track',
    no_date: '— Set date',
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      await onEditSave({
        title: editTitle.trim() || item.title,
        category: editCategory || undefined,
        intervalMonths: editIntervalMonths ? parseInt(editIntervalMonths, 10) : undefined,
      });
      onEditCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/5">
        <td className="py-3 px-4">
          {onSelect && (
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={selected ?? false}
                onChange={onSelect}
                className="rounded border-white/30 bg-white/10"
              />
            </label>
          )}
        </td>
        <td className="py-3 px-4">
          <span className="font-medium text-white">{item.title}</span>
        </td>
      <td className="py-3 px-4">
        {item.category ? (
          <Badge size="sm" variant="default">
            {item.category}
          </Badge>
        ) : (
          <span className="text-white/50">—</span>
        )}
      </td>
      <td className="py-3 px-4 text-white/80">{formatInterval(item)}</td>
      <td className="py-3 px-4">
        {isSettingDate ? (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dateInputValue}
              onChange={(e) => onDateChange(e.target.value)}
              className="px-2 py-1 bg-white/10 border border-white/20 rounded text-sm"
            />
            <button
              onClick={onDateSubmit}
              className="text-sm text-sky-lighter hover:underline"
            >
              Save
            </button>
            <button onClick={onDateCancel} className="text-sm text-white/60 hover:text-white">
              Cancel
            </button>
          </div>
        ) : (
          <span className="text-white/80">
            {item.lastPerformedAt
              ? new Date(item.lastPerformedAt).toLocaleDateString()
              : '—'}
          </span>
        )}
      </td>
      <td className={`py-3 px-4 ${statusColors[item.status]}`}>
        {item.nextDue
          ? new Date(item.nextDue).toLocaleDateString()
          : statusLabels[item.status]}
      </td>
      <td className="py-3 px-4">
        {item.sourceDocumentName ? (
          <span className="text-sm text-white/60 truncate max-w-[120px] block" title={item.sourceDocumentName}>
            <FiFile className="inline mr-1 text-white/50" />
            {item.sourceDocumentName}
          </span>
        ) : (
          <span className="text-white/50">—</span>
        )}
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-1">
          {!item.lastPerformedAt && !isSettingDate && (
            <button
              onClick={onSetDate}
              className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              title="Set last performed date"
            >
              <FiCalendar />
            </button>
          )}
          {isSettingDate ? null : (
            <>
              <button
                onClick={() => {
                  setEditTitle(item.title);
                  setEditCategory(item.category ?? '');
                  setEditIntervalMonths(String(item.intervalMonths ?? ''));
                  onEdit();
                }}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Edit"
              >
                <FiEdit2 />
              </button>
              <button
                onClick={onRemove}
                className="p-2 rounded-lg text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Remove"
              >
                <FiTrash2 />
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
    {isEditing && (
      <tr className="border-b border-white/5 bg-white/5">
        <td colSpan={8} className="py-4 px-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="min-w-[200px]">
              <Input
                label="Title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                inputSize="sm"
              />
            </div>
            <div className="min-w-[140px]">
              <Select
                label="Category"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                selectSize="sm"
              >
                <option value="">—</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div className="min-w-[120px]">
              <Input
                label="Interval (months)"
                type="number"
                min={1}
                value={editIntervalMonths}
                onChange={(e) => setEditIntervalMonths(e.target.value)}
                inputSize="sm"
                placeholder="e.g. 6"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleEditSave} disabled={saving} loading={saving}>
                Save
              </Button>
              <Button size="sm" variant="secondary" onClick={onEditCancel} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </td>
      </tr>
    )}
    </>
  );
}
