import { useState, useMemo } from 'react';
import { useUser } from '@clerk/clerk-react';
import {
  FiCheckSquare,
  FiFileText,
  FiPlus,
  FiTrash2,
  FiSave,
  FiCheckCircle,
  FiChevronDown,
  FiFolder,
  FiZap,
} from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useDocumentReviews,
  useAddDocumentReview,
  useUpdateDocumentReview,
} from '../hooks/useConvexData';
import { ClaudeAnalyzer } from '../services/claudeApi';
import type { Id } from '../../convex/_generated/dataModel';

export type ReviewVerdict = 'pass' | 'conditional' | 'fail';
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'observation';

export interface ReviewFinding {
  id: string;
  severity: FindingSeverity;
  location?: string;
  description: string;
}

const VERDICT_OPTIONS: { value: ReviewVerdict; label: string }[] = [
  { value: 'pass', label: 'Pass' },
  { value: 'conditional', label: 'Conditional' },
  { value: 'fail', label: 'Fail' },
];

const SEVERITY_OPTIONS: { value: FindingSeverity; label: string }[] = [
  { value: 'critical', label: 'Critical' },
  { value: 'major', label: 'Major' },
  { value: 'minor', label: 'Minor' },
  { value: 'observation', label: 'Observation' },
];

function newFinding(): ReviewFinding {
  return {
    id: crypto.randomUUID(),
    severity: 'minor',
    description: '',
  };
}

