import { useState } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { useAppStore } from '../store/appStore';
import { GoogleDriveService } from '../services/googleDrive';
import { FiExternalLink, FiInfo, FiCloud, FiLogOut, FiUser, FiSave, FiFolder, FiCheck, FiX, FiLoader } from 'react-icons/fi';

export default function Settings() {
  // Google Drive state
  const googleClientId = useAppStore((state) => state.googleClientId);
  const googleApiKey = useAppStore((state) => state.googleApiKey);
  const setGoogleClientId = useAppStore((state) => state.setGoogleClientId);
  const setGoogleApiKey = useAppStore((state) => state.setGoogleApiKey);
  const googleAuth = useAppStore((state) => state.googleAuth);
  const currentUser = useAppStore((state) => state.currentUser);
  const isSyncing = useAppStore((state) => state.isSyncing);
  const { signOut } = useClerk();

  const sharedRepoConfig = useAppStore((state) => state.sharedRepoConfig);
  const setSharedRepoConfig = useAppStore((state) => state.setSharedRepoConfig);

  const [gClientId, setGClientId] = useState(googleClientId);
  const [gApiKey, setGApiKey] = useState(googleApiKey);
  const [showGClientId, setShowGClientId] = useState(false);
  const [showGApiKey, setShowGApiKey] = useState(false);
  const [gSaved, setGSaved] = useState(false);

  // Shared Repository state
  const [sharedFolderId, setSharedFolderId] = useState(sharedRepoConfig?.folderId || '');
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationSuccess, setValidationSuccess] = useState(false);

  const handleValidateSharedFolder = async () => {
    const trimmed = sharedFolderId.trim();
    if (!trimmed) {
      setValidationError('Please enter a folder ID.');
      return;
    }
    if (!googleClientId || !googleApiKey) {
      setValidationError('Configure Google Drive credentials first.');
      return;
    }
    setIsValidating(true);
    setValidationError(null);
    setValidationSuccess(false);
    try {
      const drive = new GoogleDriveService({ clientId: googleClientId, apiKey: googleApiKey });
      if (!googleAuth.isSignedIn) {
        await drive.signIn();
      }
      const result = await drive.validateSharedFolder(trimmed);
      if (result.valid) {
        setSharedRepoConfig({
          enabled: true,
          folderId: trimmed,
          folderName: result.folderName,
          configuredAt: new Date().toISOString(),
        });
        setValidationSuccess(true);
        setValidationError(null);
      } else {
        setValidationError(result.error || 'Validation failed.');
      }
    } catch (err: any) {
      setValidationError(err.message || 'Failed to validate folder.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleDisableSharedRepo = () => {
    setSharedRepoConfig(null);
    setSharedFolderId('');
    setValidationSuccess(false);
    setValidationError(null);
  };

  const handleGoogleSave = () => {
    setGoogleClientId(gClientId);
    setGoogleApiKey(gApiKey);
    setGSaved(true);
    setTimeout(() => setGSaved(false), 2000);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Settings
        </h1>
        <p className="text-white/60 text-lg">
          Configure your application preferences
        </p>
      </div>

      {/* Account */}
      {currentUser && (
        <div className="glass rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
              <FiUser className="text-white" />
            </div>
            <h2 className="text-xl font-display font-bold">Account</h2>
          </div>
          <div className="flex items-center gap-4">
            {currentUser.picture ? (
              <img src={currentUser.picture} alt="" className="w-12 h-12 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-sky/20 flex items-center justify-center text-lg text-sky-light font-medium">
                {currentUser.name?.[0] || currentUser.email[0]}
              </div>
            )}
            <div className="flex-1">
              <div className="text-lg font-medium">{currentUser.name || currentUser.email}</div>
              <div className="text-sm text-white/50">{currentUser.email}</div>
              {isSyncing && (
                <div className="text-xs text-sky-light mt-1">Syncing with Google Drive...</div>
              )}
              {googleAuth.isSignedIn && !isSyncing && (
                <div className="text-xs text-green-400 mt-1">Connected to Google Drive</div>
              )}
            </div>
            <button
              onClick={() => signOut()}
              className="flex items-center gap-2 px-4 py-2 glass glass-hover rounded-xl text-red-400 text-sm font-medium transition-all"
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

      {/* Google Drive Integration */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
            <FiCloud className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-display font-bold">Google Drive Integration</h2>
          </div>
          {googleAuth.isSignedIn && (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-green-400 rounded-full" />
              <span className="text-sm text-green-400">{googleAuth.userEmail}</span>
            </div>
          )}
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
              Credentials are stored locally and only used to connect to Google Drive.
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
                <FiInfo className="text-xl" />
                Saved!
              </>
            ) : (
              <>
                <FiSave className="text-xl" />
                Save Google Credentials
              </>
            )}
          </button>

          <p className="text-sm text-white/40 mt-1">
            Google Drive connection is managed through your Google Sign-In session.
            Updating these credentials will take effect on your next sign-in.
          </p>
        </div>
      </div>

      {/* Shared Repository */}
      <div className="glass rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <FiFolder className="text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-display font-bold">Shared Repository</h2>
            <p className="text-sm text-white/50">Centralize all agent data in one Google Drive folder</p>
          </div>
          {sharedRepoConfig?.enabled && (
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 bg-green-400 rounded-full" />
              <span className="text-sm text-green-400">Active</span>
            </div>
          )}
        </div>

        {sharedRepoConfig?.fromEnv ? (
          /* Environment-configured shared repository — read-only display */
          <div className="space-y-4">
            <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
              <div className="flex items-center gap-2 text-green-400 font-medium mb-1">
                <FiCheck />
                Shared repository active — configured via environment
              </div>
              <p className="text-sm text-white/70">
                Folder ID: <code className="px-1.5 py-0.5 bg-white/10 rounded text-xs">{sharedRepoConfig.folderId}</code>
              </p>
              <p className="text-xs text-white/40 mt-1">
                Set via <code className="px-1 py-0.5 bg-white/10 rounded">VITE_SHARED_DRIVE_FOLDER_ID</code> environment variable.
                All users automatically share data from this folder.
              </p>
            </div>
            <p className="text-xs text-white/40">
              To change the shared folder, update the environment variable and redeploy.
            </p>
          </div>
        ) : !googleClientId || !googleApiKey ? (
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-yellow-200 text-sm">
            Configure your Google Drive credentials above before setting up a shared repository.
          </div>
        ) : (
          <div className="space-y-4">
            {sharedRepoConfig?.enabled && (
              <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl">
                <div className="flex items-center gap-2 text-green-400 font-medium mb-1">
                  <FiCheck />
                  Shared repository active
                </div>
                <p className="text-sm text-white/70">
                  Folder: <span className="text-white font-medium">{sharedRepoConfig.folderName || sharedRepoConfig.folderId}</span>
                </p>
                <p className="text-xs text-white/40 mt-1">
                  All agents and users share data from this folder. Subfolders: Knowledge-Bases/, Projects/
                </p>
                <button
                  onClick={handleDisableSharedRepo}
                  className="mt-3 flex items-center gap-2 px-4 py-2 glass glass-hover rounded-xl text-red-400 text-sm font-medium transition-all"
                >
                  <FiX />
                  Disable Shared Repository
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-2 text-white/80">
                Google Drive Folder ID
              </label>
              <input
                type="text"
                value={sharedFolderId}
                onChange={(e) => { setSharedFolderId(e.target.value); setValidationError(null); setValidationSuccess(false); }}
                placeholder="e.g. 1A2B3C4D5E6F7G8H9I0J..."
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
              />
              <p className="text-xs text-white/40 mt-2">
                Open the folder in Google Drive. Copy the ID from the URL:{' '}
                <code className="px-1 py-0.5 bg-white/10 rounded">
                  drive.google.com/drive/folders/<strong>[FOLDER_ID]</strong>
                </code>
              </p>
            </div>

            {validationError && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-start gap-2">
                <FiX className="mt-0.5 flex-shrink-0" />
                {validationError}
              </div>
            )}

            {validationSuccess && !sharedRepoConfig?.enabled && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-green-300 text-sm flex items-center gap-2">
                <FiCheck />
                Folder validated and saved!
              </div>
            )}

            <button
              onClick={handleValidateSharedFolder}
              disabled={isValidating || !sharedFolderId.trim()}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all bg-gradient-to-r from-blue-500 to-indigo-600 hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isValidating ? (
                <>
                  <FiLoader className="animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  <FiFolder />
                  Validate & Save
                </>
              )}
            </button>

            <div className="p-4 bg-white/5 rounded-xl text-sm text-white/60 space-y-2">
              <p className="font-medium text-white/80">How to set up a shared repository:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Create a folder in Google Drive (e.g. "Aviation Repository")</li>
                <li>Share it with all team members with <strong>Editor</strong> access</li>
                <li>Open the folder and copy the folder ID from the browser URL</li>
                <li>Paste it above and click "Validate & Save"</li>
              </ol>
              <p className="text-white/40 mt-2">
                The app will create Knowledge-Bases/ and Projects/ subfolders automatically.
                Or set <code className="px-1 py-0.5 bg-white/10 rounded">VITE_SHARED_DRIVE_FOLDER_ID</code> in your environment to auto-configure for all users.
              </p>
            </div>
          </div>
        )}
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
              <p>Paste both values in the fields above and save. They'll be used for Google Sign-In and Drive sync.</p>
            </div>
          </div>
        </div>
      </div>

      {/* How to Get API Key */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-xl font-display font-bold mb-4">How to Get Your Claude API Key</h2>
        <div className="space-y-4 text-white/80">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-sky/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-sky-light">1</span>
            </div>
            <div>
              <p>
                Visit the{' '}
                <a
                  href="https://console.anthropic.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-light hover:underline inline-flex items-center gap-1"
                >
                  Anthropic Console
                  <FiExternalLink className="text-sm" />
                </a>
                {' '}and create a key for your server environment.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-sky/20 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-sm font-bold text-sky-light">2</span>
            </div>
            <div>
              <p>Add it to your deployment environment as <code className="px-1.5 py-0.5 bg-white/10 rounded text-sm">ANTHROPIC_API_KEY</code>.</p>
            </div>
          </div>
        </div>
      </div>

      {/* About */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-xl font-display font-bold mb-4">About</h2>
        <div className="space-y-2 text-white/80">
          <p>
            <strong>Version:</strong> 1.2.0
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
