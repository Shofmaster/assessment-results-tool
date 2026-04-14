import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RevisionChecker, type AttachedImage } from '../services/revisionChecker';
import type { DocumentRevision, RevisionStatus } from '../types/revisionTracking';
import { useAppStore } from '../store/appStore';
import {
  useDefaultClaudeModel,
  useDocumentRevisions,
  useDocuments,
  useIsAdmin,
  useManualRevisionLinksByProject,
  useMergedEntityRevisionDocs,
  useSetDocumentRevisions,
  useUpdateDocumentRevision,
  useUpsertManualRevisionLinks
} from '../hooks/useConvexData';
import type { UploadedDocument } from '../types/document';
import {
  FiRefreshCw,
  FiSearch,
  FiCheckCircle,
  FiAlertTriangle,
  FiHelpCircle,
  FiLoader,
  FiAlertOctagon,
  FiFile,
  FiFolder,
  FiCloud,
  FiGlobe,
  FiImage,
  FiX,
  FiShield,
  FiTag,
  FiLayers,
  FiMoreHorizontal,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { getConvexErrorMessage } from '../utils/convexError';
import { Button, GlassCard, Badge } from './ui';

const statusConfig: Record<RevisionStatus, { icon: typeof FiCheckCircle; color: string; label: string }> = {
  current: { icon: FiCheckCircle, color: 'text-green-400', label: 'Current' },
  outdated: { icon: FiAlertTriangle, color: 'text-amber-400', label: 'Outdated' },
  unknown: { icon: FiHelpCircle, color: 'text-white/70', label: 'Not Checked' },
  checking: { icon: FiLoader, color: 'text-sky-400', label: 'Checking...' },
  error: { icon: FiAlertOctagon, color: 'text-red-400', label: 'Error' },
};

const typeIcons = {
  regulatory: FiFolder,
  entity: FiFile,
  uploaded: FiCloud,
  reference: FiFile,
};

type PileId = 'faa' | 'type' | 'entity' | 'other';

const PILES: Array<{
  id: PileId;
  label: string;
  icon: typeof FiShield;
  ring: string;
  headerBg: string;
  dropBg: string;
}> = [
  { id: 'faa', label: 'FAA Docs', icon: FiShield, ring: 'ring-sky/50', headerBg: 'bg-sky/10', dropBg: 'bg-sky/20' },
  { id: 'type', label: 'Type Docs', icon: FiTag, ring: 'ring-violet-500/50', headerBg: 'bg-violet-500/10', dropBg: 'bg-violet-500/20' },
  { id: 'entity', label: 'Entity Docs', icon: FiLayers, ring: 'ring-emerald-500/50', headerBg: 'bg-emerald-500/10', dropBg: 'bg-emerald-500/20' },
  { id: 'other', label: 'Other Docs', icon: FiMoreHorizontal, ring: 'ring-white/20', headerBg: 'bg-white/5', dropBg: 'bg-white/10' },
];

function getRevisionPile(revision: any): PileId {
  const cat = revision.category as string | undefined;
  if (cat === 'faa' || cat === 'type' || cat === 'entity' || cat === 'other') return cat;
  const dt = revision.documentType as string;
  if (dt === 'entity') return 'entity';
  if (dt === 'uploaded' || dt === 'reference') return 'other';
  return 'faa'; // default for regulatory/unknown
}

export default function RevisionTracker() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();

  const defaultModel = useDefaultClaudeModel();
  const regulatoryDocumentsRaw = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const entityDocuments = (useMergedEntityRevisionDocs(activeProjectId || undefined) || []) as any[];
  const uploadedDocumentsRaw = (useDocuments(activeProjectId || undefined, 'uploaded') || []) as any[];
  const regulatoryFiles = regulatoryDocumentsRaw;
  const uploadedDocuments = uploadedDocumentsRaw;
  const documentRevisions = (useDocumentRevisions(activeProjectId || undefined) || []) as any[];
  const manualRevisionLinks = (useManualRevisionLinksByProject(activeProjectId || undefined) || []) as any[];
  const setDocumentRevisions = useSetDocumentRevisions();
  const updateDocumentRevision = useUpdateDocumentRevision();
  const upsertManualRevisionLinks = useUpsertManualRevisionLinks();

  const [isScanning, setIsScanning] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revisionAttachedImages, setRevisionAttachedImages] = useState<Array<{ name: string } & AttachedImage>>([]);
  const revisionImageInputRef = useRef<HTMLInputElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverPile, setHoverPile] = useState<PileId | null>(null);

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0 flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">
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

  const totalDocs = documentRevisions.length;
  const currentCount = documentRevisions.filter((r: any) => r.status === 'current').length;
  const outdatedCount = documentRevisions.filter((r: any) => r.status === 'outdated').length;
  const unknownCount = documentRevisions.filter((r: any) => r.status === 'unknown' || r.status === 'error').length;
  const mismatchCount = manualRevisionLinks.filter((l: any) => l.comparisonStatus === 'mismatch').length;
  const mismatchedSourceIds = useMemo(
    () => new Set(manualRevisionLinks.filter((l: any) => l.comparisonStatus === 'mismatch' && l.sourceDocumentId).map((l: any) => String(l.sourceDocumentId))),
    [manualRevisionLinks]
  );

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

  const handleRevisionImageAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
    if (toAdd.length) setRevisionAttachedImages((prev) => [...prev, ...toAdd]);
    e.target.value = '';
  };

  const removeRevisionImage = (index: number) => {
    setRevisionAttachedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleScanDocuments = async () => {
    if (!activeProjectId) return;
    setIsScanning(true);
    setError(null);

    try {
      const uploadedForRevisions: UploadedDocument[] = uploadedDocuments.map((d: any) => ({
        id: d._id,
        name: d.name,
        text: d.extractedText || '',
        path: d.path,
        source: d.source,
        mimeType: d.mimeType,
        extractedAt: d.extractedAt,
      }));
      const checker = new RevisionChecker();
      const imagePayload = revisionAttachedImages.map(({ media_type, data }) => ({ media_type, data }));
      const revisions = await checker.extractRevisionLevels(
        regulatoryFiles.map((f: any) => ({
          id: f._id,
          name: f.name,
          path: f.path,
          category: f.category,
          size: f.size || 0,
          importedAt: f.extractedAt,
        })),
        entityDocuments.map((f: any) => ({
          id: f._id,
          name: f.name,
          path: f.path,
          size: f.size || 0,
          importedAt: f.extractedAt,
        })),
        uploadedForRevisions,
        [],
        defaultModel,
        imagePayload
      );

      await setDocumentRevisions({
        projectId: activeProjectId as any,
        revisions: revisions.map((r) => ({
          originalId: r.id,
          documentName: r.documentName,
          documentType: r.documentType,
          sourceDocumentId: r.sourceDocumentId,
          category: r.category,
          detectedRevision: r.detectedRevision,
          latestKnownRevision: r.latestKnownRevision,
          isCurrentRevision: r.isCurrentRevision ?? undefined,
          lastCheckedAt: r.lastCheckedAt ?? undefined,
          searchSummary: r.searchSummary,
          status: r.status,
        })),
      });
      await upsertManualRevisionLinks({
        projectId: activeProjectId as any,
        scannedRevisions: revisions.map((r) => ({
          sourceDocumentIdString: r.sourceDocumentId,
          documentName: r.documentName,
          detectedRevision: r.detectedRevision,
        })),
      } as any);
    } catch (err) {
      setError(`Failed to scan documents: ${getConvexErrorMessage(err)}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleCheckSingle = async (revision: any) => {
    setCheckingId(revision._id);
    await updateDocumentRevision({ revisionId: revision._id, status: 'checking' });

    try {
      const checker = new RevisionChecker();
      const updates = await checker.checkCurrentRevision({
        id: revision.originalId || revision._id,
        documentName: revision.documentName,
        documentType: revision.documentType,
        sourceDocumentId: revision.sourceDocumentId,
        category: revision.category,
        detectedRevision: revision.detectedRevision,
        latestKnownRevision: revision.latestKnownRevision,
        isCurrentRevision: revision.isCurrentRevision ?? undefined,
        lastCheckedAt: revision.lastCheckedAt || undefined,
        searchSummary: revision.searchSummary,
        status: revision.status,
      } as DocumentRevision, defaultModel);
      const sanitizedUpdates = {
        ...updates,
        isCurrentRevision: updates.isCurrentRevision ?? undefined,
        lastCheckedAt: updates.lastCheckedAt ?? undefined,
      };
      await updateDocumentRevision({ revisionId: revision._id, ...sanitizedUpdates });
    } catch (err) {
      await updateDocumentRevision({
        revisionId: revision._id,
        status: 'error',
        searchSummary: `Error: ${getConvexErrorMessage(err)}`,
      });
    } finally {
      setCheckingId(null);
    }
  };

  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    setError(null);

    try {
      const checker = new RevisionChecker();
      for (const revision of documentRevisions) {
        if (revision.detectedRevision === 'No revision detected') continue;
        await updateDocumentRevision({ revisionId: revision._id, status: 'checking' });
        const updates = await checker.checkCurrentRevision({
          id: revision.originalId || revision._id,
          documentName: revision.documentName,
          documentType: revision.documentType,
          sourceDocumentId: revision.sourceDocumentId,
          category: revision.category,
          detectedRevision: revision.detectedRevision,
          latestKnownRevision: revision.latestKnownRevision,
          isCurrentRevision: revision.isCurrentRevision ?? undefined,
          lastCheckedAt: revision.lastCheckedAt || undefined,
          searchSummary: revision.searchSummary,
          status: revision.status,
        } as DocumentRevision, defaultModel);
        const sanitizedUpdates = {
          ...updates,
          isCurrentRevision: updates.isCurrentRevision ?? undefined,
          lastCheckedAt: updates.lastCheckedAt ?? undefined,
        };
        await updateDocumentRevision({ revisionId: revision._id, ...sanitizedUpdates });
      }
    } catch (err) {
      setError(`Failed to check revisions: ${getConvexErrorMessage(err)}`);
    } finally {
      setIsCheckingAll(false);
    }
  };

  const handleMoveRevision = async (revisionId: string, toPile: PileId) => {
    const typeMap: Record<PileId, string> = {
      faa: 'regulatory',
      type: 'regulatory',
      entity: 'entity',
      other: 'uploaded',
    };
    await updateDocumentRevision({ revisionId: revisionId as any, documentType: typeMap[toPile], category: toPile } as any);
  };

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Revision Tracker
        </h1>
        <p className="text-white/60 text-lg">
          Track document revision levels and verify they are current using AI web search
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 flex items-start gap-3">
          <FiAlertOctagon className="text-xl flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm text-red-300/80">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-auto text-red-300/60 hover:text-red-300">
            &times;
          </button>
        </div>
      )}

      <div className="space-y-3 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-white/80">Attach images (optional)</span>
          <p className="text-xs text-white/60 w-full">Photos of nameplates or document covers to help detect revision levels.</p>
          <input
            ref={revisionImageInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            onChange={handleRevisionImageAttach}
            className="hidden"
            disabled={isScanning}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => revisionImageInputRef.current?.click()}
            disabled={isScanning}
            icon={<FiImage />}
          >
            Choose images
          </Button>
          {revisionAttachedImages.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {revisionAttachedImages.map((img, i) => (
                <li key={i} className="flex items-center gap-2 py-1.5 px-2 bg-white/5 rounded-lg text-sm">
                  <span className="truncate max-w-[140px] text-white/80">{img.name}</span>
                  <button
                    type="button"
                    onClick={() => removeRevisionImage(i)}
                    disabled={isScanning}
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
        <div className="flex flex-wrap gap-3">
        <Button
          size="lg"
          onClick={handleScanDocuments}
          disabled={isScanning}
          loading={isScanning}
          icon={!isScanning ? <FiSearch /> : undefined}
        >
          {isScanning ? 'Scanning...' : 'Scan All Documents'}
        </Button>

        {documentRevisions.length > 0 && (
          <Button
            variant="warning"
            size="lg"
            onClick={handleCheckAll}
            disabled={isCheckingAll || isScanning}
            loading={isCheckingAll}
            icon={!isCheckingAll ? <FiGlobe /> : undefined}
          >
            {isCheckingAll ? 'Checking...' : 'Verify All via Web Search'}
          </Button>
        )}
        </div>
        {mismatchCount > 0 && (
          <div className="text-sm text-amber-300/90">
            {mismatchCount} manual revision mismatch{mismatchCount !== 1 ? 'es' : ''} found.
            <button
              type="button"
              className="ml-2 text-sky-lighter hover:underline"
              onClick={() => navigate('/manual-management?revisionMismatches=1')}
            >
              Review in Manual Management
            </button>
          </div>
        )}
        {isAdmin && (
          <div className="text-xs text-white/50">
            Reference document revision workflows are managed in Admin.
          </div>
        )}
      </div>

      {documentRevisions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Documents" value={totalDocs} color="text-white" bgColor="from-white/10 to-white/5" />
          <SummaryCard label="Current" value={currentCount} color="text-green-400" bgColor="from-green-500/20 to-green-500/5" />
          <SummaryCard label="Outdated" value={outdatedCount} color="text-amber-400" bgColor="from-amber-500/20 to-amber-500/5" />
          <SummaryCard label="Not Checked" value={unknownCount} color="text-white/60" bgColor="from-white/10 to-white/5" />
        </div>
      )}

      {documentRevisions.length === 0 ? (
        <GlassCard>
          <div className="text-center py-16">
            <FiRefreshCw className="text-6xl text-white/20 mx-auto mb-4" />
            <p className="text-white/60 text-lg">No revision data yet</p>
            <p className="text-white/70 text-sm mt-2 max-w-md mx-auto">
              Click "Scan All Documents" to analyze your project documents and detect their revision levels.
              Then use "Verify All via Web Search" to check if they are current.
            </p>
          </div>
        </GlassCard>
      ) : (
        <>
          <p className="text-xs text-white/40 mb-3">Drag cards between piles to reclassify documents.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {PILES.map((pile) => {
              const PileIcon = pile.icon;
              const pileRevisions = documentRevisions.filter((r: any) => getRevisionPile(r) === pile.id);
              const isOver = hoverPile === pile.id;
              return (
                <div
                  key={pile.id}
                  onDragOver={(e) => { e.preventDefault(); setHoverPile(pile.id); }}
                  onDragLeave={() => setHoverPile(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setHoverPile(null);
                    if (draggingId) {
                      const current = documentRevisions.find((r: any) => r._id === draggingId);
                      if (current && getRevisionPile(current) !== pile.id) {
                        handleMoveRevision(draggingId, pile.id);
                      }
                      setDraggingId(null);
                    }
                  }}
                  className={`rounded-xl border transition-all ${isOver ? `ring-2 ${pile.ring} ${pile.dropBg} border-transparent` : 'border-white/10 bg-white/[0.03]'}`}
                >
                  {/* Pile header */}
                  <div className={`flex items-center justify-between gap-2 px-4 py-3 rounded-t-xl ${pile.headerBg}`}>
                    <div className="flex items-center gap-2">
                      <PileIcon className="text-white/70 text-sm" />
                      <span className="text-sm font-semibold text-white">{pile.label}</span>
                    </div>
                    <span className="text-xs text-white/50 bg-white/10 px-2 py-0.5 rounded-full">{pileRevisions.length}</span>
                  </div>

                  {/* Pile cards */}
                  <div className="p-3 space-y-2 min-h-[100px]">
                    {pileRevisions.length === 0 ? (
                      <div className="flex items-center justify-center h-20 text-xs text-white/30 border-2 border-dashed border-white/10 rounded-lg">
                        Drop documents here
                      </div>
                    ) : (
                      pileRevisions.map((rev: any) => (
                        <RevisionRow
                          key={rev._id}
                          revision={rev}
                          isChecking={checkingId === rev._id || rev.status === 'checking'}
                          onCheck={() => handleCheckSingle(rev)}
                          disabled={isCheckingAll}
                          draggable
                          onDragStart={() => setDraggingId(rev._id)}
                          onDragEnd={() => setDraggingId(null)}
                          isDragging={draggingId === rev._id}
                          hasManualMismatch={mismatchedSourceIds.has(String(rev.sourceDocumentId))}
                        />
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, bgColor }: { label: string; value: number; color: string; bgColor: string }) {
  return (
    <div className={`glass rounded-xl p-4 bg-gradient-to-br ${bgColor}`}>
      <div className={`text-3xl font-display font-bold ${color}`}>{value}</div>
      <div className="text-sm text-white/60 mt-1">{label}</div>
    </div>
  );
}

function RevisionRow({
  revision,
  isChecking,
  onCheck,
  disabled,
  draggable,
  onDragStart,
  onDragEnd,
  isDragging,
  hasManualMismatch,
}: {
  revision: any;
  isChecking: boolean;
  onCheck: () => void;
  disabled: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  hasManualMismatch?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = statusConfig[revision.status as RevisionStatus].icon;
  const statusColor = statusConfig[revision.status as RevisionStatus].color;
  const statusLabel = statusConfig[revision.status as RevisionStatus].label;
  const TypeIcon = typeIcons[revision.documentType as keyof typeof typeIcons] ?? FiFile;

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`bg-white/5 hover:bg-white/10 rounded-xl transition-all ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex flex-col items-start sm:flex-row sm:items-center gap-3 p-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky to-sky-light flex items-center justify-center flex-shrink-0">
          <TypeIcon className="text-white" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="font-medium flex items-center gap-2 min-w-0">
            <span className="truncate min-w-0" title={revision.documentName}>
              {revision.documentName}
            </span>
            <Badge
              size="sm"
              variant={
                revision.documentType === 'regulatory' ? 'info'
                : revision.documentType === 'uploaded' ? 'success'
                : revision.documentType === 'reference' ? 'info'
                : 'default'
              }
              className="flex-shrink-0"
            >
              {revision.documentType}
            </Badge>
            {revision.category && (
              <Badge size="sm" className="flex-shrink-0">
                {revision.category}
              </Badge>
            )}
            {hasManualMismatch && (
              <Badge size="sm" variant="warning" className="flex-shrink-0">
                Manual mismatch
              </Badge>
            )}
          </div>
          <div className="text-sm text-white/60 flex flex-wrap items-center gap-x-4 gap-y-1 mt-1">
            <span>
              Detected: <span className="text-white/80 font-medium">{revision.detectedRevision}</span>
            </span>
            {revision.latestKnownRevision && (
              <span>
                Latest: <span className={`font-medium ${revision.isCurrentRevision === false ? 'text-amber-400' : 'text-green-400'}`}>
                  {revision.latestKnownRevision}
                </span>
              </span>
            )}
            {revision.lastCheckedAt && (
              <span className="text-white/70">
                Checked: {new Date(revision.lastCheckedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 ${statusColor}`}>
          <StatusIcon className={`text-sm ${isChecking ? 'animate-spin' : ''}`} />
          <span className="text-xs font-medium">{statusLabel}</span>
        </div>

        <button
          onClick={onCheck}
          disabled={disabled || isChecking || revision.detectedRevision === 'No revision detected'}
          className="w-full sm:w-auto px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
          title={revision.detectedRevision === 'No revision detected' ? 'No revision detected to verify' : 'Check if current via web search'}
        >
          <FiGlobe className="text-xs" />
          Check
        </button>

        {revision.searchSummary && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full sm:w-auto px-2 py-1.5 text-white/70 hover:text-white/80 transition-colors text-sm"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        )}
      </div>

      {expanded && revision.searchSummary && (
        <div className="px-4 pb-4">
          <div className="p-3 bg-white/5 rounded-lg text-sm text-white/70 sm:ml-14">
            <p className="font-medium text-white/80 mb-1">AI Search Summary:</p>
            <p>{revision.searchSummary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