export default function PaperworkReview() {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const { user } = useUser();

  const allDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const referenceDocuments = (useDocuments(activeProjectId || undefined, 'reference') || []) as any[];
  const reviews = (useDocumentReviews(activeProjectId || undefined) || []) as any[];
  const addReview = useAddDocumentReview();
  const updateReview = useUpdateDocumentReview();

  const docIdToName = useMemo(() => {
    const m = new Map<string, string>();
    allDocuments.forEach((d: any) => m.set(d._id, d.name));
    return m;
  }, [allDocuments]);

  const [referenceId, setReferenceId] = useState<string>('');
  const [underReviewId, setUnderReviewId] = useState<string>('');
  const [currentReviewId, setCurrentReviewId] = useState<Id<'documentReviews'> | null>(null);
  const [verdict, setVerdict] = useState<ReviewVerdict | ''>('');
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [viewPastId, setViewPastId] = useState<Id<'documentReviews'> | null>(null);

  const currentReview = currentReviewId
    ? reviews.find((r: any) => r._id === currentReviewId)
    : null;
  const viewPast = viewPastId ? reviews.find((r: any) => r._id === viewPastId) : null;

  const referenceDoc = referenceId ? allDocuments.find((d: any) => d._id === referenceId) : null;
  const underReviewDoc = underReviewId ? allDocuments.find((d: any) => d._id === underReviewId) : null;

  const refText = referenceDoc?.extractedText ?? '';
  const underText = underReviewDoc?.extractedText ?? '';

  if (!activeProjectId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="glass rounded-2xl p-12 text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">
            Choose an existing project from the sidebar or create a new one to get started.
          </p>
          <button
            onClick={() => setCurrentView('projects')}
            className="px-8 py-3 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all flex items-center gap-2 mx-auto"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  const handleStartReview = async () => {
    if (!referenceId || !underReviewId) return;
    setSaving(true);
    try {
      const id = await addReview({
        projectId: activeProjectId as Id<'projects'>,
        referenceDocumentId: referenceId as Id<'documents'>,
        underReviewDocumentId: underReviewId as Id<'documents'>,
        status: 'draft',
        findings: [],
      });
      setCurrentReviewId(id);
      setVerdict('');
      setFindings([]);
      setNotes('');
    } catch (e: any) {
      alert(e?.message || 'Failed to start review');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!currentReviewId) return;
    setSaving(true);
    try {
      await updateReview({
        reviewId: currentReviewId,
        findings: findings.map(({ id, severity, location, description }) => ({
          id,
          severity,
          location,
          description,
        })),
        notes: notes || undefined,
      });
    } catch (e: any) {
      alert(e?.message || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteReview = async () => {
    if (!currentReviewId || !verdict) {
      alert('Select a verdict (Pass / Conditional / Fail) to complete the review.');
      return;
    }
    setSaving(true);
    try {
      await updateReview({
        reviewId: currentReviewId,
        status: 'completed',
        verdict,
        findings: findings.map(({ id, severity, location, description }) => ({
          id,
          severity,
          location,
          description,
        })),
        notes: notes || undefined,
        completedAt: new Date().toISOString(),
      });
      setCurrentReviewId(null);
      setReferenceId('');
      setUnderReviewId('');
      setVerdict('');
      setFindings([]);
      setNotes('');
    } catch (e: any) {
      alert(e?.message || 'Failed to complete review');
    } finally {
      setSaving(false);
    }
  };

  const addFinding = () => setFindings((prev) => [...prev, newFinding()]);
  const removeFinding = (id: string) => setFindings((prev) => prev.filter((f) => f.id !== id));

  const handleAiSuggestFindings = async () => {
    if (!refText.trim() || !underText.trim()) return;
    setAiSuggesting(true);
    try {
      const analyzer = new ClaudeAnalyzer();
      const suggested = await analyzer.suggestPaperworkFindings(
        refText,
        underText,
        referenceDoc?.name,
        underReviewDoc?.name
      );
      const newFindings: ReviewFinding[] = suggested.map((f) => ({
        id: crypto.randomUUID(),
        severity: (f.severity as FindingSeverity) || 'minor',
        location: f.location,
        description: f.description,
      }));
      setFindings((prev) => [...prev, ...newFindings]);
    } catch (e: any) {
      alert(e?.message || 'AI suggestion failed');
    } finally {
      setAiSuggesting(false);
    }
  };
  const updateFinding = (id: string, patch: Partial<ReviewFinding>) => {
    setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const isEditing = !!currentReviewId && currentReview?.status === 'draft';
  const canStart = referenceId && underReviewId && !currentReviewId;
  const showComparison = (referenceId && underReviewId) || isEditing;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Paperwork Review
        </h1>
        <p className="text-white/60 text-lg">
          Compare submitted paperwork against known-good reference documents and record findings.
        </p>
      </div>

      {/* New review: select reference + under review */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
          <FiCheckSquare className="text-amber-400" />
          New review
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Reference (known good)
            </label>
            <div className="relative">
              <select
                value={referenceId}
                onChange={(e) => setReferenceId(e.target.value)}
                disabled={!!currentReviewId}
                className="w-full pl-4 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light appearance-none"
              >
                <option value="">Select reference document</option>
                {referenceDocuments.map((d: any) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
              <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white/80 mb-2">
              Document under review
            </label>
            <div className="relative">
              <select
                value={underReviewId}
                onChange={(e) => setUnderReviewId(e.target.value)}
                disabled={!!currentReviewId}
                className="w-full pl-4 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light appearance-none"
              >
                <option value="">Select document to review</option>
                {allDocuments
                  .filter((d: any) => d._id !== referenceId)
                  .map((d: any) => (
                    <option key={d._id} value={d._id}>
                      {d.name} ({d.category})
                    </option>
                  ))}
              </select>
              <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            </div>
          </div>
        </div>
        {referenceDocuments.length === 0 && (
          <p className="text-amber-400/90 text-sm mb-4">
            Add reference documents in Library → Reference (known good).
          </p>
        )}
        {canStart && (
          <button
            onClick={handleStartReview}
            disabled={saving}
            className="px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 rounded-xl font-semibold hover:shadow-lg hover:shadow-amber-500/30 disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? 'Starting...' : 'Start review'}
          </button>
        )}
        {isEditing && (
          <div className="flex flex-wrap gap-2 mt-2">
            <button
              onClick={handleSaveDraft}
              disabled={saving}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-medium flex items-center gap-2"
            >
              <FiSave /> Save draft
            </button>
            <button
              onClick={() => {
                if (confirm('Discard this draft?')) {
                  setCurrentReviewId(null);
                  setVerdict('');
                  setFindings([]);
                  setNotes('');
                }
              }}
              className="px-4 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg"
            >
              Discard draft
            </button>
          </div>
        )}
      </div>

      {/* Side-by-side comparison + form */}
      {showComparison && (referenceDoc || underReviewDoc) && (
        <div className="glass rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
            <FiFileText />
            Compare documents
          </h2>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2 text-white/80">
                <FiCheckSquare className="text-amber-400" />
                <span className="font-medium">
                  {referenceDoc?.name ?? 'Reference'}
                </span>
              </div>
              <div className="flex-1 min-h-[280px] max-h-[400px] overflow-auto p-4 bg-white/5 rounded-xl border border-white/10 text-sm whitespace-pre-wrap scrollbar-thin">
                {refText || 'No extracted text. Re-import or extract in Library.'}
              </div>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-2 text-white/80">
                <FiFileText className="text-sky-400" />
                <span className="font-medium">
                  {underReviewDoc?.name ?? 'Under review'}
                </span>
              </div>
              <div className="flex-1 min-h-[280px] max-h-[400px] overflow-auto p-4 bg-white/5 rounded-xl border border-white/10 text-sm whitespace-pre-wrap scrollbar-thin">
                {underText || 'No extracted text. Re-import or extract in Library.'}
              </div>
            </div>
          </div>

          {/* Form: verdict, findings, notes */}
          {isEditing && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-white/80 mb-2">Verdict</label>
                <div className="flex gap-3">
                  {VERDICT_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="verdict"
                        value={opt.value}
                        checked={verdict === opt.value}
                        onChange={() => setVerdict(opt.value)}
                        className="rounded border-white/30 bg-white/10 text-amber-500 focus:ring-amber-500"
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-white/80">Findings</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAiSuggestFindings}
                      disabled={aiSuggesting || !refText.trim() || !underText.trim()}
                      className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 disabled:opacity-50"
                    >
                      {aiSuggesting ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <FiZap /> AI-suggest findings
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={addFinding}
                      className="flex items-center gap-1 text-sm text-sky-light hover:text-sky-lighter"
                    >
                      <FiPlus /> Add finding
                    </button>
                  </div>
                </div>
                <div className="space-y-3">
                  {findings.length === 0 && (
                    <p className="text-white/40 text-sm">No findings yet.</p>
                  )}
                  {findings.map((f) => (
                    <div
                      key={f.id}
                      className="flex flex-wrap gap-2 items-start p-3 bg-white/5 rounded-xl border border-white/10"
                    >
                      <select
                        value={f.severity}
                        onChange={(e) =>
                          updateFinding(f.id, {
                            severity: e.target.value as FindingSeverity,
                          })
                        }
                        className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm w-32"
                      >
                        {SEVERITY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Location (optional)"
                        value={f.location ?? ''}
                        onChange={(e) => updateFinding(f.id, { location: e.target.value })}
                        className="flex-1 min-w-[120px] px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm placeholder-white/30"
                      />
                      <input
                        type="text"
                        placeholder="Description"
                        value={f.description}
                        onChange={(e) => updateFinding(f.id, { description: e.target.value })}
                        className="flex-1 min-w-[180px] px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm placeholder-white/30"
                      />
                      <button
                        type="button"
                        onClick={() => removeFinding(f.id)}
                        className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg"
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-white/80 mb-2">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional notes"
                  rows={3}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light resize-y"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleCompleteReview}
                  disabled={saving || !verdict}
                  className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl font-semibold hover:shadow-lg hover:shadow-green-500/30 disabled:opacity-50 flex items-center gap-2"
                >
                  <FiCheckCircle /> Complete review
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Past reviews list */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
          <FiFolder />
          Past reviews
        </h2>
        {reviews.length === 0 ? (
          <p className="text-white/50">No reviews yet. Start a review above.</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-auto scrollbar-thin">
            {reviews.map((r: any) => (
              <div
                key={r._id}
                className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">
                    {docIdToName.get(r.referenceDocumentId) ?? 'Reference'} vs{' '}
                    {docIdToName.get(r.underReviewDocumentId) ?? 'Under review'}
                  </div>
                  <div className="text-sm text-white/60 flex flex-wrap gap-x-4 gap-y-1 mt-1">
                    <span>
                      {r.userId === user?.id ? 'You' : 'Other'} · {r.status}
                    </span>
                    {r.verdict && (
                      <span
                        className={
                          r.verdict === 'pass'
                            ? 'text-green-400'
                            : r.verdict === 'conditional'
                              ? 'text-amber-400'
                              : 'text-red-400'
                        }
                      >
                        {r.verdict}
                      </span>
                    )}
                    <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {r.status === 'draft' && r.userId === user?.id && (
                    <button
                      onClick={() => {
                        setCurrentReviewId(r._id);
                        setReferenceId(r.referenceDocumentId);
                        setUnderReviewId(r.underReviewDocumentId);
                        setFindings(
                          (r.findings as any[])?.map((f: any) => ({
                            id: f.id || crypto.randomUUID(),
                            severity: f.severity || 'minor',
                            location: f.location,
                            description: f.description || '',
                          })) ?? []
                        );
                        setNotes(r.notes ?? '');
                        setVerdict((r.verdict as ReviewVerdict) ?? '');
                      }}
                      className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
                    >
                      Continue
                    </button>
                  )}
                  <button
                    onClick={() => setViewPastId(viewPastId === r._id ? null : r._id)}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm"
                  >
                    {viewPastId === r._id ? 'Hide' : 'View'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {viewPast && (
          <div className="mt-6 p-4 bg-white/5 rounded-xl border border-white/10">
            <h3 className="font-semibold mb-2">Review details</h3>
            <p className="text-sm text-white/70 mb-2">
              Verdict: <span className="font-medium">{viewPast.verdict ?? '—'}</span>
              {viewPast.completedAt && (
                <span className="ml-4">
                  Completed {new Date(viewPast.completedAt).toLocaleString()}
                </span>
              )}
            </p>
            {viewPast.notes && (
              <p className="text-sm text-white/60 mb-2">Notes: {viewPast.notes}</p>
            )}
            {viewPast.findings?.length > 0 && (
              <ul className="list-disc list-inside text-sm text-white/70 space-y-1">
                {(viewPast.findings as any[]).map((f: any, i: number) => (
                  <li key={f.id || i}>
                    [{f.severity}] {f.location ? `${f.location}: ` : ''}
                    {f.description}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
