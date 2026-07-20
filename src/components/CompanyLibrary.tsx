import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useConvex } from 'convex/react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../convex/_generated/api';
import { useDropzone } from 'react-dropzone';
import {
  FiBook,
  FiFolder,
  FiSearch,
  FiUpload,
  FiTrash2,
  FiFile,
  FiExternalLink,
  FiPlus,
  FiEdit2,
  FiChevronDown,
  FiChevronRight,
  FiLayers,
  FiX,
  FiCloud,
  FiInfo,
} from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import {
  useProjects,
  useProject,
  useUserSettings,
  useIsAerogapEmployee,
  useIsAdmin,
  useCompanyFeaturePolicy,
  useSetManufacturerDocStorage,
  useGenerateUploadUrl,
  useDeleteStorage,
  useAddDocument,
  useTechnicalPublicationsByCompany,
  usePublicationsPaginatedByCompany,
  useCreateTechnicalPublication,
  useMovePublicationToFolder,
  useRemoveTechnicalPublication,
  useReplacePublicationSections,
  useDefaultClaudeModel,
  useDocumentChunksSearch,
  useReindexOneDocument,
  useManualGroupsByCompanyWithCounts,
  useCreateManualGroup,
  useUpdateManualGroup,
  useRemoveManualGroup,
  useAssignPublicationsToManualGroup,
  useLibraryFolders,
  useCreateLibraryFolder,
  useRenameLibraryFolder,
  useMoveLibraryFolder,
  useRemoveLibraryFolder,
  useAircraftTypes,
  useAircraftAssetsForLibrary,
  useIsFeatureEnabled,
  type LibraryAircraftScope,
} from '../hooks/useConvexData';
import { FEATURE_KEYS } from '../config/featureKeys';
import AskPanel from './ask/AskPanel';
import { DocumentExtractor, resolvePeekKind, type PeekKind } from '../services/documentExtractor';
import { parallelMap } from '../services/dctIngestChunks';
import { prepareExtractedPayloadForConvex } from '../utils/documentExtractedText';
import { isLocalReferenceCategory } from '../constants/localReference';
import { LIBRARY_SEARCH_TOP_K } from '../constants/search';
import { highlightSearchTerms, matchTypeLabel, formatSearchScore } from '../utils/searchHighlight';
import type { SearchChunk } from '../services/driveSearchService';
import { inferPublicationTypeFromPath, type SortablePublicationType } from '../services/documentTypeResolver';
import { classifyByName, classifyByContent, needsContentPeek } from '../services/driveFileClassifier';
import { DriveImportReviewModal, type DriveReviewItem } from './DriveImportReviewModal';
import {
  isLocalFileAccessSupported,
  pickAndEnumerateManualsDirectory,
  type LocalDirectoryEntry,
} from '../services/localFileAccess';
import { fetchFileFromServer, type DocumentServerConfig } from '../services/httpServerSource';
import { ManualsServerModal } from './ManualsServerModal';
import RefreshSearchIndexButton from './RefreshSearchIndexButton';
import SearchCoveragePanel from './SearchCoveragePanel';
import type { BuildIndexResult } from '../services/driveSearchIntegration';
import { getSharedDriveService } from '../services/googleDrive';
import type { GoogleDriveFile } from '../types/googleDrive';
import StandardsLibrary from './StandardsLibrary';
import {
  deleteOrphanStorage,
  sha256Hex,
  uploadFileToConvexStorage,
} from '../utils/uploadFile';
import { resolveGoogleConfig } from '../utils/googleConfig';
import type { Id } from '../../convex/_generated/dataModel';
import { getConvexErrorMessage } from '../utils/convexError';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard, Badge, Input, GlassModal } from './ui';
import { toast } from 'sonner';
import type { PublicationType } from '../types/technicalPublication';
import { getPublicationTypeLabel } from '../types/technicalPublication';
import { fileDisplayPathForUpload, filterCompanyLibraryUploadFiles } from '../utils/fileUploadPaths';
import { useIndexSummary } from '../hooks/useIndexSummary';
import { useAutoBackfillOnMount } from '../hooks/useAutoBackfillOnMount';
import { useIndexingProgress } from '../hooks/useIndexingProgress';
import LibraryFolderTree, { setLibraryDragData } from './library/LibraryFolderTree';
import AircraftScopeTree from './library/AircraftScopeTree';
import LibraryTabs from './library/LibraryTabs';
import LibraryEmptyState from './library/LibraryEmptyState';
import MoveToFolderModal, { flattenFoldersForPicker } from './library/MoveToFolderModal';
import { AircraftTypesPanelModal } from './aircraft/AircraftTypesPanel';
import type { AircraftType } from '../types/aircraftType';
import type { AircraftAsset } from '../types/aircraftAsset';

const LibraryManager = lazy(() => import('./LibraryManager'));

type LibraryTab = 'manuals' | 'parts' | 'logbook_scans' | 'entity' | 'standards' | 'search';

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

/** Concurrent Drive downloads during the pre-filing content-peek pass. */
const DRIVE_PEEK_CONCURRENCY = 6;
/** Text-like peeks (TXT/CSV/XML) only need the head of the file — ranged download size. */
const DRIVE_PEEK_TEXT_RANGE_BYTES = 256 * 1024;
/** PDF/DOCX peeks need the whole file; skip files bigger than this. */
const DRIVE_PEEK_MAX_FILE_BYTES = 15 * 1024 * 1024;
/** Total bytes the peek pass may download per batch — bounds worst-case sort time on huge folders. */
const DRIVE_PEEK_TOTAL_BYTE_BUDGET = 512 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  xml: 'application/xml',
  js: 'application/javascript',
};

