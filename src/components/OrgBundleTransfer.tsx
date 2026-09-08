import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { FiDownload, FiInfo, FiUploadCloud } from 'react-icons/fi';
import { useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { useImportOrgBundle } from '../hooks/useConvexData';
import {
  ORG_BUNDLE_SCOPE_SUMMARY,
  orgBundleFilename,
  consumeDesktopPendingOrgBundle,
  downloadOrgBundle,
  readOrgBundleFile,
  type OrgBundle,
} from '../utils/orgBundle';

type Props = {
  companyId?: string;
  companyName?: string;
  compact?: boolean;
};

export function OrgBundleActions({ companyId, companyName, compact = false }: Props) {
  const convex = useConvex();
  const importBundle = useImportOrgBundle();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleExport = useCallback(async () => {
    if (!companyId) return;
    setExporting(true);
    try {
      const bundle = await convex.query(api.orgBundle.exportOrgBundle, {
        companyId: companyId as Id<'companies'>,
      });
      downloadOrgBundle(bundle as OrgBundle, orgBundleFilename(companyName || bundle.company.name));
      toast.success('Organization bundle downloaded');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [convex, companyId, companyName]);

  const runImport = useCallback(
    async (parsed: OrgBundle, nameOverride?: string) => {
      setImporting(true);
      try {
        const result = await importBundle({
          bundle: parsed,
          targetCompanyId: companyId ? (companyId as Id<'companies'>) : undefined,
          companyNameOverride: nameOverride?.trim() || undefined,
        });
        toast.success(
          `Imported: ${result.entityProfileCount} entity profiles, ${result.certificateProfileCount} certificates, ${result.personnelCount} personnel`,
        );
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Import failed');
      } finally {
        setImporting(false);
      }
    },
    [companyId, importBundle],
  );

  const handleFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      try {
        const parsed = await readOrgBundleFile(file);
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
          Share company data between hosted AeroGap and desktop installations.{' '}
          {ORG_BUNDLE_SCOPE_SUMMARY}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {companyId ? (
          <button
            type="button"
            disabled={exporting}
            onClick={() => void handleExport()}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-2 font-inter text-sm text-white/90 hover:bg-white/10 disabled:opacity-60"
          >
            <FiDownload />
            {exporting ? 'Exporting…' : 'Export organization'}
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
              {importing ? 'Importing…' : 'Import organization'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".aqo.json,application/json,.json"
              className="hidden"
              onChange={(event) => void handleFile(event.target.files?.[0])}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

export default function OrgImportPage() {
  const navigate = useNavigate();
  const importBundle = useImportOrgBundle();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [bundle, setBundle] = useState<OrgBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const desktopBundle = await consumeDesktopPendingOrgBundle();
        if (cancelled || !desktopBundle) return;
        setBundle(desktopBundle);
        setPendingName(desktopBundle.company.name);
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
        companyNameOverride: pendingName.trim() || undefined,
      });
      toast.success(
        `Imported ${result.entityProfileCount} entity profiles, ${result.certificateProfileCount} certificates, ${result.personnelCount} personnel`,
      );
      navigate('/companies', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-900 to-navy-700 px-6 py-10">
      <div className="glass w-full max-w-lg rounded-2xl p-8">
        <h1 className="font-poppins text-2xl font-bold text-white">Import organization bundle</h1>
        <p className="mt-2 font-inter text-sm text-white/70">{ORG_BUNDLE_SCOPE_SUMMARY}</p>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-white/10 bg-black/20 p-3 font-inter text-xs text-white/60">
          <FiInfo className="mt-0.5 shrink-0 text-sky-300" />
          <span>
            Accounts are not shared between hosted and desktop AeroGap. Import creates a new
            company (or merges into an existing one) under your local account.
          </span>
        </div>

        {bundle ? (
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1 block font-inter text-sm text-white/80">Company name on this machine</span>
              <input
                value={pendingName}
                onChange={(event) => setPendingName(event.target.value)}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-white focus:border-sky-400/50 focus:outline-none"
              />
            </label>
            {bundle.entityProfiles?.length || bundle.rosterPersonnel?.length ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 font-inter text-xs text-white/50">
                <p>Bundle contains:</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {bundle.entityProfiles?.length ? (
                    <li>{bundle.entityProfiles.length} entity profile(s)</li>
                  ) : null}
                  {bundle.certificateProfiles?.length ? (
                    <li>{bundle.certificateProfiles.length} certificate profile(s)</li>
                  ) : null}
                  {bundle.rosterPersonnel?.length ? (
                    <li>{bundle.rosterPersonnel.length} personnel record(s)</li>
                  ) : null}
                  {bundle.rosterRequirementTypes?.length ? (
                    <li>{bundle.rosterRequirementTypes.length} requirement type(s)</li>
                  ) : null}
                  {bundle.rosterAssignments?.length ? (
                    <li>{bundle.rosterAssignments.length} training assignment(s)</li>
                  ) : null}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              disabled={busy || !pendingName.trim()}
              onClick={() => void confirmImport()}
              className="w-full rounded-lg bg-sky-500 py-2.5 font-inter font-medium text-white hover:bg-sky-400 disabled:opacity-60"
            >
              {busy ? 'Importing…' : 'Import organization'}
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
              Choose .aqo.json file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".aqo.json,application/json,.json"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setBusy(true);
                setError(null);
                try {
                  const parsed = await readOrgBundleFile(file);
                  setBundle(parsed);
                  setPendingName(parsed.company.name);
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
