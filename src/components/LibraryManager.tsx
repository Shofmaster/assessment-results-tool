import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { FiFolder, FiUpload, FiTrash2, FiFile } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useAppStore } from '../store/appStore';
import {
  useDocuments,
  useDocumentsByCompany,
  useAddDocument,
  useRemoveDocument,
  useAddDctXmlFromProject,
  useDefaultClaudeModel,
  useGenerateUploadUrl,
  useDeleteStorage,
  useIsAerogapEmployee,
  useUserSettings,
  useProjects,
  useProject,
  useSharedReferenceDocsResolved,
  useDctParsedLibraryDocsByCompany,
  useStartDctBulkDeleteJob,
  useDctBulkDeleteJob,
  useActiveDctBulkDeleteJobForProject,
  useLibraryFolders,
  useCreateLibraryFolder,
  useRenameLibraryFolder,
  useMoveLibraryFolder,
  useRemoveLibraryFolder,
  useMoveDocumentToFolder,
} from '../hooks/useConvexData';
import { dctDisplayNameForFile, filterXmlFilesFromFileList, parallelMap } from '../services/dctIngestChunks';
import { parseDctXmlString } from '../services/dctXmlParser';
import { DocumentExtractor } from '../services/documentExtractor';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { getConvexErrorMessage } from '../utils/convexError';
import { prepareExtractedPayloadForConvex } from '../utils/documentExtractedText';
import {
  deleteOrphanStorage,
  sha256Hex,
  uploadFileToConvexStorage,
} from '../utils/uploadFile';
import type { Id } from '../../convex/_generated/dataModel';
import { Button, GlassCard, Badge } from './ui';
import { DctContextPill, purposePreview } from './DctContextUi';
import MoveToFolderModal, { flattenFoldersForPicker } from './library/MoveToFolderModal';
import LibraryFolderTree, { setLibraryDragData } from './library/LibraryFolderTree';

function basenameLower(pathOrName: string | undefined): string {
  const s = String(pathOrName ?? '').trim();
  if (!s) return '';
  const seg = s.includes('/') ? (s.split('/').pop() ?? s) : s;
  return seg.toLowerCase();
}

function isAcceptedEntityFile(file: File): boolean {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || n.endsWith('.doc') || n.endsWith('.docx') || n.endsWith('.txt')) return true;
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  return false;
}

export type LibraryManagerProps = {
  /** When true, render only the entity panels (for embedding in Company Library tabs). */
  embedded?: boolean;
};

