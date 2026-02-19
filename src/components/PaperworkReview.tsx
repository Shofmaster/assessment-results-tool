import { useState, useMemo, useRef, useEffect } from 'react';
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
  FiBookOpen,
  FiDownload,
  FiImage,
  FiX,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useDocumentReviews,
  useAddDocumentReview,
  useUpdateDocumentReview,
  useRemoveDocumentReview,
  useAllSharedReferenceDocs,
  useProject,
  useUpsertUserSettings,
  usePaperworkReviewModel,
} from '../hooks/useConvexData';
import { ClaudeAnalyzer, type AttachedImage } from '../services/claudeApi';
import { PaperworkReviewPDFGenerator, type PaperworkReviewForPdf } from '../services/paperworkReviewPdfGenerator';
import type { Id } from '../../convex/_generated/dataModel';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { getConvexErrorMessage } from '../utils/convexError';
import { Button, GlassCard } from './ui';
import { PageModelSelector } from './PageModelSelector';

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

const REFERENCE_DOC_TYPE_LABELS: Record<string, string> = {
  'part-145-manual': 'Part 145 Repair Station Manual',
  'gmm': 'General Maintenance Manual (GMM)',
  'part-135-manual': 'Part 135 Operations Manual',
  'ops-specs': 'Operations Specifications',
  'mel': 'MEL/MMEL',
  'training-program': 'Training Program Manual',
  'qcm': 'Quality Control Manual',
  'sms-manual': 'SMS Manual',
  'ipm': 'Inspection Procedures Manual',
  'part-121-manual': 'Part 121 Operations Manual',
  'part-91-manual': 'Part 91 Operations Manual',
  'hazmat-manual': 'Hazmat Training Manual',
  'tool-calibration': 'Tool Calibration Manual',
  'isbao-standards': 'IS-BAO Standards',
  'other': 'Other Reference',
};

type ReferenceSource = 'project' | 'shared';

export interface ReferenceEntry {
  source: ReferenceSource;
  id: string;
}

function newFinding(): ReviewFinding {
  return {
    id: crypto.randomUUID(),
    severity: 'minor',
    description: '',
  };
}

