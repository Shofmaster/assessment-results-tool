import { useState } from 'react';
import { FiUpload, FiTrash2, FiChevronDown, FiChevronRight, FiDownload, FiFolder } from 'react-icons/fi';
import { toast } from 'sonner';
import { Button, GlassCard } from './ui';
import {
  useSharedReferenceDocsForCompany,
  useAddSharedReferenceDoc,
  useRemoveSharedReferenceDoc,
  useGenerateUploadUrl,
  useDefaultClaudeModel,
  useIsAerogapEmployee,
} from '../hooks/useConvexData';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { filterAdminKbReferenceUploadFiles, fileDisplayPathForUpload } from '../utils/fileUploadPaths';

function asConvexArray<T = any>(v: T[] | undefined | null | unknown): T[] {
  return Array.isArray(v) ? v : [];
}

function pickFolder(onPick: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.setAttribute('webkitdirectory', '');
  input.setAttribute('directory', '');
  input.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;opacity:0;pointer-events:none';
  const teardown = () => { queueMicrotask(() => input.remove()); };
  input.addEventListener('change', () => { const list = input.files; teardown(); if (list?.length) onPick(Array.from(list)); });
  input.addEventListener('cancel', teardown);
  document.body.appendChild(input);
  input.click();
}

const REFERENCE_DOC_TYPES = [
  { id: 'part-145-manual', name: 'Part 145 Repair Station Manual', color: 'text-blue-400' },
  { id: 'gmm', name: 'General Maintenance Manual (GMM)', color: 'text-green-400' },
  { id: 'part-135-manual', name: 'Part 135 Operations Manual', color: 'text-purple-400' },
  { id: 'ops-specs', name: 'Operations Specifications (Ops Specs)', color: 'text-amber-400' },
  { id: 'mel', name: 'Minimum Equipment List (MEL/MMEL)', color: 'text-red-400' },
  { id: 'training-program', name: 'Training Program Manual', color: 'text-teal-400' },
  { id: 'qcm', name: 'Quality Control Manual (QCM)', color: 'text-orange-400' },
  { id: 'sms-manual', name: 'SMS Manual', color: 'text-cyan-400' },
  { id: 'ipm', name: 'Inspection Procedures Manual (IPM)', color: 'text-pink-400' },
  { id: 'part-121-manual', name: 'Part 121 Operations Manual', color: 'text-indigo-400' },
  { id: 'part-91-manual', name: 'Part 91 Operations Manual', color: 'text-lime-400' },
  { id: 'hazmat-manual', name: 'Hazmat Training Manual', color: 'text-yellow-400' },
  { id: 'tool-calibration', name: 'Tool Calibration Manual', color: 'text-violet-400' },
  { id: 'isbao-standards', name: 'IS-BAO Standards', color: 'text-rose-400' },
  { id: 'other', name: 'Other Reference', color: 'text-white/70' },
] as const;

interface Props {
  adminScopeCompanyId: string | undefined;
  isStaff: boolean | null | undefined;
}

