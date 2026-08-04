import { useEffect, useState } from 'react';
import { FiCloud, FiExternalLink, FiInfo, FiSave } from 'react-icons/fi';
import {
  Badge,
  Button,
  Field,
  PasswordInput,
  SaveStatus,
  SettingsCard,
  useSaveStatus,
} from '../../ui';

type DriveProbeStatus = 'ok' | 'needs_reconnect' | 'not_connected' | 'misconfigured';

type DriveProbeResult = {
  status: DriveProbeStatus;
  detail?: string;
};

function driveStatusBadge(probe: DriveProbeResult | null, driveConnected: boolean | undefined) {
  const status = probe?.status;
  if (status === 'ok') return <Badge variant="success">Connected</Badge>;
  if (status === 'needs_reconnect') return <Badge variant="warning">Needs reconnect</Badge>;
  if (status === 'misconfigured') return <Badge variant="destructive">Server misconfigured</Badge>;
  if (status === 'not_connected') return <Badge variant="default">Not connected</Badge>;
  if (driveConnected === true) return <Badge variant="success">Connected</Badge>;
  if (driveConnected === false) return <Badge variant="default">Not connected</Badge>;
  return null;
}

const GOOGLE_SETUP_STEPS = [
  <>
    Go to the{' '}
    <a
      href="https://console.cloud.google.com/"
      target="_blank"
      rel="noopener noreferrer"
      className="text-sky-light hover:underline inline-flex items-center gap-1"
    >
      Google Cloud Console
      <FiExternalLink className="text-sm" aria-hidden />
    </a>{' '}
    and create a project (or select an existing one).
  </>,
  <>
    Enable the <strong>Google Drive API</strong> and <strong>Google Picker API</strong> under
    &quot;APIs &amp; Services&quot;.
  </>,
  <>
    Under &quot;Credentials&quot;, create an <strong>OAuth 2.0 Client ID</strong> (type: Web
    application). Add{' '}
    <code className="px-1.5 py-0.5 bg-white/10 rounded text-sm">http://localhost:5173</code> to
    &quot;Authorized JavaScript origins&quot;.
  </>,
  <>
    Also create an <strong>API Key</strong> under &quot;Credentials&quot;.
  </>,
  <>Paste both values in the fields above and save.</>,
];

