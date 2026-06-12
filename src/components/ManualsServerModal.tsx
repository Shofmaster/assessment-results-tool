import { useMemo, useState } from 'react';
import { useQuery, useConvex } from 'convex/react';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { setServerCredential } from '../services/serverCredentials';
import type { DocumentServerConfig, ServerAuthType } from '../services/httpServerSource';
import { getConvexErrorMessage } from '../utils/convexError';
import { Button, GlassModal, Input, Select } from './ui';

interface DocumentSourceRow {
  _id: Id<'documentSources'>;
  label: string;
  baseUrl: string;
  authType: string;
  headerName?: string;
  basicUsername?: string;
}

const AUTH_LABELS: Record<ServerAuthType, string> = {
  none: 'No authentication',
  bearer: 'Bearer token',
  basic: 'Basic auth (username + password)',
  apiKey: 'API key header',
};

export interface ManualsServerModalProps {
  open: boolean;
  projectId: Id<'projects'>;
  onClose: () => void;
  /** Parent fetches each path from the server (transiently) and registers metadata-only docs. */
  onRegister: (config: DocumentServerConfig, paths: string[]) => Promise<void>;
  /** Show the hint that files are auto-sorted by name into Library tabs (manuals flow only). */
  showAutoSortHint?: boolean;
}

/**
 * Connect a customer-hosted HTTP(S) manuals server: persist the non-secret config
 * (base URL + auth type) in Convex, keep the credential in this browser's IndexedDB
 * only, and register manual file paths as references (no copy stored). The resolver
 * fetches each file on demand directly from the customer server.
 */