export default function AdminRefDocsTab({ adminScopeCompanyId, isStaff }: Props) {
  const allRefDocs = useSharedReferenceDocsForCompany(adminScopeCompanyId) as any[] | undefined;
  const addRefDoc = useAddSharedReferenceDoc();
  const removeRefDoc = useRemoveSharedReferenceDoc();
  const generateUploadUrl = useGenerateUploadUrl();
  const defaultModel = useDefaultClaudeModel();
  const convex = useConvex();

  const [expandedRefType, setExpandedRefType] = useState<string | null>(null);
  const [refUploadProgress, setRefUploadProgress] = useState<{ typeId: string; current: number; total: number } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [uploadAsPlatformWide, setUploadAsPlatformWide] = useState(false);

  const canDeleteSharedDoc = (doc: any) => Boolean(doc?.companyId) || Boolean(isStaff);

  const refDocsByType = (typeId: string) =>
    asConvexArray(allRefDocs).filter((d: any) => d.documentType === typeId);

  const isRefUploading = (typeId: string) => refUploadProgress?.typeId === typeId;

  const handleRefFileUpload = async (typeId: string, files: File[]) => {
    if (files.length === 0) return;
    const { accepted, skipped } = filterAdminKbReferenceUploadFiles(files);
    if (!accepted.length) { toast.error('No supported files (PDF, Word, TXT, CSV, XLSX).'); return; }
    if (skipped > 0) toast.message(`${skipped} file(s) skipped (unsupported type).`);
    setRefUploadProgress({ typeId, current: 0, total: accepted.length });
    const { DocumentExtractor } = await import('../services/documentExtractor');
    const extractor = new DocumentExtractor();
    try {
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i];
        const displayPath = fileDisplayPathForUpload(file);
        setRefUploadProgress({ typeId, current: i + 1, total: accepted.length });
        let extractedText = '';
        try {
          const buffer = await file.arrayBuffer();
          extractedText = await extractor.extractText(buffer, file.name, file.type, defaultModel);
        } catch { /* extraction optional */ }
        let storageId: any = undefined;
        try {
          const uploadUrl = await generateUploadUrl();
          const result = await fetch(uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
          const { storageId: sid } = await result.json();
          storageId = sid;
        } catch { /* storage optional */ }
        await addRefDoc({
          documentType: typeId,
          name: displayPath,
          path: displayPath,
          source: 'local',
          mimeType: file.type || undefined,
          extractedText: extractedText || undefined,
          storageId,
          ...(uploadAsPlatformWide ? {} : { companyId: adminScopeCompanyId as any }),
        });
      }
      toast.success(`Uploaded ${accepted.length} reference document${accepted.length !== 1 ? 's' : ''}`);
    } finally {
      setRefUploadProgress(null);
    }
  };

  const handleDeleteRefDoc = async (docId: string) => {
    const doc = asConvexArray(allRefDocs).find((d: any) => d._id === docId);
    if (doc && !canDeleteSharedDoc(doc)) { toast.error('This is a platform-wide document and is read-only for your role.'); return; }
    try {
      await removeRefDoc({ documentId: docId as any });
      setDeleteConfirmId(null);
      toast.success('Reference document removed');
    } catch (err: any) {
      toast.error(err?.message || 'Could not remove reference document');
    }
  };

  const handleDownloadRefDoc = async (doc: any) => {
    if (doc.storageId) {
      try {
        const url = await convex.query(api.fileActions.getSharedReferenceDocumentFileUrl, { documentId: doc._id });
        if (url) { window.open(url, '_blank'); return; }
      } catch { /* fall through */ }
    }
    if (doc.extractedText) {
      const blob = new Blob([doc.extractedText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.name.replace(/\.[^.]+$/, '') + '.txt';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div>
      <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <p className="text-sm text-amber-300/90">
          Upload reference documents here to make them available in <strong>Paperwork Review</strong> for the selected company (plus any platform-wide references).
          These serve as "known-good" standards for comparing against submitted paperwork.
        </p>
        <label className="mt-3 flex items-center gap-2 text-xs text-amber-200/90 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={uploadAsPlatformWide}
            onChange={(e) => setUploadAsPlatformWide(e.target.checked)}
            className="rounded border-amber-400/40"
          />
          Upload as platform-wide (visible to all companies)
        </label>
        <p className="mt-2 text-[11px] text-amber-200/70 leading-relaxed">
          Platform-wide uploads require platform staff. Leave unchecked for company-scoped reference documents only.
        </p>
        <p className="mt-1 text-[11px] text-amber-200/55 leading-relaxed">
          Folder upload: Chromium or Firefox recommended; Safari is best-effort. Unsupported types in a folder are skipped (PDF, Word, TXT, CSV, XLSX).
        </p>
      </div>
      <div className="space-y-3">
        {REFERENCE_DOC_TYPES.map((docType) => {
          const docs = refDocsByType(docType.id);
          const isExpanded = expandedRefType === docType.id;
          const typeUploading = isRefUploading(docType.id);
          return (
            <GlassCard key={docType.id} border rounded="xl">
              <button
                onClick={() => setExpandedRefType(isExpanded ? null : docType.id)}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  {isExpanded ? <FiChevronDown className="text-white/70" /> : <FiChevronRight className="text-white/70" />}
                  <span className={`font-medium ${docType.color}`}>{docType.name}</span>
                  <span className="text-xs text-white/70 bg-white/5 px-2 py-0.5 rounded-full">
                    {docs.length} doc{docs.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3">
                  {refUploadProgress?.typeId === docType.id && (
                    <div className="mb-3 text-sm text-sky-lighter flex items-center gap-2">
                      <div className="animate-spin w-4 h-4 border-2 border-sky-light/30 border-t-sky-light rounded-full" />
                      Uploading file {refUploadProgress.current} of {refUploadProgress.total}...
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mb-3">
                    <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${typeUploading ? 'bg-white/5 text-white/70 cursor-not-allowed' : 'bg-sky/10 text-sky-lighter hover:bg-sky/20'}`}>
                      <FiUpload />
                      Upload Files
                      <input type="file" multiple accept=".pdf,.docx,.doc,.txt,.csv,.xlsx" className="hidden" disabled={typeUploading}
                        onChange={(e) => { if (e.target.files?.length) { handleRefFileUpload(docType.id, Array.from(e.target.files)); e.target.value = ''; } }} />
                    </label>
                    <button
                      type="button"
                      disabled={typeUploading}
                      onClick={() => { if (!typeUploading) pickFolder((files) => handleRefFileUpload(docType.id, files)); }}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${typeUploading ? 'bg-white/5 text-white/70 cursor-not-allowed' : 'bg-white/10 text-white/90 hover:bg-white/15 cursor-pointer'}`}
                    >
                      <FiFolder />
                      Upload Folder
                    </button>
                  </div>
                  {docs.length === 0 ? (
                    <p className="text-sm text-white/60 italic">No documents of this type yet.</p>
                  ) : (
                    <div className="space-y-1">
                      {docs.map((doc: any) => (
                        <div key={doc._id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 group">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm text-white/80 truncate">{doc.name}</span>
                            <span className="text-xs text-white/60">{doc.extractedText ? `${Math.round(doc.extractedText.length / 1000)}k chars` : 'no text'}</span>
                          </div>
                          <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => handleDownloadRefDoc(doc)} className="text-white/70 hover:text-sky-lighter transition-colors p-1" title="Download">
                              <FiDownload className="w-3.5 h-3.5" />
                            </button>
                            {!canDeleteSharedDoc(doc) ? (
                              <span className="text-[11px] text-white/45 px-1">read-only</span>
                            ) : deleteConfirmId === doc._id ? (
                              <div className="flex items-center gap-1">
                                <Button onClick={() => handleDeleteRefDoc(doc._id)} variant="destructive" size="sm">Confirm</Button>
                                <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-white/70 px-1 hover:text-white transition-colors">Cancel</button>
                              </div>
                            ) : (
                              <button onClick={() => setDeleteConfirmId(doc._id)} className="text-red-400/60 hover:text-red-400 transition-colors p-1" title="Remove">
                                <FiTrash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
