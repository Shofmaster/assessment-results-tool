import { useEffect, useMemo, useState } from 'react';
import { FiX, FiCheck } from 'react-icons/fi';
import {
  KNOWN_REFERENCE_DOC_TYPES,
  getKnownReferenceDocTypeLabel,
  type SortablePublicationType,
  type KnownReferenceDocType,
} from '../services/documentTypeResolver';
import type {
  LibraryClassification,
  ClassificationConfidence,
} from '../services/driveFileClassifier';
import { PUBLICATION_TYPE_TO_CATEGORY } from '../services/driveFileClassifier';

export interface DriveReviewItem {
  /** Path relative to the linked folder — unique key and resolver lookup key. */
  relativePath: string;
  fileName: string;
  mimeType: string;
  classification: LibraryClassification;
}

interface DriveImportReviewModalProps {
  open: boolean;
  items: DriveReviewItem[];
  /** True while the confirmed batch is being committed. */
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (items: DriveReviewItem[]) => void;
}

const BUCKET_OPTIONS: { value: SortablePublicationType; label: string }[] = [
  { value: 'maintenance_manual', label: 'Maintenance manual' },
  { value: 'parts_catalog', label: 'Parts catalog (IPC)' },
  { value: 'logbook_scan', label: 'Logbook scan' },
];

const BUCKET_LABEL: Record<SortablePublicationType, string> = {
  maintenance_manual: 'Maintenance manuals',
  parts_catalog: 'Parts catalogs (IPC)',
  logbook_scan: 'Logbook scans',
};

const CONFIDENCE_STYLE: Record<ClassificationConfidence, string> = {
  high: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-400/30',
  low: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
};

const SIGNAL_LABEL: Record<LibraryClassification['signal'], string> = {
  filename: 'name',
  content: 'content',
  fallback: 'unsure',
};

export function DriveImportReviewModal({
  open,
  items,
  busy,
  onCancel,
  onConfirm,
}: DriveImportReviewModalProps) {
  const [rows, setRows] = useState<DriveReviewItem[]>(items);

  // Reset working copy whenever a fresh batch is handed in.
  useEffect(() => {
    setRows(items);
  }, [items]);

  const lowCount = useMemo(
    () => rows.filter((r) => r.classification.confidence === 'low').length,
    [rows],
  );

  if (!open) return null;

  const setBucket = (relativePath: string, bucket: SortablePublicationType) => {
    setRows((prev) =>
      prev.map((r) =>
        r.relativePath === relativePath
          ? {
              ...r,
              classification: {
                ...r.classification,
                publicationType: bucket,
                category: PUBLICATION_TYPE_TO_CATEGORY[bucket],
                // A manual reroute is an authoritative high-confidence decision.
                confidence: 'high',
                signal: 'filename',
                reason: 'Set manually',
              },
            }
          : r,
      ),
    );
  };

  const setDocType = (relativePath: string, value: string) => {
    const docType = value === '' ? undefined : (value as KnownReferenceDocType);
    setRows((prev) =>
      prev.map((r) =>
        r.relativePath === relativePath
          ? { ...r, classification: { ...r.classification, documentType: docType } }
          : r,
      ),
    );
  };

  // Stable display order: group rows by their current routing bucket.
  const buckets: SortablePublicationType[] = ['maintenance_manual', 'parts_catalog', 'logbook_scan'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-white/15 bg-navy-900/95 backdrop-blur shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h3 className="text-lg font-display font-bold">Review {rows.length} file{rows.length === 1 ? '' : 's'} before filing</h3>
            <p className="text-xs text-white/55 mt-0.5">
              Each file was sorted into a Library bucket. Adjust any that look wrong, then file them.
              {lowCount > 0 ? (
                <span className="text-rose-300"> {lowCount} need{lowCount === 1 ? 's' : ''} a look.</span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            className="p-1.5 text-white/60 hover:text-white"
            onClick={onCancel}
            aria-label="Close"
          >
            <FiX />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {buckets.map((bucket) => {
            const group = rows.filter((r) => r.classification.publicationType === bucket);
            if (!group.length) return null;
            return (
              <div key={bucket}>
                <div className="text-xs font-semibold uppercase tracking-wide text-sky-light/80 mb-2">
                  {BUCKET_LABEL[bucket]} · {group.length}
                </div>
                <div className="space-y-2">
                  {group.map((r) => {
                    const c = r.classification;
                    return (
                      <div
                        key={r.relativePath}
                        className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm text-white/90 truncate" title={r.relativePath}>
                              {r.fileName}
                            </div>
                            <div className="text-[11px] text-white/45 truncate" title={c.reason}>
                              {c.reason}
                            </div>
                          </div>
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${CONFIDENCE_STYLE[c.confidence]}`}
                            title={`${c.confidence} confidence (${SIGNAL_LABEL[c.signal]})`}
                          >
                            {c.confidence} · {SIGNAL_LABEL[c.signal]}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                          <label className="block">
                            <span className="block text-[10px] text-white/50 mb-1">Library bucket</span>
                            <select
                              className="w-full rounded-lg border border-white/15 bg-navy-900/80 px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:border-sky-light/50"
                              value={c.publicationType}
                              onChange={(e) => setBucket(r.relativePath, e.target.value as SortablePublicationType)}
                            >
                              {BUCKET_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="block text-[10px] text-white/50 mb-1">Detected type (optional)</span>
                            <select
                              className="w-full rounded-lg border border-white/15 bg-navy-900/80 px-2 py-1.5 text-xs text-white/90 focus:outline-none focus:border-sky-light/50"
                              value={c.documentType ?? ''}
                              onChange={(e) => setDocType(r.relativePath, e.target.value)}
                            >
                              <option value="">— none —</option>
                              {KNOWN_REFERENCE_DOC_TYPES.map((t) => (
                                <option key={t} value={t}>{getKnownReferenceDocTypeLabel(t)}</option>
                              ))}
                            </select>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-white/10">
          <button
            type="button"
            className="px-3 py-1.5 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5 disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium bg-sky text-navy-900 hover:bg-sky-light disabled:opacity-50"
            onClick={() => onConfirm(rows)}
            disabled={busy || rows.length === 0}
          >
            <FiCheck /> {busy ? 'Filing…' : `File ${rows.length} file${rows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