/** Best-effort MIME from a filename, for files fetched from a customer server (no Content-Type kept). */
function guessMimeFromPath(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
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

/** Normalized form used for dedupe — lowercase, single-spaced, trimmed. */
function normalizePublicationTitle(s: string | undefined | null): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function docCategoryForTab(tab: Exclude<LibraryTab, 'entity' | 'standards' | 'search'>): string {
  if (tab === 'manuals') return 'maintenance_manual';
  if (tab === 'parts') return 'parts_catalog';
  return 'logbook_scan';
}

function publicationTypeForTab(tab: Exclude<LibraryTab, 'entity' | 'standards' | 'search'>): SortablePublicationType {
  if (tab === 'manuals') return 'maintenance_manual';
  if (tab === 'parts') return 'parts_catalog';
  return 'logbook_scan';
}

function parseLibraryAircraftScope(encoded: string | undefined): LibraryAircraftScope {
  if (!encoded || encoded === '__FLEET__') return { kind: 'fleet' };
  if (encoded.startsWith('type:')) return { kind: 'type', aircraftTypeId: encoded.slice(5) };
  if (encoded.startsWith('tail:')) return { kind: 'tail', aircraftId: encoded.slice(5) };
  return { kind: 'fleet' };
}

export default function CompanyLibrary() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const navigate = useNavigate();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const companyLibraryFolderByCompanyId = useAppStore((s) => s.companyLibraryFolderByCompanyId);
  const setCompanyLibraryFolderSelection = useAppStore((s) => s.setCompanyLibraryFolderSelection);
  const companyLibraryAircraftScopeByCompanyId = useAppStore((s) => s.companyLibraryAircraftScopeByCompanyId);
  const setCompanyLibraryAircraftScope = useAppStore((s) => s.setCompanyLibraryAircraftScope);
  const projects = (useProjects() || []) as any[];
  const sidebarSettings = useUserSettings();
  const isStaff = useIsAerogapEmployee();
  const isAdmin = useIsAdmin();
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
  const isAskCitationsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ASK_CITATIONS);
  const isAskRecordToolsEnabled = useIsFeatureEnabled(FEATURE_KEYS.ASK_RECORD_TOOLS);
  const [showAskPanel, setShowAskPanel] = useState(false);
  const [showLibraryInfo, setShowLibraryInfo] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showIndexDetails, setShowIndexDetails] = useState(false);

  // Per-company AeroGap-admin escape hatch: when on, manufacturer docs store full copies
  // (classic upload) instead of the no-copy default. Read here, enforced server-side too.
  const companyFeaturePolicy = useCompanyFeaturePolicy(companyId) as
    | { allowManufacturerDocStorage?: boolean }
    | null
    | undefined;
  const companyStorageEnabled = companyFeaturePolicy?.allowManufacturerDocStorage === true;
  const setManufacturerDocStorage = useSetManufacturerDocStorage();

  const [tab, setTab] = useState<LibraryTab>('manuals');
  const [makeModel, setMakeModel] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchChunk[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; currentName: string } | null>(null);
  const [tocStatus, setTocStatus] = useState<Array<{ name: string; sections: number }>>([]);
  const [selectedPubIds, setSelectedPubIds] = useState<Set<string>>(new Set());
  const [deleteProgress, setDeleteProgress] = useState<{ current: number; total: number } | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined);
  const [preserveUploadFolders, setPreserveUploadFolders] = useState(true);
  // Drive import classification review: items awaiting user confirmation, plus the
  // Drive id/size maps for the pending batch (keyed by relativePath).
  const [driveReview, setDriveReview] = useState<{
    items: DriveReviewItem[];
    driveIdByPath: Record<string, string>;
    driveSizeByPath: Record<string, number>;
  } | null>(null);
  const [driveReviewBusy, setDriveReviewBusy] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [movePublicationId, setMovePublicationId] = useState<string | null>(null);
  const [showTypesPanel, setShowTypesPanel] = useState(false);
  const [searchIndexReport, setSearchIndexReport] = useState<BuildIndexResult | null>(null);

  const libraryAircraftScope = useMemo(
    () =>
      companyId
        ? parseLibraryAircraftScope(companyLibraryAircraftScopeByCompanyId[String(companyId)])
        : ({ kind: 'fleet' } as LibraryAircraftScope),
    [companyId, companyLibraryAircraftScopeByCompanyId],
  );

  const aircraftTypes = (useAircraftTypes(uploadProjectId ?? undefined) ?? []) as AircraftType[];
  const libraryAircraft = (useAircraftAssetsForLibrary(uploadProjectId ?? undefined) ?? []) as AircraftAsset[];

  const publicationType =
    tab === 'manuals' ? 'maintenance_manual' : tab === 'parts' ? 'parts_catalog' : tab === 'logbook_scans' ? 'logbook_scan' : undefined;

  // Aircraft-scope (tail/type) browsing can't be served from an index range, so it keeps the
  // collect path — but it's naturally bounded once a specific tail/type is chosen. The common
  // unscoped/fleet browse is cursor-paginated so a 10k-publication company reads one page at a
  // time. Exactly one of the two hooks is active (the other is skipped with companyId=undefined).
  const scopeActive = libraryAircraftScope.kind === 'tail' || libraryAircraftScope.kind === 'type';
  const pubPage = usePublicationsPaginatedByCompany(
    scopeActive ? undefined : companyId,
    publicationType as 'maintenance_manual' | 'parts_catalog' | 'logbook_scan' | undefined,
    selectedFolderId,
  );
  const scopedPublications = useTechnicalPublicationsByCompany(
    scopeActive ? companyId : undefined,
    publicationType as 'maintenance_manual' | 'parts_catalog' | 'logbook_scan' | undefined,
    selectedFolderId,
    scopeActive ? libraryAircraftScope : undefined,
    uploadProjectId ?? undefined,
  ) as any[] | undefined;
  const publications = (scopeActive ? scopedPublications : pubPage.results) as any[] | undefined;
  const pubsLoadingFirst = scopeActive ? scopedPublications === undefined : pubPage.status === 'LoadingFirstPage';
  const pubsCanLoadMore = !scopeActive && pubPage.status === 'CanLoadMore';
  const pubsLoadingMore = !scopeActive && pubPage.status === 'LoadingMore';
  const folders = useLibraryFolders(companyId) as any[] | undefined;

  const manualGroups = useManualGroupsByCompanyWithCounts(
    companyId,
    publicationType as 'maintenance_manual' | 'parts_catalog' | 'logbook_scan' | undefined,
  ) as Array<{
    _id: string;
    name: string;
    publicationType?: PublicationType;
    manufacturer?: string;
    makeModel?: string;
    revisionNumber?: string;
    notes?: string;
    publicationCount: number;
  }> | undefined;

  const addDocument = useAddDocument();
  const createPublication = useCreateTechnicalPublication();
  const movePublicationToFolder = useMovePublicationToFolder();
  const removePublication = useRemoveTechnicalPublication();
  const replaceSections = useReplacePublicationSections();
  const createManualGroup = useCreateManualGroup();
  const updateManualGroup = useUpdateManualGroup();
  const removeManualGroup = useRemoveManualGroup();
  const assignPublicationsToGroup = useAssignPublicationsToManualGroup();

  // Group view state
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [assignTargetOpen, setAssignTargetOpen] = useState(false);
  const [groupForm, setGroupForm] = useState<{
    name: string;
    manufacturer: string;
    makeModel: string;
    revisionNumber: string;
    notes: string;
  }>({ name: '', manufacturer: '', makeModel: '', revisionNumber: '', notes: '' });
  const convex = useConvex();
  const generateUploadUrl = useGenerateUploadUrl();
  const deleteStorage = useDeleteStorage();
  const defaultModel = useDefaultClaudeModel();
  const chunkSearch = useDocumentChunksSearch();
  const reindexOne = useReindexOneDocument();
  const [reindexingDocIds, setReindexingDocIds] = useState<Set<string>>(new Set());
  const createFolder = useCreateLibraryFolder();
  const renameFolder = useRenameLibraryFolder();
  const moveFolder = useMoveLibraryFolder();
  const removeFolder = useRemoveLibraryFolder();
  // Per-folder item counts are intentionally not computed: deriving them requires reading
  // every publication of the type on each load (Convex has no cheap count), which would
  // defeat the pagination bandwidth savings. The folder tree omits counts when undefined.
  const folderItemCounts = undefined;

  useEffect(() => {
    if (!companyId) return;
    const encoded = companyLibraryFolderByCompanyId[String(companyId)] ?? '__ALL__';
    if (encoded === '__ALL__') setSelectedFolderId(undefined);
    else if (encoded === '__ROOT__') setSelectedFolderId(null);
    else setSelectedFolderId(encoded);
  }, [companyId, companyLibraryFolderByCompanyId]);

  const setLibraryFolderSelection = useCallback(
    (folderId: string | null | undefined) => {
      setSelectedFolderId(folderId);
      if (companyId) setCompanyLibraryFolderSelection(String(companyId), folderId);
    },
    [companyId, setCompanyLibraryFolderSelection],
  );

  const folderPathLabel = useMemo(() => {
    if (selectedFolderId === undefined) return 'Showing: all folders · uploads go to selected folder unless you use Preserve structure';
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

  const publicationMoveFolderOptions = useMemo(
    () => flattenFoldersForPicker((folders ?? []).map((f: any) => ({ _id: String(f._id), name: f.name, parentFolderId: f.parentFolderId }))),
    [folders],
  );

  const { summary: indexSummary, refetch: refetchIndexSummary, isLoading: indexSummaryLoading } =
    useIndexSummary(companyId ? { companyId: companyId as Id<'companies'> } : { projectId: null });
  // Shared indexing-progress machinery — same hook used by Splash and Admin
  // Library so per-document reindex from this page surfaces the same live
  // progress UI (polling + auto-clear + completion toast). We only need the
  // `start` function here because the per-row `Indexing…` badge is driven
  // directly by `indexSummary.perDoc[].state`, which the hook keeps fresh
  // via its polling effect.
  const { start: startCompanyIndexingProgress } =
    useIndexingProgress(indexSummary, refetchIndexSummary);
  const indexSummaryByDocId = useMemo(() => {
    const map = new Map<string, NonNullable<typeof indexSummary>['perDoc'][number]>();
    for (const d of indexSummary?.perDoc ?? []) {
      map.set(String(d.documentId), d);
    }
    return map;
  }, [indexSummary]);
  const handleReindexPubDoc = async (docId: string) => {
    setReindexingDocIds((prev) => {
      const next = new Set(prev);
      next.add(String(docId));
      return next;
    });
    try {
      await reindexOne({ documentId: docId as any });
      toast.success('Reindex queued — refreshing status…');
      // Kick off the shared progress polling so this row's "Indexing…" badge
      // becomes "Indexed" automatically — same flow as Admin Library and the
      // Splash auto-backfill.
      startCompanyIndexingProgress(1);
      await refetchIndexSummary();
    } catch (error) {
      toast.error(getConvexErrorMessage(error) || 'Could not reindex document.');
    } finally {
      setReindexingDocIds((prev) => {
        const next = new Set(prev);
        next.delete(String(docId));
        return next;
      });
    }
  };
  useAutoBackfillOnMount(
    companyId
      ? { companyId: companyId as Id<'companies'> }
      : uploadProjectId
        ? { projectId: uploadProjectId as Id<'projects'> }
        : null,
    indexSummary,
    refetchIndexSummary,
  );

  // Manuals & parts catalogs are sensitive (manufacturer copyrighted) categories.
  const tabIsLocalRef =
    tab !== 'entity' && tab !== 'search' && tab !== 'standards' && isLocalReferenceCategory(docCategoryForTab(tab));
  // Reference mode = sensitive category AND this company hasn't enabled classic copy storage.
  // In reference mode we link a customer source and never store a copy; otherwise we upload
  // and store copies like a normal tab (the AeroGap-admin escape hatch is on for this company).
  const referenceMode = tabIsLocalRef && !companyStorageEnabled;

  const filesToEntries = (files: File[]): LocalDirectoryEntry[] =>
    files.map((file) => ({ file, relativePath: fileDisplayPathForUpload(file) }));

  /**
   * Link the customer's manuals folder (File System Access) and register every file
   * as a reference (metadata only). The persisted handle lets the resolver re-read
   * files on demand without ever storing a copy.
   */
  const handleToggleCompanyStorage = async () => {
    if (!companyId) {
      toast.error('Select a company first.');
      return;
    }
    const next = !companyStorageEnabled;
    try {
      await setManufacturerDocStorage({ companyId, enabled: next });
      toast.success(
        next
          ? 'Classic store-a-copy upload enabled for this company.'
          : 'Classic upload disabled — manufacturer material is referenced, not stored.',
      );
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const handleLinkManualsFolder = async () => {
    if (!uploadProjectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    if (!isLocalFileAccessSupported()) {
      toast.error('Linking a manuals folder requires Chrome or Edge.');
      return;
    }
    try {
      const { entries } = await pickAndEnumerateManualsDirectory();
      if (!entries.length) {
        toast.message('No files found in that folder.');
        return;
      }
      await ingestTechnicalFilesAutoSorted(entries);
    } catch (err: unknown) {
      // AbortError = user dismissed the picker; stay quiet.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(getConvexErrorMessage(err));
    }
  };

  /**
   * Register manuals hosted on a customer HTTP server (metadata only). Each path is
   * fetched once now — transiently — to verify access and fingerprint the file; the
   * bytes are discarded. The resolver re-fetches on demand at analysis/view time.
   */
  const handleRegisterServerManuals = async (config: DocumentServerConfig, paths: string[]) => {
    const entries: LocalDirectoryEntry[] = [];
    const failed: string[] = [];
    for (const p of paths) {
      try {
        const buffer = await fetchFileFromServer(config, p);
        const filename = p.split('/').filter(Boolean).pop() || p;
        const file = new File([buffer], filename, { type: guessMimeFromPath(filename) });
        entries.push({ file, relativePath: p });
      } catch {
        failed.push(p);
      }
    }
    if (failed.length > 0) {
      toast.error(`Could not read ${failed.length} file${failed.length === 1 ? '' : 's'} from the server`, {
        description: failed.slice(0, 5).join(', ').slice(0, 200),
      });
    }
    if (entries.length > 0) {
      await ingestTechnicalFilesAutoSorted(entries, { source: 'http-server', documentSourceId: config.id });
    }
  };

  /**
   * Link a Google Drive folder of manufacturer manuals (metadata only). The Picker
   * grants this app drive.file access to the chosen folder; we recurse it and register
   * each file by Drive file ID — WITHOUT downloading bytes, so linking a large folder is
   * a single listing pass, not one download per file. The resolver fetches by file ID on
   * demand (token refresh handled in the shared service); dedupe keys on the file ID.
   * Sub-folder paths are preserved so "Preserve folder structure" mirrors the Drive tree.
   */
  const handleLinkDriveManuals = async () => {
    if (!uploadProjectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    const { clientId, apiKey } = resolveGoogleConfig(sidebarSettings);
    if (!clientId || !apiKey) {
      toast.error('Connect Google Drive in Settings first.');
      return;
    }
    try {
      const service = getSharedDriveService({ clientId, apiKey });
      await service.signIn();
      const folders = await service.pickFolders();
      if (!folders.length) return;

      // Enumerate each picked folder. When more than one is chosen, prefix every
      // relative path with that folder's name so files from different folders stay
      // distinct (and "Preserve folder structure" mirrors each tree under its root).
      const multiple = folders.length > 1;
      const toastId = toast.loading(
        multiple ? `Scanning ${folders.length} Drive folders…` : 'Scanning Drive folder…',
      );
      const driveEntries: Array<{ file: GoogleDriveFile; relativePath: string }> = [];
      for (const folder of folders) {
        const folderEntries = await service.enumerateFolder(folder.id);
        for (const entry of folderEntries) {
          driveEntries.push(
            multiple
              ? { file: entry.file, relativePath: `${folder.name}/${entry.relativePath}` }
              : entry,
          );
        }
      }
      if (!driveEntries.length) {
        toast.message(multiple ? 'No files found in those folders.' : 'No files found in that folder.', {
          id: toastId,
        });
        return;
      }
      toast.dismiss(toastId);

      // Classify each file before filing. Filename first (instant); for files the name
      // can't resolve, peek the bytes (transient read-and-discard, no OCR) so we never
      // persist copyrighted manuals just to sort them. Then open the review screen.
      const fallbackType: SortablePublicationType =
        tab === 'parts' ? 'parts_catalog' : tab === 'logbook_scans' ? 'logbook_scan' : 'maintenance_manual';
      const extractor = new DocumentExtractor();
      const driveIdByPath: Record<string, string> = {};
      const driveSizeByPath: Record<string, number> = {};

      // Stage A — filename classification for every file.
      const sorted = driveEntries.map(({ file: meta, relativePath }) => {
        driveIdByPath[relativePath] = meta.id;
        driveSizeByPath[relativePath] = meta.sizeBytes;
        return {
          meta,
          relativePath,
          mimeType: meta.mimeType || guessMimeFromPath(meta.name),
          classification: classifyByName(relativePath, fallbackType),
        };
      });

      // Stage B — content peek, only where the name gave no signal AND the type is one
      // the peek parser can read. Text-like files fetch just the head via a ranged
      // download; PDF/DOCX parsers need complete bytes, so those are gated by a per-file
      // size cap plus a total download budget (smallest files first) to bound worst-case
      // time on huge folders. Files that miss the cut stay low-confidence for review.
      const candidates = sorted
        .map((item) => ({
          item,
          kind: needsContentPeek(item.classification)
            ? resolvePeekKind(item.meta.name, item.mimeType)
            : null,
        }))
        .filter((c): c is { item: (typeof sorted)[number]; kind: PeekKind } => c.kind !== null);
      const selected: typeof candidates = [];
      let budget = DRIVE_PEEK_TOTAL_BYTE_BUDGET;
      const bySizeAsc = [...candidates].sort((a, b) => a.item.meta.sizeBytes - b.item.meta.sizeBytes);
      for (const c of bySizeAsc) {
        const size = c.item.meta.sizeBytes;
        if (c.kind !== 'text' && (size <= 0 || size > DRIVE_PEEK_MAX_FILE_BYTES)) continue;
        const cost = c.kind === 'text' ? Math.min(size || DRIVE_PEEK_TEXT_RANGE_BYTES, DRIVE_PEEK_TEXT_RANGE_BYTES) : size;
        if (cost > budget) continue;
        budget -= cost;
        selected.push(c);
      }
      const selectedSet = new Set(selected);
      for (const c of candidates) {
        if (!selectedSet.has(c)) {
          c.item.classification = {
            ...c.item.classification,
            reason: 'Too large to content-check — needs review',
          };
        }
      }

      const fileCountLabel = `${driveEntries.length} file${driveEntries.length === 1 ? '' : 's'}`;
      const sortId = toast.loading(`Sorting ${fileCountLabel}…`);
      let peeked = 0;
      await parallelMap(selected, DRIVE_PEEK_CONCURRENCY, async ({ item, kind }) => {
        try {
          const buffer = await service.downloadFile(
            item.meta.id,
            kind === 'text' ? { maxBytes: DRIVE_PEEK_TEXT_RANGE_BYTES } : undefined,
          );
          const peek = await extractor.extractPeekText(buffer, item.meta.name, item.mimeType);
          item.classification = classifyByContent(peek, item.classification);
        } catch (err) {
          console.warn(`Content peek failed for ${item.relativePath}`, err);
        }
        peeked += 1;
        if (peeked === selected.length || peeked % 10 === 0) {
          toast.loading(`Sorting ${fileCountLabel}… content check ${peeked}/${selected.length}`, {
            id: sortId,
          });
        }
      });
      toast.dismiss(sortId);

      const reviewItems: DriveReviewItem[] = sorted.map((item) => ({
        relativePath: item.relativePath,
        fileName: item.meta.name,
        mimeType: item.mimeType,
        classification: item.classification,
      }));
      setDriveReview({ items: reviewItems, driveIdByPath, driveSizeByPath });
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  /**
   * Commit a reviewed Drive batch: regroup files by their final (possibly user-corrected)
   * publication bucket and ingest each group with that bucket's override, carrying the
   * fine-grained documentType through to the document metadata. Reuses the same per-group
   * ingestion path as the auto-sorter; the no-copy reference logic is unchanged.
   */
  const commitDriveReview = async (finalItems: DriveReviewItem[]) => {
    if (!driveReview) return;
    const { driveIdByPath, driveSizeByPath } = driveReview;
    setDriveReviewBusy(true);
    try {
      const groups = new Map<SortablePublicationType, DriveReviewItem[]>();
      for (const item of finalItems) {
        const bucket = item.classification.publicationType;
        const group = groups.get(bucket);
        if (group) group.push(item);
        else groups.set(bucket, [item]);
      }
      for (const [bucket, group] of groups) {
        const entries: LocalDirectoryEntry[] = group.map((item) => ({
          file: new File([], item.fileName, { type: item.mimeType }),
          relativePath: item.relativePath,
        }));
        const documentTypeByPath: Record<string, string> = {};
        for (const item of group) {
          if (item.classification.documentType) {
            documentTypeByPath[item.relativePath] = item.classification.documentType;
          }
        }
        await ingestTechnicalFiles(entries, {
          source: 'gdrive',
          driveIdByPath,
          driveSizeByPath,
          publicationTypeOverride: bucket,
          documentTypeByPath,
        });
      }
      setDriveReview(null);
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    } finally {
      setDriveReviewBusy(false);
    }
  };

  /**
   * Split a batch by file-path-inferred publication type so IPCs, logbook scans, and
   * maintenance manuals each land under the right Library tab regardless of which tab
   * the batch was registered from. Unrecognized names stay on the current tab.
   */
  const ingestTechnicalFilesAutoSorted = async (
    entries: LocalDirectoryEntry[],
    opts?: { source?: 'http-server' | 'gdrive'; documentSourceId?: string; driveIdByPath?: Record<string, string>; driveSizeByPath?: Record<string, number> },
  ) => {
    if (tab === 'entity' || tab === 'search' || tab === 'standards') return;
    const fallback = publicationTypeForTab(tab);
    const groups = new Map<SortablePublicationType, LocalDirectoryEntry[]>();
    for (const entry of entries) {
      const inferred = inferPublicationTypeFromPath(entry.relativePath) ?? fallback;
      const group = groups.get(inferred);
      if (group) group.push(entry);
      else groups.set(inferred, [entry]);
    }
    for (const [pubType, group] of groups) {
      await ingestTechnicalFiles(group, { ...opts, publicationTypeOverride: pubType });
    }
  };

  const handleUpload = () => {
    if (tab === 'entity' || tab === 'search') return;
    if (!uploadProjectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    if (referenceMode) {
      void handleLinkManualsFolder();
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt,.xml,.js,image/jpeg,image/png';
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      void ingestTechnicalFiles(filesToEntries(files));
    };
    input.click();
  };

  const handleUploadFolder = () => {
    if (tab === 'entity' || tab === 'search') return;
    if (!uploadProjectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    if (referenceMode) {
      void handleLinkManualsFolder();
      return;
    }
    pickFolder((files) => void ingestTechnicalFiles(filesToEntries(files)));
  };

  const ingestTechnicalFiles = async (
    entries: LocalDirectoryEntry[],
    // When set, these are manufacturer references read from a customer HTTP server
    // (bytes fetched transiently upstream); register with that source, never a copy.
    // publicationTypeOverride files the batch under that type instead of the current tab.
    opts?: { source?: 'http-server' | 'gdrive'; documentSourceId?: string; driveIdByPath?: Record<string, string>; driveSizeByPath?: Record<string, number>; publicationTypeOverride?: SortablePublicationType; documentTypeByPath?: Record<string, string> },
  ) => {
    if (tab === 'entity' || tab === 'search') return;
    if (!uploadProjectId || !companyId) {
      toast.error('Select a project in this company first.');
      return;
    }
    const acceptedFiles = filterCompanyLibraryUploadFiles(entries.map((e) => e.file));
    const acceptedFileSet = new Set(acceptedFiles.accepted);
    const accepted = entries.filter((e) => acceptedFileSet.has(e.file));
    const skipped = entries.length - accepted.length;
    if (!accepted.length) {
      toast.error('No supported files (PDF, Word, TXT, JPG, PNG, XML).');
      return;
    }
    if (skipped > 0) {
      toast.message(`${skipped} file${skipped === 1 ? '' : 's'} skipped (unsupported type).`);
    }
    const cat = opts?.publicationTypeOverride ?? docCategoryForTab(tab as Exclude<LibraryTab, 'entity' | 'standards' | 'search'>);
    // Manufacturer copyrighted material (manuals, parts catalogs): reference only —
    // never upload bytes or persist extracted text. Read on demand from the linked source.
    // When the company's AeroGap-admin escape hatch is on, store full copies (classic upload).
    const localRef = isLocalReferenceCategory(cat);
    const persistCopy = !localRef || companyStorageEnabled;
    const pubType = opts?.publicationTypeOverride ?? publicationTypeForTab(tab as Exclude<LibraryTab, 'entity' | 'standards' | 'search'>);
    const extractor = new DocumentExtractor();
    const extractionWarnings: string[] = [];
    const saveFailures: Array<{ name: string; reason: string }> = [];
    const duplicateSkipped: string[] = [];
    const hashDuplicateSkipped: string[] = [];
    let successCount = 0;
    setTocStatus([]);

    // Dedupe set: existing publication titles in this company for this pubType,
    // normalized to ignore casing/whitespace. We re-check before each save so
    // duplicates uploaded earlier in this same batch are also caught. Fetched on
    // demand here (rather than via a standing full query that would read every
    // publication on each Library render) so browsing stays cheap; content-hash
    // dedupe below still backstops if this read is empty.
    const existingTitles = new Set<string>();
    if (companyId) {
      try {
        const existingPubsForType = (await convex.query(api.technicalPublications.listByCompany, {
          companyId: companyId as Id<'companies'>,
          publicationType: pubType as any,
        })) as Array<{ title?: string }>;
        for (const p of existingPubsForType) {
          if (p.title) existingTitles.add(normalizePublicationTitle(p.title));
        }
      } catch (err) {
        console.warn('Could not load existing publications for dedupe; relying on content-hash dedupe', err);
      }
    }

    const batchFolderKey = (parentId: string | undefined, segment: string) =>
      `${parentId ?? ''}|${segment.toLowerCase()}`;
    const batchFolderIds = new Map<string, string>();

    const ensureFolderPath = async (segments: string[]): Promise<string | undefined> => {
      if (!companyId || segments.length === 0) return undefined;
      let parentId: string | undefined;
      for (const segment of segments) {
        const key = batchFolderKey(parentId, segment);
        const fromBatch = batchFolderIds.get(key);
        if (fromBatch) {
          parentId = fromBatch;
          continue;
        }
        const existing = (folders ?? []).find((f: any) =>
          String(f.parentFolderId ?? '') === String(parentId ?? '') &&
          String(f.name).toLowerCase() === segment.toLowerCase(),
        );
        if (existing) {
          parentId = String(existing._id);
          batchFolderIds.set(key, parentId);
          continue;
        }
        const id = await createFolder({ companyId: companyId as any, parentFolderId: parentId as any, name: segment } as any);
        parentId = String(id);
        batchFolderIds.set(key, parentId);
      }
      return parentId;
    };

    try {
      for (let i = 0; i < accepted.length; i++) {
        const entry = accepted[i]!;
        const file = entry.file;
        // For local-ref docs this is the path relative to the linked manuals folder
        // (the resolver re-reads the file by this path); for others it's the display path.
        const displayPath = entry.relativePath;
        setUploadProgress({ current: i + 1, total: accepted.length, currentName: displayPath });

        // Cheap pre-check: skip if a publication with this filename stem already
        // exists. The structured publication title (post-XML-parse) is checked
        // again after extraction below so XML re-uploads of the same data module
        // are also caught.
        const filenameStem = displayPath.replace(/\.[^/.]+$/, '');
        if (existingTitles.has(normalizePublicationTitle(filenameStem))) {
          duplicateSkipped.push(displayPath);
          continue;
        }

        // gdrive reference docs are linked by file ID without downloading bytes. Use a
        // synthetic identity hash (`gdrive:<fileId>`) so re-linking the same Drive file
        // dedupes via the existing by-content-hash index, with no fetch.
        const isGdrive = opts?.source === 'gdrive';
        const driveFileId = isGdrive ? opts?.driveIdByPath?.[displayPath] : undefined;
        const buffer = isGdrive ? undefined : await file.arrayBuffer();
        const contentHash = isGdrive ? `gdrive:${driveFileId ?? displayPath}` : await sha256Hex(buffer!);
        const existingByHash = await convex.query(api.documents.findByContentHash, {
          projectId: uploadProjectId as Id<'projects'>,
          contentHash,
        });
        if (existingByHash) {
          hashDuplicateSkipped.push(displayPath);
          continue;
        }

        let storageId: Id<'_storage'> | undefined;
        if (persistCopy) {
          try {
            storageId = await uploadFileToConvexStorage(
              file,
              file.type || 'application/octet-stream',
              generateUploadUrl,
            );
          } catch (err: unknown) {
            console.warn(`Storage upload failed: ${displayPath}`, err);
          }
        }

        let extractedText = '';
        let extractionMeta: { backend: string; confidence?: number } | undefined;
        let xmlIngest:
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
        // For local-ref docs the extracted text is never persisted, so skip the
        // (token-costly) full extraction. Still run it for XML/.js shells because
        // structured ingest (title, ATA chapter, revision, TOC) is free and feeds
        // the publication metadata; the text it returns is discarded below.
        // gdrive links carry no bytes at this point (buffer is undefined), so there is
        // nothing to extract — XML auto-TOC for Drive manuals happens on demand later.
        const isXmlShell = /\.(xml|js)$/i.test(displayPath) || /\.(xml|js)$/i.test(file.name);
        if (buffer && (persistCopy || isXmlShell)) {
          try {
            const extracted = await extractor.extractTextWithMetadata(buffer, file.name, file.type, defaultModel);
            extractedText = extracted.text;
            extractionMeta = extracted.metadata;
            xmlIngest = extracted.xmlIngest;
          } catch (err: any) {
            extractionWarnings.push(displayPath);
            console.warn(`Extraction issue: ${displayPath}`, err);
          }
        }

        const userMakeModel = makeModel.trim() || undefined;
        const userManufacturer = manufacturer.trim() || undefined;
        const xmlTitle = xmlIngest?.metadata?.title?.trim();
        const xmlMakeModel = xmlIngest?.metadata?.applicableModels?.join(', ');
        const publicationTitle = xmlIngest?.metadata?.ataNbr && xmlTitle
          ? `${xmlIngest.metadata.ataNbr} ${xmlTitle}`
          : xmlTitle || filenameStem;

        // Second dedupe pass — before any DB write. The structured XML title
        // may differ from the filename stem (e.g. "05-10-00 Time Limits" vs
        // "05-10-00-in_xml"), so a renamed XML re-upload still gets caught.
        const normalizedTitle = normalizePublicationTitle(publicationTitle);
        if (existingTitles.has(normalizedTitle)) {
          duplicateSkipped.push(displayPath);
          await deleteOrphanStorage(storageId, deleteStorage);
          continue;
        }
        existingTitles.add(normalizedTitle);
        existingTitles.add(normalizePublicationTitle(filenameStem));

        let payload: Awaited<ReturnType<typeof prepareExtractedPayloadForConvex>> | undefined;
        try {
          // Local-ref docs persist no text; others spill large extractions to storage.
          payload = persistCopy ? await prepareExtractedPayloadForConvex(extractedText || '', generateUploadUrl) : undefined;
          const folderForFile =
            preserveUploadFolders && displayPath.includes('/')
              ? await ensureFolderPath(displayPath.split('/').slice(0, -1).filter(Boolean))
              : selectedFolderId === null
                ? undefined
                : selectedFolderId;
          const documentId = await addDocument({
            projectId: uploadProjectId as any,
            category: cat,
            documentType: opts?.documentTypeByPath?.[displayPath],
            name: displayPath,
            // For gdrive the resolver re-fetches by file ID, so store the ID as `path`
            // (the human-readable name lives in `name`); other sources path == display path.
            path: opts?.source === 'gdrive' ? (opts.driveIdByPath?.[displayPath] ?? displayPath) : displayPath,
            source: opts?.source ?? 'local',
            documentSourceId: opts?.documentSourceId as any,
            mimeType: file.type || undefined,
            // gdrive placeholders have no bytes; use the size reported by the Drive listing.
            size: opts?.source === 'gdrive' ? (opts.driveSizeByPath?.[displayPath] ?? 0) : file.size,
            storageId: persistCopy ? storageId : undefined,
            extractedText: persistCopy ? payload?.extractedText : undefined,
            extractedTextStorageId: persistCopy ? (payload?.extractedTextStorageId as any) : undefined,
            extractionMeta: persistCopy ? extractionMeta : undefined,
            contentHash,
            folderId: folderForFile as any,
            extractedAt: new Date().toISOString(),
          } as any);

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
            folderId: folderForFile as any,
            ...(libraryAircraftScope.kind === 'type'
              ? { aircraftTypeIds: [libraryAircraftScope.aircraftTypeId] }
              : libraryAircraftScope.kind === 'tail'
                ? { aircraftIds: [libraryAircraftScope.aircraftId] }
                : {}),
          } as any);

          successCount += 1;

          try {
            // Only auto-write sections that come from structured XML ingest (free,
            // no Claude tokens). For non-XML uploads or XML without embedded
            // sections, TOC detection is on-demand via the "Re-detect TOC" button
            // on the publication viewer so uploads do not auto-burn Claude tokens.
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
            }
          } catch {
            /* TOC optional */
          }
        } catch (err: unknown) {
          await deleteOrphanStorage(storageId, deleteStorage);
          if (payload?.extractedTextStorageId) {
            await deleteOrphanStorage(payload.extractedTextStorageId as Id<'_storage'>, deleteStorage);
          }
          saveFailures.push({ name: displayPath, reason: getConvexErrorMessage(err) });
        }
      }

      const label = getPublicationTypeLabel(pubType);
      if (successCount > 0) {
        const descParts: string[] = [];
        if (duplicateSkipped.length > 0) {
          descParts.push(`${duplicateSkipped.length} already uploaded`);
        }
        if (hashDuplicateSkipped.length > 0) {
          descParts.push(`${hashDuplicateSkipped.length} duplicate file${hashDuplicateSkipped.length === 1 ? '' : 's'} (same content)`);
        }
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
      } else if (duplicateSkipped.length > 0 && saveFailures.length === 0) {
        toast.message(
          `Skipped ${duplicateSkipped.length} duplicate${duplicateSkipped.length === 1 ? '' : 's'}`,
          { description: duplicateSkipped.slice(0, 5).join(', ').slice(0, 200) }
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

  const handleConfirmMovePublication = async (folderId: string | null) => {
    if (!movePublicationId) return;
    try {
      await movePublicationToFolder({
        publicationId: movePublicationId as any,
        folderId,
      } as any);
      toast.success('Publication moved');
    } catch (e: unknown) {
      toast.error(getConvexErrorMessage(e));
      throw e;
    }
  };

  const handleLibrarySearch = async () => {
    if (!companyId || !searchQuery.trim()) {
      toast.error('Select a company and enter a search query.');
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
        companyId: companyId as Id<'companies'>,
        projectId: uploadProjectId ? (uploadProjectId as Id<'projects'>) : undefined,
        query: searchQuery.trim(),
        categories: cats,
        topK: LIBRARY_SEARCH_TOP_K,
      });
      const chunks = ((res as any).chunks || []) as SearchChunk[];
      setSearchResults(chunks);
      if (chunks.length === 0) {
        const manualDocs =
          indexSummary?.perDoc.filter(
            (d) =>
              d.category === 'maintenance_manual' ||
              d.category === 'parts_catalog' ||
              d.category === 'logbook_scan',
          ) ?? [];
        const indexedManuals = manualDocs.filter((d) => d.chunkCount > 0).length;
        if (manualDocs.length > 0 && indexedManuals === 0) {
          toast.message('No searchable chunks yet', {
            description:
              'Manuals are uploaded but not indexed. Use Re-index on this page (per row, or via Admin · Library) or wait for indexing to finish.',
          });
        }
      }
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
      setSelectedPubIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success('Publication removed');
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const togglePubSelection = (id: string) => {
    setSelectedPubIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPubs = () => {
    const ids = (publications ?? []).map((p: any) => String(p._id));
    setSelectedPubIds(new Set(ids));
  };

  const clearPubSelection = () => {
    setSelectedPubIds(new Set());
  };

  const resetGroupForm = () => {
    setGroupForm({ name: '', manufacturer: '', makeModel: '', revisionNumber: '', notes: '' });
  };

  const openCreateGroup = () => {
    resetGroupForm();
    setGroupForm((f) => ({
      ...f,
      manufacturer: manufacturer || '',
      makeModel: makeModel || '',
    }));
    setEditingGroupId(null);
    setCreateGroupOpen(true);
  };

  const openEditGroup = (groupId: string) => {
    const g = (manualGroups || []).find((x) => String(x._id) === groupId);
    if (!g) return;
    setGroupForm({
      name: g.name ?? '',
      manufacturer: g.manufacturer ?? '',
      makeModel: g.makeModel ?? '',
      revisionNumber: g.revisionNumber ?? '',
      notes: g.notes ?? '',
    });
    setEditingGroupId(groupId);
    setCreateGroupOpen(true);
  };

  const handleSaveGroup = async () => {
    if (!companyId) return;
    const trimmed = groupForm.name.trim();
    if (!trimmed) {
      toast.error('Group name is required');
      return;
    }
    try {
      if (editingGroupId) {
        await updateManualGroup({
          groupId: editingGroupId as any,
          name: trimmed,
          manufacturer: groupForm.manufacturer || undefined,
          makeModel: groupForm.makeModel || undefined,
          revisionNumber: groupForm.revisionNumber || undefined,
          notes: groupForm.notes || undefined,
        });
        toast.success('Group updated');
      } else {
        await createManualGroup({
          companyId: companyId as any,
          name: trimmed,
          publicationType: publicationType as any,
          manufacturer: groupForm.manufacturer || undefined,
          makeModel: groupForm.makeModel || undefined,
          revisionNumber: groupForm.revisionNumber || undefined,
          notes: groupForm.notes || undefined,
        });
        toast.success('Group created');
      }
      setCreateGroupOpen(false);
      setEditingGroupId(null);
      resetGroupForm();
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const handleRemoveGroup = async (groupId: string, name: string, count: number) => {
    if (!confirm(
      count > 0
        ? `Delete the group "${name}"? ${count} publication${count === 1 ? '' : 's'} will become ungrouped (the underlying files are kept).`
        : `Delete the empty group "${name}"?`,
    )) {
      return;
    }
    try {
      await removeManualGroup({ groupId: groupId as any });
      toast.success('Group deleted');
      setExpandedGroupIds((prev) => {
        const next = new Set(prev);
        next.delete(groupId);
        return next;
      });
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const handleAssignSelectedToGroup = async (groupId: string | null) => {
    const ids = Array.from(selectedPubIds);
    if (ids.length === 0) return;
    try {
      const updated = await assignPublicationsToGroup({
        groupId: (groupId as any) ?? null,
        publicationIds: ids as any,
      });
      toast.success(
        groupId
          ? `Assigned ${updated} publication${updated === 1 ? '' : 's'} to group`
          : `Removed ${updated} publication${updated === 1 ? '' : 's'} from their group`,
      );
      setSelectedPubIds(new Set());
      setAssignTargetOpen(false);
    } catch (err: unknown) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  const toggleGroupExpansion = (groupId: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleMassDelete = async () => {
    const ids = Array.from(selectedPubIds);
    if (ids.length === 0) return;
    if (!confirm(`Delete ${ids.length} publication${ids.length === 1 ? '' : 's'} and their stored files? This cannot be undone.`)) {
      return;
    }
    setDeleteProgress({ current: 0, total: ids.length });
    const failures: Array<{ id: string; reason: string }> = [];
    let removedCount = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        setDeleteProgress({ current: i + 1, total: ids.length });
        try {
          await removePublication({ publicationId: id as any });
          removedCount += 1;
        } catch (err: unknown) {
          failures.push({ id, reason: getConvexErrorMessage(err) });
        }
      }
      if (removedCount > 0) {
        const description = failures.length > 0 ? `${failures.length} failed` : undefined;
        toast.success(
          `Removed ${removedCount} publication${removedCount === 1 ? '' : 's'}`,
          description ? { description } : undefined
        );
      }
      if (failures.length > 0 && removedCount === 0) {
        toast.error('Could not delete any publications', { description: failures[0]!.reason });
      }
      setSelectedPubIds(new Set());
    } finally {
      setDeleteProgress(null);
    }
  };

  const tabs: { id: LibraryTab; label: string; icon: ReactNode }[] = [
    { id: 'manuals', label: 'Maintenance manuals', icon: <FiBook /> },
    { id: 'parts', label: 'Parts catalogs', icon: <FiFile /> },
    { id: 'logbook_scans', label: 'Logbook scans', icon: <FiFolder /> },
    { id: 'entity', label: 'Entity documents', icon: <FiFolder /> },
    { id: 'standards', label: 'Compliance standards', icon: <FiBook /> },
    { id: 'search', label: 'Library search', icon: <FiSearch /> },
  ];

  const dropzoneActive = tab !== 'entity' && tab !== 'search' && tab !== 'standards' && !!uploadProjectId && !uploadProgress;
  const onDropFiles = (acceptedFiles: File[]) => {
    if (!dropzoneActive) return;
    if (acceptedFiles.length === 0) return;
    // Drag-drop can't yield a persistent folder handle or a stable root-relative
    // path, both of which the on-demand resolver needs. Route to the folder link.
    if (referenceMode) {
      toast.message('Use "Link manuals folder" so manuals can be read on demand without storing a copy.');
      return;
    }
    void ingestTechnicalFiles(filesToEntries(acceptedFiles));
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: COMPANY_LIBRARY_DROPZONE_ACCEPT,
    noClick: true,
    noKeyboard: true,
    disabled: !dropzoneActive,
    onDrop: onDropFiles,
  });

  const uploadLabel = tab === 'manuals' ? 'manuals' : tab === 'parts' ? 'parts manuals' : 'logbook scans';

  // Render guards live after all hooks so hook order stays stable across renders
  // (react-hooks/rules-of-hooks); these conditions only depend on props/state.
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
      <div className="mb-5 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sky-light/30 bg-sky/15 text-sky-light">
            <FiBook className="text-xl" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold leading-tight text-white">Company Library</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span>Shared maintenance manuals, IPCs &amp; logbook scans — tagged by make/model.</span>
              {uploadProject?.name ? (
                <Badge variant="outline" className="font-normal">
                  Target: {uploadProject.name}
                </Badge>
              ) : null}
              {uploadProjectId && libraryAircraftScope.kind !== 'fleet' ? (
                <Badge variant="info" className="font-normal">
                  Scope:{' '}
                  {libraryAircraftScope.kind === 'type'
                    ? aircraftTypes.find((t) => t._id === libraryAircraftScope.aircraftTypeId)?.name ?? 'selected type'
                    : libraryAircraft.find((a) => a._id === libraryAircraftScope.aircraftId)?.tailNumber ?? 'selected tail'}
                </Badge>
              ) : null}
              {uploadProjectId ? (
                <button
                  type="button"
                  onClick={() => setShowTypesPanel(true)}
                  className="text-sky-lighter underline underline-offset-2 hover:text-white"
                >
                  Manage aircraft types
                </button>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            icon={<FiInfo />}
            onClick={() => setShowLibraryInfo(true)}
          >
            How it works
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate('/compliance-report')}>
            Compliance report
          </Button>
        </div>
      </div>

      {isAskCitationsEnabled && uploadProjectId ? (
        <GlassCard padding="sm" className="mb-5">
          <button
            type="button"
            onClick={() => setShowAskPanel((prev) => !prev)}
            aria-expanded={showAskPanel}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-medium text-white/90">
              <FiSearch className="text-sky-light" />
              Ask an Expert about this library
            </span>
            <FiChevronDown className={`text-white/50 transition-transform ${showAskPanel ? 'rotate-180' : ''}`} />
          </button>
          {showAskPanel ? (
            <div className="mt-3">
              <AskPanel
                projectId={String(uploadProjectId)}
                isDarkMode
                placeholder='e.g. "what does our GMM say about tool calibration intervals?"'
                contextLabel="Searches every indexed document in this library — answers cite the exact passages."
                enableRecordTools={isAskRecordToolsEnabled}
              />
            </div>
          ) : null}
        </GlassCard>
      ) : null}

      <div className="mb-5">
        <LibraryTabs
          tabs={tabs}
          active={tab}
          onChange={(id) => {
            setTab(id);
            setSelectedPubIds(new Set());
          }}
        />
      </div>

      {tab !== 'entity' && tab !== 'search' && tab !== 'standards' ? (
        <div className="mb-5 rounded-xl border border-white/10 bg-white/5 p-3">
          <div className="flex flex-wrap items-center gap-2">
            {referenceMode ? (
              <>
                <Button variant="primary" size="sm" icon={<FiFolder />} onClick={handleLinkManualsFolder} disabled={!uploadProjectId || !!uploadProgress}>
                  Link manuals folder
                </Button>
                <Button variant="secondary" size="sm" icon={<FiCloud />} onClick={handleLinkDriveManuals} disabled={!uploadProjectId || !!uploadProgress}>
                  Link Drive folders
                </Button>
                <Button variant="secondary" size="sm" icon={<FiExternalLink />} onClick={() => setServerModalOpen(true)} disabled={!uploadProjectId || !!uploadProgress}>
                  Connect server
                </Button>
              </>
            ) : (
              <>
                <Button variant="primary" size="sm" icon={<FiUpload />} onClick={handleUpload} disabled={!uploadProjectId || !!uploadProgress}>
                  Upload {uploadLabel}
                </Button>
                <Button variant="secondary" size="sm" icon={<FiFolder />} onClick={handleUploadFolder} disabled={!uploadProjectId || !!uploadProgress}>
                  Upload folder
                </Button>
              </>
            )}
            <span className="mx-1 hidden h-5 w-px bg-white/10 sm:block" aria-hidden />
            <button
              type="button"
              onClick={() => setShowTags((v) => !v)}
              aria-expanded={showTags}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white/70 transition-colors hover:bg-white/5 hover:text-white"
            >
              <FiChevronDown className={`transition-transform ${showTags ? 'rotate-180' : ''}`} />
              Tags{' '}
              {manufacturer || makeModel ? (
                <span className="text-sky-lighter">· set</span>
              ) : (
                <span className="text-white/45">(optional)</span>
              )}
            </button>
            <label className="inline-flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={preserveUploadFolders}
                onChange={(e) => setPreserveUploadFolders(e.target.checked)}
              />
              Preserve folder structure
            </label>
            {isAdmin && tabIsLocalRef ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleCompanyStorage}
                disabled={!companyId || !!uploadProgress}
                className="ml-auto"
                title="AeroGap admin only: turn classic store-a-copy upload on or off for this company. Off by default — manufacturer material is referenced, not stored."
              >
                {companyStorageEnabled ? 'Disable classic upload' : 'Enable classic upload'}{' '}
                <span className="text-white/40">(admin)</span>
              </Button>
            ) : null}
          </div>
          {showTags ? (
            <div className="mt-3 flex flex-col gap-2 sm:max-w-xl sm:flex-row">
              <Input inputSize="sm" placeholder="Manufacturer (e.g. Cessna)" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} />
              <Input inputSize="sm" placeholder="Make & model (e.g. 208B)" value={makeModel} onChange={(e) => setMakeModel(e.target.value)} />
            </div>
          ) : null}
          {uploadProgress ? (
            <div className="mt-3 rounded-lg border border-sky-light/30 bg-sky/10 p-3">
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
              <p className="mt-2 text-[11px] text-white/60">
                Text extraction runs per file. Large scanned PDFs may take a minute each. TOC detection (AI) is
                on-demand — open a publication and use "Re-detect TOC" when you want it.
              </p>
            </div>
          ) : null}
          {!uploadProgress && tocStatus.length > 0 ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 max-h-32 overflow-y-auto">
              <div className="text-xs font-medium text-white/70 mb-1">Tables of contents from XML (free)</div>
              <ul className="text-xs text-white/60 space-y-0.5">
                {tocStatus.map((t, i) => (
                  <li key={i} className="truncate" title={`${t.name} — ${t.sections} ATA sections`}>
                    {t.name} — {t.sections} ATA section{t.sections === 1 ? '' : 's'}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'search' ? (
        <GlassCard className="mb-5">
          <div className="flex flex-col gap-2 sm:max-w-3xl sm:flex-row">
            <Input
              className="flex-1"
              placeholder='e.g. "Chapter 5 inspection intervals" or "100 hour inspection"'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleLibrarySearch();
              }}
            />
            <Button variant="primary" onClick={() => void handleLibrarySearch()} disabled={isSearching || !companyId}>
              {isSearching ? 'Searching…' : 'Search'}
            </Button>
          </div>
          <p className="mt-2 text-xs text-white/60">
            Searches every indexed technical document across this company. For tail-specific logbook questions, use Logbook → Search.
          </p>

          <div className="mt-4 rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-white/70">
                {indexSummary ? (
                  <>
                    <span className="font-medium text-white/90">{indexSummary.indexed}</span> of{' '}
                    <span className="font-medium text-white/90">{indexSummary.totalDocs}</span> documents indexed
                    {indexSummary.failed ? <span className="text-red-300"> · {indexSummary.failed} failed</span> : null}
                    {indexSummary.inFlight ? <span className="text-amber-200"> · {indexSummary.inFlight} in progress</span> : null}
                  </>
                ) : indexSummaryLoading ? (
                  'Loading indexing status…'
                ) : (
                  'Indexing status unavailable'
                )}
              </div>
              <div className="flex items-center gap-3">
                {indexSummary &&
                indexSummary.perDoc.some(
                  (d) =>
                    (d.category === 'maintenance_manual' ||
                      d.category === 'parts_catalog' ||
                      d.category === 'logbook_scan') &&
                    d.chunkCount === 0,
                ) ? (
                  <button
                    type="button"
                    onClick={() => setShowIndexDetails((v) => !v)}
                    className="text-xs text-sky-lighter underline underline-offset-2 hover:text-white"
                  >
                    {showIndexDetails ? 'Hide details' : 'Details'}
                  </button>
                ) : null}
                {uploadProjectId ? (
                  <RefreshSearchIndexButton projectId={uploadProjectId || undefined} onResult={setSearchIndexReport} />
                ) : null}
              </div>
            </div>
            {showIndexDetails && indexSummary ? (
              <div className="mt-2 space-y-1 border-t border-white/10 pt-2 text-xs text-white/60">
                {indexSummary.perDoc
                  .filter(
                    (d) =>
                      (d.category === 'maintenance_manual' ||
                        d.category === 'parts_catalog' ||
                        d.category === 'logbook_scan') &&
                      d.chunkCount === 0,
                  )
                  .slice(0, 8)
                  .map((d) => (
                    <div key={d.documentId} className="truncate" title={d.reason}>
                      Not searchable: {d.name} — {d.reason}
                    </div>
                  ))}
              </div>
            ) : null}
          </div>
          {uploadProjectId ? (
            <SearchCoveragePanel projectId={uploadProjectId || undefined} report={searchIndexReport?.perDoc ?? null} />
          ) : null}

          {searchResults.length > 0 ? (
            <ul className="mt-4 space-y-2 max-h-[480px] overflow-y-auto scrollbar-thin pr-1">
              {searchResults.map((r, i) => (
                <li key={i} className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate font-medium text-sky-200">{r.docName}</div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {r.matchType ? (
                        <Badge variant="outline" className="shrink-0 font-normal text-[10px] uppercase tracking-wide">
                          {matchTypeLabel(r.matchType)}
                        </Badge>
                      ) : null}
                      <Badge variant="outline" className="shrink-0 font-normal tabular-nums">
                        {formatSearchScore(r.score, r.rerankScore)}
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap text-white/80 line-clamp-6">
                    {highlightSearchTerms(r.text, searchQuery)}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </GlassCard>
      ) : null}

      {uploadProjectId ? (
        <AircraftTypesPanelModal
          projectId={uploadProjectId}
          open={showTypesPanel}
          onClose={() => setShowTypesPanel(false)}
        />
      ) : null}

      {tab !== 'entity' && tab !== 'search' && tab !== 'standards' ? (
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="space-y-3">
          {uploadProjectId ? (
            <AircraftScopeTree
              types={aircraftTypes}
              aircraft={libraryAircraft}
              scope={libraryAircraftScope}
              onSelectScope={(scope) => {
                if (companyId) setCompanyLibraryAircraftScope(String(companyId), scope);
              }}
            />
          ) : null}
          <LibraryFolderTree
            folders={(folders ?? []).map((f: any) => ({
              _id: String(f._id),
              name: f.name,
              parentFolderId: f.parentFolderId ? String(f.parentFolderId) : undefined,
            }))}
            selectedFolderId={selectedFolderId}
            folderItemCounts={folderItemCounts}
            onSelectFolder={setLibraryFolderSelection}
            onCreateFolder={async (name, parentFolderId) => {
              await createFolder({ companyId: companyId as any, parentFolderId: parentFolderId as any, name } as any);
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
            onPublicationDropped={async (folderId, publicationId) => {
              try {
                await movePublicationToFolder({
                  publicationId: publicationId as any,
                  folderId,
                } as any);
                toast.success('Publication moved');
              } catch (e: unknown) {
                toast.error(getConvexErrorMessage(e));
              }
            }}
            onFolderReparentDropped={async (draggedFolderId, newParentFolderId) => {
              try {
                await moveFolder({ folderId: draggedFolderId as any, newParentFolderId: newParentFolderId as any } as any);
                toast.success('Folder moved');
              } catch (e: unknown) {
                toast.error(getConvexErrorMessage(e));
              }
            }}
            title="Library folders"
          />
          </div>
        <GlassCard>
          {folderPathLabel ? <p className="mb-2 text-xs text-white/60">{folderPathLabel}</p> : null}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-lg font-semibold text-white">{getPublicationTypeLabel(publicationType!)}</h2>
              <Badge variant="outline" className="font-normal">
                {pubsLoadingFirst
                  ? 'Loading…'
                  : `${(publications?.length ?? 0).toLocaleString()}${pubsCanLoadMore || pubsLoadingMore ? '+' : ''} shown`}
              </Badge>
              {manualGroups && manualGroups.length > 0 ? (
                <Badge variant="outline" className="font-normal">
                  {manualGroups.length} group{manualGroups.length === 1 ? '' : 's'}
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                icon={<FiPlus />}
                onClick={openCreateGroup}
                disabled={!companyId || !!deleteProgress}
              >
                New group
              </Button>
              {publications && publications.length > 0 ? (
                selectedPubIds.size > 0 ? (
                  <>
                    <span className="text-sm font-medium text-sky-lighter">
                      {selectedPubIds.size} selected
                    </span>
                    <Button size="sm" variant="ghost" onClick={clearPubSelection} disabled={!!deleteProgress}>
                      Clear
                    </Button>
                    <div className="relative">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<FiLayers />}
                        onClick={() => setAssignTargetOpen((v) => !v)}
                        disabled={!!deleteProgress}
                      >
                        Assign to group
                      </Button>
                      {assignTargetOpen ? (
                        <div className="absolute right-0 mt-2 z-20 w-72 rounded-xl border border-white/15 bg-navy-900/95 backdrop-blur p-2 shadow-2xl">
                          <div className="max-h-72 overflow-auto">
                            {(manualGroups ?? []).length === 0 ? (
                              <p className="px-3 py-2 text-xs text-white/60">No groups yet. Create one above.</p>
                            ) : (
                              (manualGroups ?? []).map((g) => (
                                <button
                                  key={g._id}
                                  type="button"
                                  onClick={() => void handleAssignSelectedToGroup(String(g._id))}
                                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm"
                                >
                                  <div className="font-medium truncate">{g.name}</div>
                                  <div className="text-xs text-white/50">
                                    {g.publicationCount} member{g.publicationCount === 1 ? '' : 's'}
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                          <div className="border-t border-white/10 my-1" />
                          <button
                            type="button"
                            onClick={() => void handleAssignSelectedToGroup(null)}
                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 text-sm text-amber-300"
                          >
                            Remove from group
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<FiTrash2 />}
                      onClick={() => void handleMassDelete()}
                      disabled={!!deleteProgress}
                      className="!text-red-300 hover:!text-red-200"
                    >
                      Delete {selectedPubIds.size}
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" onClick={selectAllPubs} disabled={!!deleteProgress}>
                    Select all
                  </Button>
                )
              ) : null}
            </div>
          </div>
          {deleteProgress ? (
            <div className="mb-4 rounded-lg border border-red-300/30 bg-red-500/10 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-red-200 font-medium">
                  Deleting {deleteProgress.current} of {deleteProgress.total}…
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full bg-red-400 transition-all"
                  style={{ width: `${Math.round((deleteProgress.current / Math.max(deleteProgress.total, 1)) * 100)}%` }}
                />
              </div>
            </div>
          ) : null}
          {pubsLoadingFirst ? (
            <p className="py-8 text-center text-white/60">Loading publications…</p>
          ) : !publications?.length ? (
            selectedFolderId !== undefined ? (
              <LibraryEmptyState
                icon={<FiFolder />}
                title="This folder is empty"
                hint={'Choose "All items" or another folder, or drag items between folders to move them here.'}
              />
            ) : (
              <LibraryEmptyState
                icon={<FiBook />}
                title={`No ${uploadLabel} yet`}
                hint="Use the buttons above to link or upload — or drag files anywhere on this page."
              />
            )
          ) : (() => {
            const pubsByGroup = new Map<string, any[]>();
            const ungrouped: any[] = [];
            for (const p of publications) {
              const gid = p.manualGroupId ? String(p.manualGroupId) : null;
              if (gid) {
                if (!pubsByGroup.has(gid)) pubsByGroup.set(gid, []);
                pubsByGroup.get(gid)!.push(p);
              } else {
                ungrouped.push(p);
              }
            }
            const groupsList = (manualGroups ?? []).filter(
              (g) => (pubsByGroup.get(String(g._id))?.length ?? 0) > 0,
            );

            const renderPubRow = (p: any, indent = false) => {
              const id = String(p._id);
              const isSelected = selectedPubIds.has(id);
              const docId = p.documentId ? String(p.documentId) : null;
              const idxStatus = docId ? indexSummaryByDocId.get(docId) : undefined;
              const isReindexing = docId ? reindexingDocIds.has(docId) : false;
              const renderIndexBadge = () => {
                if (!docId) return null;
                if (isReindexing || idxStatus?.state === 'inFlight') {
                  return (
                    <Badge variant="warning" className="text-[10px]">
                      Indexing…
                    </Badge>
                  );
                }
                if (idxStatus?.state === 'indexed') {
                  return (
                    <Badge variant="success" className="text-[10px]">
                      ✓ Indexed ({idxStatus.chunkCount.toLocaleString()} chunks)
                    </Badge>
                  );
                }
                if (idxStatus?.state === 'failed') {
                  return (
                    <Badge variant="destructive" className="text-[10px]" title={idxStatus.lastError || idxStatus.errorCode}>
                      Failed — {idxStatus.errorCode || 'see details'}
                    </Badge>
                  );
                }
                if (idxStatus?.state === 'skipped') {
                  return (
                    <Badge variant="default" className="text-[10px]" title={idxStatus.reason}>
                      Not indexable
                    </Badge>
                  );
                }
                if (idxStatus?.state === 'eligible' || (idxStatus && idxStatus.chunkCount === 0)) {
                  return (
                    <Badge variant="default" className="text-[10px]">
                      Pending
                    </Badge>
                  );
                }
                return null;
              };
              const badge = renderIndexBadge();
              const showReindexBtn =
                !!docId && (idxStatus?.state === 'failed' || idxStatus?.state === 'eligible');
              const metaFrags = [
                p.makeModel ? `Model ${p.makeModel}` : null,
                p.manufacturer ? `Mfr ${p.manufacturer}` : null,
                p.revisionNumber ? `Rev ${p.revisionNumber}` : null,
                p.revisionDate ? String(p.revisionDate) : null,
              ].filter(Boolean) as string[];
              return (
                <li
                  key={p._id}
                  draggable
                  onDragStart={(e) => setLibraryDragData(e, { type: 'publication', id })}
                  className={`group flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors cursor-grab active:cursor-grabbing ${indent ? 'ml-5' : ''} ${
                    isSelected
                      ? 'border-sky-light/50 bg-sky/15'
                      : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                  }`}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePubSelection(id)}
                      disabled={!!deleteProgress}
                      className="h-4 w-4 shrink-0 rounded border-white/30 bg-white/10"
                      aria-label={`Select ${p.title}`}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium text-white">{p.title}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-white/55">
                        {(!p.aircraftTypeIds?.length && !p.aircraftIds?.length) ? (
                          <span className="text-white/45">Fleet-wide</span>
                        ) : (
                          <>
                            {(p.aircraftTypeIds ?? []).map((tid: string) => (
                              <Badge key={`t-${tid}`} variant="info" className="text-[10px] font-normal">
                                {aircraftTypes.find((t) => String(t._id) === String(tid))?.name ?? 'Type'}
                              </Badge>
                            ))}
                            {(p.aircraftIds ?? []).map((aid: string) => (
                              <Badge key={`a-${aid}`} variant="info" className="text-[10px] font-normal">
                                {libraryAircraft.find((a) => String(a._id) === String(aid))?.tailNumber ?? 'Tail'}
                              </Badge>
                            ))}
                          </>
                        )}
                        {metaFrags.map((frag, fi) => (
                          <span key={fi} className="whitespace-nowrap">
                            {fi > 0 ? <span className="pr-2 text-white/25">·</span> : null}
                            {frag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </label>
                  <div className="flex shrink-0 items-center gap-2">
                    {badge}
                    <div className="flex items-center gap-1 transition-opacity focus-within:!opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                      {showReindexBtn && docId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void handleReindexPubDoc(docId)}
                          disabled={isReindexing || !!deleteProgress}
                        >
                          {isReindexing ? 'Queuing…' : 'Re-index'}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setMovePublicationId(String(p._id))}
                        disabled={!!deleteProgress}
                      >
                        Move
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={<FiExternalLink />}
                        onClick={() => navigate(`/library/publication/${p._id}`)}
                        disabled={!!deleteProgress}
                      >
                        Open
                      </Button>
                      <button
                        type="button"
                        className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-red-400 disabled:opacity-40"
                        aria-label="Delete"
                        disabled={!!deleteProgress}
                        onClick={() => void handleDeletePub(p._id)}
                      >
                        <FiTrash2 />
                      </button>
                    </div>
                  </div>
                </li>
              );
            };

            return (
              <div className="space-y-4">
                {groupsList.length > 0 ? (
                  <ul className="space-y-2">
                    {groupsList.map((g) => {
                      const gid = String(g._id);
                      const members = pubsByGroup.get(gid) ?? [];
                      const expanded = expandedGroupIds.has(gid);
                      const allSelected = members.length > 0 && members.every((m: any) => selectedPubIds.has(String(m._id)));
                      return (
                        <li key={gid} className="rounded-xl border border-sky-light/30 bg-sky/5">
                          <div className="flex items-center justify-between gap-3 p-3">
                            <button
                              type="button"
                              onClick={() => toggleGroupExpansion(gid)}
                              className="flex items-center gap-2 min-w-0 flex-1 text-left"
                            >
                              {expanded ? <FiChevronDown /> : <FiChevronRight />}
                              <FiLayers className="text-sky-lighter shrink-0" />
                              <div className="min-w-0">
                                <div className="font-semibold truncate">{g.name}</div>
                                <div className="text-xs text-white/60 flex flex-wrap gap-2">
                                  <span>{members.length} file{members.length === 1 ? '' : 's'}</span>
                                  {g.manufacturer && <span>· {g.manufacturer}</span>}
                                  {g.makeModel && <span>· {g.makeModel}</span>}
                                  {g.revisionNumber && <span>· Rev {g.revisionNumber}</span>}
                                </div>
                              </div>
                            </button>
                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const ids = members.map((m: any) => String(m._id));
                                  setSelectedPubIds((prev) => {
                                    const next = new Set(prev);
                                    if (allSelected) {
                                      for (const id of ids) next.delete(id);
                                    } else {
                                      for (const id of ids) next.add(id);
                                    }
                                    return next;
                                  });
                                }}
                                disabled={!!deleteProgress || members.length === 0}
                              >
                                {allSelected ? 'Deselect all' : 'Select all'}
                              </Button>
                              <button
                                type="button"
                                className="p-2 text-white/60 hover:text-white"
                                aria-label="Edit group"
                                disabled={!!deleteProgress}
                                onClick={() => openEditGroup(gid)}
                              >
                                <FiEdit2 />
                              </button>
                              <button
                                type="button"
                                className="p-2 text-white/60 hover:text-red-400 disabled:opacity-40"
                                aria-label="Delete group"
                                disabled={!!deleteProgress}
                                onClick={() => void handleRemoveGroup(gid, g.name, members.length)}
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          </div>
                          {expanded ? (
                            <ul className="space-y-2 px-3 pb-3">
                              {members.map((m: any) => renderPubRow(m, true))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                {/* Empty groups (no members yet) — still surface them so users can assign */}
                {(manualGroups ?? []).filter((g) => (pubsByGroup.get(String(g._id))?.length ?? 0) === 0).length > 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                    <div className="text-xs font-medium text-white/70 mb-2">Empty groups</div>
                    <ul className="space-y-1.5">
                      {(manualGroups ?? [])
                        .filter((g) => (pubsByGroup.get(String(g._id))?.length ?? 0) === 0)
                        .map((g) => (
                          <li key={g._id} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-white/80">{g.name}</span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                className="p-1.5 text-white/50 hover:text-white"
                                aria-label="Edit group"
                                onClick={() => openEditGroup(String(g._id))}
                              >
                                <FiEdit2 />
                              </button>
                              <button
                                type="button"
                                className="p-1.5 text-white/50 hover:text-red-400"
                                aria-label="Delete group"
                                onClick={() => void handleRemoveGroup(String(g._id), g.name, 0)}
                              >
                                <FiTrash2 />
                              </button>
                            </div>
                          </li>
                        ))}
                    </ul>
                  </div>
                ) : null}

                {ungrouped.length > 0 ? (
                  <div>
                    {groupsList.length > 0 ? (
                      <div className="text-xs font-medium text-white/60 mb-2">
                        Ungrouped ({ungrouped.length})
                      </div>
                    ) : null}
                    <ul className="space-y-2">
                      {ungrouped.map((p: any) => renderPubRow(p, false))}
                    </ul>
                  </div>
                ) : null}
              </div>
            );
          })()}
          {(pubsCanLoadMore || pubsLoadingMore) ? (
            <div className="mt-4 flex justify-center">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => pubPage.loadMore(50)}
                disabled={pubsLoadingMore}
              >
                {pubsLoadingMore ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </GlassCard>
        </div>
      ) : null}

      {createGroupOpen ? (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
          onClick={() => { setCreateGroupOpen(false); setEditingGroupId(null); }}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-white/15 bg-navy-900/95 backdrop-blur p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-display font-bold">
                {editingGroupId ? 'Edit manual group' : 'Create manual group'}
              </h3>
              <button
                type="button"
                className="p-1.5 text-white/60 hover:text-white"
                onClick={() => { setCreateGroupOpen(false); setEditingGroupId(null); }}
                aria-label="Close"
              >
                <FiX />
              </button>
            </div>
            <p className="text-xs text-white/55 mb-4">
              Bundle related publications (e.g. all 1,500+ XML chapters that make up one OEM manual)
              into one logical unit. Members of the group can be selected together anywhere
              the library exposes manuals.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-white/70 mb-1">Group name</label>
                <Input
                  placeholder='e.g. "Maintenance Manual — GV"'
                  value={groupForm.name}
                  onChange={(e) => setGroupForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/70 mb-1">Manufacturer (optional)</label>
                  <Input
                    placeholder="e.g. Gulfstream"
                    value={groupForm.manufacturer}
                    onChange={(e) => setGroupForm((f) => ({ ...f, manufacturer: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-white/70 mb-1">Make &amp; model (optional)</label>
                  <Input
                    placeholder="e.g. GV"
                    value={groupForm.makeModel}
                    onChange={(e) => setGroupForm((f) => ({ ...f, makeModel: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Revision (optional)</label>
                <Input
                  placeholder='e.g. "Rev 32"'
                  value={groupForm.revisionNumber}
                  onChange={(e) => setGroupForm((f) => ({ ...f, revisionNumber: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-white/70 mb-1">Notes (optional)</label>
                <textarea
                  rows={2}
                  value={groupForm.notes}
                  onChange={(e) => setGroupForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-sky-light/50"
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => { setCreateGroupOpen(false); setEditingGroupId(null); }}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={() => void handleSaveGroup()}>
                {editingGroupId ? 'Save changes' : 'Create group'}
              </Button>
            </div>
          </div>
        </div>
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

      {tab === 'standards' ? (
        <StandardsLibrary companyId={String(companyId)} projectId={uploadProjectId ?? undefined} />
      ) : null}
      </div>

      <MoveToFolderModal
        open={movePublicationId != null}
        onClose={() => setMovePublicationId(null)}
        title="Move publication"
        description="Pick a folder, or Library root if it should sit outside folders."
        folders={publicationMoveFolderOptions}
        onConfirm={(folderId) => handleConfirmMovePublication(folderId)}
      />

      {uploadProjectId ? (
        <ManualsServerModal
          open={serverModalOpen}
          projectId={uploadProjectId as Id<'projects'>}
          onClose={() => setServerModalOpen(false)}
          onRegister={handleRegisterServerManuals}
          showAutoSortHint
        />
      ) : null}

      <DriveImportReviewModal
        open={driveReview !== null}
        items={driveReview?.items ?? []}
        busy={driveReviewBusy}
        onCancel={() => { if (!driveReviewBusy) setDriveReview(null); }}
        onConfirm={(items) => { void commitDriveReview(items); }}
      />

      <GlassModal
        open={showLibraryInfo}
        title="How the Company Library works"
        sizeClassName="max-w-2xl"
        onClose={() => setShowLibraryInfo(false)}
        footer={
          <Button variant="secondary" size="sm" onClick={() => setShowLibraryInfo(false)}>
            Got it
          </Button>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-white/75">
          <p>
            Maintenance manuals, IPCs, and logbook scans are shared at the <strong className="text-white">company</strong>{' '}
            level and tagged by make/model. New files attach to your active sidebar project and are linked for search and
            schedule tools.
          </p>
          <div>
            <h4 className="mb-1 font-semibold text-white">
              {referenceMode ? 'Reference mode (default)' : 'Classic upload'}
            </h4>
            <p>
              {referenceMode
                ? 'Copyrighted manufacturer material is referenced, never stored. Link a folder on your computer or a mapped network share (Chrome or Edge), link one or more Google Drive folders (any browser — connect Drive in Settings first; sub-folders are preserved), or connect a customer-hosted manuals server (must allow CORS). The app reads files on demand and keeps no copy — if you move or unshare a file, re-link it.'
                : 'Classic upload is ON for this company (set by an AeroGap admin): manufacturer files are uploaded and a full copy is stored on our servers. You can also drag and drop files anywhere on this page; multi-file selection is supported.'}
            </p>
          </div>
          <div>
            <h4 className="mb-1 font-semibold text-white">Tables of contents</h4>
            <p>
              OEM XML manuals (S1000D, ATA iSpec, Gulfstream <code className="rounded bg-white/10 px-1 text-white/80">.js</code>{' '}
              shells) auto-fill title, ATA chapter, revision, and applicable models — including TOC sections when the XML
              contains them. For other files (PDFs, generic XML), AI-based TOC detection is on-demand: open a publication and
              click “Re-detect TOC” to spend Claude tokens only when you want them.
            </p>
          </div>
        </div>
      </GlassModal>
    </div>
  );
}
