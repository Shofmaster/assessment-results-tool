import { useState, useMemo } from 'react';
import { FiUpload, FiExternalLink } from 'react-icons/fi';
import { toast } from 'sonner';
import { GlassCard } from './ui';
import { useAppStore } from '../store/appStore';
import {
  useSharedReferenceDocsForCompany,
  useDocuments,
  useDocumentsByCompany,
  useAddSharedReferenceDoc,
  useAddDocument,
  useGenerateUploadUrl,
  useDefaultClaudeModel,
  useProjects,
} from '../hooks/useConvexData';
import { buildAuditorCoverageSummary, orderAuditorCoverageByPriority, type CoverageSourceDocument } from '../services/auditorDocumentCoverage';
import { resolveDocumentType, type KnownReferenceDocType, type UploadCategory } from '../services/documentTypeResolver';
import { AUDITOR_DOCUMENT_REQUIREMENTS, DOC_TYPE_LABELS, type AuditorCoverageAgentId } from '../config/auditorDocumentRequirements';
import { getAcquisitionGuidance } from '../config/documentAcquisitionGuidance';
import { AUDIT_AGENTS } from '../data/auditAgentDefinitions';
import { AGENT_TYPES } from '../config/adminAgentTypes';

function asConvexArray<T = any>(v: T[] | undefined | null | unknown): T[] {
  return Array.isArray(v) ? v : [];
}

const PINNED_AUDITOR_IDS: AuditorCoverageAgentId[] = ['faa-inspector', 'general-manager', 'as9100-auditor'];

interface Props {
  adminScopeCompanyId: string | undefined;
  onRouteUploadForCategory: (category: UploadCategory) => void;
}

