import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { FiBook, FiFolder, FiSearch, FiUpload, FiTrash2, FiFile, FiExternalLink } from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useProjects,
  useProject,
  useUserSettings,
  useIsAerogapEmployee,
  useGenerateUploadUrl,
  useAddDocument,
  useTechnicalPublicationsByCompany,
  useCreateTechnicalPublication,
  useRemoveTechnicalPublication,
  useReplacePublicationSections,
  useDefaultClaudeModel,
  useDocumentChunksSearch,
} from '../hooks/useConvexData';
import { DocumentExtractor } from '../services/documentExtractor';
import { prepareExtractedPayloadForConvex } from '../utils/documentExtractedText';
import { getConvexErrorMessage } from '../utils/convexError';
import { detectPublicationTocFromText } from '../services/manualIngestion';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard, Badge, Input } from './ui';
import { toast } from 'sonner';
import type { PublicationType } from '../types/technicalPublication';
import { getPublicationTypeLabel } from '../types/technicalPublication';
import { fileDisplayPathForUpload, filterCompanyLibraryUploadFiles } from '../utils/fileUploadPaths';

const LibraryManager = lazy(() => import('./LibraryManager'));

type LibraryTab = 'manuals' | 'parts' | 'logbook_scans' | 'entity' | 'search';

const COMPANY_LIBRARY_DROPZONE_ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'text/plain': ['.txt'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/xml': ['.xml'],
  'text/xml': ['.xml'],
  'application/javascript': ['.js'],
  'text/javascript': ['.js'],
};

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

function docCategoryForTab(tab: Exclude<LibraryTab, 'entity' | 'search'>): string {
  if (tab === 'manuals') return 'maintenance_manual';
  if (tab === 'parts') return 'parts_catalog';
  return 'logbook_scan';
}

function publicationTypeForTab(tab: Exclude<LibraryTab, 'entity' | 'search'>): PublicationType {
  if (tab === 'manuals') return 'maintenance_manual';
  if (tab === 'parts') return 'parts_catalog';
  return 'logbook_scan';
}

