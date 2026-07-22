import { useState, useMemo, useRef, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useTheme } from '../context/ThemeContext';
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
  FiPlusCircle,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useConvex } from 'convex/react';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useDocumentReviews,
  useAddDocumentReview,
  useUpdateDocumentReview,
  useRemoveDocumentReview,
  useSharedReferenceDocsResolved,
  useSharedAgentDocsByAgentsResolved,
  useAllProjectAgentDocs,
  useAddDocument,
  useProject,
  useUpsertUserSettings,
  usePaperworkReviewModel,
  usePaperworkReviewAgentId,
  useAddEntityIssue,
  useUpdateDocumentExtractedText,
  useLogProductEvent,
} from '../hooks/useConvexData';
import { AUDIT_AGENTS, PAPERWORK_REVIEW_AGENT_IDS, getPaperworkReviewSystemPrompt } from '../services/auditAgents';
import { ClaudeAnalyzer, type AttachedImage } from '../services/claudeApi';
import { DocumentExtractor } from '../services/documentExtractor';
import { PaperworkReviewPDFGenerator, type PaperworkReviewForPdf } from '../services/paperworkReviewPdfGenerator';
import type { Id } from '../../convex/_generated/dataModel';
import { api } from '../../convex/_generated/api';
import type { AuditAgent } from '../types/auditSimulation';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { getConvexErrorMessage } from '../utils/convexError';
import { resolveExtractedTextForConvexDoc } from '../utils/documentExtractedText';
import type { BadgeVariant } from './ui';
import { Badge, Button, GlassCard, Select } from './ui';
import { PageModelSelector } from './PageModelSelector';
import { useConfirmDialog } from './confirm/ConfirmDialogProvider';

export type ReviewVerdict = 'pass' | 'conditional' | 'fail';
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'observation';
export type HumanFindingStatus = 'draft' | 'accepted' | 'needs_work';

