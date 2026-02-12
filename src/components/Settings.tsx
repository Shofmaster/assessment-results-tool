import { useEffect, useState } from 'react';
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
import { useUpsertUserSettings, useUserSettings } from '../hooks/useConvexData';

export default function Settings() {
  const { signOut } = useClerk();
  const { user } = useUser();

  const settings = useUserSettings();
  const upsertSettings = useUpsertUserSettings();

  const [gClientId, setGClientId] = useState('');
  const [gApiKey, setGApiKey] = useState('');
  const [showGClientId, setShowGClientId] = useState(false);
  const [showGApiKey, setShowGApiKey] = useState(false);
  const [gSaved, setGSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setGClientId(settings.googleClientId || '');
      setGApiKey(settings.googleApiKey || '');
    }
  }, [settings]);

  const handleGoogleSave = async () => {
    await upsertSettings({
      googleClientId: gClientId.trim() || undefined,
      googleApiKey: gApiKey.trim() || undefined,
    });
    setGSaved(true);
    setTimeout(() => setGSaved(false), 2000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-white/60 text-lg">
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
        <div className="space-y-2 text-white/70">
          <p>
            Claude requests are handled server-side for security. Set
            <code className="px-1.5 py-0.5 bg-white/10 rounded text-sm ml-2">ANTHROPIC_API_KEY</code>
            in your server environment.
          </p>
          <p className="text-sm text-white/50">
            The browser no longer stores or sends Claude API keys.
          </p>
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
              <p>Enable the <strong>Google Drive API</strong> and <strong>Google Picker API</strong> under "APIs & Services"</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-green-400">3</span>
            </div>
            <div>
              <p>Under "Credentials", create an <strong>OAuth 2.0 Client ID</strong> (type: Web application). Add <code className="px-1.5 py-0.5 bg-white/10 rounded text-sm">http://localhost:5173</code> to "Authorized JavaScript origins"</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-green-400">4</span>
            </div>
            <div>
              <p>Also create an <strong>API Key</strong> under "Credentials"</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-green-400">5</span>
            </div>
            <div>
              <p>Paste both values in the fields above and save. They'll be used for Google Drive import.</p>
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
