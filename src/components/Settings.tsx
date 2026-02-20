import { useEffect, useState, useRef } from 'react';
import { useClerk, useUser } from '@clerk/clerk-react';
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
} from '../hooks/useConvexData';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';

export default function Settings() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const { signOut } = useClerk();
  const { user } = useUser();

  const settings = useUserSettings();
  const upsertSettings = useUpsertUserSettings();
  const { models: claudeModels, loading: modelsLoading } = useAvailableClaudeModels();
  const defaultModel = useDefaultClaudeModel();
  const auditSimModel = useAuditSimModel();
  const paperworkReviewModel = usePaperworkReviewModel();

  const [gClientId, setGClientId] = useState('');
  const [gApiKey, setGApiKey] = useState('');
  const [showGClientId, setShowGClientId] = useState(false);
  const [showGApiKey, setShowGApiKey] = useState(false);
  const [gSaved, setGSaved] = useState(false);
  const [aiSaved, setAISaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setGClientId(settings.googleClientId || '');
      setGApiKey(settings.googleApiKey || '');
    }
  }, [settings]);

  const handleAIModelSave = async (field: 'claudeModel' | 'auditSimModel' | 'paperworkReviewModel', value: string) => {
    await upsertSettings(
      field === 'claudeModel' ? { claudeModel: value } : field === 'auditSimModel' ? { auditSimModel: value } : { paperworkReviewModel: value }
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

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-white/70 text-lg">
          Configure your application preferences
        </p>
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
                    <p className="text-sm text-white/50 mt-1">
                      Used in Analysis, Audit Simulation, and Guided Audit when the selected model for each feature supports it.
                    </p>
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

      {/* About */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-xl font-display font-bold mb-4">About</h2>
        <div className="space-y-2 text-white/80">
          <p>
            <strong>Version:</strong> 2.0.0
          </p>
          <p>
            <strong>Developer:</strong> Aviation Quality Company
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
