import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiPlus, FiTrash2, FiAlertTriangle, FiChevronDown, FiChevronUp,
  FiCpu, FiX, FiCheckCircle, FiClock, FiLoader,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import {
  useEntityIssues,
  useAddEntityIssue,
  useUpdateEntityIssue,
  useRemoveEntityIssue,
  useAssessments,
  useDefaultClaudeModel,
} from '../hooks/useConvexData';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard, Select, Badge } from './ui';
import { createClaudeMessageStream } from '../services/claudeProxy';

type EntityIssueSource = 'audit_sim' | 'paperwork_review' | 'analysis' | 'manual';
type EntityIssueSeverity = 'critical' | 'major' | 'minor' | 'observation';
type CARStatus = 'open' | 'in_progress' | 'pending_verification' | 'closed' | 'voided';
type RootCauseCategory = 'training' | 'procedure' | 'equipment' | 'human_error' | 'process' | 'material' | 'management';

const SOURCE_LABELS: Record<EntityIssueSource, string> = {
  audit_sim: 'Audit sim',
  paperwork_review: 'Paperwork review',
  analysis: 'Analysis',
  manual: 'Manual',
};

const SEVERITY_OPTIONS: { value: EntityIssueSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'observation', label: 'Observation' },
];

const STATUS_OPTIONS: { value: CARStatus; label: string; color: string }[] = [
  { value: 'open', label: 'Open', color: 'bg-red-500/20 text-red-300 border-red-500/30' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { value: 'pending_verification', label: 'Pending Verification', color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  { value: 'closed', label: 'Closed', color: 'bg-green-500/20 text-green-300 border-green-500/30' },
  { value: 'voided', label: 'Voided', color: 'bg-white/10 text-white/40 border-white/10' },
];

const ROOT_CAUSE_OPTIONS: { value: RootCauseCategory; label: string }[] = [
  { value: 'training', label: 'Training' },
  { value: 'procedure', label: 'Procedure / Documentation' },
  { value: 'equipment', label: 'Equipment / Tooling' },
  { value: 'human_error', label: 'Human Error' },
  { value: 'process', label: 'Process Design' },
  { value: 'material', label: 'Material / Parts' },
  { value: 'management', label: 'Management System' },
];

const STATUS_FLOW: CARStatus[] = ['open', 'in_progress', 'pending_verification', 'closed'];

function statusColor(status: CARStatus | undefined): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.color ??
    'bg-red-500/20 text-red-300 border-red-500/30';
}

function statusLabel(status: CARStatus | undefined): string {
  return STATUS_OPTIONS.find((s) => s.value === status)?.label ?? 'Open';
}

function isOverdue(dueDate: string | undefined, status: CARStatus | undefined): boolean {
  if (!dueDate || status === 'closed' || status === 'voided') return false;
  return new Date(dueDate) < new Date();
}

interface CARDrawerProps {
  issue: any;
  onClose: () => void;
  model: string;
}

function CARDrawer({ issue, onClose, model }: CARDrawerProps) {
  const updateIssue = useUpdateEntityIssue();

  const [status, setStatus] = useState<CARStatus>(issue.status ?? 'open');
  const [owner, setOwner] = useState(issue.owner ?? '');
  const [dueDate, setDueDate] = useState(issue.dueDate ?? '');
  const [rootCauseCategory, setRootCauseCategory] = useState<RootCauseCategory | ''>(issue.rootCauseCategory ?? '');
  const [rootCause, setRootCause] = useState(issue.rootCause ?? '');
  const [correctiveAction, setCorrectiveAction] = useState(issue.correctiveAction ?? '');
  const [preventiveAction, setPreventiveAction] = useState(issue.preventiveAction ?? '');
  const [evidenceOfClosure, setEvidenceOfClosure] = useState(issue.evidenceOfClosure ?? '');
  const [verifiedBy, setVerifiedBy] = useState(issue.verifiedBy ?? '');
  const [aiAnalysis, setAiAnalysis] = useState(issue.aiRootCauseAnalysis ?? '');
  const [aiStreaming, setAiStreaming] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await (updateIssue as any)({
        issueId: issue._id as any,
        status,
        owner: owner || undefined,
        dueDate: dueDate || undefined,
        rootCauseCategory: (rootCauseCategory as RootCauseCategory) || undefined,
        rootCause: rootCause || undefined,
        correctiveAction: correctiveAction || undefined,
        preventiveAction: preventiveAction || undefined,
        evidenceOfClosure: evidenceOfClosure || undefined,
        verifiedBy: verifiedBy || undefined,
        aiRootCauseAnalysis: aiAnalysis || undefined,
      });
      toast.success('CAR updated');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: CARStatus) => {
    setStatus(newStatus);
    try {
      await (updateIssue as any)({
        issueId: issue._id as any,
        status: newStatus,
        ...(newStatus === 'closed' ? { closedAt: new Date().toISOString() } : {}),
      });
      toast.success(`Status updated to ${statusLabel(newStatus)}`);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to update status');
    }
  };

  const handleAiRootCause = useCallback(async () => {
    setAiStreaming(true);
    setAiAnalysis('');
    try {
      let accumulated = '';
      await createClaudeMessageStream(
        {
          model,
          max_tokens: 600,
          system: `You are an aviation quality management expert specializing in root cause analysis for Part 145 repair stations and aviation organizations. Analyze the provided finding and suggest a concise root cause analysis following the 5-Why method. Identify the most likely root cause category and provide actionable corrective action recommendations. Keep the analysis practical and focused on systemic improvement. Respond in 3-5 paragraphs.`,
          messages: [
            {
              role: 'user',
              content: `Perform a root cause analysis for this CAR finding:\n\nTitle: ${issue.title}\nSeverity: ${issue.severity}\nDescription: ${issue.description}${issue.regulationRef ? `\nRegulation: ${issue.regulationRef}` : ''}${issue.location ? `\nLocation: ${issue.location}` : ''}`,
            },
          ],
        },
        {
          onText: (text) => {
            accumulated += text;
            setAiAnalysis(accumulated);
          },
        }
      );
      // Persist the result
      await (updateIssue as any)({
        issueId: issue._id as any,
        aiRootCauseAnalysis: accumulated,
      });
    } catch (e: any) {
      toast.error(e?.message ?? 'AI analysis failed');
    } finally {
      setAiStreaming(false);
    }
  }, [issue, model, updateIssue]);

  const currentStatusIdx = STATUS_FLOW.indexOf(status);

  const fieldClass = 'w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-sky-light focus:ring-1 focus:ring-sky-light';
  const textareaClass = `${fieldClass} resize-y`;
  const labelClass = 'text-xs font-semibold text-white/60 uppercase tracking-wide mb-1 block';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-navy-900 border border-white/15 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[90dvh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-white/10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {issue.carNumber && (
                <span className="font-mono text-xs font-bold text-sky-light bg-sky/10 border border-sky/20 px-2 py-0.5 rounded">
                  {issue.carNumber}
                </span>
              )}
              <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusColor(status)}`}>
                {statusLabel(status)}
              </span>
              {isOverdue(dueDate, status) && (
                <span className="text-xs font-semibold text-red-300 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded">
                  Overdue
                </span>
              )}
            </div>
            <h2 className="text-base font-semibold text-white leading-snug">{issue.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
          >
            <FiX className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto scrollbar-thin flex-1 p-5 space-y-5">
          {/* Status Progression */}
          <div>
            <span className={labelClass}>Status</span>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.filter((s) => s.value !== 'voided').map((s, idx) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => handleStatusChange(s.value)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    status === s.value
                      ? s.color + ' shadow-sm'
                      : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  {idx < currentStatusIdx ? (
                    <FiCheckCircle className="w-3 h-3" />
                  ) : idx === currentStatusIdx ? (
                    <FiClock className="w-3 h-3" />
                  ) : null}
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleStatusChange('voided')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  status === 'voided'
                    ? 'bg-white/10 text-white/40 border-white/10'
                    : 'bg-white/5 border-white/10 text-white/30 hover:text-white/50'
                }`}
              >
                Void
              </button>
            </div>
          </div>

          {/* Row: Owner + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Owner / Responsible</label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Name or department"
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`${fieldClass} ${isOverdue(dueDate, status) ? 'border-red-500/50 text-red-300' : ''}`}
              />
            </div>
          </div>

          {/* Root Cause Category */}
          <div>
            <label className={labelClass}>Root Cause Category</label>
            <select
              value={rootCauseCategory}
              onChange={(e) => setRootCauseCategory(e.target.value as RootCauseCategory | '')}
              className={fieldClass}
            >
              <option value="" className="bg-navy-900">— Select category —</option>
              {ROOT_CAUSE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} className="bg-navy-900">{o.label}</option>
              ))}
            </select>
          </div>

          {/* Root Cause */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass} style={{ marginBottom: 0 }}>Root Cause Analysis</label>
              <button
                type="button"
                onClick={handleAiRootCause}
                disabled={aiStreaming}
                className="flex items-center gap-1.5 text-xs text-sky-light hover:text-sky-lighter transition-colors disabled:opacity-50"
              >
                {aiStreaming ? <FiLoader className="w-3.5 h-3.5 animate-spin" /> : <FiCpu className="w-3.5 h-3.5" />}
                {aiStreaming ? 'Analyzing…' : 'AI Root Cause'}
              </button>
            </div>
            <textarea
              value={aiStreaming ? aiAnalysis : (rootCause || aiAnalysis)}
              onChange={(e) => {
                if (!aiStreaming) {
                  setRootCause(e.target.value);
                  setAiAnalysis('');
                }
              }}
              placeholder="Describe the root cause of this finding…"
              rows={4}
              className={textareaClass}
            />
          </div>

          {/* Corrective Action */}
          <div>
            <label className={labelClass}>Corrective Action</label>
            <textarea
              value={correctiveAction}
              onChange={(e) => setCorrectiveAction(e.target.value)}
              placeholder="Describe the immediate corrective action taken…"
              rows={3}
              className={textareaClass}
            />
          </div>

          {/* Preventive Action */}
          <div>
            <label className={labelClass}>Preventive Action</label>
            <textarea
              value={preventiveAction}
              onChange={(e) => setPreventiveAction(e.target.value)}
              placeholder="Describe systemic preventive actions to prevent recurrence…"
              rows={3}
              className={textareaClass}
            />
          </div>

          {/* Evidence of Closure */}
          {(status === 'pending_verification' || status === 'closed') && (
            <div>
              <label className={labelClass}>Evidence of Closure</label>
              <textarea
                value={evidenceOfClosure}
                onChange={(e) => setEvidenceOfClosure(e.target.value)}
                placeholder="Describe objective evidence that the corrective action is effective…"
                rows={3}
                className={textareaClass}
              />
            </div>
          )}

          {/* Verified By */}
          {status === 'closed' && (
            <div>
              <label className={labelClass}>Verified By</label>
              <input
                type="text"
                value={verifiedBy}
                onChange={(e) => setVerifiedBy(e.target.value)}
                placeholder="Name / title of verifier"
                className={fieldClass}
              />
            </div>
          )}

          {/* Finding description (read-only) */}
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className={labelClass}>Finding description</span>
            <p className="text-sm text-white/80 leading-relaxed">{issue.description}</p>
            {issue.regulationRef && (
              <p className="text-xs text-sky-light/80 mt-1">{issue.regulationRef}</p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-white/10">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={saving} onClick={handleSave}>Save CAR</Button>
        </div>
      </div>
    </div>
  );
}

