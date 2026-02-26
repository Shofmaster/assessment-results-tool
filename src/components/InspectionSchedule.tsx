import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiCalendar,
  FiSearch,
  FiAlertTriangle,
  FiTrash2,
  FiEdit2,
  FiX,
  FiFile,
} from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useInspectionScheduleItems,
  useAddInspectionScheduleItems,
  useUpdateInspectionScheduleLastPerformed,
  useUpdateInspectionScheduleItem,
  useRemoveInspectionScheduleItem,
  useDefaultClaudeModel,
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

const CATEGORIES = ['calibration', 'audit', 'training', 'surveillance', 'facility', 'ad_compliance', 'other'] as const;

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

  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<string | null>(null);
  const [reviewItems, setReviewItems] = useState<Array<ExtractedInspectionItem & { documentId: string; documentName: string; selected: boolean }> | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [setDateItemId, setSetDateItemId] = useState<string | null>(null);
  const [dateInputValue, setDateInputValue] = useState('');

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
    const docsWithText = entityDocs.filter((d: any) => d.extractedText?.trim());
    if (docsWithText.length === 0) {
      toast.error('No entity documents with extracted text. Add documents in Library and ensure text extraction has run.');
      return;
    }
    setIsScanning(true);
    setScanProgress('Starting scan...');
    setReviewItems(null);

    try {
      const extractor = new RecurringInspectionExtractor();
      const results = await extractor.extractFromDocuments(
        docsWithText.map((d: any) => ({ id: d._id, name: d.name, extractedText: d.extractedText })),
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
        items: toSave.map((it) => ({
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
        })),
      });
      setReviewItems(null);
      toast.success(`Saved ${toSave.length} inspection schedule item${toSave.length !== 1 ? 's' : ''}`);
    } catch (err) {
      toast.error(`Save failed: ${getConvexErrorMessage(err)}`);
    }
  };

  const handleCloseReview = () => {
    setReviewItems(null);
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
      toast.success('Item removed');
    } catch (err) {
      toast.error(getConvexErrorMessage(err));
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

  const sortedItems = [...filteredItems].sort((a, b) => {
    if (!a.nextDue) return 1;
    if (!b.nextDue) return -1;
    return new Date(a.nextDue).getTime() - new Date(b.nextDue).getTime();
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

      {/* Header + Scan button */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={handleScan}
            disabled={isScanning || entityDocs.length === 0}
            loading={isScanning}
            icon={!isScanning ? <FiSearch /> : undefined}
          >
            {isScanning ? (scanProgress || 'Scanning...') : 'Scan Entity Documents'}
          </Button>
          {entityDocs.length === 0 && (
            <span className="text-sm text-white/60">Add entity documents in Library first</span>
          )}
        </div>
        {items.length > 0 && (
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
        )}
      </div>

      {/* Schedule table */}
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
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Title</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Category</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Interval</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Last Performed</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Next Due</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-white/70">Source</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-white/70">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <ScheduleRow
                    key={item._id}
                    item={item}
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
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3">
              {reviewItems.map((it, idx) => (
                <div
                  key={idx}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
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
                    <p className="text-xs text-white/50 mt-1">{it.documentName}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 sm:p-6 border-t border-white/10 flex justify-end gap-3">
              <Button variant="secondary" onClick={handleCloseReview}>
                Cancel
              </Button>
              <Button onClick={handleSaveSelected}>
                Save Selected
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleRow({
  item,
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
        <td colSpan={7} className="py-4 px-4">
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
