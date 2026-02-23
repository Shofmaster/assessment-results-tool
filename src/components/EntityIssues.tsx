import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiPlus, FiTrash2, FiAlertTriangle } from 'react-icons/fi';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import {
  useEntityIssues,
  useAddEntityIssue,
  useUpdateEntityIssue,
  useRemoveEntityIssue,
  useAssessments,
} from '../hooks/useConvexData';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard, Select, Badge } from './ui';

type EntityIssueSource = 'audit_sim' | 'paperwork_review' | 'analysis' | 'manual';
type EntityIssueSeverity = 'critical' | 'major' | 'minor' | 'observation';

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

export default function EntityIssues() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const navigate = useNavigate();

  const issues = (useEntityIssues(activeProjectId ?? undefined) ?? []) as any[];
  const assessments = (useAssessments(activeProjectId ?? undefined) ?? []) as any[];
  const addIssue = useAddEntityIssue();
  const removeIssue = useRemoveEntityIssue();

  const [filterSeverity, setFilterSeverity] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newSeverity, setNewSeverity] = useState<EntityIssueSeverity>('minor');
  const [newAssessmentId, setNewAssessmentId] = useState('');

  const filtered = issues.filter((i: any) => {
    if (filterSeverity && i.severity !== filterSeverity) return false;
    if (filterSource && i.source !== filterSource) return false;
    return true;
  });

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

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 w-full">
        <GlassCard padding="xl" className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to view entity issues.</p>
          <Button onClick={() => navigate('/projects')}>Go to Projects</Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 w-full flex flex-col h-full">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Entity issues
        </h1>
        <p className="text-white/60 text-lg">
          Problem areas for this organization from audit sim, paperwork review, and manual entry.
        </p>
      </div>

      <GlassCard className="mb-6 overflow-y-auto">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
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
          </div>
          <Button
            size="sm"
            icon={<FiPlus className="w-3.5 h-3.5" />}
            onClick={() => setShowAddForm((v) => !v)}
          >
            {showAddForm ? 'Cancel' : 'Add issue'}
          </Button>
        </div>

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

        {filtered.length === 0 ? (
          <div className="py-8 text-center text-white/60 flex flex-col items-center gap-2">
            <FiAlertTriangle className="w-10 h-10 text-white/40" />
            <p>No entity issues yet. Add from Audit Simulation (Gaps and findings) or add manually above.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((issue: any) => (
              <li
                key={issue._id}
                className="p-4 rounded-xl border border-white/10 bg-white/5 flex flex-col gap-1.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
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
                    <span className="text-xs text-white/50">{SOURCE_LABELS[issue.source as EntityIssueSource] ?? issue.source}</span>
                    {issue.regulationRef && (
                      <span className="text-xs text-sky-light/90">{issue.regulationRef}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(issue._id)}
                    className="text-white/50 hover:text-red-400"
                    icon={<FiTrash2 className="w-3.5 h-3.5" />}
                    aria-label="Remove issue"
                  />
                </div>
                <p className="text-sm text-white/80 leading-relaxed">{issue.description}</p>
              </li>
            ))}
          </ul>
        )}
      </GlassCard>
    </div>
  );
}
