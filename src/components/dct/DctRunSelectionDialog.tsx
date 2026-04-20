import { useEffect, useMemo, useState } from 'react';
import { FiChevronDown, FiChevronRight, FiPlayCircle, FiX } from 'react-icons/fi';
import { Button } from '../ui';
import type { DctApplicabilityState } from '../../utils/dctApplicability';

export type DctRunSelectionRow = {
  comparisonId: string;
  questionText: string;
  dctFileName?: string;
  peerGroupLabel?: string;
  mlfLabel?: string;
  specialtyLabel?: string;
  applicability: DctApplicabilityState;
  confidence?: number;
  references?: string[];
};

export type DctRunSelectionDialogProps = {
  open: boolean;
  mode: 'traceability' | 'document-check';
  rows: DctRunSelectionRow[];
  initialSelection: Set<string>;
  running?: boolean;
  /** True when the classifier produced 0 applicable rows — prompts to switch to heuristics-only. */
  fallbackBannerVisible?: boolean;
  onSwitchToHeuristicsOnly?: () => void;
  onConfirm: (selected: Set<string>) => void | Promise<void>;
  onCancel: () => void;
};

const BUCKETS: Array<{ key: DctApplicabilityState; label: string; defaultOpen: boolean }> = [
  { key: 'applicable', label: 'Applicable', defaultOpen: true },
  { key: 'unsure', label: 'Unsure — review these', defaultOpen: true },
  { key: 'not_applicable', label: 'Not applicable', defaultOpen: false },
];

function bucketClass(key: DctApplicabilityState): string {
  if (key === 'applicable') return 'text-emerald-200 border-emerald-500/40 bg-emerald-500/10';
  if (key === 'unsure') return 'text-amber-200 border-amber-500/40 bg-amber-500/10';
  return 'text-white/60 border-white/15 bg-white/5';
}

export default function DctRunSelectionDialog({
  open,
  mode,
  rows,
  initialSelection,
  running = false,
  fallbackBannerVisible = false,
  onSwitchToHeuristicsOnly,
  onConfirm,
  onCancel,
}: DctRunSelectionDialogProps) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [openBuckets, setOpenBuckets] = useState<Record<DctApplicabilityState, boolean>>({
    applicable: true,
    unsure: true,
    not_applicable: false,
  });

  useEffect(() => {
    if (open) setSelection(new Set(initialSelection));
    // We reinitialize from initialSelection on each open; subsequent edits inside
    // the dialog stay local until onConfirm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grouped = useMemo(() => {
    const out: Record<DctApplicabilityState, DctRunSelectionRow[]> = {
      applicable: [],
      unsure: [],
      not_applicable: [],
    };
    for (const row of rows) {
      out[row.applicability].push(row);
    }
    return out;
  }, [rows]);

  if (!open) return null;

  const selectedCount = selection.size;
  const title = mode === 'traceability' ? 'Run Traceability' : 'Run Document Check';
  const actionLabel =
    mode === 'traceability'
      ? `Run Traceability on ${selectedCount} item${selectedCount === 1 ? '' : 's'}`
      : `Run Document Check on ${selectedCount} item${selectedCount === 1 ? '' : 's'}`;

  const toggleRow = (id: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkSet = (ids: string[], include: boolean) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (include) for (const id of ids) next.add(id);
      else for (const id of ids) next.delete(id);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-navy-800 border border-white/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <FiPlayCircle className="text-sky-lighter text-lg" />
            <h2 className="text-lg font-display font-bold text-white">{title}</h2>
            <span className="text-xs text-white/50">
              Review auto-selected DCT questions before running
            </span>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 rounded hover:bg-white/10 text-white/70"
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>

        {fallbackBannerVisible && (
          <div className="px-6 py-3 border-b border-amber-500/30 bg-amber-500/10 text-amber-100 text-sm flex items-start justify-between gap-3">
            <div>
              <strong className="font-semibold">Structured filter matched 0 rows.</strong>{' '}
              Showing heuristic matches as <em>Unsure</em> below — review and include what
              applies.
            </div>
            {onSwitchToHeuristicsOnly && (
              <button
                type="button"
                onClick={onSwitchToHeuristicsOnly}
                className="text-amber-50 underline hover:text-white whitespace-nowrap"
              >
                Switch to heuristics-only mode
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {BUCKETS.map((bucket) => {
            const list = grouped[bucket.key];
            const ids = list.map((r) => r.comparisonId);
            const includedInBucket = ids.filter((id) => selection.has(id)).length;
            const isOpen = openBuckets[bucket.key];
            return (
              <section
                key={bucket.key}
                className={`rounded-lg border ${bucketClass(bucket.key)}`}
              >
                <header className="flex items-center justify-between px-4 py-2 gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenBuckets((prev) => ({ ...prev, [bucket.key]: !prev[bucket.key] }))
                    }
                    className="flex items-center gap-2 text-sm font-semibold"
                  >
                    {isOpen ? <FiChevronDown /> : <FiChevronRight />}
                    {bucket.label} ({list.length})
                    {list.length > 0 && (
                      <span className="text-xs font-normal opacity-70">
                        · {includedInBucket} selected
                      </span>
                    )}
                  </button>
                  {list.length > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => bulkSet(ids, true)}
                        className="underline hover:opacity-80"
                      >
                        Select all
                      </button>
                      <span className="opacity-40">|</span>
                      <button
                        type="button"
                        onClick={() => bulkSet(ids, false)}
                        className="underline hover:opacity-80"
                      >
                        Deselect all
                      </button>
                    </div>
                  )}
                </header>
                {isOpen && list.length > 0 && (
                  <ul className="divide-y divide-white/10 border-t border-white/10">
                    {list.map((row) => {
                      const checked = selection.has(row.comparisonId);
                      return (
                        <li
                          key={row.comparisonId}
                          className="px-4 py-2 flex items-start gap-3 hover:bg-white/5"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRow(row.comparisonId)}
                            className="mt-1 accent-sky-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm text-white/90">
                              {row.questionText || '(no question text)'}
                            </div>
                            <div className="text-xs text-white/50 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                              {row.dctFileName && <span>File: {row.dctFileName}</span>}
                              {row.peerGroupLabel && <span>Peer: {row.peerGroupLabel}</span>}
                              {row.mlfLabel && <span>MLF: {row.mlfLabel}</span>}
                              {row.specialtyLabel && (
                                <span>Specialty: {row.specialtyLabel}</span>
                              )}
                              {row.references && row.references.length > 0 && (
                                <span>Refs: {row.references.slice(0, 3).join(', ')}</span>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {isOpen && list.length === 0 && (
                  <div className="px-4 py-3 text-xs text-white/50 border-t border-white/10">
                    No rows in this bucket.
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10">
          <div className="text-xs text-white/60">
            {selectedCount} of {rows.length} selected
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onCancel} disabled={running}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => onConfirm(new Set(selection))}
              disabled={selectedCount === 0 || running}
            >
              {running ? 'Running…' : actionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
