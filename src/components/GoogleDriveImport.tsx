import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { GoogleDriveService } from '../services/googleDrive';
import { DocumentExtractor } from '../services/documentExtractor';
import { FiCloud, FiLoader, FiCheck, FiAlertCircle } from 'react-icons/fi';
import type { GoogleDriveFile } from '../types/googleDrive';

interface FileProgress {
  file: GoogleDriveFile;
  status: 'downloading' | 'extracting' | 'done' | 'error';
  error?: string;
}

export default function GoogleDriveImport() {
  const [importing, setImporting] = useState(false);
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);

  const googleClientId = useAppStore((state) => state.googleClientId);
  const googleApiKey = useAppStore((state) => state.googleApiKey);
  const googleAuth = useAppStore((state) => state.googleAuth);
  const setGoogleAuth = useAppStore((state) => state.setGoogleAuth);
  const addUploadedDocument = useAppStore((state) => state.addUploadedDocument);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  const isConfigured = !!googleClientId && !!googleApiKey;

  const handleImport = async () => {
    if (!isConfigured) {
      setCurrentView('settings');
      return;
    }

    setImporting(true);
    setFileProgress([]);

    try {
      const driveService = new GoogleDriveService({
        clientId: googleClientId,
        apiKey: googleApiKey,
      });

      // Re-auth if needed — signIn will handle the popup
      if (!googleAuth.isSignedIn) {
        const authState = await driveService.signIn();
        setGoogleAuth(authState);
      } else {
        // Load scripts and try to get a fresh token
        await driveService.loadScripts();
        try {
          await driveService.ensureValidToken();
        } catch {
          // Token expired, re-sign in
          const authState = await driveService.signIn();
          setGoogleAuth(authState);
        }
      }

      const files = await driveService.openPicker();

      if (files.length === 0) {
        setImporting(false);
        return;
      }

      setFileProgress(files.map((f) => ({ file: f, status: 'downloading' })));

      const extractor = new DocumentExtractor();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
          // Download
          setFileProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: 'downloading' } : p))
          );

          const buffer = await driveService.downloadFile(file.id);

          // Extract text
          setFileProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: 'extracting' } : p))
          );

          const text = await extractor.extractText(buffer, file.name, file.mimeType);

          // Store in app
          addUploadedDocument({
            id: `gdrive-${file.id}-${Date.now()}`,
            name: file.name,
            text,
            path: `google-drive://${file.id}`,
            source: 'google-drive',
            mimeType: file.mimeType,
            extractedAt: new Date().toISOString(),
          });

          setFileProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: 'done' } : p))
          );
        } catch (error: any) {
          setFileProgress((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: 'error', error: error.message } : p
            )
          );
        }
      }
    } catch (error: any) {
      if (error.message?.includes('auth') || error.message?.includes('token')) {
        setGoogleAuth({ isSignedIn: false, userEmail: null, userName: null, userPicture: null, userHash: null });
      }
      alert(`Google Drive import failed: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleImport}
        disabled={importing}
        className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-xl font-semibold hover:shadow-lg hover:shadow-green-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {importing ? (
          <>
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Importing...
          </>
        ) : (
          <>
            <FiCloud className="text-xl" />
            {isConfigured ? 'Import from Google Drive' : 'Set Up Google Drive'}
          </>
        )}
      </button>

      {/* Progress list */}
      {fileProgress.length > 0 && (
        <div className="mt-4 space-y-2">
          {fileProgress.map((fp, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-white/5 rounded-xl text-sm"
            >
              {fp.status === 'downloading' && (
                <FiLoader className="text-sky-light animate-spin flex-shrink-0" />
              )}
              {fp.status === 'extracting' && (
                <FiLoader className="text-amber-400 animate-spin flex-shrink-0" />
              )}
              {fp.status === 'done' && (
                <FiCheck className="text-green-400 flex-shrink-0" />
              )}
              {fp.status === 'error' && (
                <FiAlertCircle className="text-red-400 flex-shrink-0" />
              )}

              <span className="flex-1 truncate">{fp.file.name}</span>

              <span className="text-white/40 text-xs flex-shrink-0">
                {fp.status === 'downloading' && 'Downloading...'}
                {fp.status === 'extracting' && 'Extracting text...'}
                {fp.status === 'done' && 'Done'}
                {fp.status === 'error' && (
                  <span className="text-red-400">{fp.error}</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