function reviewToPdfItem(r: any, docIdToName: Map<string, string>, projectName?: string): PaperworkReviewForPdf {
  const projectIds = (r as any).referenceDocumentIds ?? (r.referenceDocumentId ? [r.referenceDocumentId] : []);
  const sharedIds = (r as any).sharedReferenceDocumentIds ?? (r.sharedReferenceDocumentId ? [r.sharedReferenceDocumentId] : []);
  const refNames = [...projectIds, ...sharedIds].map((id: string) => docIdToName.get(id) ?? id).join(', ');
  return {
    projectName,
    reviewName: (r as any).name,
    underReviewDocumentName: docIdToName.get(r.underReviewDocumentId) ?? r.underReviewDocumentId,
    referenceDocumentNames: refNames,
    status: r.status,
    verdict: r.verdict,
    findings: (r.findings as any[])?.map((f: any) => ({
      severity: f.severity ?? 'observation',
      location: f.location,
      description: f.description ?? '',
    })) ?? [],
    reviewScope: (r as any).reviewScope,
    notes: r.notes,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  };
}

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
  className,
  minRows = 2,
  maxHeight = 400,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  minRows?: number;
  maxHeight?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${Math.max(h, minRows * 24)}px`;
  }, [value, minRows, maxHeight]);
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      rows={minRows}
    />
  );
}

export default function PaperworkReview() {
  const containerRef = useRef<HTMLDivElement>(null);
  const startReviewInProgressRef = useRef(false);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const navigate = useNavigate();
  const { user } = useUser();
  const activeProject = useProject(activeProjectId || undefined) as any;

  const allDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const smsDocuments = (useDocuments(activeProjectId || undefined, 'sms') || []) as any[];
  const referenceDocuments = (useDocuments(activeProjectId || undefined, 'reference') || []) as any[];
  const sharedRefDocs = (useAllSharedReferenceDocs() || []) as any[];
  const reviews = (useDocumentReviews(activeProjectId || undefined) || []) as any[];
  const addReview = useAddDocumentReview();
  const updateReview = useUpdateDocumentReview();
  const removeReview = useRemoveDocumentReview();
  const upsertSettings = useUpsertUserSettings();
  const paperworkReviewModel = usePaperworkReviewModel();

  // Documents that can be added "under review": any project doc that isn't reference (entity, sms, uploaded, regulatory)
  const documentsAvailableForUnderReview = useMemo(
    () => allDocuments.filter((d: any) => d.category !== 'reference'),
    [allDocuments]
  );

  const docIdToName = useMemo(() => {
    const m = new Map<string, string>();
    allDocuments.forEach((d: any) => m.set(d._id, d.name));
    sharedRefDocs.forEach((d: any) => {
      const typeLabel = REFERENCE_DOC_TYPE_LABELS[d.documentType] || d.documentType;
      m.set(d._id, `${d.name} (${typeLabel})`);
    });
    return m;
  }, [allDocuments, sharedRefDocs]);

  const sharedRefDocsByType = useMemo(() => {
    const grouped = new Map<string, any[]>();
    sharedRefDocs.forEach((d: any) => {
      const list = grouped.get(d.documentType) || [];
      list.push(d);
      grouped.set(d.documentType, list);
    });
    return grouped;
  }, [sharedRefDocs]);

  const [referenceEntries, setReferenceEntries] = useState<ReferenceEntry[]>([]);
  const [addRefValue, setAddRefValue] = useState<string>(''); // for "Add reference" dropdown
  const [underReviewIds, setUnderReviewIds] = useState<string[]>([]);
  const [addUnderReviewValue, setAddUnderReviewValue] = useState<string>(''); // for "Add under review" dropdown
  const [reviewName, setReviewName] = useState<string>(''); // optional name for this review (allows multiple per document)
  const [currentReviewId, setCurrentReviewId] = useState<Id<'documentReviews'> | null>(null);
  const [reviewBatchIds, setReviewBatchIds] = useState<Id<'documentReviews'>[]>([]);
  const [verdict, setVerdict] = useState<ReviewVerdict | ''>('');
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [reviewScope, setReviewScope] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [viewPastId, setViewPastId] = useState<Id<'documentReviews'> | null>(null);
  const [batchAiProgress, setBatchAiProgress] = useState<{ current: number; total: number; docName: string } | null>(null);
  const [paperworkAttachedImages, setPaperworkAttachedImages] = useState<Array<{ name: string } & AttachedImage>>([]);
  const paperworkImageInputRef = useRef<HTMLInputElement>(null);
  /** Review id (or 'draft') for which we're showing the discard-confirm modal; null = no modal */
  const [discardConfirmTarget, setDiscardConfirmTarget] = useState<Id<'documentReviews'> | 'draft' | null>(null);

  const currentReview = currentReviewId
    ? reviews.find((r: any) => r._id === currentReviewId)
    : null;

  const referenceDocs = useMemo(() => {
    return referenceEntries
      .map((e) => {
        if (e.source === 'shared') return sharedRefDocs.find((d: any) => d._id === e.id) ?? null;
        return allDocuments.find((d: any) => d._id === e.id) ?? null;
      })
      .filter(Boolean) as any[];
  }, [referenceEntries, allDocuments, sharedRefDocs]);

  const underReviewDoc = currentReviewId
    ? (() => {
        const r = reviews.find((x: any) => x._id === currentReviewId);
        return r ? allDocuments.find((d: any) => d._id === r.underReviewDocumentId) : null;
      })()
    : underReviewIds[0] ? allDocuments.find((d: any) => d._id === underReviewIds[0]) : null;

  const refText = useMemo(
    () =>
      referenceDocs
        .map((d) => `--- ${d.name} ---\n\n${d.extractedText ?? ''}`)
        .join('\n\n'),
    [referenceDocs]
  );
  const underText = underReviewDoc?.extractedText ?? '';

  const addReference = (value: string) => {
    if (!value) return;
    const source: ReferenceSource = value.startsWith('shared:') ? 'shared' : 'project';
    const id = value.startsWith('shared:') ? value.slice(7) : value;
    if (referenceEntries.some((e) => e.source === source && e.id === id)) return;
    setReferenceEntries((prev) => [...prev, { source, id }]);
    setAddRefValue('');
  };

  const removeReference = (source: ReferenceSource, id: string) => {
    setReferenceEntries((prev) => prev.filter((e) => !(e.source === source && e.id === id)));
  };

  const addUnderReview = (docId: string) => {
    if (!docId) return;
    setUnderReviewIds((prev) => (prev.includes(docId) ? prev : [...prev, docId]));
    setAddUnderReviewValue('');
  };

  const removeUnderReview = (docId: string) => {
    setUnderReviewIds((prev) => prev.filter((id) => id !== docId));
  };

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">
            Choose an existing project from the sidebar or create a new one to get started.
          </p>
          <Button size="lg" onClick={() => navigate('/projects')} className="mx-auto">
            Go to Projects
          </Button>
        </GlassCard>
      </div>
    );
  }

  const handleStartReview = async () => {
    if (referenceEntries.length === 0 || underReviewIds.length === 0) return;
    // Prevent double submission (e.g. double-click or slow state update)
    if (startReviewInProgressRef.current) return;
    startReviewInProgressRef.current = true;
    setSaving(true);
    try {
      const projectRefIds = referenceEntries.filter((e) => e.source === 'project').map((e) => e.id);
      const sharedRefIds = referenceEntries.filter((e) => e.source === 'shared').map((e) => e.id);
      const createdIds: Id<'documentReviews'>[] = [];
      // One review per document: dedupe so we never create two for the same document
      const uniqueUnderReviewIds = [...new Set(underReviewIds)];
      for (let i = 0; i < uniqueUnderReviewIds.length; i++) {
        const docId = uniqueUnderReviewIds[i];
        const nameForThis = uniqueUnderReviewIds.length > 1 && reviewName.trim()
          ? `${reviewName.trim()} (${docIdToName.get(docId) ?? 'doc'})`
          : (reviewName.trim() || undefined);
        const reviewArgs: any = {
          projectId: activeProjectId as Id<'projects'>,
          underReviewDocumentId: docId as Id<'documents'>,
          name: nameForThis,
          status: 'draft',
          findings: [],
          reviewScope: reviewScope.trim() || undefined,
          referenceDocumentIds: projectRefIds.length > 0 ? (projectRefIds as Id<'documents'>[]) : undefined,
          sharedReferenceDocumentIds: sharedRefIds.length > 0 ? (sharedRefIds as Id<'sharedReferenceDocuments'>[]) : undefined,
        };
        const id = await addReview(reviewArgs);
        createdIds.push(id);
      }
      setReviewBatchIds(createdIds);
      setCurrentReviewId(createdIds[0]);
      setReviewName('');
      setVerdict('');
      setFindings([]);
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'Failed to start review');
    } finally {
      setSaving(false);
      startReviewInProgressRef.current = false;
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
        reviewScope: reviewScope.trim() || undefined,
        notes: notes || undefined,
      });
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const handleCompleteReview = async () => {
    if (!currentReviewId || !verdict) {
      toast.warning('Select a verdict (Pass / Conditional / Fail) to complete the review.');
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
        reviewScope: reviewScope.trim() || undefined,
        notes: notes || undefined,
        completedAt: new Date().toISOString(),
      });
      const remaining = reviewBatchIds.filter((id) => id !== currentReviewId);
      if (remaining.length > 0) {
        const nextId = remaining[0];
        setReviewBatchIds(remaining);
        setCurrentReviewId(nextId);
        const nextR = reviews.find((r: any) => r._id === nextId);
        if (nextR) {
          setFindings(
            (nextR.findings as any[])?.map((f: any) => ({
              id: f.id || crypto.randomUUID(),
              severity: f.severity || 'minor',
              location: f.location,
              description: f.description || '',
            })) ?? []
          );
          setVerdict((nextR.verdict as ReviewVerdict) ?? '');
          setReviewScope((nextR as any).reviewScope ?? '');
          setNotes(nextR.notes ?? '');
        } else {
          setVerdict('');
          setFindings([]);
        }
      } else {
        setCurrentReviewId(null);
        setReviewBatchIds([]);
        setReferenceEntries([]);
        setUnderReviewIds([]);
        setReviewName('');
        setVerdict('');
        setFindings([]);
        setReviewScope('');
        setNotes('');
      }
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'Failed to complete review');
    } finally {
      setSaving(false);
    }
  };

  const addFinding = () => setFindings((prev) => [...prev, newFinding()]);
  const removeFinding = (id: string) => setFindings((prev) => prev.filter((f) => f.id !== id));

  const readImageAsBase64 = (file: File): Promise<{ name: string } & AttachedImage> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          reject(new Error('Could not parse image data'));
          return;
        }
        const media_type = match[1].toLowerCase();
        const data = match[2];
        resolve({ name: file.name, media_type, data });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  };

  const handlePaperworkImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const toAdd: Array<{ name: string } & AttachedImage> = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!allowed.includes(file.type)) {
        toast.warning(`Skipped ${file.name}: use JPEG, PNG, GIF, or WebP`);
        continue;
      }
      try {
        toAdd.push(await readImageAsBase64(file));
      } catch (err) {
        toast.error(`Failed to read ${file.name}`);
      }
    }
    if (toAdd.length) setPaperworkAttachedImages((prev) => [...prev, ...toAdd]);
    e.target.value = '';
  };

  const removePaperworkImage = (index: number) => {
    setPaperworkAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAiSuggestFindings = async () => {
    if (!refText.trim() || !underText.trim()) return;
    setAiSuggesting(true);
    const imagePayload = paperworkAttachedImages.map(({ media_type, data }) => ({ media_type, data }));
    try {
      const analyzer = new ClaudeAnalyzer(undefined, paperworkReviewModel);
      const suggested = await analyzer.suggestPaperworkFindings(
        refText,
        underText,
        referenceDocs.map((d) => d.name).join(', '),
        underReviewDoc?.name,
        reviewScope.trim() || undefined,
        imagePayload.length ? imagePayload : undefined
      );
      const newFindings: ReviewFinding[] = suggested.map((f) => ({
        id: crypto.randomUUID(),
        severity: (f.severity as FindingSeverity) || 'minor',
        location: f.location,
        description: f.description,
      }));
      setFindings((prev) => [...prev, ...newFindings]);
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'AI suggestion failed');
    } finally {
      setAiSuggesting(false);
    }
  };
  const handleAiSuggestAllDocuments = async () => {
    if (reviewBatchIds.length === 0 || !refText.trim()) {
      toast.warning('No reference text available. Make sure reference documents have extracted text.');
      return;
    }
    setAiSuggesting(true);
    try {
      const analyzer = new ClaudeAnalyzer(undefined, paperworkReviewModel);
      const total = reviewBatchIds.length;
      let processedCount = 0;
      for (let i = 0; i < reviewBatchIds.length; i++) {
        const reviewId = reviewBatchIds[i];
        const review = reviews.find((r: any) => r._id === reviewId);
        if (!review) continue;
        const doc = allDocuments.find((d: any) => d._id === review.underReviewDocumentId);
        const docName = doc?.name || 'Document';
        const docText = doc?.extractedText?.trim() ?? '';
        setBatchAiProgress({ current: i + 1, total, docName });
        if (!docText) {
          toast.warning(`Skipping "${docName}" — no extracted text.`);
          continue;
        }
        const imagePayload = paperworkAttachedImages.map(({ media_type, data }) => ({ media_type, data }));
        const suggested = await analyzer.suggestPaperworkFindings(
          refText,
          docText,
          referenceDocs.map((d) => d.name).join(', '),
          docName,
          reviewScope.trim() || undefined,
          imagePayload.length ? imagePayload : undefined
        );
        const newFindings: ReviewFinding[] = suggested.map((f) => ({
          id: crypto.randomUUID(),
          severity: (f.severity as FindingSeverity) || 'minor',
          location: f.location,
          description: f.description,
        }));
        const existingFindings: ReviewFinding[] = (review.findings as any[])?.map((f: any) => ({
          id: f.id || crypto.randomUUID(),
          severity: f.severity || 'minor',
          location: f.location,
          description: f.description || '',
        })) ?? [];
        const combined = [...existingFindings, ...newFindings];
        await updateReview({
          reviewId,
          findings: combined.map(({ id: fid, severity, location, description }) => ({
            id: fid, severity, location, description,
          })),
        });
        if (reviewId === currentReviewId) {
          setFindings(combined);
        }
        processedCount++;
      }
      toast.success(`AI review completed for ${processedCount} of ${total} document${total > 1 ? 's' : ''}`);
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'AI batch review failed');
    } finally {
      setAiSuggesting(false);
      setBatchAiProgress(null);
    }
  };

  const updateFinding = (id: string, patch: Partial<ReviewFinding>) => {
    setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const isEditing = !!currentReviewId && currentReview?.status === 'draft';
  const canStart = referenceEntries.length > 0 && underReviewIds.length > 0 && !currentReviewId;
  const showComparison = (referenceEntries.length > 0 && (underReviewIds.length > 0 || currentReviewId)) || isEditing;

  const performDiscard = async () => {
    const reviewId = discardConfirmTarget === 'draft' ? currentReviewId : discardConfirmTarget;
    if (!reviewId || reviewId === 'draft') {
      setDiscardConfirmTarget(null);
      return;
    }
    try {
      await removeReview({ reviewId });
      if (viewPastId === reviewId) setViewPastId(null);
      if (currentReviewId === reviewId) {
        const remaining = reviewBatchIds.filter((id) => id !== reviewId);
        if (remaining.length > 0) {
          setReviewBatchIds(remaining);
          setCurrentReviewId(remaining[0]);
          const nextR = reviews.find((r: any) => r._id === remaining[0]);
          if (nextR) {
            setFindings((nextR.findings as any[])?.map((f: any) => ({ id: f.id || crypto.randomUUID(), severity: f.severity || 'minor', location: f.location, description: f.description || '' })) ?? []);
            setReviewScope((nextR as any).reviewScope ?? '');
            setNotes(nextR.notes ?? '');
            setVerdict((nextR.verdict as ReviewVerdict) ?? '');
          }
        } else {
          setCurrentReviewId(null);
          setReviewBatchIds([]);
          setReferenceEntries([]);
          setUnderReviewIds([]);
          setVerdict('');
          setFindings([]);
          setReviewScope('');
          setNotes('');
        }
      }
      toast.success(discardConfirmTarget === 'draft' ? 'Draft discarded' : 'Review discarded');
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || (discardConfirmTarget === 'draft' ? 'Failed to discard draft' : 'Failed to discard review'));
    } finally {
      setDiscardConfirmTarget(null);
    }
  };

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Paperwork Review
        </h1>
        <p className="text-white/60 text-lg">
          Compare submitted paperwork against known-good reference documents and record findings.
        </p>
      </div>

      {/* New review: select reference + under review */}
      <GlassCard className="mb-6">
        <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
          <FiCheckSquare className="text-amber-400" />
          New review
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 md:items-start">
          <div className="flex flex-col min-h-[140px]">
            <label className="block text-sm font-medium text-white/80 mb-2 shrink-0">
              Reference documents (IS-BAO, Part 91, etc.)
            </label>
            {referenceEntries.length > 0 && (
              <ul className="flex flex-wrap gap-2 mb-2">
                {referenceEntries.map((e) => {
                  const name = e.source === 'shared'
                    ? sharedRefDocs.find((d: any) => d._id === e.id)?.name
                    : allDocuments.find((d: any) => d._id === e.id)?.name;
                  const typeLabel = e.source === 'shared'
                    ? REFERENCE_DOC_TYPE_LABELS[sharedRefDocs.find((d: any) => d._id === e.id)?.documentType] || 'Shared'
                    : 'Project';
                  return (
                    <li
                      key={`${e.source}:${e.id}`}
                      className="flex items-center gap-2 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-sm"
                    >
                      <span className="truncate max-w-[180px]" title={name}>{name ?? e.id}</span>
                      <span className="text-white/50 text-xs">({typeLabel})</span>
                      {!currentReviewId && (
                        <button
                          type="button"
                          onClick={() => removeReference(e.source, e.id)}
                          className="p-0.5 text-white/60 hover:text-red-400 rounded"
                          aria-label="Remove reference"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!currentReviewId && (
              <div className="flex gap-2 w-full">
                <div className="relative flex-1 min-w-0">
                  <select
                    value={addRefValue}
                    onChange={(e) => addReference(e.target.value)}
                    className="w-full pl-4 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light appearance-none text-white"
                  >
                    <option value="">Add reference document</option>
                    {referenceDocuments
                      .filter((d: any) => !referenceEntries.some((e) => e.source === 'project' && e.id === d._id))
                      .map((d: any) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    {Array.from(sharedRefDocsByType.entries()).flatMap(([typeId, docs]) =>
                      docs
                        .filter((d: any) => !referenceEntries.some((e) => e.source === 'shared' && e.id === d._id))
                        .map((d: any) => (
                          <option key={d._id} value={`shared:${d._id}`}>
                            {d.name}
                          </option>
                        ))
                    )}
                  </select>
                  <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 pointer-events-none" />
                </div>
              </div>
            )}
            {referenceEntries.some((e) => e.source === 'shared') && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-400/80">
                <FiBookOpen className="w-3 h-3" />
                Shared references are admin-uploaded (IS-BAO, Part 91, etc.)
              </div>
            )}
          </div>
          <div className="flex flex-col min-h-[140px]">
            <label className="block text-sm font-medium text-white/80 mb-2 shrink-0">
              Documents under review
            </label>
            {underReviewIds.length > 0 && (
              <ul className="flex flex-wrap gap-2 mb-2">
                {underReviewIds.map((id) => {
                  const doc = allDocuments.find((d: any) => d._id === id);
                  const name = doc?.name ?? id;
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 px-3 py-1.5 bg-sky-500/20 border border-sky-400/40 rounded-lg text-sm"
                    >
                      <span className="truncate max-w-[180px]" title={name}>{name}</span>
                      {!currentReviewId && (
                        <button
                          type="button"
                          onClick={() => removeUnderReview(id)}
                          className="p-0.5 text-white/60 hover:text-red-400 rounded"
                          aria-label="Remove document"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {!currentReviewId && (
              <div className="relative w-full">
                <select
                  value={addUnderReviewValue}
                  onChange={(e) => addUnderReview(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light appearance-none text-white"
                >
                  <option value="">Add document under review</option>
                  {documentsAvailableForUnderReview
                    .filter((d: any) => !underReviewIds.includes(d._id) && !referenceEntries.some((e) => e.source === 'project' && e.id === d._id))
                    .map((d: any) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                        {d.category && d.category !== 'entity' && d.category !== 'sms' ? ` (${d.category})` : ''}
                      </option>
                    ))}
                </select>
                <FiChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-white/70 pointer-events-none" />
              </div>
            )}
            {!currentReviewId && documentsAvailableForUnderReview.length > 0 && (
              <p className="text-xs text-white/50 mt-1.5">
                Add one or more documents to review against the references above.
              </p>
            )}
            {documentsAvailableForUnderReview.length === 0 && (
              <p className="text-amber-400/90 text-sm mt-1.5">
                No documents to review. Add documents in Library (Entity Documents, SMS Data, or Uploaded).
              </p>
            )}
          </div>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-white/80 mb-2">
            Review name <span className="text-white/50 font-normal">(optional)</span>
          </label>
          <input
            type="text"
            value={reviewName}
            onChange={(e) => setReviewName(e.target.value)}
            placeholder="e.g., Initial review, Rev 2 comparison, Ch. 5 only"
            disabled={!!currentReviewId}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light placeholder-white/40 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-white/50 mt-1">
            Name this review so you can have multiple reviews per document (e.g. different scopes or revisions).
          </p>
        </div>
        <div className="mb-4">
          <label className="block text-sm font-medium text-white/80 mb-2">
            Review scope <span className="text-white/50 font-normal">(optional)</span>
          </label>
          <textarea
            value={reviewScope}
            onChange={(e) => setReviewScope(e.target.value)}
            placeholder="e.g., Chapters 3 and 5 only, Section 2.1 compliance, Appendix A"
            rows={2}
            disabled={!!currentReviewId}
            className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light resize-y placeholder-white/40 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <p className="text-xs text-white/50 mt-1">
            Define what to focus on—chapters, sections, or specific requirements.
          </p>
        </div>
        {referenceDocuments.length === 0 && sharedRefDocs.length === 0 && (
          <p className="text-amber-400/90 text-sm mb-4">
            No reference documents found. Upload them via Admin Panel → Reference Documents, or add to Library → Reference.
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
              onClick={() => currentReviewId && setDiscardConfirmTarget('draft')}
              className="px-4 py-2 text-white/60 hover:text-white hover:bg-white/10 rounded-lg"
            >
              Discard draft
            </button>
          </div>
        )}
      </GlassCard>

      {/* Side-by-side comparison + form */}
      {showComparison && (referenceDocs.length > 0 || underReviewDoc) && (
        <GlassCard className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <FiFileText />
              Compare documents
            </h2>
            <div className="flex flex-wrap items-center gap-4">
              {isEditing && reviewBatchIds.length > 1 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-white/60">Document:</span>
                <select
                  value={currentReviewId ?? ''}
                  onChange={async (e) => {
                    const id = e.target.value as Id<'documentReviews'>;
                    if (!id || id === currentReviewId) return;
                    if (currentReviewId) {
                      try {
                        await updateReview({
                          reviewId: currentReviewId,
                          findings: findings.map(({ id: fid, severity, location, description }) => ({ id: fid, severity, location, description })),
                          reviewScope: reviewScope.trim() || undefined,
                          notes: notes || undefined,
                        });
                      } catch (_) {
                        /* keep editing current on save error */
                      }
                    }
                    setCurrentReviewId(id);
                    const r = reviews.find((x: any) => x._id === id);
                    if (r) {
                      setFindings((r.findings as any[])?.map((f: any) => ({ id: f.id || crypto.randomUUID(), severity: f.severity || 'minor', location: f.location, description: f.description || '' })) ?? []);
                      setVerdict((r.verdict as ReviewVerdict) ?? '');
                      setReviewScope((r as any).reviewScope ?? '');
                      setNotes(r.notes ?? '');
                    }
                  }}
                  className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:border-sky-400"
                >
                  {reviewBatchIds.map((id) => {
                    const r = reviews.find((x: any) => x._id === id);
                    const docName = r ? docIdToName.get(r.underReviewDocumentId) ?? 'Unknown' : 'Unknown';
                    const label = (r as any)?.name ? `${(r as any).name}` : docName;
                    return (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    );
                  })}
                </select>
                <span className="text-xs text-white/50">({currentReviewId ? reviewBatchIds.indexOf(currentReviewId) + 1 : 0} of {reviewBatchIds.length})</span>
              </div>
              )}
            </div>
          </div>
          <p className="text-sm text-white/60 mb-4">
            {reviewBatchIds.length > 1
              ? <>Use <strong>Review all with AI</strong> to compare all {reviewBatchIds.length} documents against the references, or <strong>Suggest findings</strong> (in the Findings section) for the current document only.</>
              : <>Use <strong>Suggest findings</strong> below to compare the documents and get AI-suggested compliance gaps and discrepancies.</>
            }
          </p>
          {isEditing && reviewBatchIds.length > 1 && (
            <div className="mb-5 p-4 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-400/30 rounded-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-green-300">
                    {reviewBatchIds.length} documents selected for review
                  </p>
                  <p className="text-xs text-white/50 mt-0.5">
                    Review each document against the reference(s) and populate findings automatically.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAiSuggestAllDocuments}
                  disabled={aiSuggesting || !refText.trim()}
                  className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-green-500/30 disabled:opacity-50 flex items-center gap-2 shrink-0"
                >
                  {aiSuggesting && batchAiProgress ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Reviewing {batchAiProgress.current}/{batchAiProgress.total}…
                    </>
                  ) : (
                    <>
                      <FiZap /> Review all {reviewBatchIds.length} with AI
                    </>
                  )}
                </button>
              </div>
              {batchAiProgress && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-green-300/80 mb-1.5">
                    <span>Reviewing: {batchAiProgress.docName}</span>
                    <span>{batchAiProgress.current} of {batchAiProgress.total}</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-green-400 to-emerald-400 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(batchAiProgress.current / batchAiProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6 xl:items-start">
            <div className="flex flex-col min-h-[280px] w-full">
              <div className="flex items-center gap-2 mb-2 text-white/80 shrink-0 min-h-[2rem]">
                <FiCheckSquare className="text-amber-400 shrink-0" />
                <span className="font-medium truncate">
                  {referenceDocs.length === 1
                    ? referenceDocs[0]?.name
                    : `${referenceDocs.length} references: ${referenceDocs.map((d) => d.name).join(', ')}`}
                </span>
              </div>
              <div className="flex-1 min-h-[280px] max-h-[400px] overflow-auto p-4 bg-white/5 rounded-xl border border-white/10 text-sm whitespace-pre-wrap scrollbar-thin">
                {refText || 'No extracted text. Re-import or extract in Library.'}
              </div>
            </div>
            <div className="flex flex-col min-h-[280px] w-full">
              <div className="flex items-center gap-2 mb-2 text-white/80 shrink-0 min-h-[2rem]">
                <FiFileText className="text-sky-400 shrink-0" />
                <span className="font-medium truncate">
                  {underReviewDoc?.name ?? 'Under review'}
                </span>
              </div>
              <div className="flex-1 min-h-[280px] max-h-[400px] overflow-auto p-4 bg-white/5 rounded-xl border border-white/10 text-sm whitespace-pre-wrap scrollbar-thin">
                {underText || 'No extracted text. Re-import or extract in Library.'}
              </div>
            </div>
          </div>

          {/* Form: verdict, findings, review scope, notes */}
          {isEditing && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-white/80 mb-2">Review scope</label>
                <textarea
                  value={reviewScope}
                  onChange={(e) => setReviewScope(e.target.value)}
                  placeholder="e.g., Chapters 3 and 5 only, Section 2.1 compliance"
                  rows={2}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light resize-y placeholder-white/40"
                />
              </div>
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
              <div className="space-y-2 mb-4">
                <span className="text-sm font-medium text-white/80">Attach images (optional)</span>
                <p className="text-xs text-white/60">Photos of nameplates, logs, or document pages to include when suggesting findings.</p>
                <input
                  ref={paperworkImageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  multiple
                  onChange={handlePaperworkImageAttach}
                  className="hidden"
                  disabled={aiSuggesting}
                />
                <button
                  type="button"
                  onClick={() => paperworkImageInputRef.current?.click()}
                  disabled={aiSuggesting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-sm text-white/80 hover:bg-white/15 disabled:opacity-50"
                >
                  <FiImage className="w-4 h-4" /> Choose images
                </button>
                {paperworkAttachedImages.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {paperworkAttachedImages.map((img, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 py-1.5 px-2 bg-white/5 rounded text-sm">
                        <span className="truncate text-white/80">{img.name}</span>
                        <button
                          type="button"
                          onClick={() => removePaperworkImage(i)}
                          disabled={aiSuggesting}
                          className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white"
                          aria-label="Remove image"
                        >
                          <FiX className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="text-sm font-medium text-white/80">Findings</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleAiSuggestFindings}
                      disabled={aiSuggesting || !refText.trim() || !underText.trim()}
                      className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 disabled:opacity-50"
                    >
                      {aiSuggesting && !batchAiProgress ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                          Analyzing…
                        </>
                      ) : (
                        <>
                          <FiZap /> Suggest findings{reviewBatchIds.length > 1 ? ' (this doc only)' : ''}
                        </>
                      )}
                    </button>
                    <PageModelSelector field="paperworkReviewModel" label="AI model" disabled={aiSuggesting} className="shrink-0" />
                    <button
                      type="button"
                      onClick={addFinding}
                      className="flex items-center gap-1 text-sm text-sky-light hover:text-sky-lighter"
                    >
                      <FiPlus /> Add finding
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  {findings.length === 0 && (
                    <p className="text-white/70 text-sm">No findings yet.</p>
                  )}
                  {findings.map((f) => (
                    <div
                      key={f.id}
                      className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={f.severity}
                          onChange={(e) =>
                            updateFinding(f.id, {
                              severity: e.target.value as FindingSeverity,
                            })
                          }
                          className="px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-sm font-medium text-white"
                        >
                          {SEVERITY_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          placeholder="Location (e.g. Section 3.2, Page 5)"
                          value={f.location ?? ''}
                          onChange={(e) => updateFinding(f.id, { location: e.target.value })}
                          className="flex-1 min-w-[140px] px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg text-sm placeholder-white/50"
                        />
                        <button
                          type="button"
                          onClick={() => removeFinding(f.id)}
                          className="p-2 text-white/70 hover:text-red-400 hover:bg-red-400/10 rounded-lg shrink-0"
                          title="Remove finding"
                        >
                          <FiTrash2 />
                        </button>
                      </div>
                      <AutoResizeTextarea
                        placeholder="Describe the finding in detail..."
                        value={f.description}
                        onChange={(e) => updateFinding(f.id, { description: e.target.value })}
                        minRows={2}
                        maxHeight={400}
                        className="w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm placeholder-white/50 resize-none focus:outline-none focus:border-sky-400/50"
                      />
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
        </GlassCard>
      )}

      {/* Past reviews list */}
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <FiFolder />
            Past reviews
          </h2>
          {reviews.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                try {
                  const items = reviews.map((r: any) => reviewToPdfItem(r, docIdToName, activeProject?.name));
                  const generator = new PaperworkReviewPDFGenerator();
                  const pdfBytes = await generator.generate(items);
                  const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `paperwork-reviews-${new Date().toISOString().slice(0, 10)}.pdf`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success('Reviews exported as PDF (includes drafts and completed)');
                } catch (e: any) {
                  toast.error(getConvexErrorMessage(e) || 'PDF export failed');
                }
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg font-medium flex items-center gap-2 text-sm"
            >
              <FiDownload /> Export all reviews
            </button>
          )}
        </div>
        {reviews.length === 0 ? (
          <p className="text-white/70">No reviews yet. Start a review above.</p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-auto scrollbar-thin">
            {reviews.map((r: any) => (
              <div key={r._id} className="space-y-2">
                <div
                  className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">
                      {(() => {
                        const projectIds = (r as any).referenceDocumentIds ?? (r.referenceDocumentId ? [r.referenceDocumentId] : []);
                        const sharedIds = (r as any).sharedReferenceDocumentIds ?? (r.sharedReferenceDocumentId ? [r.sharedReferenceDocumentId] : []);
                        const refNames = [...projectIds, ...sharedIds].map((id) => docIdToName.get(id) ?? id).join(', ');
                        const docLabel = docIdToName.get(r.underReviewDocumentId) ?? 'Under review';
                        const base = refNames ? `${refNames} vs ${docLabel}` : docLabel;
                        return (r as any).name ? `${(r as any).name} · ${base}` : base;
                      })()}
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
                          const projectIds = (r as any).referenceDocumentIds ?? (r.referenceDocumentId ? [r.referenceDocumentId] : []);
                          const sharedIds = (r as any).sharedReferenceDocumentIds ?? (r.sharedReferenceDocumentId ? [r.sharedReferenceDocumentId] : []);
                          setReferenceEntries([
                            ...projectIds.map((id: string) => ({ source: 'project' as const, id })),
                            ...sharedIds.map((id: string) => ({ source: 'shared' as const, id })),
                          ]);
                          setUnderReviewIds([r.underReviewDocumentId]);
                          setReviewBatchIds([r._id]);
                          setFindings(
                            (r.findings as any[])?.map((f: any) => ({
                              id: f.id || crypto.randomUUID(),
                              severity: f.severity || 'minor',
                              location: f.location,
                              description: f.description || '',
                            })) ?? []
                          );
                          setReviewScope((r as any).reviewScope ?? '');
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
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const item = reviewToPdfItem(r, docIdToName, activeProject?.name);
                          const generator = new PaperworkReviewPDFGenerator();
                          const pdfBytes = await generator.generate([item]);
                          const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          const dateStr = new Date(r.createdAt).toISOString().slice(0, 10);
                          const label = ((r as any).name ?? docIdToName.get(r.underReviewDocumentId) ?? 'review').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
                          a.download = `paperwork-review-${label}-${dateStr}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast.success('Review downloaded as PDF');
                        } catch (e: any) {
                          toast.error(getConvexErrorMessage(e) || 'PDF download failed');
                        }
                      }}
                      className="px-3 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm flex items-center gap-1"
                      title="Download this review as PDF"
                    >
                      <FiDownload /> Download
                    </button>
                    <button
                      onClick={() => setDiscardConfirmTarget(r._id)}
                      className="px-3 py-2 text-white/70 hover:text-red-300 hover:bg-red-400/10 rounded-lg text-sm flex items-center gap-1"
                      title="Discard review"
                    >
                      <FiTrash2 /> Discard
                    </button>
                  </div>
                </div>
                {viewPastId === r._id && (
                  <div className="ml-2 p-4 bg-white/5 rounded-xl border border-white/10">
                    <h3 className="font-semibold mb-2">Review details</h3>
                    <p className="text-sm text-white/70 mb-2">
                      Verdict: <span className="font-medium">{r.verdict ?? '—'}</span>
                      {r.completedAt && (
                        <span className="ml-4">
                          Completed {new Date(r.completedAt).toLocaleString()}
                        </span>
                      )}
                    </p>
                    {(r as any).reviewScope && (
                      <p className="text-sm text-white/60 mb-2">Scope: {(r as any).reviewScope}</p>
                    )}
                    {r.notes && (
                      <p className="text-sm text-white/60 mb-2">Notes: {r.notes}</p>
                    )}
                    {r.findings?.length > 0 && (
                      <div className="space-y-3 mt-3">
                        <h4 className="text-sm font-semibold text-white/90">Findings</h4>
                        {(r.findings as any[]).map((f: any, i: number) => (
                          <div
                            key={f.id || i}
                            className="p-4 rounded-xl border border-white/15 bg-white/5"
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span
                                className={`inline-flex px-2.5 py-0.5 rounded-md text-xs font-semibold uppercase tracking-wide ${
                                  f.severity === 'critical'
                                    ? 'bg-red-500/30 text-red-300'
                                    : f.severity === 'major'
                                      ? 'bg-amber-500/30 text-amber-300'
                                      : f.severity === 'minor'
                                        ? 'bg-yellow-500/20 text-yellow-200'
                                        : 'bg-sky-500/20 text-sky-300'
                                }`}
                              >
                                {SEVERITY_OPTIONS.find((o) => o.value === (f.severity ?? 'observation'))?.label ?? 'Observation'}
                              </span>
                              {f.location && (
                                <span className="text-xs text-white/60 font-medium">
                                  {f.location}
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">
                              {f.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Discard confirm modal — replaces browser confirm() */}
      {discardConfirmTarget !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="discard-modal-title">
          <GlassCard padding="xl" className="w-full max-w-md">
            <h2 id="discard-modal-title" className="text-xl font-display font-bold text-white mb-2">
              Discard review?
            </h2>
            <p className="text-white/80 mb-6">
              {discardConfirmTarget === 'draft'
                ? 'This draft will be permanently removed.'
                : 'This review will be permanently removed.'}
            </p>
            <div className="flex flex-wrap gap-3 justify-end">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setDiscardConfirmTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="md"
                onClick={performDiscard}
              >
                Discard
              </Button>
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}