export function IntegrationsSection({
  settings,
  upsertSettings,
  driveConnected,
  sharedGoogleConfigured,
  driveBusy,
  onDriveConnect,
  onDriveDisconnect,
  onDriveProbe,
  avianisStatus,
  activeProjectId,
  onAvianisTest,
  onAvianisSync,
}: {
  settings: Record<string, any> | undefined | null;
  upsertSettings: (patch: Record<string, unknown>) => Promise<unknown>;
  driveConnected: boolean | undefined;
  sharedGoogleConfigured: boolean;
  driveBusy: boolean;
  onDriveConnect: () => void;
  onDriveDisconnect: () => void;
  onDriveProbe: () => Promise<DriveProbeResult>;
  avianisStatus: Record<string, any> | undefined | null;
  activeProjectId: string | null | undefined;
  onAvianisTest: () => Promise<{ ok: boolean; message: string }>;
  onAvianisSync: () => Promise<string>;
}) {
  const googleSave = useSaveStatus();
  const avianisSave = useSaveStatus();

  const [gClientId, setGClientId] = useState('');
  const [gApiKey, setGApiKey] = useState('');

  const [avAuthMethod, setAvAuthMethod] = useState<'api_key' | 'oauth2' | 'password'>('api_key');
  const [avBaseUrl, setAvBaseUrl] = useState('');
  const [avTenantId, setAvTenantId] = useState('');
  const [avApiKey, setAvApiKey] = useState('');
  const [avClientId, setAvClientId] = useState('');
  const [avClientSecret, setAvClientSecret] = useState('');
  const [avUsername, setAvUsername] = useState('');
  const [avPassword, setAvPassword] = useState('');
  const [avTesting, setAvTesting] = useState(false);
  const [avTestResult, setAvTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [avSyncing, setAvSyncing] = useState(false);
  const [avSyncMessage, setAvSyncMessage] = useState<string | null>(null);

  const [driveProbe, setDriveProbe] = useState<DriveProbeResult | null>(null);
  const [driveProbing, setDriveProbing] = useState(false);
  const [driveProbeError, setDriveProbeError] = useState<string | null>(null);

  // Adjusted during render rather than in an effect. Settings arrive asynchronously,
  // and hydrating on the render they land keeps the form from painting empty first.
  // Keyed on the settings document so later refreshes of the same doc don't stomp
  // fields the user is midway through editing.
  const [hydratedSettings, setHydratedSettings] = useState<unknown>(null);
  if (settings && hydratedSettings !== settings) {
    setHydratedSettings(settings);
    setGClientId(settings.googleClientId || '');
    setGApiKey(settings.googleApiKey || '');
    const method = settings.avianisAuthMethod;
    if (method === 'oauth2' || method === 'password' || method === 'api_key') {
      setAvAuthMethod(method);
    }
    setAvBaseUrl(settings.avianisBaseUrl || '');
    setAvTenantId(settings.avianisTenantId || '');
    setAvApiKey(settings.avianisApiKey || '');
    setAvClientId(settings.avianisClientId || '');
    setAvClientSecret(settings.avianisClientSecret || '');
    setAvUsername(settings.avianisUsername || '');
    setAvPassword(settings.avianisPassword || '');
  }

  const runDriveProbe = async () => {
    setDriveProbing(true);
    setDriveProbeError(null);
    try {
      const result = await onDriveProbe();
      setDriveProbe(result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Drive connection test failed';
      setDriveProbeError(message);
      return null;
    } finally {
      setDriveProbing(false);
    }
  };

  useEffect(() => {
    void runDriveProbe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driveConnected]);

  const handleGoogleSave = () =>
    void googleSave.run(() =>
      upsertSettings({
        googleClientId: gClientId.trim() || undefined,
        googleApiKey: gApiKey.trim() || undefined,
      }),
    );

  const handleAvianisSave = () =>
    void avianisSave.run(() =>
      upsertSettings({
        avianisAuthMethod: avAuthMethod,
        avianisBaseUrl: avBaseUrl.trim() || undefined,
        avianisTenantId: avTenantId.trim() || undefined,
        avianisApiKey: avAuthMethod === 'api_key' ? avApiKey.trim() || undefined : undefined,
        avianisClientId: avAuthMethod === 'oauth2' ? avClientId.trim() || undefined : undefined,
        avianisClientSecret:
          avAuthMethod === 'oauth2' ? avClientSecret.trim() || undefined : undefined,
        avianisUsername: avAuthMethod === 'password' ? avUsername.trim() || undefined : undefined,
        avianisPassword: avAuthMethod === 'password' ? avPassword || undefined : undefined,
      }),
    );

  const handleTest = async () => {
    setAvTesting(true);
    setAvTestResult(null);
    try {
      setAvTestResult(await onAvianisTest());
    } catch (err) {
      setAvTestResult({ ok: false, message: err instanceof Error ? err.message : 'Test failed' });
    } finally {
      setAvTesting(false);
    }
  };

  const handleSync = async () => {
    if (!activeProjectId) {
      setAvSyncMessage('Select an active project first.');
      return;
    }
    setAvSyncing(true);
    setAvSyncMessage(null);
    try {
      setAvSyncMessage(await onAvianisSync());
    } catch (err) {
      setAvSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setAvSyncing(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white focus:outline-none focus:border-sky-light transition-colors';

  return (
    <>
      {/* ── Google Drive ─────────────────────────────────────────────── */}
      <SettingsCard
        title="Google Drive Import"
        description="Connect once — stays linked for your account across reloads and sign-outs."
        icon={<FiCloud />}
        iconGradient="from-green-500 to-emerald-600"
        status={driveStatusBadge(driveProbe, driveConnected)}
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          {driveConnected === true && driveProbe?.status !== 'needs_reconnect' ? (
            <Button
              variant="secondary"
              disabled={driveBusy}
              onClick={() => {
                onDriveDisconnect();
                window.setTimeout(() => void runDriveProbe(), 400);
              }}
            >
              {driveBusy ? 'Working…' : 'Disconnect Google Drive'}
            </Button>
          ) : (
            <Button
              variant="success"
              disabled={driveBusy || !sharedGoogleConfigured}
              onClick={() => {
                onDriveConnect();
                window.setTimeout(() => void runDriveProbe(), 800);
              }}
            >
              {driveBusy
                ? 'Connecting…'
                : driveProbe?.status === 'needs_reconnect'
                  ? 'Reconnect Google Drive'
                  : 'Connect Google Drive'}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={driveProbing || driveBusy}
            onClick={() => void runDriveProbe()}
          >
            {driveProbing ? 'Testing…' : 'Test Drive connection'}
          </Button>
        </div>

        {driveProbe?.status === 'ok' ? (
          <p className="mb-4 text-sm text-green-100/90">Drive link is healthy.</p>
        ) : null}
        {driveProbe?.status === 'needs_reconnect' ? (
          <p className="mb-4 text-sm text-amber-200">
            {driveProbe.detail ||
              'Your Drive link expired. Reconnect to restore Ask and Library Drive search.'}
          </p>
        ) : null}
        {driveProbe?.status === 'misconfigured' ? (
          <p className="mb-4 text-sm text-rose-300">
            {driveProbe.detail || 'Persistent Drive auth is not configured on the server.'}
          </p>
        ) : null}
        {driveProbeError ? <p className="mb-4 text-sm text-rose-300">{driveProbeError}</p> : null}

        {sharedGoogleConfigured && (
          <div className="mb-4 flex items-start gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-sm text-green-100/90">
            <FiInfo className="text-green-300 flex-shrink-0 mt-0.5" aria-hidden />
            <div className="space-y-2">
              <p>
                After connecting once, Ask an Expert and Library search keep using your Drive
                manuals without another Google popup — including after reload or sign-out.
              </p>
              <p>
                <strong>Weekly reconnect means the Google app is still in Testing.</strong> Open{' '}
                <a
                  href="https://console.cloud.google.com/apis/credentials/consent"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-light hover:underline"
                >
                  OAuth consent screen
                </a>{' '}
                in Google Cloud and set Publishing status to <strong>In production</strong>.
                Apps left in Testing expire the Drive link after about 7 days.
              </p>
            </div>
          </div>
        )}

        <details className="group rounded-xl border border-white/10">
          <summary className="cursor-pointer list-none select-none px-4 py-3 text-sm font-medium text-white/80 hover:text-white flex items-center gap-2">
            <span aria-hidden className="transition-transform group-open:rotate-90">
              ▸
            </span>
            Advanced: use your own Google credentials
          </summary>
          <div className="px-4 pb-4 space-y-4">
            <p className="text-sm text-white/70">
              Optional override of the app-wide API credentials. Your Google account link is
              stored separately and securely on the server.
            </p>

            <Field label="Google Client ID">
              {({ id }) => (
                <PasswordInput
                  id={id}
                  secretName="Google Client ID"
                  value={gClientId}
                  onChange={(e) => setGClientId(e.target.value)}
                  placeholder="123456789-abcdef.apps.googleusercontent.com"
                />
              )}
            </Field>

            <Field label="Google API Key">
              {({ id }) => (
                <PasswordInput
                  id={id}
                  secretName="Google API key"
                  value={gApiKey}
                  onChange={(e) => setGApiKey(e.target.value)}
                  placeholder="AIzaSy..."
                />
              )}
            </Field>

            <div className="flex flex-wrap items-center gap-3">
              <Button icon={<FiSave />} onClick={handleGoogleSave}>
                Save Google credentials
              </Button>
              <SaveStatus state={googleSave.state} errorLabel={googleSave.error ?? undefined} />
            </div>

            <div className="pt-4 border-t border-white/10">
              <p className="text-sm font-medium text-white/80 mb-3">Setup instructions</p>
              <ol className="space-y-3 text-sm text-white/75">
                {GOOGLE_SETUP_STEPS.map((step, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span
                      aria-hidden
                      className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 text-xs font-bold text-green-400"
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </details>
      </SettingsCard>

      {/* ── Avianis ──────────────────────────────────────────────────── */}
      <SettingsCard
        title="Avianis Connection"
        description="Pull aircraft current times and open discrepancies from your Avianis tenant."
        icon={<FiCloud />}
        iconGradient="from-sky to-indigo-500"
        status={avianisStatus?.configured ? <Badge variant="success">Configured</Badge> : null}
      >
        <div className="space-y-4">
          <Field
            label="Authentication method"
            help='Avianis issues OAuth2 client credentials for API access. If "Test connection" is rejected, ask your Avianis/Portside rep to provision API credentials — a normal web login may not have API access.'
          >
            {({ id, describedBy }) => (
              <select
                id={id}
                aria-describedby={describedBy}
                value={avAuthMethod}
                onChange={(e) =>
                  setAvAuthMethod(e.target.value as 'api_key' | 'oauth2' | 'password')
                }
                className="w-full sm:w-72 px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors text-white"
              >
                <option value="api_key" className="bg-navy text-white">
                  API key / Bearer token
                </option>
                <option value="oauth2" className="bg-navy text-white">
                  OAuth2 client_credentials
                </option>
                <option value="password" className="bg-navy text-white">
                  Username + password
                </option>
              </select>
            )}
          </Field>

          <Field label="Base URL">
            {({ id }) => (
              <input
                id={id}
                type="text"
                value={avBaseUrl}
                onChange={(e) => setAvBaseUrl(e.target.value)}
                placeholder="https://api.avianis.io"
                className={inputClass}
              />
            )}
          </Field>

          <Field label="Tenant / Operator ID (optional)">
            {({ id }) => (
              <input
                id={id}
                type="text"
                value={avTenantId}
                onChange={(e) => setAvTenantId(e.target.value)}
                placeholder="e.g. ACME-CHARTER"
                className={inputClass}
              />
            )}
          </Field>

          {avAuthMethod === 'api_key' && (
            <Field label="API key">
              {({ id }) => (
                <PasswordInput
                  id={id}
                  secretName="Avianis API key"
                  value={avApiKey}
                  onChange={(e) => setAvApiKey(e.target.value)}
                  placeholder="Bearer token from Avianis"
                />
              )}
            </Field>
          )}

          {avAuthMethod === 'oauth2' && (
            <>
              <Field label="Client ID">
                {({ id }) => (
                  <input
                    id={id}
                    type="text"
                    value={avClientId}
                    onChange={(e) => setAvClientId(e.target.value)}
                    className={inputClass}
                  />
                )}
              </Field>
              <Field label="Client secret">
                {({ id }) => (
                  <PasswordInput
                    id={id}
                    secretName="Avianis client secret"
                    value={avClientSecret}
                    onChange={(e) => setAvClientSecret(e.target.value)}
                  />
                )}
              </Field>
            </>
          )}

          {avAuthMethod === 'password' && (
            <>
              <Field label="Username">
                {({ id }) => (
                  <input
                    id={id}
                    type="text"
                    value={avUsername}
                    onChange={(e) => setAvUsername(e.target.value)}
                    className={inputClass}
                  />
                )}
              </Field>
              <Field
                label="Password"
                help="Your normal Avianis login credentials, submitted via Avianis's OAuth2 client_credentials flow at /oauth/token."
              >
                {({ id, describedBy }) => (
                  <PasswordInput
                    id={id}
                    aria-describedby={describedBy}
                    secretName="Avianis password"
                    value={avPassword}
                    onChange={(e) => setAvPassword(e.target.value)}
                  />
                )}
              </Field>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button icon={<FiSave />} onClick={handleAvianisSave}>
              Save Avianis credentials
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleTest()}
              disabled={avTesting || !avianisStatus?.configured}
            >
              {avTesting ? 'Testing…' : 'Test connection'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => void handleSync()}
              disabled={avSyncing || !avianisStatus?.configured || !activeProjectId}
            >
              {avSyncing ? 'Syncing…' : 'Sync now'}
            </Button>
          </div>

          <SaveStatus state={avianisSave.state} errorLabel={avianisSave.error ?? undefined} />

          {avTestResult && (
            <p className={`text-sm ${avTestResult.ok ? 'text-green-300' : 'text-rose-300'}`}>
              {avTestResult.message}
            </p>
          )}
          {avSyncMessage && <p className="text-sm text-white/70">{avSyncMessage}</p>}
          {avianisStatus?.lastSyncedAt && (
            <p className="text-xs text-white/50">
              Last sync: {new Date(avianisStatus.lastSyncedAt).toLocaleString()}
            </p>
          )}
          {avianisStatus?.lastSyncError && (
            <p className="text-xs text-rose-300">
              Last sync error: {avianisStatus.lastSyncError}
            </p>
          )}
        </div>
      </SettingsCard>
    </>
  );
}