export default function AdminAuditorDocsTab({ adminScopeCompanyId, onRouteUploadForCategory }: Props) {
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const projects = asConvexArray(useProjects());

  const allRefDocs = useSharedReferenceDocsForCompany(adminScopeCompanyId) as any[] | undefined;
  const addRefDoc = useAddSharedReferenceDoc();
  const addDocument = useAddDocument();
  const generateUploadUrl = useGenerateUploadUrl();
  const defaultModel = useDefaultClaudeModel();

  const regulatoryByCompany = useDocumentsByCompany(adminScopeCompanyId, 'regulatory');
  const smsByCompany = useDocumentsByCompany(adminScopeCompanyId, 'sms');
  const referenceByCompany = useDocumentsByCompany(adminScopeCompanyId, 'reference');
  const uploadedByCompany = useDocumentsByCompany(adminScopeCompanyId, 'uploaded');
  const regulatoryByProject = useDocuments(activeProjectId || undefined, 'regulatory');
  const smsByProject = useDocuments(activeProjectId || undefined, 'sms');
  const referenceByProject = useDocuments(activeProjectId || undefined, 'reference');
  const uploadedByProject = useDocuments(activeProjectId || undefined, 'uploaded');

  const [coverageOverrides, setCoverageOverrides] = useState<Record<string, KnownReferenceDocType>>({});
  const [expandedGuidanceDocType, setExpandedGuidanceDocType] = useState<KnownReferenceDocType | null>(null);

  const libraryTargetProjectId = useMemo(() => {
    if (!adminScopeCompanyId) return activeProjectId;
    const inCompany = activeProjectId && projects.some((p: any) =>
      String(p._id) === String(activeProjectId) && String(p.companyId) === String(adminScopeCompanyId)
    );
    if (inCompany) return activeProjectId;
    const first = projects.find((p: any) => String(p.companyId) === String(adminScopeCompanyId));
    return first?._id ?? null;
  }, [adminScopeCompanyId, activeProjectId, projects]);

  const projectLibraryDocs = useMemo(() => {
    const regFiles = asConvexArray(adminScopeCompanyId ? regulatoryByCompany : regulatoryByProject);
    const smsDocs = asConvexArray(adminScopeCompanyId ? smsByCompany : smsByProject);
    const refDocs = asConvexArray(adminScopeCompanyId ? referenceByCompany : referenceByProject);
    const uploadedDocs = asConvexArray(adminScopeCompanyId ? uploadedByCompany : uploadedByProject);
    return [...regFiles, ...smsDocs, ...refDocs, ...uploadedDocs].map((d: any) => ({
      id: d._id,
      name: d.name,
      category: d.category,
      documentType: undefined,
    }));
  }, [adminScopeCompanyId, regulatoryByCompany, smsByCompany, referenceByCompany, uploadedByCompany, regulatoryByProject, smsByProject, referenceByProject, uploadedByProject]);

  const coverageDocuments = useMemo(() => {
    const sharedReference = asConvexArray(allRefDocs).map((d: any) => ({
      id: d._id,
      name: d.name,
      category: 'reference',
      documentType: d.documentType,
    }));
    return [...projectLibraryDocs, ...sharedReference] as CoverageSourceDocument[];
  }, [allRefDocs, projectLibraryDocs]);

  const auditorCoverageIds = useMemo(
    () => AUDIT_AGENTS.map((a) => a.id).filter((id): id is AuditorCoverageAgentId => id !== 'audit-host'),
    []
  );

  const coverageSummary = useMemo(
    () => buildAuditorCoverageSummary(auditorCoverageIds, coverageDocuments, coverageOverrides),
    [auditorCoverageIds, coverageDocuments, coverageOverrides]
  );

  const orderedCoverage = useMemo(
    () => orderAuditorCoverageByPriority(coverageSummary.byAuditor, PINNED_AUDITOR_IDS),
    [coverageSummary.byAuditor]
  );

  const handleBaselineChecklistUpload = async (files: File[]) => {
    if (files.length === 0) return;
    const missingRequiredTypes = new Set<KnownReferenceDocType>(orderedCoverage.flatMap((item) => item.missingDocTypes));
    if (missingRequiredTypes.size === 0) { toast.success('All required baseline document types are already covered.'); return; }
    const { DocumentExtractor } = await import('../services/documentExtractor');
    const extractor = new DocumentExtractor();
    let uploadedCount = 0;
    let skippedCount = 0;
    let needsProject = false;
    for (const file of files) {
      const resolved = resolveDocumentType({ id: file.name, name: file.name });
      const docType = resolved.docType as KnownReferenceDocType;
      if (!missingRequiredTypes.has(docType)) { skippedCount += 1; continue; }
      const guidance = getAcquisitionGuidance(docType);
      const destination = guidance.suggestedUploadCategory;
      if (destination !== 'reference' && !libraryTargetProjectId) { needsProject = true; skippedCount += 1; continue; }
      let extractedText = '';
      try { const buffer = await file.arrayBuffer(); extractedText = await extractor.extractText(buffer, file.name, file.type, defaultModel); } catch { /* optional */ }
      let storageId: any = undefined;
      try {
        const uploadUrl = await generateUploadUrl();
        const result = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
        const { storageId: sid } = await result.json();
        storageId = sid;
      } catch { /* optional */ }
      if (destination === 'reference') {
        await addRefDoc({ documentType: docType, name: file.name, path: file.name, source: 'local', mimeType: file.type || undefined, extractedText: extractedText || undefined, storageId });
      } else {
        await addDocument({ projectId: libraryTargetProjectId as any, category: destination, name: file.name, path: file.name, source: 'local', mimeType: file.type || undefined, size: file.size, storageId, extractedText: extractedText || undefined, extractedAt: new Date().toISOString() } as any);
      }
      uploadedCount += 1;
    }
    if (uploadedCount > 0) toast.success(`Uploaded ${uploadedCount} checklist document${uploadedCount === 1 ? '' : 's'}.`);
    if (skippedCount > 0) toast.info(`Skipped ${skippedCount} file${skippedCount === 1 ? '' : 's'} (not missing baseline type or no target project).`);
    if (needsProject) toast.info('Select a project to route regulatory/SMS checklist documents.');
  };

  return (
    <div className="space-y-4">
      <div className="p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl">
        <p className="text-sm text-sky-300/90">
          Track required documents by auditor persona, prioritize missing items, and jump directly to upload or source guidance.
        </p>
      </div>

      <GlassCard border rounded="xl">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-lg font-display font-bold text-white">Auditor coverage overview</h3>
          <p className="text-xs text-white/60 mt-1">Pinned first: FAA Inspector, General Manager, AS9100 Auditor</p>
          <p className="text-[11px] text-white/50 mt-1">Coverage uses project library + shared reference docs only (auditor knowledge-base docs are separate context).</p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {orderedCoverage.map((item) => {
            const agent = AGENT_TYPES.find((a) => a.id === item.agentId);
            const pinned = PINNED_AUDITOR_IDS.includes(item.agentId);
            const complete = item.missingDocTypes.length === 0;
            return (
              <div key={item.agentId} className={`rounded-lg border ${pinned ? 'border-sky-light/30' : 'border-white/10'} bg-white/5 p-3`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className={`text-sm font-medium ${agent?.color || 'text-white'}`}>{agent?.name || item.agentId}</p>
                  <span className={`text-xs ${complete ? 'text-green-400' : 'text-amber-300'}`}>
                    {item.satisfiedCount}/{item.requiredCount} ({item.completionPercent}%)
                  </span>
                </div>
                <p className="text-[11px] text-white/60">
                  Missing:{' '}
                  {item.missingDocTypes.length === 0
                    ? 'None'
                    : item.missingDocTypes.slice(0, 3).map((t) => DOC_TYPE_LABELS[t]).join(', ')}
                  {item.missingDocTypes.length > 3 ? ` +${item.missingDocTypes.length - 3} more` : ''}
                </p>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard border rounded="xl">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-lg font-display font-bold text-white">Prioritized missing document types</h3>
          <p className="text-xs text-white/60 mt-1">Upload first where coverage gain is highest.</p>
        </div>
        <div className="p-4 space-y-2">
          <div className="rounded-lg border border-sky-light/20 bg-sky/10 p-3 mb-2">
            <p className="text-xs text-sky-lighter mb-2">
              One-click helper: upload multiple files and auto-route each file to Reference, Regulatory, or SMS based on inferred document type.
            </p>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors bg-sky/20 text-sky-lighter hover:bg-sky/30">
              <FiUpload />
              Upload Baseline Checklist Files
              <input
                type="file"
                multiple
                accept=".pdf,.docx,.doc,.txt,.csv,.xlsx"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length) handleBaselineChecklistUpload(files);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          {coverageSummary.prioritizedMissing.length === 0 ? (
            <p className="text-sm text-green-300">All required baseline document types are currently covered.</p>
          ) : (
            coverageSummary.prioritizedMissing.map((item) => {
              const guidance = getAcquisitionGuidance(item.docType);
              const expanded = expandedGuidanceDocType === item.docType;
              return (
                <div key={item.docType} className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm text-white">{item.label}</p>
                      <p className="text-[11px] text-white/60">
                        Helps {item.coverageGain} auditor{item.coverageGain === 1 ? '' : 's'} • {item.priorityBucket}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onRouteUploadForCategory(guidance.suggestedUploadCategory)}
                        className="text-xs px-2 py-1 rounded-md bg-sky/20 text-sky-lighter border border-sky-light/30"
                      >
                        Upload now
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedGuidanceDocType(expanded ? null : item.docType)}
                        className="text-xs px-2 py-1 rounded-md bg-white/10 text-white/80 border border-white/20"
                      >
                        {expanded ? 'Hide guidance' : 'View guidance'}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-3 text-xs text-white/80 space-y-2 border-t border-white/10 pt-3">
                      <p>{guidance.guidance}</p>
                      <p className="text-white/60">Suggested sources: {guidance.sourceTypes.join(', ')}</p>
                      {guidance.templateLinks.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {guidance.templateLinks.map((link) => (
                            <a
                              key={link.url}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sky-lighter hover:underline"
                            >
                              <FiExternalLink className="w-3 h-3" />
                              {link.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </GlassCard>
    </div>
  );
}
