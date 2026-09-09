import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FiDownload, FiInfo, FiUploadCloud } from 'react-icons/fi';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useImportProjectBundle, useUpsertUserSettings } from '../hooks/useConvexData';
import { useAppStore } from '../store/appStore';
import {
  BUNDLE_SCOPE_SUMMARY,
  bundleFilename,
  consumeDesktopPendingBundle,
  downloadProjectBundle,
  readProjectBundleFile,
  type ProjectBundle,
} from '../utils/projectBundle';

type Props = {
  companyId?: string;
  exportProjectId?: string;
  exportProjectName?: string;
  compact?: boolean;
};

export function ProjectBundleActions({
  companyId,
  exportProjectId,
  exportProjectName,
  compact = false,
}: Props) {
  const convex = useConvex();
  const importBundle = useImportProjectBundle();
  const upsertSettings = useUpsertUserSettings();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!exportProjectId) return;
    setExporting(true);
    try {
      const bundle = await convex.query(api.projects.exportBundle, {
        projectId: exportProjectId as Id<'projects'>,
      });
      downloadProjectBundle(bundle as ProjectBundle, bundleFilename(exportProjectName || bundle.project.name));
      toast.success('Project bundle downloaded');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [convex, exportProjectId, exportProjectName]);

  const runImport = useCallback(
    async (parsed: ProjectBundle, nameOverride?: string) => {
      setImporting(true);
      try {
        const result = await importBundle({
          bundle: parsed,
          companyId: companyId as Id<'companies'> | undefined,
          nameOverride: nameOverride?.trim() || undefined,
        });
        const projectId = String(result.projectId);
        setActiveProjectId(projectId);
        await upsertSettings({ activeProjectId: projectId as Id<'projects'> });
        toast.success(`Imported "${parsed.project.name}"`);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Import failed');
      } finally {
        setImporting(false);
      }
    },
    [companyId, importBundle, setActiveProjectId, upsertSettings],
  );

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const parsed = await readProjectBundleFile(file);
        await runImport(parsed);
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Could not read bundle');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [runImport],
  );

  return (
    <div className={compact ? 'flex flex-wrap gap-2' : 'space-y-3'}>
      {!compact && (
        <p className="font-inter text-sm text-white/65">
          Move audit work between hosted AeroGap and this installation. {BUNDLE_SCOPE_SUMMARY}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {exportProjectId ? (
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-inter text-sm text-white/90 hover:bg-white/10 disabled:opacity-60"
          >
            <FiDownload />
            {exporting ? 'Exporting…' : 'Export bundle'}
          </button>
        ) : null}
        {!compact ? (
          <>
            <button
              type="button"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/15 px-3 py-2 font-inter text-sm text-sky-100 hover:bg-sky-500/25 disabled:opacity-60"
            >
              <FiUploadCloud />
              {importing ? 'Importing…' : 'Import bundle'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".aqp.json,application/json,.json"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function ProjectImportPage() {
  const navigate = useNavigate();
  const importBundle = useImportProjectBundle();
  const upsertSettings = useUpsertUserSettings();
  const setActiveProjectId = useAppStore((s) => s.setActiveProjectId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [bundle, setBundle] = useState<ProjectBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const desktopBundle = await consumeDesktopPendingBundle();
        if (cancelled || !desktopBundle) return;
        setBundle(desktopBundle);
        setPendingName(desktopBundle.project.name);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not read bundle');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const confirmImport = async () => {
    if (!bundle) return;
    setBusy(true);
    setError(null);
    try {
      const result = await importBundle({
        bundle,
        nameOverride: pendingName.trim() || undefined,
      });
      const projectId = String(result.projectId);
      setActiveProjectId(projectId);
      await upsertSettings({ activeProjectId: projectId as Id<'projects'> });
      toast.success('Project imported');
      navigate('/logbook', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 px-6 py-10">
      <div className="glass w-full max-w-lg rounded-2xl p-8">
        <h1 className="font-poppins text-2xl font-bold text-white">Import project bundle</h1>
        <p className="mt-2 font-inter text-sm text-white/70">{BUNDLE_SCOPE_SUMMARY}</p>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-3 font-inter text-xs text-white/60">
          <FiInfo className="mt-0.5 shrink-0 text-sky-300" />
          <span>
            Accounts are not shared between hosted and desktop AeroGap. Import creates a new project
            under your local account; your sign-in here stays separate from the cloud.
          </span>
        </div>

        {bundle ? (
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block font-inter text-sm text-white/80">Project name on this machine</span>
              <input
                value={pendingName}
                onChange={(event) => setPendingName(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-sky-400/50 focus:outline-none"
              />
            </label>
            <button
              type="button"
              disabled={busy || !pendingName.trim()}
              onClick={() => void confirmImport()}
              className="w-full rounded-lg bg-sky-500 py-2.5 font-inter font-medium text-white hover:bg-sky-400 disabled:opacity-60"
            >
              {busy ? 'Importing…' : 'Import project'}
            </button>
          </div>
        ) : (
          <div className="mt-6">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-400/30 bg-sky-500/15 px-4 py-2.5 font-inter text-sm text-sky-100 hover:bg-sky-500/25"
            >
              <FiUploadCloud />
              Choose .aqp.json file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".aqp.json,application/json,.json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError(null);
                try {
                  const parsed = await readProjectBundleFile(file);
                  setBundle(parsed);
                  setPendingName(parsed.project.name);
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Could not read bundle');
                } finally {
                  setBusy(false);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }
              }}
            />
          </div>
        )}

        {error ? (
          <p role="alert" className="mt-4 font-inter text-sm text-rose-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
