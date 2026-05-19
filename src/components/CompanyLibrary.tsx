import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
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

const LibraryManager = lazy(() => import('./LibraryManager'));

type LibraryTab = 'manuals' | 'parts' | 'logbook_scans' | 'entity' | 'search';

function isAcceptedTechFile(file: File): boolean {
  const n = file.name.toLowerCase();
  if (n.endsWith('.pdf') || n.endsWith('.doc') || n.endsWith('.docx') || n.endsWith('.txt')) return true;
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return true;
  return false;
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
          <p className="text-white/70 mb-4">Choose a tenant in the sidebar to use the company library.</p>
          <Button onClick={() => navigate('/companies')}>Open Companies</Button>
        </GlassCard>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <h2 className="text-xl font-display font-bold mb-2">Company library</h2>
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
    input.accept = '.pdf,.doc,.docx,.txt,image/jpeg,image/png';
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      void ingestTechnicalFiles(files);
    };
    input.click();
  };

  const ingestTechnicalFiles = async (files: File[]) => {
    if (!uploadProjectId || !companyId) return;
    const accepted = files.filter(isAcceptedTechFile);
    if (!accepted.length) {
      toast.error('No supported files (PDF, Word, TXT, images).');
      return;
    }
    const cat = docCategoryForTab(tab as Exclude<LibraryTab, 'entity' | 'search'>);
    const pubType = publicationTypeForTab(tab as Exclude<LibraryTab, 'entity' | 'search'>);
    const extractor = new DocumentExtractor();

    for (const file of accepted) {
      const displayPath = file.name;
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
      let extractionMeta: { backend: string; confidence?: number } | undefined;
      try {
        const buffer = await file.arrayBuffer();
        const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, defaultModel);
        extractedText = extracted.text;
        extractionMeta = extracted.metadata;
      } catch (err: any) {
        toast.warning(`Extraction issue: ${displayPath}`, { description: err?.message });
      }
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

        const publicationId = await createPublication({
          companyId: companyId as any,
          projectId: uploadProjectId as any,
          documentId: documentId as any,
          title: displayPath.replace(/\.[^/.]+$/, ''),
          publicationType: pubType,
          makeModel: makeModel.trim() || undefined,
          manufacturer: manufacturer.trim() || undefined,
        });

        toast.success(`Added ${getPublicationTypeLabel(pubType)}: ${displayPath}`);

        try {
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
            toast.message('Table of contents detected', { description: `${sections.length} ATA sections indexed.` });
          }
        } catch {
          /* TOC optional */
        }
      } catch (err: unknown) {
        toast.error(`Could not save ${displayPath}`, { description: getConvexErrorMessage(err) });
      }
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

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Company library
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
          <div className="mt-4">
            <Button variant="primary" icon={<FiUpload />} onClick={handleUpload} disabled={!uploadProjectId}>
              Upload {tab === 'manuals' ? 'manuals' : tab === 'parts' ? 'parts manuals' : 'logbook scans'}
            </Button>
          </div>
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
  );
}
