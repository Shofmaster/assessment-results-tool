import { useMemo, useState } from 'react';
import { FiBook, FiExternalLink, FiFolder, FiTrash2 } from 'react-icons/fi';
import {
  useAddDocument,
  useCompanyFeaturePolicy,
  useDocuments,
  useRecordStandardsAttestation,
  useRemoveDocument,
} from '../hooks/useConvexData';
import {
  STANDARDS_REFERENCE_CATEGORIES,
  isStandardsReferenceCategory,
  type StandardsReferenceCategory,
} from '../constants/localReference';
import {
  isLocalFileAccessSupported,
  pickAndEnumerateManualsDirectory,
  type LocalDirectoryEntry,
} from '../services/localFileAccess';
import { fetchFileFromServer, type DocumentServerConfig } from '../services/httpServerSource';
import { ManualsServerModal } from './ManualsServerModal';
import { sha256Hex } from '../utils/uploadFile';
import { getConvexErrorMessage } from '../utils/convexError';
import type { Id } from '../../convex/_generated/dataModel';
import { Badge, Button, GlassCard } from './ui';
import { toast } from 'sonner';

const STANDARD_LABELS: Record<StandardsReferenceCategory, string> = {
  isbao_standard: 'IS-BAO / ICAO',
  as9100_standard: 'AS9100 / AS9110',
  isbah_standard: 'IS-BAH',
  audit_criteria: 'ARGUS / Wyvern audit criteria',
};

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  xml: 'application/xml',
};

