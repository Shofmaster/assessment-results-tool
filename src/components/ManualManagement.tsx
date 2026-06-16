import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FiBook, FiPlus, FiChevronDown, FiChevronUp, FiX,
  FiSend, FiCheck, FiXCircle, FiClock, FiEdit2,
  FiTrash2, FiRefreshCw, FiAlertCircle, FiFilter, FiUpload,
  FiUser, FiFileText, FiFolder, FiDownload, FiLink2,
} from 'react-icons/fi';
import { useConvex } from 'convex/react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard, Badge } from './ui';
import {
  useIsAerogapEmployee,
  useManualRevisions, useManualChangeLogs,
  useCreateManual, useRemoveManual,
  useCreateManualRevision, useSubmitManualRevision, useResolveManualRevision,
  useUpdateManualRevision, useRemoveManualRevision,
  useAddManualChangeLog, useRemoveManualChangeLog,
  useCurrentDbUser,
  useAddDocument, useDefaultClaudeModel, useGenerateUploadUrl,
  useManualRevisionLinksByManual, useUpsertManualRevisionLinks,
} from '../hooks/useConvexData';
import { useQuery } from '../hooks/useConvexQueryNoThrow';
import { api } from '../../convex/_generated/api';
import { DocumentExtractor } from '../services/documentExtractor';
import ManualFileViewer from './ManualFileViewer';
import { prepareManualDownload } from '../services/manualStamping';

// Manual type definitions (shared with ManualWriter)
const MANUAL_TYPES = [
  { id: 'part-145-manual', label: 'Part 145 RSM', color: 'text-blue-400', bg: 'bg-blue-500/20' },
  { id: 'gmm', label: 'GMM', color: 'text-green-400', bg: 'bg-green-500/20' },
  { id: 'qcm', label: 'QCM', color: 'text-orange-400', bg: 'bg-orange-500/20' },
  { id: 'training-program', label: 'Training Manual', color: 'text-teal-400', bg: 'bg-teal-500/20' },
  { id: 'part-135-manual', label: 'Part 135 Ops', color: 'text-purple-400', bg: 'bg-purple-500/20' },
  { id: 'sms-manual', label: 'SMS Manual', color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
  { id: 'ops-specs', label: 'Ops Specs', color: 'text-amber-400', bg: 'bg-amber-500/20' },
  { id: 'ipm', label: 'IPM', color: 'text-pink-400', bg: 'bg-pink-500/20' },
  { id: 'hazmat-manual', label: 'Hazmat Manual', color: 'text-yellow-400', bg: 'bg-yellow-500/20' },
  { id: 'tool-calibration', label: 'Tool Calibration', color: 'text-violet-400', bg: 'bg-violet-500/20' },
] as const;

type ManualTypeId = typeof MANUAL_TYPES[number]['id'];

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'warning' | 'success' | 'info' | 'destructive'; icon: typeof FiClock }> = {
  draft:             { label: 'Draft',              variant: 'default',     icon: FiEdit2 },
  in_review:         { label: 'In Review',          variant: 'warning',     icon: FiClock },
  approved:          { label: 'Approved',           variant: 'success',     icon: FiCheck },
  published:         { label: 'Published',          variant: 'info',        icon: FiBook },
  submitted:         { label: 'Submitted',          variant: 'warning',     icon: FiSend },
  customer_reviewing:{ label: 'Customer Reviewing', variant: 'warning',     icon: FiClock },
  customer_approved: { label: 'Approved',           variant: 'success',     icon: FiCheck },
  customer_rejected: { label: 'Rejected',           variant: 'destructive', icon: FiXCircle },
  superseded:        { label: 'Superseded',         variant: 'default',     icon: FiRefreshCw },
};

const CHANGE_TYPES = [
  { id: 'added', label: 'Added', color: 'text-green-400' },
  { id: 'modified', label: 'Modified', color: 'text-amber-400' },
  { id: 'deleted', label: 'Deleted', color: 'text-red-400' },
  { id: 'admin_change', label: 'Admin Note', color: 'text-sky-400' },
];

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return iso; }
}

function getManualTypeInfo(id: string) {
  return MANUAL_TYPES.find((t) => t.id === id) || { id, label: id, color: 'text-white/70', bg: 'bg-white/10' };
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

function inferManualTypeFromFileName(fileName: string): ManualTypeId | null {
  const lower = fileName.toLowerCase();
  if (/\b(145|part[\s-]*145|repair[\s-]*station|rsm)\b/.test(lower)) return 'part-145-manual';
  if (/\b(gmm|general[\s-]*maintenance)\b/.test(lower)) return 'gmm';
  if (/\b(qcm|quality[\s-]*control|qc[\s-]*manual)\b/.test(lower)) return 'qcm';
  if (/\b(training|training[\s-]*program)\b/.test(lower)) return 'training-program';
  if (/\b(135|part[\s-]*135)\b/.test(lower)) return 'part-135-manual';
  if (/\b(sms|safety[\s-]*management)\b/.test(lower)) return 'sms-manual';
  if (/\b(ops[\s-]*specs?|operations[\s-]*specifications?)\b/.test(lower)) return 'ops-specs';
  if (/\b(ipm|inspection[\s-]*procedures?)\b/.test(lower)) return 'ipm';
  if (/\b(hazmat|hazardous[\s-]*materials?)\b/.test(lower)) return 'hazmat-manual';
  if (/\b(calibration|tool[\s-]*control)\b/.test(lower)) return 'tool-calibration';
  return null;
}

function detectRevisionFromFileName(fileName: string): string {
  const base = stripFileExtension(fileName);
  const patterns = [
    /\b(rev(?:ision)?)[\s._-]*([a-z0-9]+)/i,
    /\b(issue|version|ver|amendment|amdt|change|chg)[\s._-]*([a-z0-9]+)/i,
    /\b(20\d{2})\b/,
  ];
  for (const p of patterns) {
    const match = base.match(p);
    if (!match) continue;
    if (match[2]) return `${match[1]} ${match[2]}`.trim();
    return match[1];
  }
  return 'No revision detected';
}

// --- Sub-components ---

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] || { label: status, variant: 'default' as const, icon: FiAlertCircle };
  const Icon = cfg.icon;
  return (
    <Badge variant={cfg.variant} pill className="gap-1 inline-flex items-center">
      <Icon className="text-[10px]" />
      {cfg.label}
    </Badge>
  );
}

