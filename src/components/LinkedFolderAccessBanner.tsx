import { useCallback, useEffect, useState } from 'react';
import { FiFolder, FiAlertTriangle } from 'react-icons/fi';
import { Button } from './ui';
import {
  ensureFolderIndexWritable,
  ensureReadPermission,
  getLinkedFolder,
  getManualsFolderAccess,
  isDesktopFolderBridgeAvailable,
  type ManualsFolderAccess,
} from '../services/localFileAccess';

/**
 * Shown when a manuals folder is linked but Chromium needs a click before we
 * can read it, or when we can read but not write the shared search index.
 * Hidden in the desktop shell — native path linking does not use FSA prompts.
 */
export default function LinkedFolderAccessBanner({
  className,
  onGranted,
}: {
  className?: string;
  onGranted?: () => void;
}) {
  const [access, setAccess] = useState<ManualsFolderAccess | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (isDesktopFolderBridgeAvailable()) {
      setAccess({ status: 'none' });
      return;
    }
    try {
      setAccess(await getManualsFolderAccess());
    } catch {
      setAccess({ status: 'none' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const needsWrite = access?.status === 'granted' && access.canWrite === false;

  if (!access || access.status === 'none' || (access.status === 'granted' && access.canWrite)) {
    return null;
  }

  const handleAllow = async () => {
    setBusy(true);
    try {
      const folder = await getLinkedFolder();
      if (!folder || folder.kind !== 'fsa') {
        setAccess({ status: 'none' });
        return;
      }
      if (needsWrite) {
        const ok = await ensureFolderIndexWritable(folder);
        if (ok) {
          setAccess({ status: 'granted', name: folder.name || access.name, canWrite: true });
          onGranted?.();
          return;
        }
        await refresh();
        return;
      }
      const ok = await ensureReadPermission(folder);
      if (ok) {
        const canWrite = await ensureFolderIndexWritable(folder);
        setAccess({
          status: 'granted',
          name: folder.name || access.name,
          canWrite,
        });
        onGranted?.();
      } else {
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  const title = needsWrite ? 'Allow write access for search index' : 'Allow access to linked folder';
  const body = needsWrite
    ? 'AeroGap can read this folder but needs permission to create a .aerogap subfolder and save the shared search index (vectors only — no manual text).'
    : `${access.name} is linked, but this browser needs permission again before search can read manuals from it${
        access.status === 'denied' ? ' (access was denied)' : ''
      }.`;

  return (
    <div
      className={
        className ??
        'mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 p-3'
      }
      role="status"
    >
      <div className="min-w-0 flex-1 text-sm text-amber-50/90">
        <p className="flex items-center gap-2 font-semibold text-amber-100">
          <FiAlertTriangle aria-hidden /> {title}
        </p>
        <p className="mt-1 text-xs text-amber-50/70">
          <FiFolder className="mr-1 inline text-amber-200/80" aria-hidden />
          <span className="font-medium text-amber-100/90">{access.name}</span> — {body}
        </p>
        {needsWrite ? (
          <p className="mt-1 text-xs text-amber-50/55">
            If no prompt appears, use Link manuals folder again and pick the same folder (choose
            write/edit when asked).
          </p>
        ) : null}
      </div>
      <Button variant="primary" size="sm" onClick={() => void handleAllow()} disabled={busy}>
        {busy ? 'Allowing…' : needsWrite ? 'Allow write access' : 'Allow access'}
      </Button>
    </div>
  );
}