function guessMimeFromPath(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

interface Props {
  companyId: string;
  projectId: string | null | undefined;
}

/**
 * Per-company compliance-standards registration (no-copy). Standards are copyrighted
 * third-party material the platform must not store or redistribute, so this panel
 * registers each tenant's own licensed copy as a metadata-only `documents` row — the
 * file stays on the customer's linked folder or HTTP server and is read on demand at
 * audit time (see useStandardsAgentDocs). A one-time per-company license attestation is
 * required before any standard can be registered.
 *
 * Note: when an AeroGap admin has enabled the legacy `allowStandardsStorage` escape hatch
 * for this company, standards still flow through the legacy shared-KB path and these
 * registrations are not consumed by the auditors — the panel surfaces that state.
 */
export default function StandardsLibrary({ companyId, projectId }: Props) {
  const policy = useCompanyFeaturePolicy(companyId || undefined) as
    | { allowStandardsStorage?: boolean; standardsLicenseAttestation?: { acceptedAt: string; acceptedByUserId: string } }
    | null
    | undefined;
  const docs = (useDocuments(projectId ?? undefined) || []) as any[];
  const addDocument = useAddDocument();
  const removeDocument = useRemoveDocument();
  const recordAttestation = useRecordStandardsAttestation();

  const [selectedCategory, setSelectedCategory] = useState<StandardsReferenceCategory>(
    STANDARDS_REFERENCE_CATEGORIES[0],
  );
  const [attestChecked, setAttestChecked] = useState(false);
  const [serverModalOpen, setServerModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const legacyStorageOn = policy?.allowStandardsStorage === true;
  const attestation = policy?.standardsLicenseAttestation;
  const hasAttestation = !!attestation;
  const canRegister = !!projectId && (hasAttestation || attestChecked) && !busy;

  const standardsDocs = useMemo(
    () => docs.filter((d) => typeof d.category === 'string' && isStandardsReferenceCategory(d.category)),
    [docs],
  );
  const docsByCategory = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const d of standardsDocs) {
      (map[d.category] ||= []).push(d);
    }
    return map;
  }, [standardsDocs]);

  /** Persist the per-company attestation on first use; returns false if it can't proceed. */
  const ensureAttestation = async (): Promise<boolean> => {
    if (hasAttestation) return true;
    if (!attestChecked) {
      toast.error('Please confirm the license attestation first.');
      return false;
    }
    try {
      await recordAttestation({ companyId: companyId as any });
      return true;
    } catch (err) {
      toast.error(getConvexErrorMessage(err));
      return false;
    }
  };

  const registerEntries = async (
    entries: LocalDirectoryEntry[],
    opts: { source: 'local' | 'http-server'; documentSourceId?: string },
  ) => {
    if (!projectId) {
      toast.error('Select a project in this company first.');
      return;
    }
    setBusy(true);
    const now = new Date().toISOString();
    let success = 0;
    const failed: string[] = [];
    try {
      for (const { file, relativePath } of entries) {
        try {
          const buffer = await file.arrayBuffer();
          const contentHash = await sha256Hex(buffer);
          await addDocument({
            projectId: projectId as any,
            category: selectedCategory,
            name: file.name,
            path: relativePath,
            source: opts.source,
            mimeType: file.type || guessMimeFromPath(file.name),
            size: file.size,
            contentHash,
            documentSourceId: opts.documentSourceId as Id<'documentSources'> | undefined,
            extractedAt: now,
          });
          success += 1;
        } catch {
          failed.push(relativePath);
        }
      }
    } finally {
      setBusy(false);
    }
    if (success > 0) {
      toast.success(`Registered ${success} standard file${success === 1 ? '' : 's'} (no copy stored).`);
    }
    if (failed.length > 0) {
      toast.error(`Failed to register ${failed.length} file${failed.length === 1 ? '' : 's'}.`, {
        description: failed.slice(0, 5).join(', ').slice(0, 200),
      });
    }
  };

  const handleLinkFolder = async () => {
    if (!(await ensureAttestation())) return;
    if (!isLocalFileAccessSupported()) {
      toast.error('Linking a standards folder requires Chrome or Edge.');
      return;
    }
    try {
      const { entries } = await pickAndEnumerateManualsDirectory();
      if (!entries.length) {
        toast.message('No files found in that folder.');
        return;
      }
      await registerEntries(entries, { source: 'local' });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(getConvexErrorMessage(err));
    }
  };

  const handleOpenServerModal = async () => {
    if (!(await ensureAttestation())) return;
    setServerModalOpen(true);
  };

  const handleRegisterServer = async (config: DocumentServerConfig, paths: string[]) => {
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
      toast.error(`Could not read ${failed.length} file${failed.length === 1 ? '' : 's'} from the server.`, {
        description: failed.slice(0, 5).join(', ').slice(0, 200),
      });
    }
    if (entries.length > 0) {
      await registerEntries(entries, { source: 'http-server', documentSourceId: config.id });
    }
  };

  const handleRemove = async (documentId: string, name: string) => {
    try {
      await removeDocument({ documentId: documentId as Id<'documents'> });
      toast.success(`Removed "${name}".`);
    } catch (err) {
      toast.error(getConvexErrorMessage(err));
    }
  };

  return (
    <GlassCard className="mb-6">
      <div className="flex items-center gap-2 mb-1">
        <FiBook />
        <h2 className="text-lg font-semibold">Compliance standards (licensed reference)</h2>
      </div>
      <p className="text-xs text-white/55 mb-4 leading-relaxed">
        Copyrighted standards (IS-BAO, AS9100, IS-BAH, ARGUS/Wyvern) are referenced from your own
        licensed copy, never stored or redistributed by us. Link a folder on your computer (or a
        mapped network share — requires Chrome or Edge) or connect a server you host; the app reads
        each file on demand at audit time and keeps only metadata (name, path, hash).
      </p>

      {legacyStorageOn ? (
        <div className="mb-4 rounded-lg border border-amber-300/25 bg-amber-500/10 p-3 text-xs text-amber-100">
          Legacy standards storage is ON for this company (set by an AeroGap admin). Audits use the
          shared knowledge base; standards registered here will not be consumed until that is turned
          off.
        </div>
      ) : null}

      <div className="mb-4">
        <label className="block text-sm text-white/80 mb-1">Standard</label>
        <div className="flex flex-wrap gap-2">
          {STANDARDS_REFERENCE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                selectedCategory === cat
                  ? 'border-sky-light/50 bg-sky/20 text-white'
                  : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {STANDARD_LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {hasAttestation ? (
        <p className="mb-4 text-[11px] text-white/45">
          License attested on {new Date(attestation!.acceptedAt).toLocaleDateString()}.
        </p>
      ) : (
        <label className="mb-4 flex items-start gap-2 text-xs text-white/75">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={attestChecked}
            onChange={(e) => setAttestChecked(e.target.checked)}
          />
          <span>
            I represent that this organization holds a valid, current license to the standard(s) it
            registers here, and is permitted to use them for internal compliance review.
          </span>
        </label>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon={<FiFolder />} onClick={handleLinkFolder} disabled={!canRegister}>
          Link standard folder
        </Button>
        <Button
          variant="secondary"
          icon={<FiExternalLink />}
          onClick={handleOpenServerModal}
          disabled={!canRegister}
        >
          Connect standards server
        </Button>
      </div>

      {!projectId ? (
        <p className="mt-3 text-xs text-amber-200/80">Select a project in this company to register standards.</p>
      ) : null}

      <div className="mt-6 space-y-4">
        {STANDARDS_REFERENCE_CATEGORIES.map((cat) => {
          const list = docsByCategory[cat] || [];
          if (list.length === 0) return null;
          return (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-white/85">{STANDARD_LABELS[cat]}</span>
                <Badge>{list.length}</Badge>
              </div>
              <ul className="space-y-1">
                {list.map((d) => (
                  <li
                    key={d._id}
                    className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white truncate" title={d.name}>
                        {d.name}
                      </p>
                      <p className="text-[11px] text-white/45 truncate" title={d.path}>
                        {d.source === 'http-server' ? 'server' : 'local'} · {d.path}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleRemove(String(d._id), d.name)}
                      className="text-xs px-2 py-1 rounded border border-red-400/40 text-red-300 hover:bg-red-500/10 inline-flex items-center gap-1"
                    >
                      <FiTrash2 /> Remove
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {standardsDocs.length === 0 ? (
          <p className="text-xs text-white/45">No standards registered yet for this project.</p>
        ) : null}
      </div>

      {projectId ? (
        <ManualsServerModal
          open={serverModalOpen}
          projectId={projectId as Id<'projects'>}
          onClose={() => setServerModalOpen(false)}
          onRegister={handleRegisterServer}
        />
      ) : null}
    </GlassCard>
  );
}