/** Library page shows only entity documents; other categories are managed in Admin. */
export default function LibraryManager({ embedded = false }: LibraryManagerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef, !embedded);

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const companyLibraryFolderByCompanyId = useAppStore((s) => s.companyLibraryFolderByCompanyId);
  const setCompanyLibraryFolderSelection = useAppStore((s) => s.setCompanyLibraryFolderSelection);
  const navigate = useNavigate();
  const defaultModel = useDefaultClaudeModel();
  const isStaff = useIsAerogapEmployee();
  const sidebarSettings = useUserSettings();
  const adminScopeCompanyId = sidebarSettings?.activeCompanyId as string | undefined;
  const projects = (useProjects() || []) as any[];

  const entityByCompany = useDocumentsByCompany(
    isStaff && adminScopeCompanyId ? adminScopeCompanyId : undefined,
    'entity',
  );
  const entityByProject = useDocuments(activeProjectId || undefined, 'entity');

  const entityDocuments = (
    isStaff && adminScopeCompanyId ? entityByCompany || [] : entityByProject || []
  ) as any[];

  const libraryTargetProjectId = useMemo(() => {
    if (!isStaff || !adminScopeCompanyId) return activeProjectId;
    const inCompany =
      activeProjectId &&
      projects.some(
        (p: any) =>
          String(p._id) === String(activeProjectId) &&
          String(p.companyId) === String(adminScopeCompanyId),
      );
    if (inCompany) return activeProjectId;
    const first = projects.find((p: any) => String(p.companyId) === String(adminScopeCompanyId));
    return first?._id ?? null;
  }, [isStaff, adminScopeCompanyId, activeProjectId, projects]);

  const uploadProjectId = libraryTargetProjectId;
  const uploadProject = useProject(uploadProjectId ?? undefined) as { companyId?: string } | undefined | null;
  const uploadCompanyId = uploadProject?.companyId;
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined);
  const [moveDocumentId, setMoveDocumentId] = useState<string | null>(null);
  const folders = useLibraryFolders(uploadCompanyId ? String(uploadCompanyId) : undefined) as any[] | undefined;
  const createFolder = useCreateLibraryFolder();
  const renameFolder = useRenameLibraryFolder();
  const moveFolder = useMoveLibraryFolder();
  const removeFolder = useRemoveLibraryFolder();
  const moveDocumentToFolder = useMoveDocumentToFolder();

  useEffect(() => {
    if (!uploadCompanyId) return;
    const encoded = companyLibraryFolderByCompanyId[String(uploadCompanyId)] ?? '__ALL__';
    if (encoded === '__ALL__') setSelectedFolderId(undefined);
    else if (encoded === '__ROOT__') setSelectedFolderId(null);
    else setSelectedFolderId(encoded);
  }, [uploadCompanyId, companyLibraryFolderByCompanyId]);

  const setLibraryFolderSelection = useCallback(
    (folderId: string | null | undefined) => {
      setSelectedFolderId(folderId);
      if (uploadCompanyId) setCompanyLibraryFolderSelection(String(uploadCompanyId), folderId);
    },
    [uploadCompanyId, setCompanyLibraryFolderSelection],
  );

  const sharedRefsResolved = useSharedReferenceDocsResolved() as any[] | undefined;
  const dctLibraryRefs = useMemo(
    () =>
      (sharedRefsResolved ?? []).filter((ref) => {
        const type = String(ref?.documentType ?? '').toLowerCase();
        const canonicalType = String(ref?.canonicalDocType ?? '').toLowerCase();
        return type === 'faa_sas_dct' || canonicalType === 'faa_sas_dct';
      }),
    [sharedRefsResolved],
  );
  const parsedLibraryRows = useDctParsedLibraryDocsByCompany(
    uploadCompanyId ? String(uploadCompanyId) : undefined,
  ) as any[] | undefined;
  const parsedLibraryByHash = useMemo(() => {
    const m = new Map<string, any>();
    for (const row of parsedLibraryRows ?? []) {
      const h = String(row?.contentHash ?? '').trim();
      if (h) m.set(h, row);
    }
    return m;
  }, [parsedLibraryRows]);

  const convex = useConvex();
  const addDocument = useAddDocument();
  const deleteStorage = useDeleteStorage();
  const addDctXmlFromProject = useAddDctXmlFromProject();
  const removeDocument = useRemoveDocument();
  const startDctBulkDeleteJob = useStartDctBulkDeleteJob();
  const activeDctBulkDeleteJob = useActiveDctBulkDeleteJobForProject(
    uploadProjectId ? String(uploadProjectId) : null,
  );
  const [dctBulkJobWatchId, setDctBulkJobWatchId] = useState<string | null>(null);
  const [dctBulkDeleteStarting, setDctBulkDeleteStarting] = useState(false);
  const dctDeleteToastIdRef = useRef<string | number | null>(null);
  const dctDeleteFinalizedRef = useRef(false);
  const bulkDeleteJob = useDctBulkDeleteJob(dctBulkJobWatchId);

  useEffect(() => {
    if (dctBulkJobWatchId != null) return;
    if (!uploadProjectId) return;
    const j = activeDctBulkDeleteJob;
    if (j === undefined) return;
    if (j && (j.status === 'queued' || j.status === 'running')) {
      setDctBulkJobWatchId(String(j._id));
    }
  }, [dctBulkJobWatchId, uploadProjectId, activeDctBulkDeleteJob]);

  useEffect(() => {
    if (!dctBulkJobWatchId) return;
    const job = bulkDeleteJob;
    const tid = dctDeleteToastIdRef.current;

    if (job === undefined) return;

    if (job === null) {
      const t = dctDeleteToastIdRef.current;
      if (t && !dctDeleteFinalizedRef.current) {
        dctDeleteFinalizedRef.current = true;
        toast.error('DCT delete job not found or was removed.', { id: t });
        dctDeleteToastIdRef.current = null;
      }
      setDctBulkJobWatchId(null);
      return;
    }

    if (!tid && (job.status === 'queued' || job.status === 'running')) {
      dctDeleteToastIdRef.current = toast.loading('Resuming DCT delete…');
    }

    const effectiveTid = dctDeleteToastIdRef.current;
    if (!effectiveTid) return;

    if (job.status === 'queued' || job.status === 'running') {
      const est =
        job.totalEstimate != null && job.totalEstimate > 0
          ? ` (~${job.totalEstimate} files)`
          : '';
      toast.loading(
        `Deleting DCT files… ${job.deletedDocs} file(s) removed${est}. Parse cache: ${job.deletedParsedDocs} doc(s), ${job.deletedParsedQuestions} question row(s) cleared.`,
        { id: effectiveTid },
      );
      return;
    }

    if (dctDeleteFinalizedRef.current) return;
    dctDeleteFinalizedRef.current = true;

    if (job.status === 'completed') {
      toast.success(
        `Removed ${job.deletedDocs} DCT file(s). Cleared ${job.deletedParsedDocs} parse record(s) and ${job.deletedParsedQuestions} cached question row(s).`,
        { id: effectiveTid },
      );
    } else if (job.status === 'failed') {
      toast.error('Could not finish deleting DCT files', {
        id: effectiveTid,
        description: job.lastError ?? 'Unknown error',
      });
    } else {
      toast.message(`DCT delete job ended (${job.status}).`, { id: effectiveTid });
    }
    setDctBulkJobWatchId(null);
    dctDeleteToastIdRef.current = null;
  }, [dctBulkJobWatchId, bulkDeleteJob]);

  const generateUploadUrl = useGenerateUploadUrl();

  const processEntityFiles = async (fileList: File[], sourceLabel: string) => {
    if (!uploadProjectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    const files = Array.from(fileList);
    const accepted = files.filter(isAcceptedEntityFile);
    const skipped = files.length - accepted.length;
    if (!accepted.length) {
      toast.error('No supported files in selection (PDF, Word, TXT, images).');
      return;
    }
    if (skipped > 0) {
      toast.message(`${skipped} file(s) skipped (unsupported type).`);
    }

    const extractor = new DocumentExtractor();
    const showProgress = accepted.length > 3;
    const toastId = showProgress ? toast.loading(`${sourceLabel}: 0/${accepted.length}…`) : undefined;
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < accepted.length; i++) {
      const file = accepted[i];
      const displayPath = dctDisplayNameForFile(file);
      const shortLabel = displayPath.includes('/') ? displayPath.split('/').pop() ?? displayPath : displayPath;

      if (toastId && (i % 3 === 0 || i === accepted.length - 1)) {
        toast.loading(`${sourceLabel}: ${i + 1}/${accepted.length} — ${shortLabel}`, { id: toastId });
      }

      let extractedText = '';
      let extractionMeta: { backend: string; confidence?: number } | undefined;
      let storageId: Id<'_storage'> | undefined;
      let contentHash: string | undefined;
      try {
        const buffer = await file.arrayBuffer();
        contentHash = await sha256Hex(buffer);
        const existingByHash = await convex.query(api.documents.findByContentHash, {
          projectId: uploadProjectId as Id<'projects'>,
          contentHash,
        });
        if (existingByHash) {
          continue;
        }
        try {
          storageId = await uploadFileToConvexStorage(
            file,
            file.type || 'application/octet-stream',
            generateUploadUrl,
          );
        } catch (uploadErr: unknown) {
          console.warn(`Storage upload failed: ${shortLabel}`, uploadErr);
        }
        try {
          const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, defaultModel);
          extractedText = extracted.text;
          extractionMeta = extracted.metadata;
        } catch (err: any) {
          toast.warning(`Could not extract text from ${shortLabel}`, { description: err?.message });
        }
        const payload = await prepareExtractedPayloadForConvex(extractedText || '', generateUploadUrl);
        const rowExtractedText = payload.extractedText;
        const extractedTextStorageId = payload.extractedTextStorageId;
        if (payload.extractedTextStorageId) {
          toast.message(`Large document: ${shortLabel}`, {
            description:
              'Full extracted text is stored in file storage; analyses will load the complete text automatically.',
          });
        } else if (payload.spillFailed) {
          toast.warning(`Could not upload full text for ${shortLabel}`, {
            description: 'Saved an inline excerpt only. Try again or split the file.',
          });
        } else if (payload.inlineTruncated) {
          toast.warning(`Stored a truncated copy of ${shortLabel}`, {
            description: 'Extracted text was clamped to fit the database row.',
          });
        }
        try {
          await addDocument({
            projectId: uploadProjectId as any,
            category: 'entity',
            folderId: selectedFolderId === null ? undefined : (selectedFolderId as any),
            name: displayPath,
            path: displayPath,
            source: 'local',
            mimeType: file.type || undefined,
            size: file.size,
            storageId,
            extractedText: rowExtractedText,
            extractedTextStorageId: extractedTextStorageId as any,
            extractionMeta,
            contentHash,
            extractedAt: new Date().toISOString(),
          } as any);
          successCount += 1;
        } catch (err: unknown) {
          await deleteOrphanStorage(storageId, deleteStorage);
          if (extractedTextStorageId) {
            await deleteOrphanStorage(extractedTextStorageId as Id<'_storage'>, deleteStorage);
          }
          failCount += 1;
          toast.error(`Could not save ${shortLabel}`, { description: getConvexErrorMessage(err) });
        }
      } catch (err: unknown) {
        failCount += 1;
        toast.error(`Could not process ${shortLabel}`, { description: getConvexErrorMessage(err) });
      }
    }

    if (successCount > 0) {
      toast.success(
        `Added ${successCount} entity document${successCount !== 1 ? 's' : ''}${failCount > 0 ? ` (${failCount} failed)` : ''}`,
        toastId ? { id: toastId } : undefined,
      );
    } else if (accepted.length > 0) {
      toast.error('No entity documents were saved', {
        ...(toastId ? { id: toastId } : {}),
        description: 'Fix the errors above or try again.',
      });
    }
  };

  const handleImportEntity = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/gif,image/webp';
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      void processEntityFiles(files, 'Import');
    };
    input.click();
  };

  const handleImportEntityFolder = () => {
    if (!uploadProjectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt,image/jpeg,image/png,image/gif,image/webp';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      void processEntityFiles(files, 'Folder import');
    };
    input.click();
  };

  const processDctXmlFilesToLibrary = async (fileList: File[], sourceLabel: string) => {
    if (!uploadProjectId) {
      toast.error('Select a project first.');
      return;
    }
    if (!uploadCompanyId) {
      toast.error('This project is not linked to a company. DCT files are stored in the company reference library.');
      return;
    }
    const xmlFiles = filterXmlFilesFromFileList(fileList);
    if (!xmlFiles.length) {
      toast.error('No .xml files in selection.');
      return;
    }
    const toastId = toast.loading(`${sourceLabel}: uploading 0/${xmlFiles.length}…`);
    const results = await parallelMap(xmlFiles, 4, async (file) => {
      const displayName = dctDisplayNameForFile(file);
      let storageId: string | undefined;
      let parsed: ReturnType<typeof parseDctXmlString> | null = null;
      try {
        const text = await file.text();
        parsed = parseDctXmlString(displayName, text);
        const uploadUrl = await generateUploadUrl();
        const uploadResult = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Type': file.type || 'application/xml' },
          body: file,
        });
        const uploadJson = await uploadResult.json();
        storageId = uploadJson.storageId;
      } catch {
        return { ok: false as const, displayName, err: 'upload/parse failed' };
      }
      if (!storageId) return { ok: false as const, displayName, err: 'no storage id' };

      let notes: string | undefined;
      if (parsed) {
        const bits = [parsed.standardDctId, parsed.peerGroupLabel].filter(Boolean);
        if (bits.length) notes = bits.join(' · ');
      }

      try {
        await addDctXmlFromProject({
          projectId: uploadProjectId as any,
          name: displayName,
          path: displayName,
          storageId: storageId as any,
          mimeType: file.type || 'application/xml',
          notes,
          contentHash: parsed?.contentHash,
          parsed: parsed
            ? {
                fileName: parsed.fileName,
                contentHash: parsed.contentHash,
                standardDctId: parsed.standardDctId,
                standardDctDetailId: parsed.standardDctDetailId,
                dctVersionNumber: parsed.dctVersionNumber,
                dctVersionDate: parsed.dctVersionDate,
                dctStatus: parsed.dctStatus,
                mlfId: parsed.mlfId,
                mlfLabel: parsed.mlfLabel,
                mlfName: parsed.mlfName,
                assessmentTypeLabel: parsed.assessmentTypeLabel,
                specialtyLabel: parsed.specialtyLabel,
                peerGroupLabel: parsed.peerGroupLabel,
                purpose: parsed.purpose,
                objective: parsed.objective,
                questions: parsed.questions.map((q) => ({
                  questionId: q.questionId,
                  questionDetailsId: q.questionDetailsId,
                  qVersionNumber: q.qVersionNumber,
                  qVersionDate: q.qVersionDate,
                  displayOrder: q.displayOrder,
                  text: q.text,
                  safetyAttribute: q.safetyAttribute,
                  questionType: q.questionType,
                  scopingAttribute: q.scopingAttribute,
                  noteToUser: q.noteToUser,
                  references: q.references ?? [],
                  responses: q.responses ?? [],
                })),
              }
            : undefined,
        });
        return { ok: true as const, displayName };
      } catch (err: unknown) {
        return { ok: false as const, displayName, err: getConvexErrorMessage(err) };
      }
    });

    const ok = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);
    if (ok > 0) {
      toast.success(
        `Added ${ok} DCT XML file${ok !== 1 ? 's' : ''} to company reference library. Use DCT Compliance → Sync from library to copy requirements into a project.`,
        {
          id: toastId,
          description:
            failed.length > 0
              ? `${failed.length} failed: ${failed
                  .slice(0, 4)
                  .map((f) => `${f.displayName} (${'err' in f ? f.err : ''})`)
                  .join(' · ')}`
              : undefined,
        },
      );
    } else {
      toast.error('No DCT XML files were saved', {
        id: toastId,
        description: failed.length ? failed.slice(0, 3).map((f) => f.displayName).join(' · ') : undefined,
      });
    }
  };

  const handleImportDctXml = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.xml,application/xml,text/xml';
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      void processDctXmlFilesToLibrary(files, 'DCT XML');
    };
    input.click();
  };

  const handleImportDctXmlFolder = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.xml,application/xml,text/xml';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      void processDctXmlFilesToLibrary(files, 'DCT folder');
    };
    input.click();
  };

  const handleDelete = (fileId: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      removeDocument({ documentId: fileId as any });
    }
  };

  const handleDeleteAllDcts = async () => {
    if (!uploadProjectId) {
      toast.error('Select a project first.');
      return;
    }
    if (!uploadCompanyId) {
      toast.error('Link this project to a company to manage DCT library files.');
      return;
    }
    const count = dctLibraryRefs.length;
    if (count === 0) {
      toast.message('No DCT XML files to delete.');
      return;
    }
    const confirmed = confirm(
      `Are you sure you want to delete ALL ${count} DCT XML file${count !== 1 ? 's' : ''} from the company reference library? This cannot be undone.`,
    );
    if (!confirmed) return;
    dctDeleteFinalizedRef.current = false;
    setDctBulkDeleteStarting(true);
    const toastId = toast.loading(`Starting delete of ${count} DCT file${count !== 1 ? 's' : ''}…`);
    dctDeleteToastIdRef.current = toastId;
    try {
      const jobId = await startDctBulkDeleteJob({
        projectId: uploadProjectId as any,
        totalEstimate: count,
      });
      setDctBulkJobWatchId(String(jobId));
      toast.loading('Deleting DCT files in the background…', { id: toastId });
    } catch (err: unknown) {
      dctDeleteToastIdRef.current = null;
      toast.error('Could not start DCT delete job', {
        id: toastId,
        description: getConvexErrorMessage(err),
      });
    } finally {
      setDctBulkDeleteStarting(false);
    }
  };

  const dctBulkDeleteInProgress =
    dctBulkDeleteStarting ||
    (bulkDeleteJob != null &&
      (bulkDeleteJob.status === 'queued' || bulkDeleteJob.status === 'running'));

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const scopedCopy =
    isStaff && adminScopeCompanyId
      ? 'All entity documents across projects in the selected company. Imports go to the active sidebar project when it belongs to this company; otherwise the first project in the company.'
      : 'Organization manuals, procedures, and other entity documentation for this project. Other library categories are managed in Admin.';
  const filteredEntityDocuments = useMemo(() => {
    if (selectedFolderId === undefined) return entityDocuments;
    if (selectedFolderId === null) return entityDocuments.filter((d: any) => !d.folderId);
    return entityDocuments.filter((d: any) => String(d.folderId || '') === String(selectedFolderId));
  }, [entityDocuments, selectedFolderId]);
  const folderItemCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of entityDocuments) {
      if (!d.folderId) continue;
      const key = String(d.folderId);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [entityDocuments]);

  const folderPathLabel = useMemo(() => {
    if (selectedFolderId === undefined) return 'Showing: all folders · uploads follow the folder tree selection';
    if (selectedFolderId === null) return 'Showing: Library root only';
    const byId = new Map((folders ?? []).map((f: any) => [String(f._id), f]));
    const names: string[] = [];
    let cursor: string | undefined = selectedFolderId ?? undefined;
    while (cursor) {
      const row = byId.get(cursor);
      if (!row) break;
      names.unshift(row.name);
      cursor = row.parentFolderId ? String(row.parentFolderId) : undefined;
    }
    return names.length ? `Library · ${names.join(' › ')}` : 'Library root';
  }, [folders, selectedFolderId]);

  const documentMoveFolderOptions = useMemo(
    () =>
      flattenFoldersForPicker(
        (folders ?? []).map((f: any) => ({
          _id: String(f._id),
          name: f.name,
          parentFolderId: f.parentFolderId,
        })),
      ),
    [folders],
  );

  const handleConfirmMoveDocument = async (folderId: string | null) => {
    if (!moveDocumentId) return;
    try {
      await moveDocumentToFolder({ documentId: moveDocumentId as any, folderId } as any);
      toast.success('Document moved');
    } catch (e: unknown) {
      toast.error(getConvexErrorMessage(e));
      throw e;
    }
  };

  const outerClass = embedded
    ? 'w-full min-w-0 h-full min-h-0'
    : 'w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0';

  // Render guards live after all hooks so hook order stays stable across renders
  // (see react-hooks/rules-of-hooks); these conditions only depend on props/state.
  if (isStaff && !adminScopeCompanyId && !embedded) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a company</h2>
          <p className="text-white/70 mb-6">
            Choose a tenant in the sidebar company scope or from the Companies page to view entity documents for that workspace.
          </p>
          <Button size="lg" onClick={() => navigate('/companies')} className="mx-auto">
            Open Companies
          </Button>
        </GlassCard>
      </div>
    );
  }

  if (!isStaff && !activeProjectId && !embedded) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/70 mb-6">
            Choose an existing project from the sidebar or create a new one to get started.
          </p>
          <Button
            size="lg"
            onClick={() => navigate('/logbook')}
            className="mx-auto"
          >
            Open Logbook
          </Button>
        </GlassCard>
      </div>
    );
  }

  if (isStaff && adminScopeCompanyId && !uploadProjectId && !embedded) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">No project in this company</h2>
          <p className="text-white/70 mb-6">Create a project in the sidebar for this tenant to upload entity documents.</p>
        </GlassCard>
      </div>
    );
  }

  if (embedded && !uploadProjectId) {
    return (
      <div ref={containerRef} className="text-sm text-white/60 py-6">
        Select a project (in this company) to upload entity documents.
      </div>
    );
  }

  return (
    <div ref={containerRef} className={outerClass}>
      {!embedded ? (
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
            Entity Documents
          </h1>
          <p className="text-white/70 text-lg">{scopedCopy}</p>
        </div>
      ) : (
        <p className="text-sm text-white/60 mb-4">{scopedCopy}</p>
      )}

      <GlassCard className="mb-6">
        <h2 className="text-xl font-display font-bold mb-4">Import Entity Documents</h2>
        <p className="text-sm text-white/60 mb-4 max-w-2xl">
          Choose multiple files, or pick an entire folder (nested paths are kept in the document name). Unsupported
          types in a folder are skipped. PDF, Word, plain text, and common images are supported.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={handleImportEntity}
            icon={<FiUpload className="text-xl" />}
            className="w-full sm:w-auto"
            disabled={!uploadProjectId}
          >
            Import Files
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={handleImportEntityFolder}
            icon={<FiFolder className="text-xl" />}
            className="w-full sm:w-auto"
            disabled={!uploadProjectId}
          >
            Import Folder
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="mb-6">
        <h2 className="text-xl font-display font-bold mb-2">FAA SAS DCT XML (company reference library)</h2>
        <p className="text-sm text-white/60 mb-4 max-w-2xl">
          Upload standard DCT <code className="text-sky-300/90">.xml</code> files here. They are stored like other shared references for your company.
          Open <strong className="text-white/80">DCT Compliance</strong> and use <strong className="text-white/80">Sync from library</strong> to copy parsed requirements into each project.
        </p>
        <div className="flex flex-col sm:flex-row flex-wrap gap-2">
          <Button
            variant="secondary"
            size="lg"
            onClick={handleImportDctXml}
            icon={<FiUpload className="text-xl" />}
            className="w-full sm:w-auto"
            disabled={!uploadProjectId || !uploadCompanyId || dctBulkDeleteInProgress}
          >
            Upload DCT XML
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={handleImportDctXmlFolder}
            icon={<FiFolder className="text-xl" />}
            className="w-full sm:w-auto"
            disabled={!uploadProjectId || !uploadCompanyId || dctBulkDeleteInProgress}
          >
            Upload DCT folder
          </Button>
        </div>
        {!uploadCompanyId && uploadProjectId ? (
          <p className="text-xs text-amber-200/80 mt-2">Link this project to a company to enable DCT library uploads.</p>
        ) : null}

        {uploadCompanyId && dctLibraryRefs.length > 0 ? (
          <div className="mt-4 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-white">DCT files in reference library ({dctLibraryRefs.length})</h3>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDeleteAllDcts}
                disabled={dctBulkDeleteInProgress}
                icon={<FiTrash2 />}
                className="text-red-300 hover:text-red-200 border-red-400/30 hover:border-red-400/60"
              >
                {dctBulkDeleteInProgress ? 'Deleting…' : 'Delete all DCTs'}
              </Button>
            </div>
            <ul className="space-y-2 max-h-[280px] overflow-y-auto pr-1 scrollbar-thin">
              {dctLibraryRefs.map((ref: any) => {
                const h = String(ref?.contentHash ?? '').trim();
                const meta = h ? parsedLibraryByHash.get(h) : undefined;
                const displayName = ref?.name ?? ref?.path ?? 'DCT XML';
                const bits = [meta?.standardDctId, meta?.mlfLabel, meta?.peerGroupLabel].filter(Boolean);
                return (
                  <li
                    key={String(ref._id)}
                    className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm"
                  >
                    <div className="font-medium text-white truncate" title={displayName}>
                      {displayName}
                    </div>
                    {bits.length > 0 ? (
                      <div className="text-xs text-white/70 mt-1">{bits.join(' · ')}</div>
                    ) : null}
                    {meta?.purpose ? (
                      <p className="text-[11px] text-white/55 mt-1 line-clamp-2">{purposePreview(meta.purpose, 160)}</p>
                    ) : null}
                    {!meta && h ? (
                      <p className="text-[10px] text-amber-200/80 mt-1">
                        Parse cache not found — re-upload this XML in Library to refresh Standard DCT labels.
                      </p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : uploadCompanyId ? (
          <p className="text-xs text-white/45 mt-4 pt-4 border-t border-white/10">
            No DCT XML files in the company reference library yet. Use Upload DCT XML above.
          </p>
        ) : null}
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <LibraryFolderTree
        folders={(folders ?? []).map((f: any) => ({ _id: String(f._id), name: f.name, parentFolderId: f.parentFolderId ? String(f.parentFolderId) : undefined }))}
        selectedFolderId={selectedFolderId}
        onSelectFolder={setLibraryFolderSelection}
        folderItemCounts={folderItemCounts}
        onCreateFolder={async (name, parentFolderId) => {
          if (!uploadCompanyId) return;
          await createFolder({ companyId: uploadCompanyId as any, parentFolderId: parentFolderId as any, name } as any);
          toast.success('Folder created');
        }}
        onRenameFolder={async (folderId, name) => {
          await renameFolder({ folderId: folderId as any, name } as any);
          toast.success('Folder renamed');
        }}
        onMoveFolder={async (folderId, newParentFolderId) => {
          await moveFolder({ folderId: folderId as any, newParentFolderId: newParentFolderId as any } as any);
          toast.success('Folder moved');
        }}
        onDeleteFolder={async (folderId, mode) => {
          await removeFolder({ folderId: folderId as any, mode } as any);
          if (selectedFolderId === folderId) setLibraryFolderSelection(undefined);
          toast.success('Folder deleted');
        }}
        onDocumentDropped={async (folderId, documentId) => {
          try {
            await moveDocumentToFolder({ documentId: documentId as any, folderId } as any);
            toast.success('Document moved');
          } catch (e: unknown) {
            toast.error(getConvexErrorMessage(e));
          }
        }}
        title="Library folders"
      />
      <GlassCard>
        <p className="text-xs text-white/50 mb-3">{folderPathLabel}</p>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-display font-bold">Entity Documents</h2>
            <Badge>
              {selectedFolderId === undefined
                ? `${entityDocuments.length} items`
                : `${filteredEntityDocuments.length} / ${entityDocuments.length} items`}
            </Badge>
          </div>
        </div>

        {filteredEntityDocuments.length === 0 ? (
          <div className="text-center py-12">
            <FiFile className="text-6xl text-white/20 mx-auto mb-4" />
            {entityDocuments.length === 0 ? (
              <>
                <p className="text-white/60">No entity documents yet</p>
                <p className="text-white/70 text-sm mt-2">
                  Click &quot;Import Files&quot; above to add manuals, procedures, or other organization documents.
                </p>
              </>
            ) : (
              <>
                <p className="text-white/60">Nothing in this folder view</p>
                <p className="text-white/70 text-sm mt-2">
                  Choose &quot;All items&quot; in the folder tree or move documents between folders (drag rows or use Move).
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
            {filteredEntityDocuments.map((file: any) => (
              <div
                key={file._id}
                draggable
                onDragStart={(e) => setLibraryDragData(e, { type: 'document', id: String(file._id) })}
                className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
              >
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-sky to-sky-light">
                    <FiFile className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{file.name}</div>
                    <div className="text-sm text-white/60 flex flex-wrap items-center gap-x-4 gap-y-1">
                      {file.category && <Badge>{file.category}</Badge>}
                      {String((file as any)?.canonicalDocType ?? '').toLowerCase() === 'faa_sas_dct' ||
                      String((file as any)?.documentType ?? '').toLowerCase() === 'faa_sas_dct' ? (
                        <Badge variant="info">FAA SAS DCT</Badge>
                      ) : null}
                      {file.extractedTextStorageId && <Badge variant="info">Full text in storage</Badge>}
                      {file.projectName && (
                        <span className="text-white/50 text-xs">Project: {file.projectName}</span>
                      )}
                      <span>{formatFileSize(file.size)}</span>
                      <span>{new Date(file.extractedAt).toLocaleDateString()}</span>
                    </div>
                    {uploadCompanyId &&
                    (String((file as any)?.canonicalDocType ?? '').toLowerCase() === 'faa_sas_dct' ||
                      String((file as any)?.documentType ?? '').toLowerCase() === 'faa_sas_dct' ||
                      (typeof file.name === 'string' &&
                        file.name.toLowerCase().endsWith('.xml') &&
                        dctLibraryRefs.some(
                          (r: any) =>
                            basenameLower(r?.name) === basenameLower(file.name) ||
                            basenameLower(r?.path) === basenameLower(file.name),
                        ))) ? (
                      (() => {
                        const explicitDct =
                          String((file as any)?.canonicalDocType ?? '').toLowerCase() === 'faa_sas_dct' ||
                          String((file as any)?.documentType ?? '').toLowerCase() === 'faa_sas_dct';
                        const bn = basenameLower(file.name);
                        const ref = dctLibraryRefs.find(
                          (r: any) =>
                            basenameLower(r?.name) === bn || basenameLower(r?.path) === bn,
                        );
                        const h = ref ? String(ref?.contentHash ?? '').trim() : '';
                        const meta = h ? parsedLibraryByHash.get(h) : undefined;
                        if (!meta && !explicitDct) return null;
                        if (!meta) {
                          return (
                            <p className="text-[10px] text-amber-200/80 mt-2">
                              Marked as FAA SAS DCT — parse cache missing; re-upload via FAA SAS DCT XML above to show
                              Standard DCT labels.
                            </p>
                          );
                        }
                        return (
                          <div className="mt-2 pt-2 border-t border-white/10">
                            <p className="text-[10px] uppercase text-white/40 mb-1">
                              {explicitDct ? 'FAA SAS DCT' : 'Matches DCT library file (same filename)'}
                            </p>
                            <DctContextPill doc={meta} />
                            {meta.purpose ? (
                              <p className="text-[11px] text-white/55 mt-1 line-clamp-2">
                                {purposePreview(meta.purpose, 160)}
                              </p>
                            ) : null}
                          </div>
                        );
                      })()
                    ) : null}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setMoveDocumentId(String(file._id))}
                  className="opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  Move
                </Button>
                <button
                  onClick={() => handleDelete(file._id)}
                  className="p-2 text-white/70 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
                >
                  <FiTrash2 className="text-xl" />
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>
      </div>

      <MoveToFolderModal
        open={moveDocumentId != null}
        onClose={() => setMoveDocumentId(null)}
        title="Move document"
        description="Pick a folder, or Library root if it should sit outside folders."
        folders={documentMoveFolderOptions}
        onConfirm={(folderId) => handleConfirmMoveDocument(folderId)}
      />
    </div>
  );
}