// --- Change Log Table ---
function ChangeLogTable({
  revisionId, manualId, canEdit,
}: { revisionId: string; manualId: string; canEdit: boolean }) {
  const logs = useManualChangeLogs(revisionId) as any[] | undefined;
  const addLog = useAddManualChangeLog();
  const removeLog = useRemoveManualChangeLog();

  const [showForm, setShowForm] = useState(false);
  const [section, setSection] = useState('');
  const [description, setDescription] = useState('');
  const [changeType, setChangeType] = useState('modified');
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!section.trim() || !description.trim()) { toast.error('Section and description are required'); return; }
    setSaving(true);
    try {
      await addLog({ manualId: manualId as any, revisionId: revisionId as any, section, description, changeType });
      setSection(''); setDescription(''); setChangeType('modified'); setShowForm(false);
      toast.success('Change log entry added');
    } catch (e: any) { toast.error(e.message || 'Failed to add entry'); }
    finally { setSaving(false); }
  };

  if (!logs) return <div className="text-white/40 text-xs py-2">Loading change log…</div>;

  return (
    <div className="space-y-2">
      {logs.length === 0 ? (
        <p className="text-white/40 text-xs italic">No change log entries yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-white/40 border-b border-white/10">
                <th className="text-left py-1.5 pr-3 font-medium">Section</th>
                <th className="text-left py-1.5 pr-3 font-medium">Type</th>
                <th className="text-left py-1.5 pr-3 font-medium">Description</th>
                <th className="text-left py-1.5 pr-3 font-medium">Author</th>
                <th className="text-left py-1.5 pr-3 font-medium">Date</th>
                {canEdit && <th className="w-6" />}
              </tr>
            </thead>
            <tbody>
              {logs.map((log: any) => {
                const ct = CHANGE_TYPES.find((t) => t.id === log.changeType);
                return (
                  <tr key={log._id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-1.5 pr-3 text-white/80 font-medium">{log.section}</td>
                    <td className="py-1.5 pr-3">
                      <span className={ct?.color || 'text-white/60'}>{ct?.label || log.changeType}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-white/70 max-w-xs">{log.description}</td>
                    <td className="py-1.5 pr-3 text-white/50">{log.authorName || log.authorId}</td>
                    <td className="py-1.5 pr-3 text-white/40">{formatDate(log.createdAt)}</td>
                    {canEdit && (
                      <td className="py-1.5">
                        {log.changeType !== 'admin_change' && (
                          <button
                            type="button"
                            onClick={() => removeLog({ logId: log._id }).then(() => toast.success('Entry removed'))}
                            className="text-white/30 hover:text-red-400 transition-colors p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 active:scale-[0.95]"
                            title="Remove entry"
                          >
                            <FiTrash2 className="text-xs" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="pt-1">
          {!showForm ? (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 text-xs text-sky-lighter/70 hover:text-sky-lighter transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 active:scale-[0.98]"
            >
              <FiPlus className="text-xs" /> Add entry
            </button>
          ) : (
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 space-y-2 mt-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text" value={section} onChange={(e) => setSection(e.target.value)}
                  placeholder="Section / area affected"
                  className="col-span-2 sm:col-span-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
                />
                <select
                  value={changeType} onChange={(e) => setChangeType(e.target.value)}
                  className="col-span-2 sm:col-span-1 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
                >
                  {CHANGE_TYPES.filter((t) => t.id !== 'admin_change').map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what changed…"
                rows={2}
                className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50 resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAdd} disabled={saving}>
                  {saving ? 'Saving…' : 'Add'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowForm(false); setSection(''); setDescription(''); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Revision Row ---
function RevisionRow({
  revision, manual, isAerogapEmp, canResolve, canEdit, isSelected, onSelect,
  onSubmit, onResolve, onSaveRevision, onDeleteRevision, projectDocuments,
}: {
  revision: any;
  manual: any;
  isAerogapEmp: boolean;
  canResolve: boolean;
  canEdit: boolean;
  isSelected: boolean;
  onSelect: (revId: string) => void;
  onSubmit: (revId: string) => void;
  onResolve: (revId: string, resolution: 'customer_approved' | 'customer_rejected') => void;
  onSaveRevision: (revId: string, changes: { revisionNumber?: string; revisionTitle?: string; sourceDocumentId?: string | null }) => Promise<void>;
  onDeleteRevision: (revId: string) => Promise<void>;
  projectDocuments: any[];
}) {
  const [open, setOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');
  const [showResolve, setShowResolve] = useState(false);
  const [editNumber, setEditNumber] = useState(revision.revisionNumber || '');
  const [editTitle, setEditTitle] = useState(revision.revisionTitle || '');
  const [selectedDocId, setSelectedDocId] = useState(revision.sourceDocumentId || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setEditNumber(revision.revisionNumber || '');
    setEditTitle(revision.revisionTitle || '');
    setSelectedDocId(revision.sourceDocumentId || '');
  }, [revision._id, revision.revisionNumber, revision.revisionTitle, revision.sourceDocumentId]);

  const canDeleteRevision = canEdit && (isAerogapEmp || !['submitted', 'customer_reviewing'].includes(revision.status));

  return (
    <div className={`border rounded-xl overflow-hidden ${isSelected ? 'border-sky/40' : 'border-white/10'}`}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); onSelect(revision._id); }}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 active:scale-[0.995]"
      >
        <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
          <span className="font-semibold text-white text-sm">{revision.revisionNumber}</span>
          {revision.revisionTitle && (
            <span className="text-white/70 text-xs px-2 py-0.5 rounded bg-white/10">{revision.revisionTitle}</span>
          )}
          <StatusBadge status={revision.status} />
          {revision.submittedAt && (
            <span className="text-white/40 text-xs">Submitted {formatDate(revision.submittedAt)}</span>
          )}
          {revision.resolvedAt && (
            <span className="text-white/40 text-xs">Resolved {formatDate(revision.resolvedAt)}</span>
          )}
          {revision.notes && (
            <span className="text-white/50 text-xs italic truncate max-w-[200px]">"{revision.notes}"</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Submit action — AeroGap only, on draft revisions */}
          {isAerogapEmp && revision.status === 'draft' && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSubmit(revision._id); }}
              className="flex items-center gap-1.5 px-3 py-1 bg-sky/20 hover:bg-sky/30 text-sky-lighter rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 active:scale-[0.98]"
              title="Submit to customer"
            >
              <FiSend className="text-xs" /> Submit
            </button>
          )}
          {/* Resolve actions — manual owner or AeroGap for submitted/customer_reviewing */}
          {canResolve && (revision.status === 'submitted' || revision.status === 'customer_reviewing') && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowResolve((v) => !v); }}
              className="flex items-center gap-1.5 px-3 py-1 bg-white/10 hover:bg-white/15 text-white/70 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.98]"
              title="Approve or reject revision"
            >
              <FiCheck className="text-xs" /> Review
            </button>
          )}
          {open ? <FiChevronUp className="text-white/40" /> : <FiChevronDown className="text-white/40" />}
        </div>
      </button>

      {/* Resolve form */}
      {showResolve && (
        <div className="px-4 pb-3 bg-white/3 border-t border-white/10 space-y-2">
          <p className="text-white/60 text-xs pt-2">Add an optional note, then approve or reject this revision:</p>
          <textarea
            value={resolveNotes} onChange={(e) => setResolveNotes(e.target.value)}
            placeholder="Notes (optional)…"
            rows={2}
            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50 resize-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { onResolve(revision._id, 'customer_approved'); setShowResolve(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-400/50 active:scale-[0.98]"
            >
              <FiCheck /> Approve
            </button>
            <button
              type="button"
              onClick={() => { onResolve(revision._id, 'customer_rejected'); setShowResolve(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 active:scale-[0.98]"
            >
              <FiXCircle /> Reject
            </button>
            <Button size="sm" variant="ghost" onClick={() => setShowResolve(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {open && (
        <div className="px-4 py-3 bg-white/3 border-t border-white/10 space-y-3">
          {canEdit && (
            <div className="p-3 rounded-lg border border-white/10 bg-black/20 space-y-2">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Revision settings</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  value={editNumber}
                  onChange={(e) => setEditNumber(e.target.value)}
                  placeholder="Revision number"
                  className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white"
                />
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="Revision name/title"
                  className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white"
                />
                <select
                  value={selectedDocId || ''}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white"
                >
                  <option value="">No linked file</option>
                  {projectDocuments.map((doc) => (
                    <option key={doc._id} value={doc._id}>{doc.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    setSaving(true);
                    try {
                      await onSaveRevision(revision._id, {
                        revisionNumber: editNumber.trim(),
                        revisionTitle: editTitle.trim(),
                        sourceDocumentId: selectedDocId || null,
                      });
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="inline-flex items-center gap-1"
                >
                  <FiLink2 className="text-xs" />
                  {saving ? 'Saving…' : 'Save Revision'}
                </Button>
                {canDeleteRevision && (
                  <button
                    type="button"
                    onClick={() => onDeleteRevision(revision._id)}
                    className="px-3 py-1.5 rounded bg-red-500/15 hover:bg-red-500/25 text-red-300 text-xs"
                  >
                    Delete revision
                  </button>
                )}
              </div>
            </div>
          )}
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Change Log</p>
          <ChangeLogTable
            revisionId={revision._id}
            manualId={manual._id}
            canEdit={canEdit}
          />
        </div>
      )}
    </div>
  );
}

// --- Manual Card ---
function ManualCard({
  manual, isAerogapEmp, currentUserId, onDeleted, projectDocuments, showOnlyMismatches,
}: {
  manual: any;
  isAerogapEmp: boolean;
  currentUserId: string;
  onDeleted: () => void;
  projectDocuments: any[];
  showOnlyMismatches?: boolean;
}) {
  const convex = useConvex();
  const [expanded, setExpanded] = useState(false);
  const [showNewRevForm, setShowNewRevForm] = useState(false);
  const [newRevNumber, setNewRevNumber] = useState('');
  const [newRevTitle, setNewRevTitle] = useState('');
  const [newRevNotes, setNewRevNotes] = useState('');
  const [newRevSourceDocId, setNewRevSourceDocId] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>('');
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [stampUncontrolledCopy, setStampUncontrolledCopy] = useState(true);

  const revisions = useManualRevisions(expanded ? manual._id : undefined) as any[] | undefined;
  const revisionLinks = useManualRevisionLinksByManual(expanded ? manual._id : undefined) as any[] | undefined;
  const createRevision = useCreateManualRevision();
  const submitRevision = useSubmitManualRevision();
  const resolveRevision = useResolveManualRevision();
  const updateRevision = useUpdateManualRevision();
  const removeRevision = useRemoveManualRevision();
  const removeManual = useRemoveManual();

  const typeInfo = getManualTypeInfo(manual.manualType);
  const isOwner = manual.userId === currentUserId;
  const canEdit = isAerogapEmp || isOwner;
  const mismatchRevisionIds = new Set(
    (revisionLinks || [])
      .filter((link: any) => link.comparisonStatus === 'mismatch')
      .map((link: any) => String(link.manualRevisionId))
  );
  const mismatchCount = (revisionLinks || []).filter((link: any) => link.comparisonStatus === 'mismatch').length;
  const latestSyncAt = (revisionLinks || []).reduce((latest: string | null, link: any) => {
    if (!link.lastSyncedAt) return latest;
    if (!latest) return link.lastSyncedAt;
    return link.lastSyncedAt > latest ? link.lastSyncedAt : latest;
  }, null as string | null);

  const sortedRevisions = useMemo(() => {
    const ordered = [...(revisions || [])].sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt));
    if (!showOnlyMismatches) return ordered;
    return ordered.filter((rev: any) => mismatchRevisionIds.has(String(rev._id)));
  }, [revisions, showOnlyMismatches, mismatchRevisionIds]);
  const selectedRevision = useMemo(
    () => sortedRevisions.find((rev: any) => rev._id === selectedRevisionId) || sortedRevisions[0] || null,
    [sortedRevisions, selectedRevisionId],
  );
  const selectedDocument = useMemo(
    () => projectDocuments.find((doc: any) => doc._id === selectedRevision?.sourceDocumentId),
    [projectDocuments, selectedRevision?.sourceDocumentId],
  );

  useEffect(() => {
    if (!expanded || !selectedRevision) return;
    setSelectedRevisionId(selectedRevision._id);
  }, [expanded, selectedRevision?._id]);

  useEffect(() => {
    let cancelled = false;
    const loadUrl = async () => {
      setViewerUrl(null);
      if (!selectedDocument?._id) return;
      try {
        const url = await convex.query((api as any).fileActions.getProjectDocumentFileUrl, { documentId: selectedDocument._id });
        if (!cancelled) setViewerUrl(url || null);
      } catch {
        if (!cancelled) setViewerUrl(null);
      }
    };
    void loadUrl();
    return () => { cancelled = true; };
  }, [convex, selectedDocument?._id]);

  const handleSubmitRevision = async (revId: string) => {
    try {
      await submitRevision({ revisionId: revId as any, manualId: manual._id });
      toast.success('Revision submitted to customer');
    } catch (e: any) { toast.error(e.message || 'Failed to submit'); }
  };

  const handleResolveRevision = async (revId: string, resolution: 'customer_approved' | 'customer_rejected') => {
    try {
      await resolveRevision({ revisionId: revId as any, manualId: manual._id, resolution });
      toast.success(resolution === 'customer_approved' ? 'Revision approved' : 'Revision rejected');
    } catch (e: any) { toast.error(e.message || 'Failed to resolve'); }
  };

  const handleNewRevision = async () => {
    if (!newRevNumber.trim()) { toast.error('Revision number is required'); return; }
    setSaving(true);
    try {
      await createRevision({
        manualId: manual._id,
        revisionNumber: newRevNumber.trim(),
        revisionTitle: newRevTitle.trim() || undefined,
        sourceDocumentId: newRevSourceDocId || undefined,
        notes: newRevNotes.trim() || undefined,
      });
      setNewRevNumber('');
      setNewRevTitle('');
      setNewRevNotes('');
      setNewRevSourceDocId('');
      setShowNewRevForm(false);
      toast.success(`${newRevNumber} created`);
    } catch (e: any) { toast.error(e.message || 'Failed to create revision'); }
    finally { setSaving(false); }
  };

  const handleSaveRevision = async (revisionId: string, changes: { revisionNumber?: string; revisionTitle?: string; sourceDocumentId?: string | null }) => {
    try {
      await updateRevision({
        revisionId: revisionId as any,
        revisionNumber: changes.revisionNumber || undefined,
        revisionTitle: changes.revisionTitle || undefined,
        sourceDocumentId: changes.sourceDocumentId === null ? null : changes.sourceDocumentId || undefined,
      } as any);
      toast.success('Revision updated');
    } catch (e: any) {
      toast.error(e.message || 'Failed to update revision');
    }
  };

  const handleDeleteRevision = async (revisionId: string) => {
    if (!window.confirm('Delete this revision? Change logs under it will also be removed.')) return;
    try {
      await removeRevision({ revisionId: revisionId as any });
      toast.success('Revision deleted');
      if (selectedRevisionId === revisionId) setSelectedRevisionId('');
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete revision');
    }
  };

  const handleDownloadManual = async () => {
    if (!viewerUrl || !selectedDocument) {
      toast.error('Select a revision with a linked file first');
      return;
    }
    setDownloading(true);
    try {
      const prepared = await prepareManualDownload({
        fileUrl: viewerUrl,
        fileName: selectedDocument.name || `${manual.title}.pdf`,
        mimeType: selectedDocument.mimeType,
        stampUncontrolledCopy,
      });
      const downloadUrl = URL.createObjectURL(prepared.blob);
      const anchor = document.createElement('a');
      anchor.href = downloadUrl;
      anchor.download = prepared.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(downloadUrl);
      for (const warning of prepared.warnings) toast.warning(warning);
      toast.success('Manual download started');
    } catch (e: any) {
      toast.error(e.message || 'Failed to download manual');
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${manual.title}"? This cannot be undone.`)) return;
    try {
      await removeManual({ manualId: manual._id });
      toast.success('Manual deleted');
      onDeleted();
    } catch (e: any) { toast.error(e.message || 'Failed to delete'); }
  };

  return (
    <GlassCard padding="none" border className="overflow-hidden">
      {/* Card header */}
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${typeInfo.bg} ${typeInfo.color}`}>
              <FiFileText className="text-[10px]" />
              {typeInfo.label}
            </span>
            <StatusBadge status={manual.status} />
            <span className="text-white/40 text-xs font-mono">{manual.currentRevision}</span>
          </div>
          <h3 className="text-white font-semibold text-sm truncate">{manual.title}</h3>
          <p className="text-white/40 text-xs mt-0.5">Updated {formatDate(manual.updatedAt)}</p>
          {mismatchCount > 0 && (
            <p className="text-amber-300 text-xs mt-0.5">
              {mismatchCount} revision mismatch{mismatchCount !== 1 ? 'es' : ''}
            </p>
          )}
          {latestSyncAt && (
            <p className="text-white/30 text-xs mt-0.5">
              Revision sync: {new Date(latestSyncAt).toLocaleDateString()}
            </p>
          )}
          {isAerogapEmp && manual.ownerName && (
            <p className="text-white/30 text-xs mt-0.5 flex items-center gap-1">
              <FiUser className="text-[10px]" />
              {manual.ownerName}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isAerogapEmp && (
            <button
              type="button"
              onClick={() => { setShowNewRevForm((v) => !v); setExpanded(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky/10 hover:bg-sky/20 text-sky-lighter rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 active:scale-[0.98]"
              title="New revision"
            >
              <FiPlus className="text-xs" /> New Rev
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 rounded-xl text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.98]"
            title={expanded ? 'Collapse' : 'View revisions'}
          >
            <FiBook className="text-xs" />
            {expanded ? 'Collapse' : 'Revisions'}
            {expanded ? <FiChevronUp className="text-xs" /> : <FiChevronDown className="text-xs" />}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              className="p-1.5 text-white/30 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 active:scale-[0.95]"
              title="Delete manual"
            >
              <FiTrash2 className="text-sm" />
            </button>
          )}
        </div>
      </div>

      {/* New Revision form */}
      {showNewRevForm && (
        <div className="mx-4 mb-3 p-3 bg-sky/5 border border-sky/20 rounded-xl space-y-2">
          <p className="text-sky-lighter text-xs font-semibold">Create New Revision</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text" value={newRevNumber} onChange={(e) => setNewRevNumber(e.target.value)}
              placeholder="e.g. Rev 2"
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
            />
            <input
              type="text" value={newRevTitle} onChange={(e) => setNewRevTitle(e.target.value)}
              placeholder="Revision name (optional)"
              className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
            />
          </div>
          <input
            type="text" value={newRevNotes} onChange={(e) => setNewRevNotes(e.target.value)}
            placeholder="Brief notes (optional)"
            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white placeholder-white/30 focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
          />
          <select
            value={newRevSourceDocId}
            onChange={(e) => setNewRevSourceDocId(e.target.value)}
            className="w-full px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
          >
            <option value="">No linked file</option>
            {projectDocuments.map((doc: any) => (
              <option key={doc._id} value={doc._id}>{doc.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleNewRevision} disabled={saving}>
              {saving ? 'Creating…' : 'Create'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowNewRevForm(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Revision history */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-white/10 pt-3">
          <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Revision History</p>
          {!revisions ? (
            <div className="text-white/40 text-xs">Loading…</div>
          ) : sortedRevisions.length === 0 ? (
            <p className="text-white/40 text-xs italic">
              {showOnlyMismatches ? 'No mismatches for this manual.' : 'No revisions yet.'}
            </p>
          ) : (
            <div className="space-y-2">
              {sortedRevisions.map((rev: any) => (
                <RevisionRow
                  key={rev._id}
                  revision={rev}
                  manual={manual}
                  isAerogapEmp={isAerogapEmp}
                  canEdit={canEdit}
                  isSelected={selectedRevision?._id === rev._id}
                  onSelect={setSelectedRevisionId}
                  canResolve={isOwner || isAerogapEmp}
                  onSubmit={handleSubmitRevision}
                  onResolve={handleResolveRevision}
                  onSaveRevision={handleSaveRevision}
                  onDeleteRevision={handleDeleteRevision}
                  projectDocuments={projectDocuments}
                />
              ))}
            </div>
          )}
          <div className="pt-3 border-t border-white/10 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider">Manual file viewer</p>
              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs text-white/60">
                  <input
                    type="checkbox"
                    checked={stampUncontrolledCopy}
                    onChange={(e) => setStampUncontrolledCopy(e.target.checked)}
                  />
                  Stamp as Uncontrolled Copy
                </label>
                <button
                  type="button"
                  disabled={!selectedDocument || downloading}
                  onClick={handleDownloadManual}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky/20 hover:bg-sky/30 disabled:opacity-50 disabled:cursor-not-allowed text-sky-lighter rounded-lg text-xs"
                >
                  <FiDownload className="text-xs" />
                  {downloading ? 'Preparing…' : 'Download Manual'}
                </button>
              </div>
            </div>
            <ManualFileViewer
              fileUrl={viewerUrl}
              fileName={selectedDocument?.name || `${manual.title}.pdf`}
              mimeType={selectedDocument?.mimeType}
              extractedText={selectedDocument?.extractedText}
            />
          </div>
        </div>
      )}
    </GlassCard>
  );
}

// --- New Manual Modal ---
function NewManualModal({
  projectId, onClose, onCreate,
}: { projectId: string; onClose: () => void; onCreate: () => void }) {
  const [manualType, setManualType] = useState<string>(MANUAL_TYPES[0].id);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const createManual = useCreateManual();
  const upsertManualRevisionLinks = useUpsertManualRevisionLinks();
  const location = useLocation();

  const handleCreate = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      await createManual({ projectId: projectId as any, manualType, title: title.trim() });
      toast.success('Manual created');
      onCreate();
      onClose();
    } catch (e: any) { toast.error(e.message || 'Failed to create manual'); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <GlassCard border padding="md" className="w-full max-w-md relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.95]"
        >
          <FiX />
        </button>
        <h2 className="text-white font-bold text-lg mb-4">Create New Manual</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-white/60 text-xs mb-1">Manual Type</label>
            <select
              value={manualType}
              onChange={(e) => setManualType(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
            >
              {MANUAL_TYPES.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-white/60 text-xs mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Acme Air Part 145 Repair Station Manual"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <Button onClick={handleCreate} disabled={saving} className="flex-1">
            {saving ? 'Creating…' : 'Create Manual'}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
        </div>
      </GlassCard>
    </div>
  );
}

// --- Main Component ---
export default function ManualManagement() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);

  const isAerogapEmp = useIsAerogapEmployee();
  const currentUser = useCurrentDbUser() as any;
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const defaultModel = useDefaultClaudeModel();
  const addDocument = useAddDocument();
  const generateUploadUrl = useGenerateUploadUrl();
  const createManual = useCreateManual();
  const upsertManualRevisionLinks = useUpsertManualRevisionLinks();
  const location = useLocation();

  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [customerFilter, setCustomerFilter] = useState<string>('all');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showExistingDocsModal, setShowExistingDocsModal] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ completed: number; total: number } | null>(null);

  // For employees — load all manuals; for customers — load by project
  const allManualsRaw = useQuery(
    isAerogapEmp ? (api as any).manuals.listAllForEmployee : (api as any).manuals.listByProject,
    isAerogapEmp ? {} : activeProjectId ? { projectId: activeProjectId as any } : 'skip'
  ) as any[] | undefined;

  // All project documents (for the "use existing" picker)
  const projectDocuments = useQuery(
    api.documents.listByProject,
    activeProjectId ? { projectId: activeProjectId as any } : 'skip'
  ) as any[] | undefined;

  const handleRegisterExistingDocument = async (doc: any) => {
    if (!activeProjectId) return;
    // Detect manual type from doc name
    const lower = (doc.name || '').toLowerCase();
    let detectedType: string = 'part-145-manual';
    for (const mt of MANUAL_TYPES) {
      if (lower.includes(mt.id) || lower.includes(mt.label.toLowerCase())) {
        detectedType = mt.id;
        break;
      }
    }
    try {
      await createManual({
        projectId: activeProjectId as any,
        manualType: detectedType as any,
        title: doc.name || 'Untitled Document',
      });
      toast.success(`"${doc.name}" added to Manual Management`);
      setShowExistingDocsModal(false);
    } catch (err: any) {
      toast.error('Failed to register document', { description: err.message });
    }
  };

  const handleUploadCurrentManuals = () => {
    if (!activeProjectId || isUploading) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/gif,image/webp';
    input.onchange = async (e) => {
      const rawFiles = Array.from((e.target as HTMLInputElement).files || []);
      const folders = rawFiles.filter((f) => f.size === 0 && f.type === '');
      const files = rawFiles.filter((f) => !(f.size === 0 && f.type === ''));
      if (folders.length > 0) {
        toast.warning(
          `${folders.length} folder${folders.length !== 1 ? 's' : ''} skipped — please select individual files, not folders.`
        );
      }
      if (files.length === 0) return;

      setIsUploading(true);
      setUploadProgress({ completed: 0, total: files.length });

      const extractor = new DocumentExtractor();
      let successCount = 0;
      let createdManualCount = 0;
      const existingManualKeys = new Set(
        (allManualsRaw || [])
          .map((m: any) => `${String(m.manualType).toLowerCase()}::${String(m.title).trim().toLowerCase()}`)
      );

      try {
        for (let idx = 0; idx < files.length; idx += 1) {
          const file = files[idx];
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
            // Storage upload is best-effort; extraction and metadata save can still proceed.
          }

          try {
            const buffer = await file.arrayBuffer();
            const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, defaultModel);
            extractedText = extracted.text;
            extractionMeta = extracted.metadata;
          } catch (err: any) {
            toast.warning(`Could not extract text from ${file.name}`, { description: err?.message });
          }

          try {
            const sourceDocumentId = await addDocument({
              projectId: activeProjectId as any,
              category: 'entity',
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
            successCount += 1;
            await upsertManualRevisionLinks({
              projectId: activeProjectId as any,
              scannedRevisions: [{
                sourceDocumentId,
                documentName: file.name,
                detectedRevision: detectRevisionFromFileName(file.name),
              }],
            } as any);

            const inferredType = inferManualTypeFromFileName(file.name);
            if (inferredType) {
              const inferredTitle = stripFileExtension(file.name).trim();
              const dedupeKey = `${inferredType.toLowerCase()}::${inferredTitle.toLowerCase()}`;
              if (inferredTitle && !existingManualKeys.has(dedupeKey)) {
                try {
                  await createManual({
                    projectId: activeProjectId as any,
                    manualType: inferredType,
                    title: inferredTitle,
                  } as any);
                  await upsertManualRevisionLinks({
                    projectId: activeProjectId as any,
                    scannedRevisions: [{
                      sourceDocumentId,
                      documentName: file.name,
                      detectedRevision: detectRevisionFromFileName(file.name),
                    }],
                  } as any);
                  existingManualKeys.add(dedupeKey);
                  createdManualCount += 1;
                } catch {
                  toast.warning(`Uploaded ${file.name}, but could not add it to Manual Management.`);
                }
              }
            }
          } catch (err: any) {
            toast.error(`Failed to save ${file.name}`, { description: err?.message || 'Please try again.' });
          } finally {
            setUploadProgress({ completed: idx + 1, total: files.length });
          }
        }
      } finally {
        setIsUploading(false);
      }

      if (successCount > 0) {
        toast.success(
          `Uploaded ${successCount} current manual${successCount !== 1 ? 's' : ''} to project documents`
        );
        if (createdManualCount > 0) {
          toast.success(
            `Added ${createdManualCount} uploaded file${createdManualCount !== 1 ? 's' : ''} to Manual Management`
          );
        }
      }
      if (successCount !== files.length) {
        toast.warning(`${files.length - successCount} file${files.length - successCount !== 1 ? 's' : ''} failed`);
      }
      setUploadProgress(null);
    };
    input.click();
  };

  // Derive unique customer list from the manuals data (employee view only)
  const customerOptions = isAerogapEmp
    ? (() => {
        const seen = new Set<string>();
        const opts: { userId: string; label: string }[] = [];
        for (const m of allManualsRaw || []) {
          if (!seen.has(m.userId)) {
            seen.add(m.userId);
            opts.push({ userId: m.userId, label: m.ownerName || m.ownerEmail || m.userId });
          }
        }
        return opts.sort((a, b) => a.label.localeCompare(b.label));
      })()
    : [];

  const manuals = (allManualsRaw || []).filter((m: any) => {
    if (typeFilter !== 'all' && m.manualType !== typeFilter) return false;
    if (statusFilter !== 'all' && m.status !== statusFilter) return false;
    if (isAerogapEmp && customerFilter !== 'all' && m.userId !== customerFilter) return false;
    return true;
  });

  const pendingCount = (allManualsRaw || []).filter((m: any) => m.status === 'in_review').length;
  const approvedCount = (allManualsRaw || []).filter((m: any) => m.status === 'approved' || m.status === 'published').length;
  const mismatchOnly = new URLSearchParams(location.search).get('revisionMismatches') === '1';

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 space-y-6 h-full min-h-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Manual Management</h1>
          <p className="text-white/50 text-sm mt-1">
            Track revisions, manage customer exchanges, and maintain change logs.
          </p>
        </div>
        {(isAerogapEmp || activeProjectId) && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setShowExistingDocsModal(true)}
              disabled={!activeProjectId}
              className="flex items-center gap-2 flex-shrink-0"
              title="Register a document already uploaded to this project as a manual"
            >
              <FiFolder />
              From Existing Docs
            </Button>
            <Button
              variant="secondary"
              onClick={handleUploadCurrentManuals}
              disabled={!activeProjectId || isUploading}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <FiUpload />
              {isUploading ? 'Uploading…' : 'Upload Current Manuals'}
            </Button>
            <Button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-2 flex-shrink-0"
            >
              <FiPlus /> New Manual
            </Button>
          </div>
        )}
      </div>

      {uploadProgress && (
        <div className="text-white/60 text-xs">
          Uploading manuals: {uploadProgress.completed}/{uploadProgress.total}
        </div>
      )}

      {/* Summary pills */}
      {allManualsRaw && allManualsRaw.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-xl text-xs text-white/60">
            <FiBook className="text-sky-lighter" />
            <span><span className="text-white font-semibold">{allManualsRaw.length}</span> total</span>
          </div>
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 rounded-xl text-xs text-amber-400">
              <FiClock />
              <span><span className="font-semibold">{pendingCount}</span> pending review</span>
            </div>
          )}
          {approvedCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 rounded-xl text-xs text-green-400">
              <FiCheck />
              <span><span className="font-semibold">{approvedCount}</span> approved</span>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <FiFilter className="text-white/40 text-sm flex-shrink-0" />
        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
        >
          <option value="all">All Types</option>
          {MANUAL_TYPES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="in_review">In Review</option>
          <option value="approved">Approved</option>
          <option value="published">Published</option>
        </select>
        {/* Customer filter (employees only) */}
        {isAerogapEmp && customerOptions.length > 0 && (
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-light/50 focus-visible:ring-2 focus-visible:ring-sky-lighter/50"
          >
            <option value="all">All Customers</option>
            {customerOptions.map((opt) => (
              <option key={opt.userId} value={opt.userId}>{opt.label}</option>
            ))}
          </select>
        )}
        {(typeFilter !== 'all' || statusFilter !== 'all' || customerFilter !== 'all') && (
          <button
            type="button"
            onClick={() => { setTypeFilter('all'); setStatusFilter('all'); setCustomerFilter('all'); }}
            className="text-xs text-white/40 hover:text-white/70 transition-colors flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 active:scale-[0.98]"
          >
            <FiX className="text-xs" /> Clear filters
          </button>
        )}
      </div>

      {/* Manual list */}
      {!allManualsRaw ? (
        <div className="text-white/40 text-sm text-center py-12">Loading manuals…</div>
      ) : manuals.length === 0 ? (
        <GlassCard border padding="lg" className="text-center">
          <FiBook className="text-white/20 text-4xl mx-auto mb-3" />
          <p className="text-white/50 text-sm">
            {allManualsRaw.length === 0
              ? 'No manuals yet. Create one to start tracking revisions.'
              : 'No manuals match the current filters.'}
          </p>
          {allManualsRaw.length === 0 && (isAerogapEmp || activeProjectId) && (
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="mt-3 text-sky-lighter text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-lighter/50 rounded"
            >
              Create your first manual →
            </button>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-3" key={refreshKey}>
          {manuals.map((manual: any) => (
            <ManualCard
              key={manual._id}
              manual={manual}
              isAerogapEmp={isAerogapEmp}
              currentUserId={currentUser?.clerkUserId || ''}
              onDeleted={() => setRefreshKey((k) => k + 1)}
              projectDocuments={projectDocuments || []}
              showOnlyMismatches={mismatchOnly}
            />
          ))}
        </div>
      )}

      {/* New Manual Modal */}
      {showNewModal && activeProjectId && (
        <NewManualModal
          projectId={activeProjectId}
          onClose={() => setShowNewModal(false)}
          onCreate={() => setRefreshKey((k) => k + 1)}
        />
      )}
      {showNewModal && !activeProjectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <GlassCard border padding="md" className="w-full max-w-sm text-center">
            <FiAlertCircle className="text-amber-400 text-3xl mx-auto mb-3" />
            <p className="text-white/70 text-sm mb-4">Please select a project before creating a manual.</p>
            <Button onClick={() => setShowNewModal(false)}>OK</Button>
          </GlassCard>
        </div>
      )}

      {/* Existing Documents Picker Modal */}
      {showExistingDocsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <GlassCard border padding="md" className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Register from existing documents</h2>
              <button
                type="button"
                onClick={() => setShowExistingDocsModal(false)}
                className="text-white/40 hover:text-white transition-colors"
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>
            <p className="text-sm text-white/60 mb-4">
              Select a document already uploaded to this project to register it in Manual Management without re-uploading.
            </p>
            {!activeProjectId ? (
              <p className="text-sm text-amber-300">Please select a project first.</p>
            ) : !projectDocuments ? (
              <p className="text-sm text-white/50">Loading documents…</p>
            ) : projectDocuments.length === 0 ? (
              <p className="text-sm text-white/50">No documents found in this project. Upload documents first.</p>
            ) : (
              <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {projectDocuments.map((doc: any) => (
                  <li key={doc._id}>
                    <button
                      type="button"
                      onClick={() => handleRegisterExistingDocument(doc)}
                      className="w-full flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2.5 text-left transition-colors"
                    >
                      <FiFileText className="text-sky-lighter shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white truncate">{doc.name || 'Untitled'}</div>
                        <div className="text-xs text-white/50">{doc.category || 'document'} · {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : ''}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" onClick={() => setShowExistingDocsModal(false)}>Cancel</Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