export default function CompanyLibrary() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const navigate = useNavigate();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const projects = (useProjects() || []) as any[];
  const sidebarSettings = useUserSettings();
  const isStaff = useIsAerogapEmployee();
  const adminScopeCompanyId = sidebarSettings?.activeCompanyId as string | undefined;

  const uploadProjectId = useMemo(() => {
    if (!isStaff || !adminScopeCompanyId) return activeProjectId;
    const inCompany =
      activeProjectId &&
      projects.some(
        (p: any) =>
          String(p._id) === String(activeProjectId) && String(p.companyId) === String(adminScopeCompanyId)
      );
    if (inCompany) return activeProjectId;
    const first = projects.find((p: any) => String(p.companyId) === String(adminScopeCompanyId));
    return first?._id ?? null;
  }, [isStaff, adminScopeCompanyId, activeProjectId, projects]);

  const uploadProject = useProject(uploadProjectId ?? undefined) as { companyId?: string; name?: string } | null | undefined;
  const companyId = (isStaff && adminScopeCompanyId ? adminScopeCompanyId : uploadProject?.companyId) as string | undefined;

  const [tab, setTab] = useState<LibraryTab>('manuals');
  const [makeModel, setMakeModel] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ docName: string; text: string; score: number }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; currentName: string } | null>(null);
  const [tocStatus, setTocStatus] = useState<Array<{ name: string; sections: number }>>([]);

  const publicationType =
    tab === 'manuals' ? 'maintenance_manual' : tab === 'parts' ? 'parts_catalog' : tab === 'logbook_scans' ? 'logbook_scan' : undefined;

  const publications = useTechnicalPublicationsByCompany(
    companyId,
    publicationType as 'maintenance_manual' | 'parts_catalog' | 'logbook_scan' | undefined
  ) as any[] | undefined;

  const addDocument = useAddDocument();
  const createPublication = useCreateTechnicalPublication();
  const removePublication = useRemoveTechnicalPublication();
  const replaceSections = useReplacePublicationSections();
  const generateUploadUrl = useGenerateUploadUrl();
  const defaultModel = useDefaultClaudeModel();
  const chunkSearch = useDocumentChunksSearch();

  if (isStaff && !adminScopeCompanyId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <h2 className="text-xl font-display font-bold mb-2">Select a company</h2>
          <p className="text-white/70 mb-4">Choose a tenant in the sidebar to use the Company Library.</p>
          <Button onClick={() => navigate('/companies')}>Open Companies</Button>
        </GlassCard>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <h2 className="text-xl font-display font-bold mb-2">Company Library</h2>
          <p className="text-white/70 mb-4">
            Your active project must belong to a company. Link the project to an organization in settings, then return here.
          </p>
          <Button onClick={() => navigate('/settings')}>Settings</Button>
        </GlassCard>
      </div>
    );
  }

  const handleUpload = () => {
    if (tab === 'entity' || tab === 'search') return;
    if (!uploadProjectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt,.xml,.js,image/jpeg,image/png';
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      void ingestTechnicalFiles(files);
    };
    input.click();
  };

  const handleUploadFolder = () => {
    if (tab === 'entity' || tab === 'search') return;
    if (!uploadProjectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    pickFolder((files) => void ingestTechnicalFiles(files));
  };

  const ingestTechnicalFiles = async (files: File[]) => {
    if (tab === 'entity' || tab === 'search') return;
    if (!uploadProjectId || !companyId) {
      toast.error('Select a project in this company first.');
      return;
    }
    const { accepted, skipped } = filterCompanyLibraryUploadFiles(files);
    if (!accepted.length) {
      toast.error('No supported files (PDF, Word, TXT, JPG, PNG, XML).');
      return;
    }
    if (skipped > 0) {
      toast.message(`${skipped} file${skipped === 1 ? '' : 's'} skipped (unsupported type).`);
    }
    const cat = docCategoryForTab(tab as Exclude<LibraryTab, 'entity' | 'search'>);
    const pubType = publicationTypeForTab(tab as Exclude<LibraryTab, 'entity' | 'search'>);
    const extractor = new DocumentExtractor();
    const extractionWarnings: string[] = [];
    const saveFailures: Array<{ name: string; reason: string }> = [];
    let successCount = 0;
    setTocStatus([]);

    try {
      for (let i = 0; i < accepted.length; i++) {
        const file = accepted[i]!;
        const displayPath = fileDisplayPathForUpload(file);
        setUploadProgress({ current: i + 1, total: accepted.length, currentName: displayPath });

        let storageId: any;
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
          /* optional */
        }
        let extractedText = '';
        let extractionMeta: { backend: string; confidence?: number; xml?: any } | undefined;
        try {
          const buffer = await file.arrayBuffer();
          const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, defaultModel);
          extractedText = extracted.text;
          extractionMeta = extracted.metadata;
        } catch (err: any) {
          extractionWarnings.push(displayPath);
          console.warn(`Extraction issue: ${displayPath}`, err);
        }
        const xmlIngest = extractionMeta?.xml as
          | {
              metadata?: {
                title?: string;
                revisionNumber?: string;
                revisionDate?: string;
                manufacturer?: string;
                applicableModels?: string[];
                ataNbr?: string;
              };
              sections?: Array<{
                ataChapter: string;
                ataSection?: string;
                title: string;
                startPage: number;
                endPage: number;
                depth: number;
              }>;
              format?: { family?: string; oem?: string };
            }
          | undefined;
        const payload = await prepareExtractedPayloadForConvex(extractedText || '', generateUploadUrl);
        try {
          const documentId = await addDocument({
            projectId: uploadProjectId as any,
            category: cat,
            name: displayPath,
            path: displayPath,
            source: 'local',
            mimeType: file.type || undefined,
            size: file.size,
            storageId,
            extractedText: payload.extractedText,
            extractedTextStorageId: payload.extractedTextStorageId as any,
            extractionMeta,
            extractedAt: new Date().toISOString(),
          } as any);

          const userMakeModel = makeModel.trim() || undefined;
          const userManufacturer = manufacturer.trim() || undefined;
          const xmlTitle = xmlIngest?.metadata?.title?.trim();
          const xmlMakeModel = xmlIngest?.metadata?.applicableModels?.join(', ');
          const titleFromFile = displayPath.replace(/\.[^/.]+$/, '');
          const publicationTitle = xmlIngest?.metadata?.ataNbr && xmlTitle
            ? `${xmlIngest.metadata.ataNbr} ${xmlTitle}`
            : xmlTitle || titleFromFile;

          const publicationId = await createPublication({
            companyId: companyId as any,
            projectId: uploadProjectId as any,
            documentId: documentId as any,
            title: publicationTitle,
            publicationType: pubType,
            makeModel: userMakeModel || xmlMakeModel || undefined,
            manufacturer: userManufacturer || xmlIngest?.metadata?.manufacturer || undefined,
            revisionNumber: xmlIngest?.metadata?.revisionNumber || undefined,
            revisionDate: xmlIngest?.metadata?.revisionDate || undefined,
          } as any);

          successCount += 1;

          try {
            if (xmlIngest?.sections && xmlIngest.sections.length > 0 && publicationId) {
              await replaceSections({
                publicationId: publicationId as any,
                sections: xmlIngest.sections.map((s) => ({
                  ataChapter: s.ataChapter,
                  ataSection: s.ataSection,
                  title: s.title,
                  startPage: s.startPage,
                  endPage: s.endPage,
                  depth: s.depth,
                })),
              });
              setTocStatus((prev) => [...prev, { name: displayPath, sections: xmlIngest.sections!.length }]);
            } else {
              const sections = await detectPublicationTocFromText(extractedText || payload.extractedText || '', defaultModel);
              if (sections.length > 0 && publicationId) {
                await replaceSections({
                  publicationId: publicationId as any,
                  sections: sections.map((s) => ({
                    ataChapter: s.ataChapter,
                    ataSection: s.ataSection,
                    title: s.title,
                    startPage: s.startPage,
                    endPage: s.endPage,
                    depth: s.depth,
                  })),
                });
                setTocStatus((prev) => [...prev, { name: displayPath, sections: sections.length }]);
              }
            }
          } catch {
            /* TOC optional */
          }
        } catch (err: unknown) {
          saveFailures.push({ name: displayPath, reason: getConvexErrorMessage(err) });
        }
      }

      const label = getPublicationTypeLabel(pubType);
      if (successCount > 0) {
        const descParts: string[] = [];
        if (extractionWarnings.length > 0) {
          descParts.push(`${extractionWarnings.length} extraction warning${extractionWarnings.length === 1 ? '' : 's'}`);
        }
        if (saveFailures.length > 0) {
          descParts.push(`${saveFailures.length} failed`);
        }
        toast.success(
          `Added ${successCount} ${label}${successCount === 1 ? '' : 's'}`,
          descParts.length > 0 ? { description: descParts.join(' · ') } : undefined
        );
      }
      if (saveFailures.length > 0 && successCount === 0) {
        toast.error(`Could not save any files`, { description: saveFailures[0]!.reason });
      } else if (saveFailures.length > 0) {
        toast.error(`Could not save ${saveFailures.length} file${saveFailures.length === 1 ? '' : 's'}`, {
          description: saveFailures.map((f) => f.name).join(', ').slice(0, 200),
        });
      }
    } finally {
      setUploadProgress(null);
    }
  };

  const handleLibrarySearch = async () => {
    if (!uploadProjectId || !searchQuery.trim()) {
      toast.error('Select a project and enter a search query.');
      return;
    }
    setIsSearching(true);
    setSearchResults([]);
    try {
      const cats =
        tab === 'search'
          ? ['maintenance_manual', 'parts_catalog', 'logbook_scan', 'entity', 'uploaded', 'regulatory']
          : [docCategoryForTab(tab as any)].filter(Boolean);
      const res = await chunkSearch({
        projectId: uploadProjectId as any,
        query: searchQuery.trim(),
        categories: cats,
        topK: 16,
      });
      setSearchResults((res as any).chunks || []);
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    } finally {
      setIsSearching(false);
    }
  };

  const handleDeletePub = async (id: string) => {
    if (!confirm('Delete this publication and its stored file?')) return;
    try {
      await removePublication({ publicationId: id as any });
      toast.success('Publication removed');
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const tabs: { id: LibraryTab; label: string; icon: ReactNode }[] = [
    { id: 'manuals', label: 'Maintenance manuals', icon: <FiBook /> },
    { id: 'parts', label: 'Parts catalogs', icon: <FiFile /> },
    { id: 'logbook_scans', label: 'Logbook scans', icon: <FiFolder /> },
    { id: 'entity', label: 'Entity documents', icon: <FiFolder /> },
    { id: 'search', label: 'Library search', icon: <FiSearch /> },
  ];

  const dropzoneActive = tab !== 'entity' && tab !== 'search' && !!uploadProjectId && !uploadProgress;
  const onDropFiles = (acceptedFiles: File[]) => {
    if (!dropzoneActive) return;
    if (acceptedFiles.length === 0) return;
    void ingestTechnicalFiles(acceptedFiles);
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: COMPANY_LIBRARY_DROPZONE_ACCEPT,
    noClick: true,
    noKeyboard: true,
    disabled: !dropzoneActive,
    onDrop: onDropFiles,
  });

  const uploadLabel = tab === 'manuals' ? 'manuals' : tab === 'parts' ? 'parts manuals' : 'logbook scans';

  return (
    <div {...getRootProps()} className="w-full min-w-0 h-full min-h-0 overflow-auto relative">
      <input {...getInputProps()} />

      {isDragActive && dropzoneActive && (
        <div className="fixed inset-0 z-30 bg-sky/10 border-2 border-dashed border-sky-light/50 flex items-center justify-center backdrop-blur-sm pointer-events-none">
          <div className="text-center">
            <FiUpload className="text-5xl text-sky-light mx-auto mb-2" />
            <p className="text-sky-lighter font-medium text-lg">Drop files to upload to {uploadLabel}</p>
            <p className="text-white/70 text-sm mt-1">PDF, Word, TXT, JPG, PNG, XML · multi-file and folder drops supported</p>
          </div>
        </div>
      )}

      <div ref={containerRef} className="p-3 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Company Library
        </h1>
        <p className="text-white/70 text-lg max-w-3xl">
          Maintenance manuals, IPCs, and logbook scans are shared at the company level (tagged by make/model). Files upload
          into the active sidebar project and are linked for search and schedule tools.
        </p>
        {uploadProject?.name ? (
          <p className="text-xs text-white/50 mt-2">Upload target project: {uploadProject.name}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              tab === t.id
                ? 'border-sky-light/50 bg-sky/20 text-white'
                : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <Button variant="secondary" size="sm" className="ml-auto" onClick={() => navigate('/compliance-report')}>
          Compliance report
        </Button>
      </div>

      {tab !== 'entity' && tab !== 'search' ? (
        <GlassCard className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Make / model tags (optional)</h2>
          <div className="flex flex-col sm:flex-row gap-3 max-w-2xl">
            <Input placeholder="Manufacturer (e.g. Cessna)" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
            <Input placeholder="Make & model (e.g. 208B)" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={<FiUpload />} onClick={handleUpload} disabled={!uploadProjectId || !!uploadProgress}>
              Upload {uploadLabel}
            </Button>
            <Button variant="secondary" icon={<FiFolder />} onClick={handleUploadFolder} disabled={!uploadProjectId || !!uploadProgress}>
              Upload folder
            </Button>
            <p className="text-xs text-white/50">
              Or drag and drop files anywhere on this page. Multi-file selection supported (e.g. 20+ chapter PDFs).
              OEM XML manuals (S1000D, ATA iSpec, Gulfstream <code className="text-white/70">.js</code> shells) auto-fill title, ATA chapter, revision, and applicable models.
            </p>
          </div>
          {uploadProgress ? (
            <div className="mt-4 rounded-lg border border-sky-light/30 bg-sky/10 p-3">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="text-sky-lighter font-medium">
                  Uploading {uploadProgress.current} of {uploadProgress.total}
                </span>
                <span className="text-white/60 truncate max-w-[60%]" title={uploadProgress.currentName}>
                  {uploadProgress.currentName}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-light transition-all"
                  style={{ width: `${Math.round((uploadProgress.current / Math.max(uploadProgress.total, 1)) * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] text-white/50">
                Text extraction and TOC detection run per file. Large scanned PDFs may take a minute each.
              </p>
            </div>
          ) : null}
          {!uploadProgress && tocStatus.length > 0 ? (
            <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3 max-h-32 overflow-y-auto">
              <div className="text-xs font-medium text-white/70 mb-1">Tables of contents detected</div>
              <ul className="text-xs text-white/60 space-y-0.5">
                {tocStatus.map((t, i) => (
                  <li key={i} className="truncate" title={`${t.name} — ${t.sections} ATA sections`}>
                    {t.name} — {t.sections} ATA section{t.sections === 1 ? '' : 's'}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </GlassCard>
      ) : null}

      {tab === 'search' ? (
        <GlassCard className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Semantic search (manuals & catalogs)</h2>
          <div className="flex flex-col sm:flex-row gap-2 max-w-3xl">
            <Input
              className="flex-1"
              placeholder='e.g. "Chapter 5 inspection intervals" or "100 hour inspection"'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <Button variant="primary" onClick={() => void handleLibrarySearch()} disabled={isSearching || !uploadProjectId}>
              {isSearching ? 'Searching…' : 'Search'}
            </Button>
          </div>
          <p className="text-xs text-white/50 mt-2">
            Uses embeddings on technical library documents in the active project. For logbook tail-specific questions, use
            Logbook → Search.
          </p>
          {searchResults.length > 0 ? (
            <ul className="mt-4 space-y-3 max-h-[480px] overflow-y-auto">
              {searchResults.map((r, i) => (
                <li key={i} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="font-medium text-sky-200">{r.docName}</div>
                  <div className="text-white/60 text-xs mb-1">Score: {r.score?.toFixed?.(3) ?? r.score}</div>
                  <div className="text-white/80 whitespace-pre-wrap line-clamp-6">{r.text}</div>
                </li>
              ))}
            </ul>
          ) : null}
        </GlassCard>
      ) : null}

      {tab !== 'entity' && tab !== 'search' ? (
        <GlassCard>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold">{getPublicationTypeLabel(publicationType!)}</h2>
            <Badge>{publications?.length ?? 0} items</Badge>
          </div>
          {!publications?.length ? (
            <p className="text-white/60 py-8 text-center">No publications yet. Upload a PDF or Word manual above.</p>
          ) : (
            <ul className="space-y-2">
              {publications.map((p: any) => (
                <li
                  key={p._id}
                  className="flex items-center justify-between gap-3 p-4 rounded-xl bg-white/5 border border-white/10"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.title}</div>
                    <div className="text-xs text-white/50 flex flex-wrap gap-2">
                      {p.makeModel && <span>Model: {p.makeModel}</span>}
                      {p.manufacturer && <span>Mfr: {p.manufacturer}</span>}
                      {p.revisionNumber && <span>Rev: {p.revisionNumber}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<FiExternalLink />}
                      onClick={() => navigate(`/library/publication/${p._id}`)}
                    >
                      Open
                    </Button>
                    <button
                      type="button"
                      className="p-2 text-white/60 hover:text-red-400"
                      aria-label="Delete"
                      onClick={() => void handleDeletePub(p._id)}
                    >
                      <FiTrash2 />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </GlassCard>
      ) : null}

      {tab === 'entity' ? (
        <Suspense
          fallback={
            <div className="text-white/60 text-sm py-8 text-center">Loading entity library…</div>
          }
        >
          <LibraryManager embedded />
        </Suspense>
      ) : null}
      </div>
    </div>
  );
}
