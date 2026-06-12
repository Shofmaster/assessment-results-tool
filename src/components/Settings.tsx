import { useEffect, useState, useRef } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import {
  FiExternalLink,
  FiInfo,
  FiCloud,
  FiLogOut,
  FiUser,
  FiSave,
  FiCheck,
} from 'react-icons/fi';
import {
  useUpsertUserSettings,
  useUserSettings,
  useAvailableClaudeModels,
  useDefaultClaudeModel,
  useAuditSimModel,
  usePaperworkReviewModel,
  useDctTraceabilityModel,
  useMyAdminCompanies,
  useListWhereCanManageProjectsCompanies,
  useAvianisStatus,
  useTestAvianisConnection,
  useSyncAvianis,
} from '../hooks/useConvexData';
import { useAppStore } from '../store/appStore';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { useTheme } from '../context/ThemeContext';
import BillingSection from './billing/BillingSection';

export default function Settings() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const { preference, setPreference } = useTheme();
  const { signOut } = useClerk();
  const { user } = useUser();

  const settings = useUserSettings();
  const upsertSettings = useUpsertUserSettings();
  const myAdminCompanies = useMyAdminCompanies();
  const projectManageCompanies = useListWhereCanManageProjectsCompanies();
  const canOpenCompanyAdmin =
    (myAdminCompanies && myAdminCompanies.length > 0) ||
    (projectManageCompanies && projectManageCompanies.length > 0);
  const { models: claudeModels, loading: modelsLoading } = useAvailableClaudeModels();
  const defaultModel = useDefaultClaudeModel();
  const auditSimModel = useAuditSimModel();
  const paperworkReviewModel = usePaperworkReviewModel();
  const dctTraceabilityModel = useDctTraceabilityModel();

  const [gClientId, setGClientId] = useState('');
  const [gApiKey, setGApiKey] = useState('');
  const [showGClientId, setShowGClientId] = useState(false);
  const [showGApiKey, setShowGApiKey] = useState(false);
  const [gSaved, setGSaved] = useState(false);
  const [aiSaved, setAISaved] = useState(false);
  const [askDefaultsSaved, setAskDefaultsSaved] = useState(false);

  // --- Avianis state ---
  const avianisStatus = useAvianisStatus();
  const testAvianis = useTestAvianisConnection();
  const syncAvianis = useSyncAvianis();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const [avAuthMethod, setAvAuthMethod] = useState<'api_key' | 'oauth2' | 'password'>('api_key');
  const [avBaseUrl, setAvBaseUrl] = useState('');
  const [avTenantId, setAvTenantId] = useState('');
  const [avApiKey, setAvApiKey] = useState('');
  const [avClientId, setAvClientId] = useState('');
  const [avClientSecret, setAvClientSecret] = useState('');
  const [avUsername, setAvUsername] = useState('');
  const [avPassword, setAvPassword] = useState('');
  const [avSaved, setAvSaved] = useState(false);
  const [avTesting, setAvTesting] = useState(false);
  const [avTestResult, setAvTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [avSyncing, setAvSyncing] = useState(false);
  const [avSyncMessage, setAvSyncMessage] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setGClientId(settings.googleClientId || '');
      setGApiKey(settings.googleApiKey || '');
      const s = settings as Record<string, any>;
      const method = s.avianisAuthMethod;
      if (method === 'oauth2' || method === 'password' || method === 'api_key') {
        setAvAuthMethod(method);
      }
      setAvBaseUrl(s.avianisBaseUrl || '');
      setAvTenantId(s.avianisTenantId || '');
      setAvApiKey(s.avianisApiKey || '');
      setAvClientId(s.avianisClientId || '');
      setAvClientSecret(s.avianisClientSecret || '');
      setAvUsername(s.avianisUsername || '');
      setAvPassword(s.avianisPassword || '');
    }
  }, [settings]);

  const handleAvianisSave = async () => {
    await upsertSettings({
      avianisAuthMethod: avAuthMethod,
      avianisBaseUrl: avBaseUrl.trim() || undefined,
      avianisTenantId: avTenantId.trim() || undefined,
      avianisApiKey: avAuthMethod === 'api_key' ? avApiKey.trim() || undefined : undefined,
      avianisClientId: avAuthMethod === 'oauth2' ? avClientId.trim() || undefined : undefined,
      avianisClientSecret:
        avAuthMethod === 'oauth2' ? avClientSecret.trim() || undefined : undefined,
      avianisUsername: avAuthMethod === 'password' ? avUsername.trim() || undefined : undefined,
      avianisPassword: avAuthMethod === 'password' ? avPassword || undefined : undefined,
    } as any);
    setAvSaved(true);
    setTimeout(() => setAvSaved(false), 2000);
  };

  const handleAvianisTest = async () => {
    setAvTesting(true);
    setAvTestResult(null);
    try {
      const result = (await testAvianis({})) as { ok: boolean; message: string };
      setAvTestResult(result);
    } catch (err) {
      setAvTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Test failed',
      });
    } finally {
      setAvTesting(false);
    }
  };

  const handleAvianisSync = async () => {
    if (!activeProjectId) {
      setAvSyncMessage('Select an active project first.');
      return;
    }
    setAvSyncing(true);
    setAvSyncMessage(null);
    try {
      const result = (await syncAvianis({ projectId: activeProjectId as any })) as {
        aircraftSynced: number;
        discrepanciesSynced: number;
      };
      setAvSyncMessage(
        `Synced ${result.aircraftSynced} aircraft, ${result.discrepanciesSynced} discrepancies.`,
      );
    } catch (err) {
      setAvSyncMessage(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setAvSyncing(false);
    }
  };

  const handleAIModelSave = async (
    field: 'claudeModel' | 'auditSimModel' | 'paperworkReviewModel' | 'dctTraceabilityModel',
    value: string,
  ) => {
    await upsertSettings(
      field === 'claudeModel'
        ? { claudeModel: value }
        : field === 'auditSimModel'
          ? { auditSimModel: value }
          : field === 'paperworkReviewModel'
            ? { paperworkReviewModel: value }
            : { dctTraceabilityModel: value },
    );
    setAISaved(true);
    setTimeout(() => setAISaved(false), 2000);
  };

  const handleGoogleSave = async () => {
    await upsertSettings({
      googleClientId: gClientId.trim() || undefined,
      googleApiKey: gApiKey.trim() || undefined,
    });
    setGSaved(true);
    setTimeout(() => setGSaved(false), 2000);
  };

  const forceCompanyContextDefault = (settings as any)?.forceCompanyContextDefault === true;

  const handleForceCompanyContextDefaultChange = async (enabled: boolean) => {
    await upsertSettings({ forceCompanyContextDefault: enabled } as any);
    setAskDefaultsSaved(true);
    setTimeout(() => setAskDefaultsSaved(false), 2000);
  };

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-white/70 text-lg">
          Configure your application preferences
        </p>
      </div>

      {/* Theme */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 flex items-center justify-center">
            <FiInfo className="text-white" />
          </div>
          <h2 className="text-xl font-display font-bold">Theme</h2>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium mb-2 text-white/80">Display mode</label>
          <select
            value={preference}
            onChange={(e) => setPreference(e.target.value as 'light' | 'dark' | 'system')}
            className="w-full sm:w-72 px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors text-white"
          >
            <option value="system" className="bg-navy text-white">
              System
            </option>
            <option value="light" className="bg-navy text-white">
              Light
            </option>
            <option value="dark" className="bg-navy text-white">
              Dark
            </option>
          </select>
          <p className="text-sm text-white/60">
            System follows your operating system appearance preference.
          </p>
        </div>
      </div>

      {/* Account */}
      {user && (
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <FiUser className="text-white" />
            </div>
            <h2 className="text-xl font-display font-bold">Account</h2>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {user.imageUrl ? (
              <img src={user.imageUrl} alt="" className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-sky/20 flex items-center justify-center text-lg text-sky-light font-medium">
                {(user.fullName || user.primaryEmailAddress?.emailAddress || '?')[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-lg font-medium">{user.fullName || user.primaryEmailAddress?.emailAddress}</div>
              <div className="text-sm text-white/50">{user.primaryEmailAddress?.emailAddress}</div>
            </div>
            <button
              onClick={() => signOut()}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 glass glass-hover rounded-xl text-red-400 text-sm font-medium transition-all"
            >
              <FiLogOut />
              Sign Out
            </button>
          </div>
        </div>
      )}

      <BillingSection />

      {/* Company administration (tenant) */}
      {canOpenCompanyAdmin && (
        <div className="glass rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-display font-bold mb-2">Company administration workspace</h2>
          <p className="text-sm text-white/65 mb-4">
            Open a dedicated workspace to manage company details, including organization profile, repair station type,
            facility square footage, class ratings, capabilities, and policy controls.
          </p>
          {myAdminCompanies && myAdminCompanies.length > 0 ? (
            <p className="text-xs text-white/55 mb-4">
              You are a company admin for {myAdminCompanies.length} organization
              {myAdminCompanies.length === 1 ? '' : 's'} and can also manage members and delegated support.
            </p>
          ) : (
            <p className="text-xs text-white/55 mb-4">
              You have company manager access. Member management and delegated support remain admin-only.
            </p>
          )}
          <Link
            to="/company-admin"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-sky-light/40 bg-sky/20 text-sky-lighter text-sm font-medium hover:bg-sky/30 transition-colors"
          >
            Open company admin
          </Link>
        </div>
      )}

      {/* Ask an Expert defaults */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-500 flex items-center justify-center">
            <FiInfo className="text-white" />
          </div>
          <h2 className="text-xl font-display font-bold">Ask an Expert defaults</h2>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white/90">Force company context by default</p>
            <p className="text-sm text-white/60 mt-1">
              New home-page Ask an Expert chats start with uploaded manuals and company profile grounding enabled.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={forceCompanyContextDefault}
            onClick={() => handleForceCompanyContextDefaultChange(!forceCompanyContextDefault).catch(() => {})}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
              forceCompanyContextDefault
                ? 'border-sky/40 bg-sky/20 text-sky-lighter hover:bg-sky/30'
                : 'border-white/20 bg-white/5 text-white/85 hover:bg-white/10'
            }`}
          >
            {forceCompanyContextDefault ? 'On' : 'Off'}
          </button>
        </div>
        {askDefaultsSaved && (
          <p className="text-sm text-green-400 flex items-center gap-2 mt-3">
            <FiCheck /> Ask an Expert default saved.
          </p>
        )}
      </div>

      {projectManageCompanies && projectManageCompanies.length > 0 && (
        <div className="glass rounded-2xl p-6 mb-6">
          <h2 className="text-xl font-display font-bold mb-2">Company projects</h2>
          <p className="text-sm text-white/65 mb-4">
            Create or delete projects for organizations where you are an administrator or manager. Deletion uses a strict
            confirmation on the project page.
          </p>
          <ul className="space-y-2">
            {(projectManageCompanies as { _id: string; name: string }[]).map((c) => (
              <li key={c._id}>
                <Link
                  to={`/companies/${c._id}/projects`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-white/90 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Claude AI Configuration */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky to-sky-light flex items-center justify-center">
            <FiInfo className="text-white" />
          </div>
          <h2 className="text-xl font-display font-bold">Claude AI Configuration</h2>
        </div>
        <div className="space-y-2 text-white/70 mb-4">
          <p>
            Claude requests are handled server-side for security. Set
            <code className="px-1.5 py-0.5 bg-white/10 rounded text-sm ml-2">ANTHROPIC_API_KEY</code>
            in your server environment.
          </p>
          <p className="text-sm text-white/50">
            The browser no longer stores or sends Claude API keys.
          </p>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">
              Default model
            </label>
            <select
              value={defaultModel}
              onChange={(e) => handleAIModelSave('claudeModel', e.target.value)}
              disabled={modelsLoading}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors text-white"
            >
              {claudeModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-navy text-white">
                  {m.display_name}{m.supportsThinking ? ' (supports extended thinking)' : ''}
                </option>
              ))}
            </select>
            <p className="text-sm text-white/50 mt-1">
              Used for analysis, document extraction, revision tracking, and comparison summaries.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">
              Audit simulation model
            </label>
            <select
              value={auditSimModel}
              onChange={(e) => handleAIModelSave('auditSimModel', e.target.value)}
              disabled={modelsLoading}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors text-white"
            >
              {claudeModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-navy text-white">
                  {m.display_name}{m.supportsThinking ? ' (supports extended thinking)' : ''}
                </option>
              ))}
            </select>
            <p className="text-sm text-white/50 mt-1">
              Used for audit simulation agents and discrepancy extraction. Defaults to the default model if not set.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">
              Paperwork review model
            </label>
            <select
              value={paperworkReviewModel}
              onChange={(e) => handleAIModelSave('paperworkReviewModel', e.target.value)}
              disabled={modelsLoading}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors text-white"
            >
              {claudeModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-navy text-white">
                  {m.display_name}{m.supportsThinking ? ' (supports extended thinking)' : ''}
                </option>
              ))}
            </select>
            <p className="text-sm text-white/50 mt-1">
              Used for paperwork review analysis. Defaults to the default model if not set.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">
              DCT traceability model
            </label>
            <select
              value={dctTraceabilityModel}
              onChange={(e) => handleAIModelSave('dctTraceabilityModel', e.target.value)}
              disabled={modelsLoading}
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors text-white"
            >
              {claudeModels.map((m) => (
                <option key={m.id} value={m.id} className="bg-navy text-white">
                  {m.display_name}{m.supportsThinking ? ' (supports extended thinking)' : ''}
                </option>
              ))}
            </select>
            <p className="text-sm text-white/50 mt-1">
              Used for DCT Compliance AI traceability. Defaults to the default model if not set.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">
              Extended thinking (Claude only, supported on select models)
            </label>
            {(() => {
              const defaultModelEntry = claudeModels.find((m) => m.id === defaultModel);
              const defaultSupportsThinking = defaultModelEntry?.supportsThinking === true;
              const defaultModelDisplayName = defaultModelEntry?.display_name ?? defaultModel;
              return (
                <>
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings?.thinkingEnabled ?? false}
                        onChange={(e) => upsertSettings({ thinkingEnabled: e.target.checked }).catch(() => {})}
                        disabled={!defaultSupportsThinking}
                        className="w-4 h-4 rounded border-white/30 bg-white/10 text-sky focus:ring-sky"
                      />
                      <span className="text-white/90">Enable extended thinking</span>
                    </label>
                    <select
                      value={settings?.thinkingBudget ?? 10000}
                      onChange={(e) => upsertSettings({ thinkingBudget: Number(e.target.value) }).catch(() => {})}
                      disabled={!defaultSupportsThinking || !(settings?.thinkingEnabled ?? false)}
                      className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-sky-light text-white text-sm"
                    >
                      <option value={2000} className="bg-navy">Light (2K tokens)</option>
                      <option value={10000} className="bg-navy">Standard (10K)</option>
                      <option value={20000} className="bg-navy">Deep (20K)</option>
                    </select>
                  </div>
                  {!defaultSupportsThinking && (
                    <p className="text-sm text-amber-400/90 mt-2">
                      Not available for {defaultModelDisplayName}. Select a model that supports extended thinking (e.g. Claude Sonnet 4.6) to enable.
                    </p>
                  )}
                  {(defaultSupportsThinking && (settings?.thinkingEnabled ?? false)) && (
                    <>
                      <div className="flex flex-wrap items-center gap-4 mt-3">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings?.adaptiveThinking ?? false}
                            onChange={(e) => upsertSettings({ adaptiveThinking: e.target.checked }).catch(() => {})}
                            className="w-4 h-4 rounded border-white/30 bg-white/10 text-sky focus:ring-sky"
                          />
                          <span className="text-white/90">Adaptive thinking (recommended for Claude 4.6)</span>
                        </label>
                        {(settings?.adaptiveThinking ?? false) && (
                          <select
                            value={settings?.adaptiveThinkingEffort ?? 'high'}
                            onChange={(e) => upsertSettings({ adaptiveThinkingEffort: e.target.value }).catch(() => {})}
                            className="px-3 py-2 bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:border-sky-light text-white text-sm"
                          >
                            <option value="low" className="bg-navy">Low effort</option>
                            <option value="medium" className="bg-navy">Medium effort</option>
                            <option value="high" className="bg-navy">High effort (recommended)</option>
                            <option value="max" className="bg-navy">Maximum effort</option>
                          </select>
                        )}
                      </div>
                      <p className="text-sm text-white/50 mt-1">
                        {(settings?.adaptiveThinking ?? false)
                          ? 'Adaptive thinking lets Claude decide when and how deeply to reason. Outperforms manual budgets on policy-heavy audit tasks.'
                          : 'Used in Analysis, Audit Simulation, and Guided Audit when the selected model for each feature supports it.'}
                      </p>
                    </>
                  )}
                </>
              );
            })()}
          </div>
          {aiSaved && (
            <p className="text-sm text-green-400 flex items-center gap-2">
              <FiCheck /> Model preferences saved.
            </p>
          )}
        </div>
      </div>

      {/* Google Drive Integration (Import Only) */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <FiCloud className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-display font-bold">Google Drive Import</h2>
            <p className="text-sm text-white/50">Optional. Used only to import files into a project.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">
              Google Client ID
            </label>
            <div className="relative">
              <input
                type={showGClientId ? 'text' : 'password'}
                value={gClientId}
                onChange={(e) => setGClientId(e.target.value)}
                placeholder="123456789-abcdef.apps.googleusercontent.com"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors pr-24"
              />
              <button
                onClick={() => setShowGClientId(!showGClientId)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm text-white/60 hover:text-white transition-colors"
              >
                {showGClientId ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">
              Google API Key
            </label>
            <div className="relative">
              <input
                type={showGApiKey ? 'text' : 'password'}
                value={gApiKey}
                onChange={(e) => setGApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors pr-24"
              />
              <button
                onClick={() => setShowGApiKey(!showGApiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 text-sm text-white/60 hover:text-white transition-colors"
              >
                {showGApiKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-sm text-white/60 mt-2">
              Credentials are stored in Convex per user and only used for Drive import.
            </p>
          </div>

          <button
            onClick={handleGoogleSave}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
              gSaved
                ? 'bg-gradient-to-r from-green-500 to-green-600 shadow-lg shadow-green-500/30'
                : 'bg-gradient-to-r from-sky to-sky-light hover:shadow-lg hover:shadow-sky/30'
            }`}
          >
            {gSaved ? (
              <>
                <FiCheck className="text-xl" />
                Saved!
              </>
            ) : (
              <>
                <FiSave className="text-xl" />
                Save Google Credentials
              </>
            )}
          </button>
        </div>
      </div>

      {/* Google Drive Setup Instructions */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-xl font-display font-bold mb-4">Google Drive Setup</h2>
        <div className="space-y-4 text-white/80">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-green-400">1</span>
            </div>
            <div>
              <p>
                Go to the{' '}
                <a
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-light hover:underline inline-flex items-center gap-1"
                >
                  Google Cloud Console
                  <FiExternalLink className="text-sm" />
                </a>
                {' '}and create a project (or select an existing one)
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-green-400">2</span>
            </div>
            <div>
              <p>Enable the <strong>Google Drive API</strong> and <strong>Google Picker API</strong> under &quot;APIs &amp; Services&quot;</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-green-400">3</span>
            </div>
            <div>
              <p>Under &quot;Credentials&quot;, create an <strong>OAuth 2.0 Client ID</strong> (type: Web application). Add <code className="px-1.5 py-0.5 bg-white/10 rounded text-sm">http://localhost:5173</code> to &quot;Authorized JavaScript origins&quot;</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-green-400">4</span>
            </div>
            <div>
              <p>Also create an <strong>API Key</strong> under &quot;Credentials&quot;</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-green-400">5</span>
            </div>
            <div>
              <p>Paste both values in the fields above and save. They&apos;ll be used for Google Drive import.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Avianis Integration */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky to-indigo-500 flex items-center justify-center">
            <FiCloud className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-display font-bold">Avianis Connection</h2>
            <p className="text-sm text-white/50">
              Pull aircraft current times and open discrepancies from your Avianis tenant.
            </p>
          </div>
          {avianisStatus?.configured && (
            <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-300 text-xs font-medium">
              Configured
            </span>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">
              Authentication method
            </label>
            <select
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
            <p className="text-xs text-white/50 mt-1">
              Avianis uses OAuth2 client credentials issued for API access — choose "OAuth2" and
              enter the client_id / client_secret Avianis provides (or "Username + password" using
              the same values). A normal Avianis web login may not have API access; if Test
              connection is rejected, ask your Avianis/Portside rep to provision API credentials.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">Base URL</label>
            <input
              type="text"
              value={avBaseUrl}
              onChange={(e) => setAvBaseUrl(e.target.value)}
              placeholder="https://api.avianis.io"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-white/80">
              Tenant / Operator ID (optional)
            </label>
            <input
              type="text"
              value={avTenantId}
              onChange={(e) => setAvTenantId(e.target.value)}
              placeholder="e.g. ACME-CHARTER"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
            />
          </div>

          {avAuthMethod === 'api_key' && (
            <div>
              <label className="block text-sm font-medium mb-2 text-white/80">API key</label>
              <input
                type="password"
                value={avApiKey}
                onChange={(e) => setAvApiKey(e.target.value)}
                placeholder="Bearer token from Avianis"
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
              />
            </div>
          )}

          {avAuthMethod === 'oauth2' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2 text-white/80">Client ID</label>
                <input
                  type="text"
                  value={avClientId}
                  onChange={(e) => setAvClientId(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-white/80">Client secret</label>
                <input
                  type="password"
                  value={avClientSecret}
                  onChange={(e) => setAvClientSecret(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
                />
              </div>
            </>
          )}

          {avAuthMethod === 'password' && (
            <>
              <div>
                <label className="block text-sm font-medium mb-2 text-white/80">Username</label>
                <input
                  type="text"
                  value={avUsername}
                  onChange={(e) => setAvUsername(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2 text-white/80">Password</label>
                <input
                  type="password"
                  value={avPassword}
                  onChange={(e) => setAvPassword(e.target.value)}
                  className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
                />
              </div>
              <p className="text-xs text-white/50">
                These are your normal Avianis login credentials. Submitted via Avianis's OAuth2
                client_credentials flow at <code className="text-white/70">/oauth/token</code>.
              </p>
            </>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleAvianisSave}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all ${
                avSaved
                  ? 'bg-gradient-to-r from-green-500 to-green-600 shadow-lg shadow-green-500/30'
                  : 'bg-gradient-to-r from-sky to-sky-light hover:shadow-lg hover:shadow-sky/30'
              }`}
            >
              {avSaved ? (
                <>
                  <FiCheck className="text-xl" />
                  Saved!
                </>
              ) : (
                <>
                  <FiSave className="text-xl" />
                  Save Avianis credentials
                </>
              )}
            </button>

            <button
              onClick={handleAvianisTest}
              disabled={avTesting || !avianisStatus?.configured}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-white/20 text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {avTesting ? 'Testing…' : 'Test connection'}
            </button>

            <button
              onClick={handleAvianisSync}
              disabled={avSyncing || !avianisStatus?.configured || !activeProjectId}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold border border-white/20 text-white hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {avSyncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>

          {avTestResult && (
            <p
              className={`text-sm ${avTestResult.ok ? 'text-green-300' : 'text-rose-300'}`}
            >
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
      </div>

      {/* About */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-xl font-display font-bold mb-4">About</h2>
        <div className="space-y-2 text-white/80">
          <p>
            <strong>Version:</strong> 2.0.0
          </p>
          <p>
            <strong>Developer:</strong> AeroGap
          </p>
          <p className="pt-4 border-t border-white/10">
            This application uses Claude AI to perform comprehensive aviation quality assessments
            against regulatory standards including 14 CFR Part 145, EASA regulations, and industry
            best practices.
          </p>
        </div>
      </div>
    </div>
  );
}