export function ManualsServerModal({ open, projectId, onClose, onRegister, showAutoSortHint }: ManualsServerModalProps) {
  const convex = useConvex();
  const sources = useQuery(api.documentSources.listByProject, open ? { projectId } : 'skip') as
    | DocumentSourceRow[]
    | undefined;

  const [mode, setMode] = useState<'new' | string>('new');
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [authType, setAuthType] = useState<ServerAuthType>('none');
  const [headerName, setHeaderName] = useState('');
  const [basicUsername, setBasicUsername] = useState('');
  const [secret, setSecret] = useState('');
  const [paths, setPaths] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSource = useMemo(
    () => (mode === 'new' ? undefined : (sources ?? []).find((s) => String(s._id) === mode)),
    [mode, sources],
  );
  const effectiveAuthType: ServerAuthType = selectedSource
    ? (selectedSource.authType as ServerAuthType)
    : authType;

  const reset = () => {
    setMode('new');
    setLabel('');
    setBaseUrl('');
    setAuthType('none');
    setHeaderName('');
    setBasicUsername('');
    setSecret('');
    setPaths('');
    setError(null);
  };

  const handleClose = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError(null);
    const pathList = paths
      .split('\n')
      .map((p) => p.trim())
      .filter(Boolean);
    if (pathList.length === 0) {
      setError('Enter at least one file path on the server (one per line).');
      return;
    }

    setBusy(true);
    try {
      let config: DocumentServerConfig;

      if (mode === 'new') {
        const url = baseUrl.trim();
        if (!/^https?:\/\//i.test(url)) {
          setError('Server URL must start with http:// or https://');
          setBusy(false);
          return;
        }
        if (authType !== 'none' && !secret.trim()) {
          setError('Enter the server credential (stored only in this browser).');
          setBusy(false);
          return;
        }
        const sourceId = (await convex.mutation(api.documentSources.add, {
          projectId,
          label: label.trim() || url,
          baseUrl: url,
          authType,
          headerName: authType === 'apiKey' ? headerName.trim() || undefined : undefined,
          basicUsername: authType === 'basic' ? basicUsername.trim() || undefined : undefined,
        })) as Id<'documentSources'>;
        config = {
          id: String(sourceId),
          baseUrl: url,
          authType,
          headerName: authType === 'apiKey' ? headerName.trim() || undefined : undefined,
          basicUsername: authType === 'basic' ? basicUsername.trim() || undefined : undefined,
        };
        if (authType !== 'none') {
          await setServerCredential(String(sourceId), secret.trim());
        }
      } else {
        if (!selectedSource) {
          setError('Select a server.');
          setBusy(false);
          return;
        }
        config = {
          id: String(selectedSource._id),
          baseUrl: selectedSource.baseUrl,
          authType: selectedSource.authType as ServerAuthType,
          headerName: selectedSource.headerName,
          basicUsername: selectedSource.basicUsername,
        };
        // Re-entering the credential is optional — keep the one already in this browser if blank.
        if (secret.trim()) {
          await setServerCredential(String(selectedSource._id), secret.trim());
        }
      }

      await onRegister(config, pathList);
      reset();
      onClose();
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassModal
      open={open}
      title="Connect manuals server"
      onClose={handleClose}
      sizeClassName="max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Registering…' : 'Register manuals'}
          </Button>
        </>
      }
    >
      <p className="text-white/70 mb-4 text-xs leading-relaxed">
        Reference manuals hosted on your own HTTP(S) server (DMS or internal file server). The app
        fetches each file on demand directly from your server and never stores a copy. Your server
        must allow access from this app (CORS). The credential is kept only in this browser, never
        synced to our servers.
      </p>

      {sources && sources.length > 0 ? (
        <Select
          label="Server"
          selectSize="sm"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value);
            setSecret('');
            setError(null);
          }}
          className="mb-4"
        >
          {sources.map((s) => (
            <option key={String(s._id)} value={String(s._id)}>
              {s.label} ({s.baseUrl})
            </option>
          ))}
          <option value="new">+ Add a new server…</option>
        </Select>
      ) : null}

      {mode === 'new' ? (
        <div className="space-y-3">
          <Input
            label="Name"
            placeholder="e.g. Maintenance DMS"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Input
            label="Base URL"
            placeholder="https://manuals.example.com/files"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <Select
            label="Authentication"
            value={authType}
            onChange={(e) => setAuthType(e.target.value as ServerAuthType)}
          >
            {(Object.keys(AUTH_LABELS) as ServerAuthType[]).map((t) => (
              <option key={t} value={t}>
                {AUTH_LABELS[t]}
              </option>
            ))}
          </Select>
          {authType === 'apiKey' ? (
            <Input
              label="Header name"
              placeholder="X-Api-Key"
              value={headerName}
              onChange={(e) => setHeaderName(e.target.value)}
            />
          ) : null}
          {authType === 'basic' ? (
            <Input
              label="Username"
              placeholder="username"
              value={basicUsername}
              onChange={(e) => setBasicUsername(e.target.value)}
            />
          ) : null}
          {authType !== 'none' ? (
            <Input
              label={authType === 'basic' ? 'Password' : 'Credential'}
              type="password"
              placeholder="Stored only in this browser"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-white/60">
            Using <span className="text-white/85">{selectedSource?.baseUrl}</span> ·{' '}
            {AUTH_LABELS[effectiveAuthType]}
          </p>
          {effectiveAuthType !== 'none' ? (
            <Input
              label="Credential (optional)"
              type="password"
              placeholder="Leave blank to keep the one saved in this browser"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          ) : null}
        </div>
      )}

      <div className="mt-4">
        <label className="block text-sm font-medium mb-2 text-white/80">File paths on the server</label>
        <textarea
          className="w-full bg-white/10 border border-white/20 text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-sky-light transition-colors min-h-[120px] font-mono"
          placeholder={'manuals/cessna-208b/05-10-00.pdf\nmanuals/cessna-208b/ipc.pdf'}
          value={paths}
          onChange={(e) => setPaths(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-white/45">
          One path per line, relative to the base URL. Each file is fetched once now to verify access
          and fingerprint it — the bytes are not stored.
          {showAutoSortHint
            ? ' Files are auto-sorted by name: IPC/parts catalogs, logbook scans, and maintenance manuals (MM/AMM/GMM) each land under their own Library tab; unrecognized names stay on the current tab.'
            : ''}
        </p>
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
          {error}
        </p>
      ) : null}
    </GlassModal>
  );
}
