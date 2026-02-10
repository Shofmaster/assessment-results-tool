import { useState } from 'react';
import { FiCloud, FiLoader, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import { useUserSettings, useAddDocument } from '../hooks/useConvexData';
import { GoogleDriveService } from '../services/googleDrive';
import type { GoogleDriveFile } from '../types/googleDrive';

interface FileProgress {
  file: GoogleDriveFile;
  status: 'downloading' | 'extracting' | 'done' | 'error';
  error?: string;
}

export default function GoogleDriveImport() {
  const [importing, setImporting] = useState(false);
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);

  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const settings = useUserSettings();
  const addDocument = useAddDocument();
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  const googleClientId = settings?.googleClientId || '';
  const googleApiKey = settings?.googleApiKey || '';
  const isConfigured = !!googleClientId && !!googleApiKey;

  const handleImport = async () => {
    if (!activeProjectId) {
      setCurrentView('projects');
      return;
    }
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

      await driveService.signIn();

      const files = await driveService.openPicker();

      if (files.length === 0) {
        setImporting(false);
        return;
      }

      setFileProgress(files.map((f) => ({ file: f, status: 'downloading' })));

      const { DocumentExtractor } = await import('../services/documentExtractor');
      const extractor = new DocumentExtractor();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
          setFileProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: 'downloading' } : p))
          );

          const buffer = await driveService.downloadFile(file.id);

          setFileProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: 'extracting' } : p))
          );

          const text = await extractor.extractText(buffer, file.name, file.mimeType);

          await addDocument({
            projectId: activeProjectId as any,
            category: 'uploaded',
            name: file.name,
            path: `google-drive://${file.id}`,
            source: 'google-drive',
            mimeType: file.mimeType,
            extractedText: text,
            extractedAt: new Date().toISOString(),
            size: file.sizeBytes || 0,
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