export default function EntityIssues() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const navigate = useNavigate();
  const model = useDefaultClaudeModel();

  const issues = (useEntityIssues(activeProjectId ?? undefined) ?? []) as any[];
  const assessments = (useAssessments(activeProjectId ?? undefined) ?? []) as any[];
  const addIssue = useAddEntityIssue();
  const removeIssue = useRemoveEntityIssue();

  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSeverity, setNewSeverity] = useState<EntityIssueSeverity>('minor');
  const [newAssessmentId, setNewAssessmentId] = useState('');
  const [openDrawerId, setOpenDrawerId] = useState<string | null>(null);

  const filtered = issues.filter((i: any) => {
    if (filterSeverity && i.severity !== filterSeverity) return false;
    if (filterSource && i.source !== filterSource) return false;
    if (filterStatus) {
      const effectiveStatus = i.status ?? 'open';
      if (effectiveStatus !== filterStatus) return false;
    }
    return true;
  });

  // Summary counts
  const openCount = issues.filter((i: any) => !i.status || i.status === 'open').length;
  const inProgressCount = issues.filter((i: any) => i.status === 'in_progress').length;
  const overdueCount = issues.filter((i: any) => isOverdue(i.dueDate, i.status ?? 'open')).length;
  const closedCount = issues.filter((i: any) => i.status === 'closed').length;

  const handleAddManual = async () => {
    if (!activeProjectId || !newTitle.trim()) return;
    try {
      await addIssue({
        projectId: activeProjectId as any,
        source: 'manual',
        severity: newSeverity,
        title: newTitle.trim(),
        description: newDescription.trim() || newTitle.trim(),
        assessmentId: newAssessmentId || undefined,
      });
      toast.success('Issue added');
      setNewTitle('');
      setNewDescription('');
      setShowAddForm(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to add issue');
    }
  };

  const handleRemove = async (issueId: string) => {
    try {
      await removeIssue({ issueId: issueId as any });
      toast.success('Issue removed');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to remove');
    }
  };

  const drawerIssue = openDrawerId ? issues.find((i: any) => i._id === openDrawerId) : null;

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 h-full min-h-0">
        <GlassCard padding="xl" className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to view entity issues.</p>
          <Button onClick={() => navigate('/projects')}>Go to Projects</Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 flex flex-col min-h-0 h-full">
      {/* Drawer */}
      {drawerIssue && (
        <CARDrawer
          issue={drawerIssue}
          model={model}
          onClose={() => setOpenDrawerId(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          CARs & Entity issues
        </h1>
        <p className="text-white/60 text-lg">
          Corrective action records from audit simulation, paperwork review, analysis, and manual entry.
        </p>
      </div>

      {/* Summary KPI row */}
      {issues.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Open', value: openCount, color: 'text-red-300', bg: 'bg-red-500/10 border-red-500/20', filter: 'open' },
            { label: 'In Progress', value: inProgressCount, color: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/20', filter: 'in_progress' },
            { label: 'Overdue', value: overdueCount, color: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/20', filter: '' },
            { label: 'Closed', value: closedCount, color: 'text-green-300', bg: 'bg-green-500/10 border-green-500/20', filter: 'closed' },
          ].map((kpi) => (
            <button
              key={kpi.label}
              type="button"
              onClick={() => kpi.filter ? setFilterStatus(filterStatus === kpi.filter ? '' : kpi.filter) : undefined}
              className={`rounded-xl border p-4 text-left transition-all ${kpi.bg} ${kpi.filter ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'} ${filterStatus === kpi.filter && kpi.filter ? 'ring-1 ring-white/20' : ''}`}
            >
              <div className={`text-2xl font-bold font-display ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-white/60 mt-0.5">{kpi.label}</div>
            </button>
          ))}
        </div>
      )}

      <GlassCard className="mb-6 overflow-y-auto scrollbar-thin flex-1">
        {/* Filters + Add button */}
        <div className="sticky top-0 z-10 bg-navy-900/90 backdrop-blur pb-3 mb-4 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              label="Severity"
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value)}
              selectSize="sm"
            >
              <option value="">All</option>
              {SEVERITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
            <Select
              label="Source"
              value={filterSource}
              onChange={(e) => setFilterSource(e.target.value)}
              selectSize="sm"
            >
              <option value="">All</option>
              {(Object.entries(SOURCE_LABELS) as [EntityIssueSource, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
            <Select
              label="Status"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              selectSize="sm"
            >
              <option value="">All</option>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            icon={<FiPlus className="w-3.5 h-3.5" />}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? 'Cancel' : 'Add issue'}
          </Button>
        </div>

        {/* Manual add form */}
        {showAddForm && (
          <div className="p-4 rounded-xl border border-white/10 bg-white/5 mb-4 space-y-3">
            <h3 className="text-sm font-semibold text-sky-light">New issue (manual)</h3>
            <input
              type="text"
              placeholder="Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-sky-light focus:ring-1 focus:ring-sky-light"
            />
            <textarea
              placeholder="Description"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-sky-light focus:ring-1 focus:ring-sky-light resize-y"
            />
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={newSeverity}
                onChange={(e) => setNewSeverity(e.target.value as EntityIssueSeverity)}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-sky-light"
              >
                {SEVERITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-navy-800">{o.label}</option>
                ))}
              </select>
              <select
                value={newAssessmentId}
                onChange={(e) => setNewAssessmentId(e.target.value)}
                className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-sky-light"
              >
                <option value="" className="bg-navy-800">No assessment</option>
                {assessments.map((a: any) => (
                  <option key={a._id} value={a._id} className="bg-navy-800">{a.data?.companyName ?? a._id}</option>
                ))}
              </select>
              <Button size="sm" onClick={handleAddManual} disabled={!newTitle.trim()}>
                Save
              </Button>
            </div>
          </div>
        )}

        {/* Issue list */}
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-white/60 flex flex-col items-center gap-2">
            <FiAlertTriangle className="w-10 h-10 text-white/40" />
            <p>No entity issues yet. Add from Audit Simulation (Gaps and findings) or add manually above.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((issue: any) => {
              const effectiveStatus: CARStatus = issue.status ?? 'open';
              const overdue = isOverdue(issue.dueDate, effectiveStatus);

              return (
                <li
                  key={issue._id}
                  className={`rounded-xl border bg-white/5 transition-colors ${
                    overdue ? 'border-red-500/30' : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Issue row (always visible) */}
                  <button
                    type="button"
                    className="w-full p-4 flex flex-col gap-1.5 text-left"
                    onClick={() => setOpenDrawerId(issue._id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {issue.carNumber && (
                          <span className="font-mono text-xs font-bold text-sky-light/90 bg-sky/10 border border-sky/20 px-2 py-0.5 rounded">
                            {issue.carNumber}
                          </span>
                        )}
                        <span className="font-semibold text-white/95">{issue.title}</span>
                        <Badge
                          size="sm"
                          className={
                            issue.severity === 'critical'
                              ? 'bg-red-500/20 text-red-300'
                              : issue.severity === 'major'
                                ? 'bg-amber-500/20 text-amber-300'
                                : issue.severity === 'minor'
                                  ? 'bg-yellow-500/20 text-yellow-300'
                                  : 'bg-white/10 text-white/70'
                          }
                        >
                          {issue.severity}
                        </Badge>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${statusColor(effectiveStatus)}`}>
                          {statusLabel(effectiveStatus)}
                        </span>
                        {overdue && (
                          <span className="text-xs text-red-300 font-semibold">Overdue</span>
                        )}
                        <span className="text-xs text-white/50">{SOURCE_LABELS[issue.source as EntityIssueSource] ?? issue.source}</span>
                        {issue.regulationRef && (
                          <span className="text-xs text-sky-light/90">{issue.regulationRef}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {issue.dueDate && effectiveStatus !== 'closed' && effectiveStatus !== 'voided' && (
                          <span className={`text-xs ${overdue ? 'text-red-300' : 'text-white/50'}`}>
                            Due {new Date(issue.dueDate).toLocaleDateString()}
                          </span>
                        )}
                        <span className="text-white/40 text-xs">Open CAR →</span>
                      </div>
                    </div>
                    <p className="text-sm text-white/75 leading-relaxed line-clamp-2">{issue.description}</p>
                    {(issue.correctiveAction || issue.rootCause) && (
                      <p className="text-xs text-white/50 italic mt-0.5 line-clamp-1">
                        {issue.correctiveAction ? `CA: ${issue.correctiveAction}` : `RC: ${issue.rootCause}`}
                      </p>
                    )}
                  </button>

                  {/* Delete button row */}
                  <div className="flex justify-end px-3 pb-2">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleRemove(issue._id); }}
                      className="text-white/30 hover:text-red-400 transition-colors p-1.5 rounded"
                      aria-label="Remove issue"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