export interface ReviewFinding {
  id: string;
  severity: FindingSeverity;
  location?: string;
  description: string;
  /**
   * Human review state for this finding.
   * Stored inside `documentReviews.findings` (which is v.any in Convex),
   * so we can safely evolve this shape without a schema migration.
   */
  humanStatus?: HumanFindingStatus;
  reviewedBy?: string;
  reviewedAt?: string;
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

const SEVERITY_ORDER: Record<FindingSeverity, number> = {
  critical: 0,
  major: 1,
  minor: 2,
  observation: 3,
};

function sortFindingsBySeverity<T extends { severity?: string }>(findings: T[]): T[] {
  return [...findings].sort((a, b) => {
    const orderA = SEVERITY_ORDER[a.severity as FindingSeverity] ?? 99;
    const orderB = SEVERITY_ORDER[b.severity as FindingSeverity] ?? 99;
    return orderA - orderB;
  });
}

function findingSeverityBadgeVariant(severity: string | undefined): BadgeVariant {
  switch (severity) {
    case 'critical':
      return 'destructive';
    case 'major':
      return 'warning';
    case 'minor':
      return 'default';
    case 'observation':
    default:
      return 'info';
  }
}

function verdictBadgeVariant(verdict: string | undefined): BadgeVariant {
  const v = (verdict ?? '').toLowerCase();
  switch (v) {
    case 'pass':
      return 'success';
    case 'conditional':
      return 'warning';
    case 'fail':
      return 'destructive';
    default:
      return 'outline';
  }
}

type EvidenceSegments = {
  requirement?: string;
  evidence?: string;
  gap?: string;
  correctiveAction?: string;
  recommendedAction?: string;
};

function normalizeEvidenceText(input: string): string {
  return (input ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*>\s*/gm, '')
    .replace(/\*\*/g, '')
    .trim();
}

function parseEvidenceSegments(description: string): EvidenceSegments {
  const text = normalizeEvidenceText(description);
  if (!text) return {};

  const labels = [
    'Requirement',
    'Evidence',
    'Gap',
    'Corrective action',
    'Recommended action',
    'Recommended corrective action',
  ];

  // First try: pipe format like "Requirement: ... | Evidence: ... | Gap: ... | Corrective action: ..."
  if (text.includes('|') && /Requirement\s*:|Evidence\s*:|Gap\s*:|Corrective action\s*:|Recommended action\s*:|Recommended corrective action\s*:/i.test(text)) {
    const parts = text
      .split('|')
      .map((p) => p.trim())
      .filter(Boolean);

    const out: EvidenceSegments = {};
    for (const part of parts) {
      const m = part.match(
        /^(Requirement|Evidence|Gap|Corrective action|Recommended action|Recommended corrective action)\s*:\s*([\s\S]*?)$/
      );
      if (!m) continue;
      const rawLabel = String(m[1]).toLowerCase();
      const value = String(m[2] ?? '').trim();
      if (!value) continue;

      if (rawLabel === 'requirement') out.requirement = value;
      else if (rawLabel === 'evidence') out.evidence = value;
      else if (rawLabel === 'gap') out.gap = value;
      else if (rawLabel === 'corrective action') out.correctiveAction = value;
      else if (rawLabel === 'recommended action') out.recommendedAction = value;
      else if (rawLabel === 'recommended corrective action') out.recommendedAction = value;
    }
    if (out.requirement || out.evidence || out.gap || out.correctiveAction || out.recommendedAction) return out;
  }

  // Second try: multi-line blocks with labels, stopping at the next label.
  const extract = (label: string, next: string[]): string | undefined => {
    const nextGroup = next.length ? next.join('|') : '$';
    const re = new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=(?:${nextGroup})|$)`, 'i');
    const m = text.match(re);
    const v = m?.[1]?.trim();
    return v || undefined;
  };

  return {
    requirement: extract('Requirement', ['Evidence', 'Gap', 'Corrective action', 'Recommended action', 'Recommended corrective action']),
    evidence: extract('Evidence', ['Gap', 'Corrective action', 'Recommended action', 'Recommended corrective action']),
    gap: extract('Gap', ['Corrective action', 'Recommended action', 'Recommended corrective action']),
    correctiveAction: extract('Corrective action', ['Recommended action', 'Recommended corrective action']),
    recommendedAction:
      extract('Recommended action', ['Recommended corrective action']) ??
      extract('Recommended corrective action', labels.filter((l) => l !== 'Recommended corrective action')),
  };
}

const UNDER_REVIEW_CATEGORY_LABELS: Record<string, string> = {
  entity: 'Entity documents',
  sms: 'SMS documents',
  uploaded: 'Uploaded documents',
  regulatory: 'Regulatory documents',
};

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
    humanStatus: 'draft',
  };
}

function reviewToPdfItem(r: any, docIdToName: Map<string, string>, projectName?: string): PaperworkReviewForPdf {
  const projectIds = (r as any).referenceDocumentIds ?? (r.referenceDocumentId ? [r.referenceDocumentId] : []);
  const sharedIds = (r as any).sharedReferenceDocumentIds ?? (r.sharedReferenceDocumentId ? [r.sharedReferenceDocumentId] : []);
  const refNames = [...projectIds, ...sharedIds].map((id: string) => docIdToName.get(id) ?? id).join(', ');
  const rawFindings = (r.findings as any[])?.map((f: any) => ({
    severity: f.severity ?? 'observation',
    location: f.location,
    description: f.description ?? '',
  })) ?? [];
  return {
    projectName,
    reviewName: (r as any).name,
    underReviewDocumentName: docIdToName.get(r.underReviewDocumentId) ?? r.underReviewDocumentId,
    referenceDocumentNames: refNames,
    status: r.status,
    verdict: r.verdict,
    findings: sortFindingsBySeverity(rawFindings),
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
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const navigate = useNavigate();
  const convex = useConvex();
  const confirmDialog = useConfirmDialog();
  const { user } = useUser();
  const activeProject = useProject(activeProjectId || undefined) as any;

  const allDocuments = (useDocuments(activeProjectId || undefined) || []) as any[];
  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const smsDocuments = (useDocuments(activeProjectId || undefined, 'sms') || []) as any[];
  const referenceDocuments = (useDocuments(activeProjectId || undefined, 'reference') || []) as any[];
  const sharedRefDocs = (useSharedReferenceDocsResolved() || []) as any[];
  const paperworkKbAgentIds = useMemo(() => AUDIT_AGENTS.map((a) => a.id), []);
  const sharedKbDocs = (useSharedAgentDocsByAgentsResolved(paperworkKbAgentIds) || []).filter(
    (d: any) => (d.extractedText || '').length > 0
  ) as any[];
  const projectKbDocs = (useAllProjectAgentDocs(activeProjectId || undefined) || []).filter(
    (d: any) => (d.extractedText || '').length > 0
  ) as any[];
  const allKbDocs = useMemo(
    () => [...sharedKbDocs, ...projectKbDocs],
    [sharedKbDocs, projectKbDocs]
  );
  const addDocument = useAddDocument();
  const reviews = (useDocumentReviews(activeProjectId || undefined) || []) as any[];
  const addReview = useAddDocumentReview();
  const updateReview = useUpdateDocumentReview();
  const removeReview = useRemoveDocumentReview();
  const upsertSettings = useUpsertUserSettings();
  const paperworkReviewModel = usePaperworkReviewModel();
  const paperworkReviewAgentIdFromStore = usePaperworkReviewAgentId();
  const addEntityIssue = useAddEntityIssue();
  const updateDocumentExtractedText = useUpdateDocumentExtractedText();
  const logProductEvent = useLogProductEvent();
  const extractorRef = useRef(new DocumentExtractor());

  const validAgentIds = useMemo(
    () => new Set(PAPERWORK_REVIEW_AGENT_IDS as readonly string[]),
    []
  );
  const paperworkReviewAgentId = validAgentIds.has(paperworkReviewAgentIdFromStore)
    ? paperworkReviewAgentIdFromStore
    : 'generic';

  const [localPerspectiveId, setLocalPerspectiveId] = useState<string>(paperworkReviewAgentId);
  useEffect(() => {
    setLocalPerspectiveId(paperworkReviewAgentId);
  }, [paperworkReviewAgentId]);

  // Documents that can be added "under review": any project doc that isn't reference (entity, sms, uploaded, regulatory)
  const documentsAvailableForUnderReview = useMemo(
    () => allDocuments.filter((d: any) => d.category !== 'reference'),
    [allDocuments]
  );

  /** Group documents by category for the under-review dropdown optgroups */
  const documentsByCategory = useMemo(() => {
    const order = ['entity', 'sms', 'uploaded', 'regulatory'] as const;
    const grouped = new Map<string, any[]>();
    for (const d of documentsAvailableForUnderReview) {
      const cat = (d.category as string) || 'uploaded';
      const list = grouped.get(cat) || [];
      list.push(d);
      grouped.set(cat, list);
    }
    const known = order
      .filter((cat) => grouped.has(cat))
      .map((category) => ({
        category,
        label: UNDER_REVIEW_CATEGORY_LABELS[category] || category,
        docs: grouped.get(category) || [],
      }));
    const knownSet = new Set<string>(order);
    const otherCats = Array.from(grouped.keys()).filter((c) => !knownSet.has(c));
    const otherDocs = otherCats.flatMap((cat) => grouped.get(cat) || []);
    if (otherDocs.length === 0) return known;
    return [...known, { category: 'other', label: 'Other', docs: otherDocs }];
  }, [documentsAvailableForUnderReview]);

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

  /** Group reviews by batchId so we can offer one PDF per batch when multiple docs were selected */
  const reviewsByBatch = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of reviews) {
      const key = (r as any).batchId ?? r._id;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries());
  }, [reviews]);

  const [referenceEntries, setReferenceEntries] = useState<ReferenceEntry[]>([]);
  const [addRefValue, setAddRefValue] = useState<string>(''); // for "Add reference" dropdown
  const [referenceFilter, setReferenceFilter] = useState<string>('');
  const [addingKbRef, setAddingKbRef] = useState(false);
  const [underReviewIds, setUnderReviewIds] = useState<string[]>([]);
  const [underReviewFilter, setUnderReviewFilter] = useState<string>('');
  const [selectedAuditorIds, setSelectedAuditorIds] = useState<Set<AuditAgent['id']>>(new Set());
  const [reviewName, setReviewName] = useState<string>(''); // optional name for this review (allows multiple per document)
  const [currentReviewId, setCurrentReviewId] = useState<Id<'documentReviews'> | null>(null);
  const [reviewBatchIds, setReviewBatchIds] = useState<Id<'documentReviews'>[]>([]);
  const [verdict, setVerdict] = useState<ReviewVerdict | ''>('');
  const [findings, setFindings] = useState<ReviewFinding[]>([]);
  const [reviewScope, setReviewScope] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [buildingReport, setBuildingReport] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiReportDraft, setAiReportDraft] = useState('');
  const [generatingAiReport, setGeneratingAiReport] = useState(false);
  const [addingFindingsToEntityIssues, setAddingFindingsToEntityIssues] = useState(false);
  const [batchAiProgress, setBatchAiProgress] = useState<{ current: number; total: number; docName: string } | null>(null);
  const [autoExtractingText, setAutoExtractingText] = useState(false);
  const [docTextOverrides, setDocTextOverrides] = useState<Record<string, string>>({});
  /** Full text from `extractedTextStorageId` for project documents (Convex row size limit). */
  const [overflowTextByDocId, setOverflowTextByDocId] = useState<Record<string, string>>({});
  const [paperworkAttachedImages, setPaperworkAttachedImages] = useState<Array<{ name: string } & AttachedImage>>([]);
  const paperworkImageInputRef = useRef<HTMLInputElement>(null);
  const extractionInFlightRef = useRef<Set<string>>(new Set());
  const [setupCardExpanded, setSetupCardExpanded] = useState(true);
  const [pastReviewsExpanded, setPastReviewsExpanded] = useState(false);
  const prevCurrentReviewIdRef = useRef<Id<'documentReviews'> | null>(null);

  const currentReview = currentReviewId
    ? reviews.find((r: any) => r._id === currentReviewId)
    : null;

  useEffect(() => {
    setAiReportDraft('');
  }, [currentReviewId]);

  useEffect(() => {
    const prev = prevCurrentReviewIdRef.current;
    if (!prev && currentReviewId) {
      setSetupCardExpanded(false);
    }
    if (prev && !currentReviewId) {
      setSetupCardExpanded(true);
    }
    prevCurrentReviewIdRef.current = currentReviewId;
  }, [currentReviewId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const todo = allDocuments.filter(
        (d: any) => d.extractedTextStorageId && overflowTextByDocId[d._id] === undefined,
      );
      if (todo.length === 0) return;
      const batch: Record<string, string> = {};
      for (const d of todo) {
        if (cancelled) return;
        batch[d._id] = await resolveExtractedTextForConvexDoc(d, convex);
      }
      if (!cancelled) {
        setOverflowTextByDocId((prev) => ({ ...prev, ...batch }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allDocuments, convex, overflowTextByDocId]);

  const selectedReferenceDocs = useMemo(() => {
    return referenceEntries
      .map((e) => {
        const doc = e.source === 'shared'
          ? sharedRefDocs.find((d: any) => d._id === e.id) ?? null
          : allDocuments.find((d: any) => d._id === e.id) ?? null;
        if (!doc) return null;
        return { source: e.source, doc };
      })
      .filter(Boolean) as Array<{ source: ReferenceSource; doc: any }>;
  }, [referenceEntries, allDocuments, sharedRefDocs]);

  const underReviewDoc = currentReviewId
    ? (() => {
        const r = reviews.find((x: any) => x._id === currentReviewId);
        return r ? allDocuments.find((d: any) => d._id === r.underReviewDocumentId) : null;
      })()
    : underReviewIds[0] ? allDocuments.find((d: any) => d._id === underReviewIds[0]) : null;

  const getEffectiveDocText = (doc: any): string => {
    if (!doc) return '';
    return (
      docTextOverrides[doc._id] ??
      overflowTextByDocId[doc._id] ??
      doc.extractedText ??
      ''
    );
  };
  const auditorReferenceDocs = useMemo(
    () =>
      allKbDocs.filter(
        (d: any) =>
          selectedAuditorIds.has(d.agentId as AuditAgent['id']) &&
          (getEffectiveDocText(d) || '').trim().length > 0
      ),
    [allKbDocs, selectedAuditorIds, docTextOverrides, overflowTextByDocId]
  );
  const effectiveReferenceDocs = useMemo(
    () => (selectedReferenceDocs.length > 0 ? selectedReferenceDocs.map((r) => r.doc) : auditorReferenceDocs),
    [selectedReferenceDocs, auditorReferenceDocs]
  );
  const filteredUnderReviewGroups = useMemo(() => {
    const q = underReviewFilter.trim().toLowerCase();
    return documentsByCategory
      .map(({ category, label, docs }) => ({
        category,
        label,
        docs: docs
          .filter((d: any) => !referenceEntries.some((e) => e.source === 'project' && e.id === d._id))
          .filter((d: any) => underReviewIds.includes(d._id) || !q || (d.name || '').toLowerCase().includes(q)),
      }))
      .filter((group) => group.docs.length > 0);
  }, [documentsByCategory, referenceEntries, underReviewFilter, underReviewIds]);

  const filteredProjectReferenceOptions = useMemo(() => {
    const q = referenceFilter.trim().toLowerCase();
    return referenceDocuments.filter(
      (d: any) =>
        !referenceEntries.some((e) => e.source === 'project' && e.id === d._id) &&
        (!q || (d.name || '').toLowerCase().includes(q))
    );
  }, [referenceDocuments, referenceEntries, referenceFilter]);

  const filteredKbOptions = useMemo(() => {
    const q = referenceFilter.trim().toLowerCase();
    return allKbDocs.filter((d: any) => !q || (d.name || '').toLowerCase().includes(q));
  }, [allKbDocs, referenceFilter]);

  const filteredSharedRefGroups = useMemo(() => {
    const q = referenceFilter.trim().toLowerCase();
    return Array.from(sharedRefDocsByType.entries())
      .map(([typeId, docs]) => ({
        typeId,
        docs: docs.filter(
          (d: any) =>
            !referenceEntries.some((e) => e.source === 'shared' && e.id === d._id) &&
            (!q || (d.name || '').toLowerCase().includes(q))
        ),
      }))
      .filter((group) => group.docs.length > 0);
  }, [sharedRefDocsByType, referenceEntries, referenceFilter]);

  const availableReferenceOptionCount =
    filteredProjectReferenceOptions.length +
    filteredKbOptions.length +
    filteredSharedRefGroups.reduce((count, group) => count + group.docs.length, 0);
  const effectiveReferenceText = useMemo(
    () =>
      effectiveReferenceDocs
        .map((d) => `--- ${d.name} ---\n\n${getEffectiveDocText(d)}`)
        .join('\n\n'),
    [effectiveReferenceDocs, docTextOverrides, overflowTextByDocId]
  );
  const underText = getEffectiveDocText(underReviewDoc);
  const auditorNameById = useMemo(
    () => new Map(AUDIT_AGENTS.map((agent) => [agent.id, agent.name] as const)),
    []
  );
  const hasReferenceSelection = referenceEntries.length > 0;
  const hasUnderReviewSelection = underReviewIds.length > 0;
  const hasReferenceOrAuditor = hasReferenceSelection || selectedAuditorIds.size > 0;
  const effectiveReferenceNames = effectiveReferenceDocs.map((d: any) => d.name).join(', ');

  const fetchFileBuffer = async (url: string): Promise<ArrayBuffer> => {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`File download failed (${res.status})`);
    }
    return await res.arrayBuffer();
  };

  const ensureProjectDocText = async (doc: any): Promise<string> => {
    if (!doc) return '';
    const existing = getEffectiveDocText(doc);
    if (existing.trim()) return existing;

    if (extractionInFlightRef.current.has(doc._id)) {
      return '';
    }

    extractionInFlightRef.current.add(doc._id);
    try {
      const url = await convex.query((api as any).fileActions.getProjectDocumentFileUrl, {
        documentId: doc._id as Id<'documents'>,
      });
      if (!url) {
        throw new Error(`No stored file found for "${doc.name}". Re-import this file once so extraction can run automatically.`);
      }
      const fileBuffer = await fetchFileBuffer(url);
      const extracted = await extractorRef.current.extractText(
        fileBuffer,
        doc.name,
        doc.mimeType || 'application/octet-stream',
        paperworkReviewModel
      );
      if (!extracted.trim()) {
        throw new Error(`No readable text found in "${doc.name}".`);
      }
      await updateDocumentExtractedText({
        documentId: doc._id as Id<'documents'>,
        extractedText: extracted,
        extractedAt: new Date().toISOString(),
        mimeType: doc.mimeType || undefined,
        size: doc.size || undefined,
      } as any);
      return extracted;
    } finally {
      extractionInFlightRef.current.delete(doc._id);
    }
  };

  const ensureSharedRefText = async (doc: any): Promise<string> => {
    if (!doc) return '';
    const existing = getEffectiveDocText(doc);
    if (existing.trim()) return existing;

    if (extractionInFlightRef.current.has(doc._id)) {
      return '';
    }

    extractionInFlightRef.current.add(doc._id);
    try {
      const url = await convex.query((api as any).fileActions.getSharedReferenceDocumentFileUrl, {
        documentId: doc._id as Id<'sharedReferenceDocuments'>,
      });
      if (!url) {
        throw new Error(`No stored file found for shared reference "${doc.name}".`);
      }
      const fileBuffer = await fetchFileBuffer(url);
      const extracted = await extractorRef.current.extractText(
        fileBuffer,
        doc.name,
        doc.mimeType || 'application/octet-stream',
        paperworkReviewModel
      );
      if (!extracted.trim()) {
        throw new Error(`No readable text found in "${doc.name}".`);
      }
      setDocTextOverrides((prev) => ({ ...prev, [doc._id]: extracted }));
      return extracted;
    } finally {
      extractionInFlightRef.current.delete(doc._id);
    }
  };

  const ensureReferenceContextReady = async (): Promise<string> => {
    if (selectedReferenceDocs.length === 0) {
      const text = effectiveReferenceText.trim();
      if (!text) {
        throw new Error('No usable auditor reference context found. Select an auditor with knowledge docs or add a reference document.');
      }
      return text;
    }

    const parts: string[] = [];
    for (const entry of selectedReferenceDocs) {
      let text = getEffectiveDocText(entry.doc);
      if (!text.trim()) {
        text = entry.source === 'shared'
          ? await ensureSharedRefText(entry.doc)
          : await ensureProjectDocText(entry.doc);
      }
      if (text.trim()) {
        parts.push(`--- ${entry.doc.name} ---\n\n${text}`);
      }
    }
    if (parts.length === 0) {
      throw new Error('Reference text is empty. Add a reference with readable text.');
    }
    return parts.join('\n\n');
  };

  const ensureUnderReviewTextReady = async (): Promise<string> => {
    if (!underReviewDoc) throw new Error('Select a document under review first.');
    const current = getEffectiveDocText(underReviewDoc);
    if (current.trim()) return current;
    const extracted = await ensureProjectDocText(underReviewDoc);
    if (!extracted.trim()) {
      throw new Error('Under-review text is empty.');
    }
    return extracted;
  };

  const addReference = async (value: string) => {
    if (!value) return;
    if (value.startsWith('kb:')) {
      const kbDocId = value.slice(3);
      const kbDoc = allKbDocs.find((d: any) => d._id === kbDocId);
      if (!kbDoc || !activeProjectId || addingKbRef) return;
      setAddingKbRef(true);
      setAddRefValue('');
      try {
        const newDocId = await addDocument({
          projectId: activeProjectId as any,
          category: 'reference',
          name: kbDoc.name,
          path: kbDoc.path || kbDoc.name,
          source: 'knowledge-base',
          extractedText: kbDoc.extractedText ?? '',
          extractedAt: new Date().toISOString(),
        });
        setReferenceEntries((prev) => {
          if (prev.some((e) => e.source === 'project' && e.id === newDocId)) return prev;
          return [...prev, { source: 'project' as ReferenceSource, id: newDocId }];
        });
        toast.success(`Added "${kbDoc.name}" as reference`);
      } catch (e: any) {
        toast.error(getConvexErrorMessage(e) || 'Failed to add from knowledge base');
      } finally {
        setAddingKbRef(false);
      }
      return;
    }
    const source: ReferenceSource = value.startsWith('shared:') ? 'shared' : 'project';
    const id = value.startsWith('shared:') ? value.slice(7) : value;
    if (referenceEntries.some((e) => e.source === source && e.id === id)) return;
    setReferenceEntries((prev) => [...prev, { source, id }]);
    setAddRefValue('');
  };

  const removeReference = (source: ReferenceSource, id: string) => {
    setReferenceEntries((prev) => prev.filter((e) => !(e.source === source && e.id === id)));
  };

  const setUnderReviewSelection = (docIds: string[]) => {
    const uniqueIds = Array.from(new Set(docIds.filter(Boolean)));
    setUnderReviewIds(uniqueIds);
  };

  const toggleUnderReviewSelection = (docId: string) => {
    setUnderReviewIds((prev) => {
      if (prev.includes(docId)) return prev.filter((id) => id !== docId);
      return [...prev, docId];
    });
  };

  const selectAllVisibleUnderReview = () => {
    const visibleIds = filteredUnderReviewGroups.flatMap((group) => group.docs.map((d: any) => d._id));
    setUnderReviewSelection([...underReviewIds, ...visibleIds]);
  };

  const removeUnderReview = (docId: string) => {
    setUnderReviewIds((prev) => prev.filter((id) => id !== docId));
  };

  const selectAllAuditorsForDraft = () => {
    setSelectedAuditorIds(new Set(AUDIT_AGENTS.map((agent) => agent.id)));
  };

  const clearAuditorsForDraft = () => {
    setSelectedAuditorIds(new Set());
  };

  const toggleAuditorSelection = (auditorId: AuditAgent['id']) => {
    setSelectedAuditorIds((prev) => {
      const next = new Set(prev);
      if (next.has(auditorId)) {
        next.delete(auditorId);
      } else {
        next.add(auditorId);
      }
      return next;
    });
  };

  const saveCurrentReviewAuditors = async (next: Set<AuditAgent['id']>) => {
    if (!currentReviewId) return;
    setSelectedAuditorIds(next);
    try {
      await updateReview({
        reviewId: currentReviewId,
        auditorIds: Array.from(next),
      });
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'Failed to update auditors');
    }
  };

  const selectAllAuditorsForCurrentReview = async () => {
    const next = new Set<AuditAgent['id']>(AUDIT_AGENTS.map((agent) => agent.id));
    await saveCurrentReviewAuditors(next);
  };

  const clearAuditorsForCurrentReview = async () => {
    await saveCurrentReviewAuditors(new Set());
  };

  const toggleCurrentReviewAuditor = async (auditorId: AuditAgent['id']) => {
    const next = new Set(selectedAuditorIds);
    if (next.has(auditorId)) {
      next.delete(auditorId);
    } else {
      next.add(auditorId);
    }
    await saveCurrentReviewAuditors(next);
  };

  const hydrateFromReview = (review: any, batchIdsOverride?: Id<'documentReviews'>[]) => {
    const projectIds = (review as any).referenceDocumentIds ?? (review.referenceDocumentId ? [review.referenceDocumentId] : []);
    const sharedIds = (review as any).sharedReferenceDocumentIds ?? (review.sharedReferenceDocumentId ? [review.sharedReferenceDocumentId] : []);
    setReferenceEntries([
      ...projectIds.map((id: string) => ({ source: 'project' as const, id })),
      ...sharedIds.map((id: string) => ({ source: 'shared' as const, id })),
    ]);

    const batchIds = batchIdsOverride ?? (((review as any).batchId
      ? (reviews as any[]).filter((x: any) => x.batchId === (review as any).batchId).map((x: any) => x._id)
      : [review._id]) as Id<'documentReviews'>[]);
    setReviewBatchIds(batchIds);

    const underIds = batchIds.length > 1
      ? batchIds
          .map((id: Id<'documentReviews'>) => (reviews as any[]).find((x: any) => x._id === id)?.underReviewDocumentId)
          .filter(Boolean)
      : [review.underReviewDocumentId];
    setUnderReviewIds(underIds as string[]);

    setSelectedAuditorIds(new Set((((review as any).auditorIds ?? []) as AuditAgent['id'][])));
    setFindings(
      (review.findings as any[])?.map((f: any) => ({
        id: f.id || crypto.randomUUID(),
        severity: f.severity || 'minor',
        location: f.location,
        description: f.description || '',
        humanStatus: f.humanStatus || 'draft',
        reviewedBy: f.reviewedBy,
        reviewedAt: f.reviewedAt,
      })) ?? []
    );
    setReviewScope((review as any).reviewScope ?? '');
    setNotes(review.notes ?? '');
    setVerdict((review.verdict as ReviewVerdict) ?? '');
  };

  // Auto-select a "fail" verdict when a draft review has critical findings, so the reviewer
  // can complete without manually choosing one. Kept with the other hooks (above the early
  // return below) so hook order stays stable across renders (react-hooks/rules-of-hooks).
  useEffect(() => {
    const editing = !!currentReviewId && currentReview?.status === 'draft';
    if (!editing) return;
    if (findings.some((f) => f.severity === 'critical') && !verdict) {
      setVerdict('fail');
    }
  }, [currentReviewId, currentReview, findings, verdict]);

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 h-full min-h-0">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">
            Choose an existing project from the sidebar or create a new one to get started.
          </p>
          <Button size="lg" onClick={() => navigate('/logbook')} className="mx-auto">
            Open Logbook
          </Button>
        </GlassCard>
      </div>
    );
  }

  const handleStartReview = async () => {
    if (underReviewIds.length === 0) return;
    if (referenceEntries.length === 0 && selectedAuditorIds.size === 0) {
      toast.warning('Add at least one reference document or select an auditor to start the review.');
      return;
    }
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
      const batchId = uniqueUnderReviewIds.length > 1 ? crypto.randomUUID() : undefined;
      for (let i = 0; i < uniqueUnderReviewIds.length; i++) {
        const docId = uniqueUnderReviewIds[i];
        const nameForThis = uniqueUnderReviewIds.length > 1 && reviewName.trim()
          ? `${reviewName.trim()} (${docIdToName.get(docId) ?? 'doc'})`
          : (reviewName.trim() || undefined);
        const reviewArgs: any = {
          projectId: activeProjectId as Id<'projects'>,
          underReviewDocumentId: docId as Id<'documents'>,
          auditorIds: Array.from(selectedAuditorIds),
          name: nameForThis,
          status: 'draft',
          findings: [],
          reviewScope: reviewScope.trim() || undefined,
          referenceDocumentIds: projectRefIds.length > 0 ? (projectRefIds as Id<'documents'>[]) : undefined,
          sharedReferenceDocumentIds: sharedRefIds.length > 0 ? (sharedRefIds as Id<'sharedReferenceDocuments'>[]) : undefined,
          batchId,
        };
        const id = await addReview(reviewArgs);
        createdIds.push(id);
      }
      setReviewBatchIds(createdIds);
      setCurrentReviewId(createdIds[0]);
      setReviewName('');
      setVerdict('');
      setFindings([]);
      setAiReportDraft('');
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
        findings: findings.map(({ id, severity, location, description, humanStatus, reviewedBy, reviewedAt }) => ({
          id,
          severity,
          location,
          description,
          humanStatus: humanStatus || 'draft',
          reviewedBy,
          reviewedAt,
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
        findings: findings.map(({ id, severity, location, description, humanStatus, reviewedBy, reviewedAt }) => ({
          id,
          severity,
          location,
          description,
          humanStatus: humanStatus || 'draft',
          reviewedBy,
          reviewedAt,
        })),
        reviewScope: reviewScope.trim() || undefined,
        notes: notes || undefined,
      });
      const remaining = reviewBatchIds.filter((id) => id !== currentReviewId);
      if (remaining.length > 0) {
        const nextId = remaining[0];
        setCurrentReviewId(nextId);
        const nextR = reviews.find((r: any) => r._id === nextId);
        if (nextR) {
          hydrateFromReview(nextR, remaining);
        } else {
          setVerdict('');
          setFindings([]);
          setSelectedAuditorIds(new Set());
        }
      } else {
        setCurrentReviewId(null);
        setReviewBatchIds([]);
        setReferenceEntries([]);
        setUnderReviewIds([]);
        setSelectedAuditorIds(new Set());
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

  const handleBuildReport = async () => {
    if (!currentReview) return;
    setBuildingReport(true);
    try {
      const projectIds = (currentReview as any).referenceDocumentIds ?? (currentReview.referenceDocumentId ? [(currentReview as any).referenceDocumentId] : []);
      const sharedIds = (currentReview as any).sharedReferenceDocumentIds ?? (currentReview.sharedReferenceDocumentId ? [(currentReview as any).sharedReferenceDocumentId] : []);
      const refNames = [...projectIds, ...sharedIds].map((id: string) => docIdToName.get(id) ?? id).join(', ');
      const item: PaperworkReviewForPdf = {
        projectName: activeProject?.name,
        reviewName: (currentReview as any).name,
        underReviewDocumentName: docIdToName.get((currentReview as any).underReviewDocumentId) ?? (currentReview as any).underReviewDocumentId,
        referenceDocumentNames: refNames,
        status: 'draft',
        verdict: verdict || undefined,
        findings: sortFindingsBySeverity(
          findings.map((f) => ({ severity: f.severity, location: f.location, description: f.description }))
        ),
        reviewScope: reviewScope.trim() || undefined,
        notes: notes || undefined,
        createdAt: (currentReview as any).createdAt,
        completedAt: undefined,
      };
      const generator = new PaperworkReviewPDFGenerator();
      const pdfBytes = await generator.generate([item]);
      const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toISOString().slice(0, 10);
      const label = ((currentReview as any).name ?? docIdToName.get((currentReview as any).underReviewDocumentId) ?? 'review').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
      a.download = `paperwork-review-draft-${label}-${dateStr}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Draft report downloaded as PDF');
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'Failed to build report');
    } finally {
      setBuildingReport(false);
    }
  };

  const handleAddFindingsToEntityIssues = async () => {
    if (!activeProjectId || findings.length === 0) return;
    setAddingFindingsToEntityIssues(true);
    try {
      for (const f of findings) {
        await addEntityIssue({
          projectId: activeProjectId as any,
          source: 'paperwork_review',
          sourceId: currentReviewId ?? undefined,
          severity: f.severity,
          title: f.location ? `${f.location}: ${f.description.slice(0, 60)}${f.description.length > 60 ? '…' : ''}` : f.description.slice(0, 80) || 'Finding',
          description: f.description,
          location: f.location,
        });
      }
      toast.success(`${findings.length} finding(s) added to Entity issues`);
      navigate('/entity-issues');
    } catch (e: any) {
      toast.error(e?.message ?? 'Failed to add to entity issues');
    } finally {
      setAddingFindingsToEntityIssues(false);
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
    if (!underReviewDoc) {
      toast.warning('Select a document under review first.');
      return;
    }
    setAiSuggesting(true);
    setAutoExtractingText(true);
    const imagePayload = paperworkAttachedImages.map(({ media_type, data }) => ({ media_type, data }));
    try {
      const resolvedRefText = await ensureReferenceContextReady();
      const resolvedUnderText = await ensureUnderReviewTextReady();
      const analyzer = new ClaudeAnalyzer(undefined, paperworkReviewModel);
      const systemPrompt = getPaperworkReviewSystemPrompt(localPerspectiveId);
      const suggested = await analyzer.suggestPaperworkFindings(
        resolvedRefText,
        resolvedUnderText,
        effectiveReferenceNames || 'Reference context',
        underReviewDoc?.name,
        reviewScope.trim() || undefined,
        imagePayload.length ? imagePayload : undefined,
        notes.trim() || undefined,
        systemPrompt
      );
      const newFindings: ReviewFinding[] = suggested.map((f) => ({
        id: crypto.randomUUID(),
        severity: (f.severity as FindingSeverity) || 'minor',
        location: f.location,
        description: f.description,
        humanStatus: 'draft',
      }));
      setFindings((prev) => [...prev, ...newFindings]);
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'AI suggestion failed');
    } finally {
      setAutoExtractingText(false);
      setAiSuggesting(false);
    }
  };
  const handleGenerateAiReport = async () => {
    if (!underReviewDoc) {
      toast.warning('Select a document under review first.');
      return;
    }
    setGeneratingAiReport(true);
    setAutoExtractingText(true);
    try {
      const resolvedRefText = await ensureReferenceContextReady();
      const resolvedUnderText = await ensureUnderReviewTextReady();
      const analyzer = new ClaudeAnalyzer(undefined, paperworkReviewModel);
      const auditorNames = Array.from(selectedAuditorIds)
        .map((id) => auditorNameById.get(id) ?? id)
        .filter(Boolean);
      const systemPrompt = getPaperworkReviewSystemPrompt(localPerspectiveId);
      const report = await analyzer.generatePaperworkReviewReport({
        referenceText: resolvedRefText,
        underReviewText: resolvedUnderText,
        referenceNames: effectiveReferenceNames || 'Reference context',
        underReviewName: underReviewDoc?.name ?? 'Document under review',
        findings: sortFindingsBySeverity(
          findings.map((f) => ({ severity: f.severity, location: f.location, description: f.description }))
        ),
        reviewScope: reviewScope.trim() || undefined,
        notes: notes.trim() || undefined,
        auditorNames,
        systemPrompt,
        attachedImages: paperworkAttachedImages.map(({ media_type, data }) => ({ media_type, data })),
      });
      setAiReportDraft(report);
      toast.success('AI report draft generated.');
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'AI report generation failed');
    } finally {
      setAutoExtractingText(false);
      setGeneratingAiReport(false);
    }
  };
  const handleDownloadAiReport = () => {
    if (!aiReportDraft.trim()) return;
    const blob = new Blob([aiReportDraft], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    const label = (underReviewDoc?.name ?? 'paperwork-review').replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 40);
    a.href = url;
    a.download = `paperwork-ai-report-${label}-${dateStr}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const handleAiSuggestAllDocuments = async () => {
    if (reviewBatchIds.length === 0) {
      toast.warning('No reviews in this batch.');
      return;
    }
    setAiSuggesting(true);
    setAutoExtractingText(true);
    try {
      const resolvedRefText = await ensureReferenceContextReady();
      const analyzer = new ClaudeAnalyzer(undefined, paperworkReviewModel);
      const total = reviewBatchIds.length;

      if (total > 1) {
        setBatchAiProgress({ current: 1, total: 1, docName: 'Comparing all documents together…' });
        const underReviewDocs = reviewBatchIds
          .map((reviewId) => {
            const review = reviews.find((r: any) => r._id === reviewId);
            if (!review) return null;
            const doc = allDocuments.find((d: any) => d._id === review.underReviewDocumentId);
            const name = doc?.name ?? docIdToName.get(review.underReviewDocumentId) ?? 'Document';
            const text = doc ? getEffectiveDocText(doc).trim() : '';
            return text ? { name, text } : null;
          })
          .filter(Boolean) as { name: string; text: string }[];

        if (underReviewDocs.length < reviewBatchIds.length) {
          for (const reviewId of reviewBatchIds) {
            const review = reviews.find((r: any) => r._id === reviewId);
            if (!review) continue;
            const doc = allDocuments.find((d: any) => d._id === review.underReviewDocumentId);
            if (!doc) continue;
            if (getEffectiveDocText(doc).trim()) continue;
            await ensureProjectDocText(doc);
          }
        }
        const underReviewDocsAfterExtract = reviewBatchIds
          .map((reviewId) => {
            const review = reviews.find((r: any) => r._id === reviewId);
            if (!review) return null;
            const doc = allDocuments.find((d: any) => d._id === review.underReviewDocumentId);
            if (!doc) return null;
            const text = getEffectiveDocText(doc).trim();
            if (!text) return null;
            return { name: doc.name ?? 'Document', text };
          })
          .filter(Boolean) as { name: string; text: string }[];
        if (underReviewDocsAfterExtract.length === 0) {
          throw new Error('No under-review documents contain readable text.');
        }

        const imagePayload = paperworkAttachedImages.map(({ media_type, data }) => ({ media_type, data }));
        const systemPrompt = getPaperworkReviewSystemPrompt(localPerspectiveId);
        const { byDocument, crossDocumentFindings } = await analyzer.suggestPaperworkFindingsBatch(
          resolvedRefText,
          underReviewDocsAfterExtract,
          effectiveReferenceNames || 'Reference context',
          reviewScope.trim() || undefined,
          notes.trim() || undefined,
          imagePayload.length ? imagePayload : undefined,
          systemPrompt
        );

        const crossAsFindings: ReviewFinding[] = crossDocumentFindings.map((f) => ({
          id: crypto.randomUUID(),
          severity: (f.severity as FindingSeverity) || 'observation',
          location: f.location,
          description: `[Cross-document] ${f.description}`,
          humanStatus: 'draft',
        }));

        let processedCount = 0;
        for (let i = 0; i < reviewBatchIds.length; i++) {
          const reviewId = reviewBatchIds[i];
          const review = reviews.find((r: any) => r._id === reviewId);
          if (!review) continue;
          const docName = docIdToName.get(review.underReviewDocumentId) ?? allDocuments.find((d: any) => d._id === review.underReviewDocumentId)?.name ?? '';
          const docFindings: ReviewFinding[] = (byDocument[docName] ?? Object.values(byDocument)[0] ?? []).map((f) => ({
            id: crypto.randomUUID(),
            severity: (f.severity as FindingSeverity) || 'minor',
            location: f.location,
            description: f.description,
            humanStatus: 'draft',
          }));
          const existingFindings: ReviewFinding[] = (review.findings as any[])?.map((f: any) => ({
            id: f.id || crypto.randomUUID(),
            severity: f.severity || 'minor',
            location: f.location,
            description: f.description ?? '',
            humanStatus: f.humanStatus || 'draft',
            reviewedBy: f.reviewedBy,
            reviewedAt: f.reviewedAt,
          })) ?? [];
          const combined =
            i === 0 ? [...existingFindings, ...docFindings, ...crossAsFindings] : [...existingFindings, ...docFindings];
          await updateReview({
            reviewId,
            findings: combined.map(({ id: fid, severity, location, description, humanStatus, reviewedBy, reviewedAt }) => ({
              id: fid,
              severity,
              location,
              description,
              humanStatus: humanStatus || 'draft',
              reviewedBy,
              reviewedAt,
            })),
          });
          if (reviewId === currentReviewId) {
            setFindings(combined);
          }
          processedCount++;
        }
        toast.success(`Compared ${processedCount} documents in one analysis (findings + cross-document notes).`);
      } else {
        const reviewId = reviewBatchIds[0];
        const review = reviews.find((r: any) => r._id === reviewId);
        if (!review) {
          setAiSuggesting(false);
          setBatchAiProgress(null);
          return;
        }
        const doc = allDocuments.find((d: any) => d._id === review.underReviewDocumentId);
        const docName = doc?.name || 'Document';
        const docText = doc ? getEffectiveDocText(doc).trim() : '';
        setBatchAiProgress({ current: 1, total: 1, docName });
        let resolvedDocText = docText;
        if (!resolvedDocText && doc) {
          resolvedDocText = (await ensureProjectDocText(doc)).trim();
        }
        if (!resolvedDocText) {
          throw new Error(`No readable text for "${docName}".`);
        }
        const imagePayload = paperworkAttachedImages.map(({ media_type, data }) => ({ media_type, data }));
        const systemPrompt = getPaperworkReviewSystemPrompt(localPerspectiveId);
        const suggested = await analyzer.suggestPaperworkFindings(
          resolvedRefText,
          resolvedDocText,
          effectiveReferenceNames || 'Reference context',
          docName,
          reviewScope.trim() || undefined,
          imagePayload.length ? imagePayload : undefined,
          notes.trim() || undefined,
          systemPrompt
        );
        const newFindings: ReviewFinding[] = suggested.map((f) => ({
          id: crypto.randomUUID(),
          severity: (f.severity as FindingSeverity) || 'minor',
          location: f.location,
          description: f.description,
          humanStatus: 'draft',
        }));
        const existingFindings: ReviewFinding[] = (review.findings as any[])?.map((f: any) => ({
          id: f.id || crypto.randomUUID(),
          severity: f.severity || 'minor',
          location: f.location,
          description: f.description ?? '',
          humanStatus: f.humanStatus || 'draft',
          reviewedBy: f.reviewedBy,
          reviewedAt: f.reviewedAt,
        })) ?? [];
        const combined = [...existingFindings, ...newFindings];
        await updateReview({
          reviewId,
          findings: combined.map(({ id: fid, severity, location, description, humanStatus, reviewedBy, reviewedAt }) => ({
            id: fid,
            severity,
            location,
            description,
            humanStatus: humanStatus || 'draft',
            reviewedBy,
            reviewedAt,
          })),
        });
        if (reviewId === currentReviewId) {
          setFindings(combined);
        }
        toast.success('AI review completed.');
      }
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || 'AI batch review failed');
    } finally {
      setAutoExtractingText(false);
      setAiSuggesting(false);
      setBatchAiProgress(null);
    }
  };

  const updateFinding = (id: string, patch: Partial<ReviewFinding>) => {
    setFindings((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  const isEditing = !!currentReviewId && currentReview?.status === 'draft';
  const reviewerName = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Reviewer';
  const canStart = hasUnderReviewSelection && hasReferenceOrAuditor && !currentReviewId;
  const canRunAiForCurrentDoc = !!underReviewDoc && effectiveReferenceDocs.length > 0;

  /** True when a draft review has any critical findings (drives the auto-fail effect above and verdict UI). */
  const hasCriticalFindings = findings.some((f) => f.severity === 'critical');
  const showComparison = (hasReferenceOrAuditor && (underReviewIds.length > 0 || currentReviewId)) || isEditing;

  const requestDiscard = async (target: Id<'documentReviews'> | 'draft') => {
    const isDraft = target === 'draft';
    const ok = await confirmDialog({
      title: isDraft ? 'Discard draft?' : 'Discard this review?',
      message: isDraft
        ? 'The current draft will be removed from this project. This cannot be undone.'
        : 'This review will be removed from the project. This cannot be undone.',
      confirmLabel: 'Discard',
    });
    if (!ok) return;
    const reviewId = isDraft ? currentReviewId : target;
    if (!reviewId) return;
    try {
      await removeReview({ reviewId });
      if (currentReviewId === reviewId) {
        const remaining = reviewBatchIds.filter((id) => id !== reviewId);
        if (remaining.length > 0) {
          setCurrentReviewId(remaining[0]);
          const nextR = reviews.find((r: any) => r._id === remaining[0]);
          if (nextR) {
            hydrateFromReview(nextR, remaining);
          }
        } else {
          setCurrentReviewId(null);
          setReviewBatchIds([]);
          setReferenceEntries([]);
          setUnderReviewIds([]);
          setSelectedAuditorIds(new Set());
          setVerdict('');
          setFindings([]);
          setReviewScope('');
          setNotes('');
        }
      }
      toast.success(isDraft ? 'Draft discarded' : 'Review discarded');
    } catch (e: any) {
      toast.error(getConvexErrorMessage(e) || (isDraft ? 'Failed to discard draft' : 'Failed to discard review'));
    }
  };

  const panelSurface = isDarkMode
    ? 'bg-white/[0.03] border-white/10'
    : 'bg-slate-50 border-slate-200';
  const labelStrong = isDarkMode ? 'text-white/80' : 'text-slate-700';
  const labelWeak = isDarkMode ? 'text-white/50' : 'text-slate-500';
  const inputBox = isDarkMode
    ? 'bg-white/10 border border-white/20 text-white placeholder-white/45 focus:outline-none focus:border-sky-light'
    : 'bg-white border border-slate-200 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-sky-500';
  const listScrollBox = isDarkMode ? 'border-white/20 bg-white/5' : 'border-slate-200 bg-white';
  const listItemBox = isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-100/80';
  const subtleText = isDarkMode ? 'text-white/50' : 'text-slate-500';
  const chipUnsel = isDarkMode
    ? 'bg-white/5 border-white/15 text-white/80 hover:bg-white/10'
    : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200';
  const docChip = isDarkMode
    ? 'bg-sky-500/20 border border-sky-400/40 text-white'
    : 'bg-sky-100 border border-sky-300 text-slate-900';
  const checkboxLabelChecked = isDarkMode ? 'bg-sky/20 text-white' : 'bg-sky-100 text-slate-900';
  const checkboxLabelIdle = isDarkMode ? 'hover:bg-white/10 text-white/85' : 'hover:bg-slate-100 text-slate-800';
  const noUnderDocs = documentsAvailableForUnderReview.length === 0;
  const noRefSources = referenceDocuments.length === 0 && sharedRefDocs.length === 0 && allKbDocs.length === 0;
  const setupExpanded = !currentReviewId || setupCardExpanded;

  return (
    <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 flex flex-col min-h-0 h-full">
      <div className="mb-6">
        <h1 className={`text-3xl sm:text-4xl font-display font-bold mb-2 ${isDarkMode ? 'bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent' : 'text-slate-900'}`}>
          Paperwork Review
        </h1>
        <p className={`text-lg mb-4 ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
          Compare submitted paperwork against known-good reference documents and record findings.
        </p>
        <div className="flex flex-wrap items-center gap-2" aria-label="Review flow">
          {[
            { n: 1, label: 'Setup', active: !currentReviewId || setupCardExpanded },
            { n: 2, label: 'Review', active: !!currentReviewId && showComparison },
            { n: 3, label: 'History', active: pastReviewsExpanded },
          ].map(({ n, label, active }) => (
            <Badge
              key={n}
              variant={active ? 'info' : 'outline'}
              size="sm"
              pill
              className="gap-1.5"
            >
              <span className="tabular-nums font-semibold">{n}</span>
              {label}
            </Badge>
          ))}
        </div>
      </div>

      {/* New review: select reference + under review */}
      <GlassCard className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <h2 className="text-xl font-display font-bold flex items-center gap-2">
            <FiCheckSquare className="text-amber-400" />
            New review
          </h2>
          {currentReviewId && setupCardExpanded && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSetupCardExpanded(false)}>
              Hide setup
            </Button>
          )}
        </div>
        <p className={`text-sm mb-3 ${isDarkMode ? 'text-white/65' : 'text-slate-500'}`}>
          Follow the steps in order so the review logic is clear and AI can generate useful findings and reports.
        </p>
        <div
          className={`mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs ${isDarkMode ? 'text-white/70' : 'text-slate-600'}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasUnderReviewSelection ? 'bg-emerald-400' : isDarkMode ? 'bg-white/35' : 'bg-slate-300'}`}
              aria-hidden
            />
            Under review
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${hasReferenceSelection ? 'bg-emerald-400' : isDarkMode ? 'bg-white/35' : 'bg-slate-300'}`}
              aria-hidden
            />
            References
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${selectedAuditorIds.size > 0 ? 'bg-emerald-400' : isDarkMode ? 'bg-white/35' : 'bg-slate-300'}`}
              aria-hidden
            />
            Auditors <span className={labelWeak}>(or refs)</span>
          </span>
        </div>

        {currentReviewId && !setupCardExpanded && (
          <div
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 ${panelSurface}`}
          >
            <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-sm ${labelStrong}`}>
              <span>{underReviewIds.length} under review</span>
              <span className={isDarkMode ? 'text-white/40' : 'text-slate-300'} aria-hidden>
                ·
              </span>
              <span>{referenceEntries.length} reference(s)</span>
              <span className={isDarkMode ? 'text-white/40' : 'text-slate-300'} aria-hidden>
                ·
              </span>
              <span>{selectedAuditorIds.size} auditor(s)</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setSetupCardExpanded(true)}>
                Edit setup
              </Button>
              {isEditing && (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    icon={<FiSave className="w-3.5 h-3.5" />}
                    onClick={handleSaveDraft}
                    disabled={saving}
                  >
                    Save draft
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => currentReviewId && void requestDiscard('draft')}
                  >
                    Discard draft
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {setupExpanded && (
          <div>
        <p className={`text-xs uppercase tracking-wide mb-3 ${isDarkMode ? 'text-white/40' : 'text-slate-400'}`}>Review inputs</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4 lg:items-start">
          <div className={`flex flex-col min-h-[140px] p-4 rounded-xl border ${panelSurface}`}>
            <label className={`block text-sm font-medium mb-2 shrink-0 ${labelStrong}`}>
              Documents under review <span className="text-amber-500 font-normal">(required)</span>
            </label>
            {underReviewIds.length > 0 && (
              <ul className="flex flex-wrap gap-2 mb-2">
                {underReviewIds.map((id) => {
                  const doc = allDocuments.find((d: any) => d._id === id);
                  const name = doc?.name ?? id;
                  return (
                    <li
                      key={id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${docChip}`}
                    >
                      <span className="truncate max-w-[180px]" title={name}>{name}</span>
                      {!currentReviewId && (
                        <button
                          type="button"
                          onClick={() => removeUnderReview(id)}
                          className={`p-0.5 rounded ${isDarkMode ? 'text-white/60 hover:text-red-400' : 'text-slate-500 hover:text-red-600'}`}
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
              <div className="w-full">
                <input
                  type="text"
                  value={underReviewFilter}
                  onChange={(e) => setUnderReviewFilter(e.target.value)}
                  placeholder="Filter under-review documents..."
                  className={`mt-2 w-full px-3 py-2 text-sm rounded-lg ${inputBox}`}
                />
                <div className="flex items-center justify-between mt-2 mb-1">
                  <p className={`text-xs ${subtleText}`}>
                    {filteredUnderReviewGroups.reduce((count, group) => count + group.docs.length, 0)} option(s) shown
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllVisibleUnderReview}
                      className="text-xs text-sky-light hover:text-sky-lighter"
                    >
                      Select visible
                    </button>
                    <span className={isDarkMode ? 'text-white/30' : 'text-slate-300'} aria-hidden>|</span>
                    <button
                      type="button"
                      onClick={() => setUnderReviewSelection([])}
                      className={`text-xs ${isDarkMode ? 'text-white/60 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className={`max-h-56 overflow-y-auto scrollbar-thin rounded-xl border p-2 space-y-2 ${listScrollBox}`}>
                  {filteredUnderReviewGroups.length === 0 ? (
                    <p className={`px-2 py-2 text-xs ${subtleText}`}>No matching documents.</p>
                  ) : (
                    filteredUnderReviewGroups.map(({ category, label, docs }) => (
                      <div key={category} className={`rounded-lg border p-2 ${listItemBox}`}>
                        <p className={`text-[11px] uppercase tracking-wide mb-1 ${subtleText}`}>{label}</p>
                        <div className="space-y-1">
                          {docs.map((d: any) => {
                            const checked = underReviewIds.includes(d._id);
                            return (
                              <label
                                key={d._id}
                                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                                  checked ? checkboxLabelChecked : checkboxLabelIdle
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleUnderReviewSelection(d._id)}
                                  className="rounded border-white/30 bg-white/5 text-sky-light focus:ring-sky"
                                />
                                <span className="truncate" title={d.name}>{d.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            {!currentReviewId && documentsAvailableForUnderReview.length > 0 && (
              <p className={`text-xs mt-1.5 ${subtleText}`}>
                Select one or more documents to review against references or auditor perspectives.
              </p>
            )}
          </div>
          <div className={`flex flex-col min-h-[140px] p-4 rounded-xl border ${panelSurface}`}>
            <label className={`block text-sm font-medium mb-2 shrink-0 ${labelStrong}`}>
              Reference paperwork / standards <span className={`${labelWeak} font-normal`}>(optional)</span>
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
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border ${
                        isDarkMode ? 'bg-white/10 border-white/20' : 'bg-slate-100 border-slate-200'
                      }`}
                    >
                      <span className="truncate max-w-[180px]" title={name}>{name ?? e.id}</span>
                      <span className={`text-xs ${labelWeak}`}>({typeLabel})</span>
                      {!currentReviewId && (
                        <button
                          type="button"
                          onClick={() => removeReference(e.source, e.id)}
                          className={`p-0.5 rounded ${isDarkMode ? 'text-white/60 hover:text-red-400' : 'text-slate-500 hover:text-red-600'}`}
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
                  <input
                    type="text"
                    value={referenceFilter}
                    onChange={(e) => setReferenceFilter(e.target.value)}
                    placeholder="Filter references..."
                    className={`mb-2 w-full px-3 py-2 text-sm rounded-lg ${inputBox}`}
                  />
                  <Select
                    value={addRefValue}
                    onChange={(e) => void addReference(e.target.value)}
                    disabled={addingKbRef}
                    selectSize="md"
                    aria-label="Add reference document"
                    className={addingKbRef ? 'opacity-60' : ''}
                  >
                    <option value="">Add reference document</option>
                    {filteredProjectReferenceOptions.length > 0 ? (
                      <optgroup label="Project reference documents">
                        {filteredProjectReferenceOptions.map((d: any) => (
                          <option key={d._id} value={d._id}>
                            {d.name}
                          </option>
                        ))}
                      </optgroup>
                    ) : null}
                    {filteredKbOptions.length > 0 && (
                      <optgroup label="Knowledge Base">
                        {filteredKbOptions.map((d: any) => (
                          <option key={d._id} value={`kb:${d._id}`}>
                            {d.name}{' '}
                            {d.agentId ? `(${AUDIT_AGENTS.find((a) => a.id === d.agentId)?.name || d.agentId})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {filteredSharedRefGroups.map(({ typeId, docs }) => {
                      if (docs.length === 0) return null;
                      const typeLabel = REFERENCE_DOC_TYPE_LABELS[typeId] || typeId;
                      return (
                        <optgroup key={typeId} label={typeLabel}>
                          {docs.map((d: any) => (
                            <option key={d._id} value={`shared:${d._id}`}>
                              {d.name}
                              {docs.length > 1 ? ` (${typeLabel})` : ''}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </Select>
                  <p className={`text-xs mt-1 ${subtleText}`}>
                    {availableReferenceOptionCount} option(s) shown
                  </p>
                </div>
              </div>
            )}
            {(referenceEntries.some((e) => e.source === 'shared') || allKbDocs.length > 0) && (
              <div className="flex items-center gap-1.5 mt-1.5 text-xs text-amber-400/80">
                <FiBookOpen className="w-3 h-3" />
                {allKbDocs.length > 0 && 'Use documents from Admin → Knowledge Bases or project agent docs as references. '}
                {referenceEntries.some((e) => e.source === 'shared') && 'Shared references are admin-uploaded (IS-BAO, Part 91, etc.)'}
              </div>
            )}
          </div>
          <div className={`flex flex-col min-h-[140px] p-4 rounded-xl border ${panelSurface}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <label className={`block text-sm font-medium ${labelStrong}`}>
                Auditors for this review <span className={`${labelWeak} font-normal`}>(optional)</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllAuditorsForDraft}
                  disabled={!!currentReviewId}
                  className="text-xs text-sky-light hover:text-sky-lighter disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Select all
                </button>
                <span className={isDarkMode ? 'text-white/30' : 'text-slate-300'} aria-hidden>|</span>
                <button
                  type="button"
                  onClick={clearAuditorsForDraft}
                  disabled={!!currentReviewId}
                  className={`text-xs disabled:opacity-50 disabled:cursor-not-allowed ${isDarkMode ? 'text-white/60 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {AUDIT_AGENTS.map((agent) => {
                const selected = selectedAuditorIds.has(agent.id);
                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => toggleAuditorSelection(agent.id)}
                    disabled={!!currentReviewId}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition disabled:opacity-50 disabled:cursor-not-allowed ${
                      selected
                        ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-700 dark:text-emerald-200'
                        : chipUnsel
                    }`}
                    aria-pressed={selected}
                  >
                    {agent.name}
                  </button>
                );
              })}
            </div>
            <p className={`text-xs mt-1 ${subtleText}`}>
              If no reference document is selected, AI uses the selected auditors&apos; knowledge-base context.
            </p>
            {!currentReviewId && !hasReferenceOrAuditor && (
              <p className="text-xs text-amber-600 dark:text-amber-300/90 mt-2">
                Add at least one reference document or select an auditor to start.
              </p>
            )}
          </div>
        </div>
        {!currentReviewId && (
          <details className={`mb-4 rounded-xl border px-4 py-3 ${panelSurface}`}>
            <summary className={`cursor-pointer text-sm font-medium ${isDarkMode ? 'text-sky-light' : 'text-sky-700'}`}>
              Optional details (review name &amp; scope before start)
            </summary>
            <div className="mt-3 space-y-3">
              <div>
                <label className={`block text-sm font-medium mb-2 ${labelStrong}`}>
                  Review name <span className={`${labelWeak} font-normal`}>(optional)</span>
                </label>
                <input
                  type="text"
                  value={reviewName}
                  onChange={(e) => setReviewName(e.target.value)}
                  placeholder="e.g., Initial review, Rev 2 comparison, Ch. 5 only"
                  className={`w-full px-4 py-3 rounded-xl ${inputBox}`}
                />
                <p className={`text-xs mt-1 ${subtleText}`}>
                  Name this review so you can have multiple reviews per document (e.g. different scopes or revisions).
                </p>
              </div>
              <div>
                <label className={`block text-sm font-medium mb-2 ${labelStrong}`}>
                  Review scope <span className={`${labelWeak} font-normal`}>(optional)</span>
                </label>
                <textarea
                  value={reviewScope}
                  onChange={(e) => setReviewScope(e.target.value)}
                  placeholder="e.g., Chapters 3 and 5 only, Section 2.1 compliance, Appendix A"
                  rows={2}
                  className={`w-full px-4 py-3 rounded-xl resize-y ${inputBox}`}
                />
                <p className={`text-xs mt-1 ${subtleText}`}>
                  Define what to focus on—chapters, sections, or specific requirements. You can edit scope again in Compare documents.
                </p>
              </div>
            </div>
          </details>
        )}
        {(noUnderDocs || noRefSources) && (
          <p className={`text-sm mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 ${isDarkMode ? 'text-amber-200/90' : 'text-amber-800'}`}>
            {noUnderDocs && (
              <span>No entity/SMS/uploaded documents are available to put under review.</span>
            )}
            {noUnderDocs && noRefSources && <span aria-hidden> </span>}
            {noRefSources && (
              <span>No reference sources (project references, KB, or shared references) are available yet.</span>
            )}
            <Button type="button" variant="ghost" size="sm" className="shrink-0 underline" onClick={() => navigate('/library')}>
              Open Library
            </Button>
          </p>
        )}
        {canStart && (
          <Button type="button" variant="warning" size="lg" onClick={handleStartReview} disabled={saving}>
            {saving ? 'Starting...' : 'Start review'}
          </Button>
        )}
        {!currentReviewId && !canStart && (
          <p className={`text-xs ${subtleText}`}>
            To start: add at least one document under review and either one reference document or one auditor.
          </p>
        )}
        {isEditing && (
          <div className="flex flex-wrap gap-2 mt-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              icon={<FiSave className="w-4 h-4" />}
              onClick={handleSaveDraft}
              disabled={saving}
            >
              {saving ? 'Saving…' : 'Save draft'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => currentReviewId && void requestDiscard('draft')}
            >
              Discard draft
            </Button>
          </div>
        )}
          </div>
        )}
      </GlassCard>

      {/* Side-by-side comparison + form */}
      {showComparison && (effectiveReferenceDocs.length > 0 || underReviewDoc) && (
        <GlassCard className="mb-6 flex flex-col min-h-0">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-2">
            <h2 className="text-xl font-display font-bold flex items-center gap-2">
              <FiFileText />
              Compare documents
            </h2>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {isEditing && reviewBatchIds.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-sm ${subtleText}`}>Document</span>
                  <Select
                    value={currentReviewId ?? ''}
                    onChange={async (e) => {
                      const id = e.target.value as Id<'documentReviews'>;
                      if (!id || id === currentReviewId) return;
                      if (currentReviewId) {
                        try {
                          await updateReview({
                            reviewId: currentReviewId,
                            findings: findings.map(({ id: fid, severity, location, description, humanStatus, reviewedBy, reviewedAt }) => ({
                              id: fid,
                              severity,
                              location,
                              description,
                              humanStatus: humanStatus || 'draft',
                              reviewedBy,
                              reviewedAt,
                            })),
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
                        hydrateFromReview(r);
                      }
                    }}
                    selectSize="sm"
                    className="min-w-[12rem] max-w-[20rem] text-sm"
                    aria-label="Document in batch"
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
                  </Select>
                  <span className={`text-xs ${subtleText}`}>
                    ({currentReviewId ? reviewBatchIds.indexOf(currentReviewId) + 1 : 0} of {reviewBatchIds.length})
                  </span>
                </div>
              )}
            </div>
          </div>
          <p className={`text-sm mb-4 ${isDarkMode ? 'text-white/60' : 'text-slate-600'}`}>
            {reviewBatchIds.length > 1
              ? <>Use <strong>Review all … with AI</strong> for one combined analysis across all {reviewBatchIds.length} documents, or <strong>Re-run AI for this doc</strong> in Findings for only the current document. Add <strong>Notes</strong> below to steer the AI.</>
              : <>Use <strong>Generate findings with AI</strong> (or <strong>Re-run AI for this doc</strong> under Findings). Add <strong>Notes</strong> to narrow scope or ask a specific question.</>
            }
          </p>
          {isEditing && (
            <div className="mb-5 p-4 bg-gradient-to-r from-amber-500/10 to-emerald-500/10 border border-amber-300/30 rounded-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-200">
                    Primary workflow: create findings with AI first
                  </p>
                  <p className="text-xs text-white/60 mt-0.5">
                    Generate findings automatically, then edit/add manual findings only as needed.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={reviewBatchIds.length > 1 ? handleAiSuggestAllDocuments : handleAiSuggestFindings}
                  disabled={aiSuggesting || autoExtractingText || !canRunAiForCurrentDoc}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-emerald-600 rounded-xl font-semibold text-sm hover:shadow-lg hover:shadow-amber-500/30 disabled:opacity-50 flex items-center gap-2 shrink-0"
                >
                  {autoExtractingText ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Preparing document text…
                    </>
                  ) : aiSuggesting && batchAiProgress ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Reviewing {batchAiProgress.current}/{batchAiProgress.total}…
                    </>
                  ) : aiSuggesting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Running AI review…
                    </>
                  ) : (
                    <>
                      <FiZap />
                      {reviewBatchIds.length > 1 ? `Review all ${reviewBatchIds.length} docs with AI` : 'Generate findings with AI'}
                    </>
                  )}
                </button>
              </div>
              {!canRunAiForCurrentDoc && (
                <p className="text-xs text-amber-200/90 mt-2">
                  AI needs an under-review document plus reference context (selected references, or auditor knowledge if no references are selected).
                </p>
              )}
              {batchAiProgress && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-amber-100/90 mb-1.5">
                    <span className="truncate pr-2">Reviewing: {batchAiProgress.docName}</span>
                    <span className="shrink-0">
                      {batchAiProgress.current} of {batchAiProgress.total}
                    </span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-amber-400 to-emerald-400 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${(batchAiProgress.current / batchAiProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6 xl:items-stretch">
            <div className="flex min-h-[320px] flex-col w-full rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/10 px-3 py-2 backdrop-blur-sm">
                <Badge variant="outline" size="sm" className="shrink-0">
                  Reference
                </Badge>
                <FiCheckSquare className="text-amber-400 shrink-0" />
                <span className="font-medium truncate text-sm text-white/90 min-w-0">
                  {selectedReferenceDocs.length > 0
                    ? (effectiveReferenceDocs.length === 1
                      ? effectiveReferenceDocs[0]?.name
                      : `${effectiveReferenceDocs.length} references: ${effectiveReferenceNames}`)
                    : `Auditor context (${effectiveReferenceDocs.length} KB docs)`}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm whitespace-pre-wrap scrollbar-thin text-white/85">
                {effectiveReferenceText || 'No reference context text available.'}
              </div>
            </div>
            <div className="flex min-h-[320px] flex-col w-full rounded-xl border border-white/10 bg-white/5 overflow-hidden">
              <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-2 border-b border-white/10 bg-white/10 px-3 py-2 backdrop-blur-sm">
                <Badge variant="outline" size="sm" className="shrink-0">
                  Under review
                </Badge>
                <FiFileText className="text-sky-400 shrink-0" />
                <span className="font-medium truncate text-sm text-white/90 min-w-0">
                  {underReviewDoc?.name ?? 'Under review'}
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm whitespace-pre-wrap scrollbar-thin text-white/85">
                {underText || 'No extracted text yet. AI actions will try to extract it automatically from the stored file.'}
              </div>
            </div>
          </div>

          {/* Form: auditors, scope, verdict, findings, notes */}
          {isEditing && (
            <>
              <div className="mb-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="block text-sm font-medium text-white/80">Assigned auditors</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void selectAllAuditorsForCurrentReview()}
                      className="text-xs text-sky-light hover:text-sky-lighter"
                    >
                      Select all
                    </button>
                    <span className="text-white/30" aria-hidden>|</span>
                    <button
                      type="button"
                      onClick={() => void clearAuditorsForCurrentReview()}
                      className="text-xs text-white/60 hover:text-white"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {AUDIT_AGENTS.map((agent) => {
                    const selected = selectedAuditorIds.has(agent.id);
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => void toggleCurrentReviewAuditor(agent.id)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                          selected
                            ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                            : 'bg-white/5 border-white/15 text-white/80 hover:bg-white/10'
                        }`}
                        aria-pressed={selected}
                      >
                        {agent.name}
                      </button>
                    );
                  })}
                </div>
              </div>
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
                {hasCriticalFindings && verdict === 'fail' && (
                  <p className="text-amber-400/90 text-xs mb-2">
                    Verdict set to Fail automatically (critical findings present). You can change it if needed.
                  </p>
                )}
                <div
                  className="inline-flex flex-wrap rounded-xl border border-white/20 bg-white/5 p-1 gap-1"
                  role="group"
                  aria-label="Verdict"
                >
                  {VERDICT_OPTIONS.map((opt) => {
                    const selected = verdict === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setVerdict(opt.value)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                          selected
                            ? 'bg-gradient-to-r from-amber-500/90 to-amber-600/90 text-white shadow'
                            : 'text-white/75 hover:bg-white/10'
                        }`}
                        aria-pressed={selected}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
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
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-wrap items-end gap-2 shrink-0">
                      <span className="text-sm text-white/70 whitespace-nowrap pb-2">Perspective</span>
                      <div className="min-w-[8rem] max-w-[14rem]">
                        <Select
                          data-testid="paperwork-review-perspective"
                          value={localPerspectiveId}
                          onChange={async (e) => {
                            const next = e.target.value;
                            setLocalPerspectiveId(next);
                            try {
                              await upsertSettings({ paperworkReviewAgentId: next });
                            } catch (err) {
                              console.error('[userSettings.upsert] Failed to save perspective:', err);
                              toast.error('Failed to save perspective', {
                                description: getConvexErrorMessage(err),
                              });
                              setLocalPerspectiveId(paperworkReviewAgentId);
                            }
                          }}
                          disabled={aiSuggesting}
                          selectSize="sm"
                          aria-label="Review perspective"
                          className="disabled:opacity-50"
                        >
                          <option value="generic">Generic auditor</option>
                          {AUDIT_AGENTS.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pb-0.5">
                      <PageModelSelector field="paperworkReviewModel" compact disabled={aiSuggesting} />
                    </div>
                    <button
                      type="button"
                      onClick={handleAiSuggestFindings}
                      disabled={aiSuggesting || autoExtractingText || !canRunAiForCurrentDoc}
                      className="flex items-center gap-1 text-sm text-amber-400 hover:text-amber-300 disabled:opacity-50"
                    >
                      {aiSuggesting && !batchAiProgress ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                          Analyzing…
                        </>
                      ) : (
                        <>
                          <FiZap /> Re-run AI for this doc
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
                    {findings.length > 0 && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<FiPlusCircle className="w-3.5 h-3.5" />}
                        onClick={handleAddFindingsToEntityIssues}
                        disabled={addingFindingsToEntityIssues}
                      >
                        Add findings to entity issues
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  {findings.length === 0 && (
                    <p className="text-white/70 text-sm">No findings yet.</p>
                  )}
                  {sortFindingsBySeverity(findings).map((f) => (
                    <div
                      key={f.id}
                      className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3"
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <Badge variant={findingSeverityBadgeVariant(f.severity)} size="sm" className="shrink-0 mb-0.5">
                          {SEVERITY_OPTIONS.find((o) => o.value === f.severity)?.label ?? 'Minor'}
                        </Badge>
                        <div className="w-[9.5rem] shrink-0">
                          <Select
                            aria-label="Finding severity"
                            selectSize="sm"
                            value={f.severity}
                            onChange={(e) =>
                              updateFinding(f.id, {
                                severity: e.target.value as FindingSeverity,
                              })
                            }
                            className="text-sm"
                          >
                            {SEVERITY_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <input
                          type="text"
                          placeholder="Location (e.g. Section 3.2, Page 5)"
                          value={f.location ?? ''}
                          onChange={(e) => updateFinding(f.id, { location: e.target.value })}
                          className="min-w-[8rem] flex-1 px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm placeholder-white/50 focus:outline-none focus:border-sky-light"
                        />
                        <div className="w-[9rem] shrink-0">
                          <Select
                            aria-label="Human review status"
                            selectSize="sm"
                            value={f.humanStatus ?? 'draft'}
                            onChange={(e) => {
                              const next = e.target.value as HumanFindingStatus;
                              updateFinding(f.id, {
                                humanStatus: next,
                                reviewedBy: next === 'draft' ? undefined : reviewerName,
                                reviewedAt: next === 'draft' ? undefined : new Date().toISOString(),
                              });

                              if (next === 'accepted' && activeProjectId && currentReviewId) {
                                void logProductEvent({
                                  eventType: 'finding_accepted',
                                  projectId: activeProjectId as any,
                                  properties: JSON.stringify({
                                    reviewId: currentReviewId,
                                    findingId: f.id,
                                    severity: f.severity,
                                  }),
                                }).catch(() => {});
                              }
                            }}
                            className="text-sm"
                          >
                            <option value="draft">Draft</option>
                            <option value="accepted">Accepted</option>
                            <option value="needs_work">Needs work</option>
                          </Select>
                        </div>
                        {f.humanStatus && f.humanStatus !== 'draft' && (
                          <span className="text-xs text-white/50 pb-2 shrink-0">by {f.reviewedBy || '—'}</span>
                        )}
                        <button
                          type="button"
                          onClick={() => removeFinding(f.id)}
                          className="p-2 text-white/70 hover:text-red-400 hover:bg-red-400/10 rounded-lg shrink-0 mb-0.5"
                          title="Remove finding"
                        >
                          <FiTrash2 />
                        </button>
                      </div>

                      {(() => {
                        const seg = parseEvidenceSegments(f.description);
                        const actionText = seg.correctiveAction ?? seg.recommendedAction;
                        const hasAny = seg.requirement || seg.evidence || seg.gap || actionText;
                        if (!hasAny) return null;

                        return (
                          <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-2">
                            {seg.requirement && (
                              <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">
                                  Requirement
                                </div>
                                <div className="text-sm text-white/80 whitespace-pre-wrap">{seg.requirement}</div>
                              </div>
                            )}
                            {seg.evidence && (
                              <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">
                                  Evidence
                                </div>
                                <div className="text-sm text-white/80 whitespace-pre-wrap">{seg.evidence}</div>
                              </div>
                            )}
                            {seg.gap && (
                              <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">
                                  Gap
                                </div>
                                <div className="text-sm text-white/80 whitespace-pre-wrap">{seg.gap}</div>
                              </div>
                            )}
                            {actionText && (
                              <div className="space-y-1">
                                <div className="text-[11px] uppercase tracking-wide text-white/50 font-semibold">
                                  Corrective action
                                </div>
                                <div className="text-sm text-white/80 whitespace-pre-wrap">{actionText}</div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

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
                  placeholder="e.g. Compare section 5 only; Are training requirements aligned? Focus on record retention."
                  rows={3}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light resize-y placeholder-white/40"
                />
                <p className="text-xs text-white/50 mt-1">Notes are sent to the AI when you use Suggest findings or Review all with AI—use them to ask specific questions or narrow the scope.</p>
              </div>
              <div className="mb-4 p-4 bg-white/5 border border-white/10 rounded-xl">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <h3 className="text-sm font-medium text-white/85">AI + agent report draft</h3>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleGenerateAiReport}
                      disabled={generatingAiReport || autoExtractingText || !canRunAiForCurrentDoc}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 text-sm hover:bg-emerald-500/30 disabled:opacity-50"
                    >
                      {generatingAiReport ? 'Generating…' : 'Generate AI report'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadAiReport}
                      disabled={!aiReportDraft.trim()}
                      className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white/85 text-sm hover:bg-white/20 disabled:opacity-50"
                    >
                      Download report draft
                    </button>
                  </div>
                </div>
                <p className="text-xs text-white/55 mb-2">
                  Uses selected perspective and assigned auditors (if any) to draft a structured report with corrective actions and closeout checklist.
                </p>
                <textarea
                  value={aiReportDraft}
                  onChange={(e) => setAiReportDraft(e.target.value)}
                  placeholder="AI report draft will appear here. You can edit it before download."
                  rows={10}
                  className="w-full px-3 py-2 bg-black/20 border border-white/15 rounded-lg text-sm placeholder-white/40 focus:outline-none focus:border-sky-400/50 resize-y"
                />
              </div>
              <div
                className={`sticky bottom-0 z-20 -mx-4 sm:-mx-6 mt-2 flex flex-wrap items-center gap-3 border-t px-4 sm:px-6 py-4 backdrop-blur-md ${
                  isDarkMode ? 'border-white/10 bg-slate-950/90' : 'border-slate-200 bg-white/95'
                }`}
              >
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  icon={<FiDownload className="w-4 h-4" />}
                  onClick={handleBuildReport}
                  disabled={buildingReport}
                  title="Generate a PDF of the current draft without completing the review"
                >
                  {buildingReport ? 'Building…' : 'Build report'}
                </Button>
                <Button
                  type="button"
                  variant="success"
                  size="md"
                  icon={<FiCheckCircle className="w-4 h-4" />}
                  onClick={handleCompleteReview}
                  disabled={saving || !verdict}
                >
                  Complete review
                </Button>
              </div>
            </>
          )}
        </GlassCard>
      )}

      {/* Past reviews list */}
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3 gap-y-3 mb-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 className="text-xl font-display font-bold flex items-center gap-2 shrink-0">
              <FiFolder />
              Past reviews ({reviews.length})
            </h2>
            {reviews.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={pastReviewsExpanded}
                onClick={() => setPastReviewsExpanded((v) => !v)}
                className="inline-flex items-center gap-1"
                icon={
                  <FiChevronDown
                    className={`w-4 h-4 transition-transform ${pastReviewsExpanded ? 'rotate-180' : ''}`}
                  />
                }
              >
                {pastReviewsExpanded ? 'Hide list' : 'Show list'}
              </Button>
            )}
          </div>
          {reviews.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={<FiDownload className="w-4 h-4" />}
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
            >
              Export all
            </Button>
          )}
        </div>
        {reviews.length === 0 ? (
          <p className="text-white/70">No reviews yet. Start a review above.</p>
        ) : !pastReviewsExpanded ? (
          <p className={`text-sm ${subtleText}`}>Show list to browse batches, continue drafts, or download PDFs.</p>
        ) : (
          <div className="space-y-4 max-h-[400px] overflow-y-auto scrollbar-thin pr-1">
            {reviewsByBatch.map(([batchKey, batchReviews]) => (
              <div key={batchKey} className="space-y-2">
                {batchReviews.length > 1 && (
                  <div className="flex items-center justify-between py-2 px-3 bg-sky-500/10 border border-sky-400/30 rounded-lg">
                    <span className="text-sm text-sky-200">
                      {batchReviews.length} documents — one review batch
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      icon={<FiDownload className="w-3.5 h-3.5" />}
                      onClick={async () => {
                        try {
                          const items = batchReviews.map((r: any) => reviewToPdfItem(r, docIdToName, activeProject?.name));
                          const generator = new PaperworkReviewPDFGenerator();
                          const pdfBytes = await generator.generate(items);
                          const blob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `paperwork-reviews-batch-${new Date().toISOString().slice(0, 10)}.pdf`;
                          a.click();
                          URL.revokeObjectURL(url);
                          toast.success(`Batch exported as one PDF (${batchReviews.length} reviews)`);
                        } catch (e: any) {
                          toast.error(getConvexErrorMessage(e) || 'PDF export failed');
                        }
                      }}
                    >
                      Batch PDF
                    </Button>
                  </div>
                )}
                {batchReviews.map((r: any) => (
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
                            <Badge variant={verdictBadgeVariant(r.verdict)} size="sm" pill>
                              {r.verdict}
                            </Badge>
                          )}
                          <span>{new Date(r.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-shrink-0 flex-wrap justify-end">
                        {r.status === 'draft' && r.userId === user?.id && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setCurrentReviewId(r._id);
                              const batchId = (r as any).batchId;
                              const batchReviews = batchId
                                ? (reviews as any[]).filter((x: any) => x.batchId === batchId).map((x: any) => x._id)
                                : [r._id];
                              hydrateFromReview(r, batchReviews);
                            }}
                          >
                            Continue
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon={<FiDownload className="w-3.5 h-3.5" />}
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
                              const label = ((r as any).name ?? docIdToName.get(r.underReviewDocumentId) ?? 'review')
                                .replace(/[^a-zA-Z0-9-_]/g, '_')
                                .slice(0, 40);
                              a.download = `paperwork-review-${label}-${dateStr}.pdf`;
                              a.click();
                              URL.revokeObjectURL(url);
                              toast.success('Review downloaded as PDF');
                            } catch (e: any) {
                              toast.error(getConvexErrorMessage(e) || 'PDF download failed');
                            }
                          }}
                          title="Download this review as PDF"
                        >
                          Download
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          icon={<FiTrash2 className="w-3.5 h-3.5" />}
                          onClick={() => void requestDiscard(r._id)}
                          title="Discard review"
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                    <div className="ml-2 p-4 bg-white/5 rounded-xl border border-white/10">
                    <h3 className="font-semibold mb-2">Review details</h3>
                    <p className="text-sm text-white/70 mb-2 flex flex-wrap items-center gap-2">
                      Verdict:{' '}
                      {r.verdict ? (
                        <Badge variant={verdictBadgeVariant(r.verdict)} size="sm">
                          {r.verdict}
                        </Badge>
                      ) : (
                        <span className="font-medium">—</span>
                      )}
                      {r.completedAt && (
                        <span className="ml-4">
                          Completed {new Date(r.completedAt).toLocaleString()}
                        </span>
                      )}
                    </p>
                    {(r as any).reviewScope && (
                      <p className="text-sm text-white/60 mb-2">Scope: {(r as any).reviewScope}</p>
                    )}
                    {Array.isArray((r as any).auditorIds) && (r as any).auditorIds.length > 0 && (
                      <p className="text-sm text-white/60 mb-2">
                        Auditors: {(r as any).auditorIds.map((id: string) => auditorNameById.get(id as AuditAgent['id']) ?? id).join(', ')}
                      </p>
                    )}
                    {r.notes && (
                      <p className="text-sm text-white/60 mb-2">Notes: {r.notes}</p>
                    )}
                    {r.findings?.length > 0 && (
                      <div className="space-y-3 mt-3">
                        <h4 className="text-sm font-semibold text-white/90">Findings</h4>
                        {sortFindingsBySeverity(r.findings as any[]).map((f: any, i: number) => (
                          <div
                            key={f.id || i}
                            className="p-4 rounded-xl border border-white/15 bg-white/5"
                          >
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <Badge variant={findingSeverityBadgeVariant(f.severity)} size="sm">
                                {SEVERITY_OPTIONS.find((o) => o.value === (f.severity ?? 'observation'))?.label ?? 'Observation'}
                              </Badge>
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
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
