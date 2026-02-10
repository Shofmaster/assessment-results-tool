import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { FiUpload, FiTrash2, FiFile, FiFolder, FiCloud, FiFileText } from 'react-icons/fi';
import type { FileInfo } from '../types/assessment';
import GoogleDriveImport from './GoogleDriveImport';

type TabType = 'regulatory' | 'entity' | 'uploaded';

export default function LibraryManager() {
  const [activeTab, setActiveTab] = useState<TabType>('regulatory');
  const [selectedCategory, setSelectedCategory] = useState('CFRs');

  const regulatoryFiles = useAppStore((state) => state.regulatoryFiles);
  const entityDocuments = useAppStore((state) => state.entityDocuments);
  const uploadedDocuments = useAppStore((state) => state.uploadedDocuments);
  const addRegulatoryFiles = useAppStore((state) => state.addRegulatoryFiles);
  const addEntityDocuments = useAppStore((state) => state.addEntityDocuments);
  const setRegulatoryFiles = useAppStore((state) => state.setRegulatoryFiles);
  const setEntityDocuments = useAppStore((state) => state.setEntityDocuments);
  const removeUploadedDocument = useAppStore((state) => state.removeUploadedDocument);
  const clearUploadedDocuments = useAppStore((state) => state.clearUploadedDocuments);

  const regulatoryCategories = [
    'CFRs',
    'ISbao Standards',
    'EASA Regulations',
    'Advisory Circulars',
    'Other Standards',
  ];

  const handleImportRegulatory = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const fileInfos: FileInfo[] = await Promise.all(
        files.map(async (file) => ({
          id: `${Date.now()}-${file.name}`,
          name: file.name,
          path: file.name,
          category: selectedCategory,
          size: file.size,
          importedAt: new Date().toISOString(),
        }))
      );
      addRegulatoryFiles(fileInfos);
    };
    input.click();
  };

  const handleImportEntity = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.pdf,.doc,.docx,.txt';
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      const fileInfos: FileInfo[] = await Promise.all(
        files.map(async (file) => ({
          id: `${Date.now()}-${file.name}`,
          name: file.name,
          path: file.name,
          size: file.size,
          importedAt: new Date().toISOString(),
        }))
      );
      addEntityDocuments(fileInfos);
    };
    input.click();
  };

  const handleDelete = (fileId: string) => {
    if (confirm('Are you sure you want to delete this file?')) {
      if (activeTab === 'regulatory') {
        setRegulatoryFiles(regulatoryFiles.filter((f) => f.id !== fileId));
      } else if (activeTab === 'entity') {
        setEntityDocuments(entityDocuments.filter((f) => f.id !== fileId));
      } else {
        removeUploadedDocument(fileId);
      }
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const displayFiles = activeTab === 'regulatory' ? regulatoryFiles : activeTab === 'entity' ? entityDocuments : [];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Document Library
        </h1>
        <p className="text-white/60 text-lg">
          Organize your regulatory standards and entity documentation
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab('regulatory')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'regulatory'
              ? 'bg-gradient-to-r from-sky to-sky-light shadow-lg shadow-sky/30'
              : 'glass glass-hover text-white/60'
          }`}
        >
          <FiFolder className="inline mr-2" />
          Regulatory Standards
        </button>
        <button
          onClick={() => setActiveTab('entity')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'entity'
              ? 'bg-gradient-to-r from-sky to-sky-light shadow-lg shadow-sky/30'
              : 'glass glass-hover text-white/60'
          }`}
        >
          <FiFile className="inline mr-2" />
          Entity Documents
        </button>
        <button
          onClick={() => setActiveTab('uploaded')}
          className={`px-6 py-3 rounded-xl font-semibold transition-all ${
            activeTab === 'uploaded'
              ? 'bg-gradient-to-r from-green-500 to-emerald-600 shadow-lg shadow-green-500/30'
              : 'glass glass-hover text-white/60'
          }`}
        >
          <FiCloud className="inline mr-2" />
          Uploaded Documents
          {uploadedDocuments.length > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-xs">
              {uploadedDocuments.length}
            </span>
          )}
        </button>
      </div>

      {/* Import Section */}
      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-xl font-display font-bold mb-4">
          {activeTab === 'regulatory'
            ? 'Import Regulatory Files'
            : activeTab === 'entity'
              ? 'Import Entity Documents'
              : 'Import from Google Drive'}
        </h2>

        {activeTab === 'regulatory' && (
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2 text-white/80">
              Select Category
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full md:w-64 px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors"
            >
              {regulatoryCategories.map((cat) => (
                <option key={cat} value={cat} className="bg-navy-800">
                  {cat}
                </option>
              ))}
            </select>
          </div>
        )}

        {(activeTab === 'regulatory' || activeTab === 'entity') && (
          <div className="flex items-center gap-3">
            <button
              onClick={activeTab === 'regulatory' ? handleImportRegulatory : handleImportEntity}
              className="flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all"
            >
              <FiUpload className="text-xl" />
              Import Files
            </button>
            <GoogleDriveImport />
          </div>
        )}

        {activeTab === 'uploaded' && (
          <GoogleDriveImport />
        )}
      </div>

      {/* Files List — Regulatory & Entity */}
      {(activeTab === 'regulatory' || activeTab === 'entity') && (
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold">
              {activeTab === 'regulatory' ? 'Regulatory Files' : 'Entity Documents'} (
              {displayFiles.length})
            </h2>
          </div>

          {displayFiles.length === 0 ? (
            <div className="text-center py-12">
              <FiFolder className="text-6xl text-white/20 mx-auto mb-4" />
              <p className="text-white/60">No files imported yet</p>
              <p className="text-white/40 text-sm mt-2">
                Click "Import Files" or "Import from Google Drive" above to get started
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
              {displayFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky to-sky-light flex items-center justify-center flex-shrink-0">
                      <FiFile className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{file.name}</div>
                      <div className="text-sm text-white/60 flex items-center gap-4">
                        {file.category && (
                          <span className="px-2 py-0.5 bg-white/10 rounded text-xs">
                            {file.category}
                          </span>
                        )}
                        <span>{formatFileSize(file.size)}</span>
                        <span>
                          {new Date(file.importedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(file.id)}
                    className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <FiTrash2 className="text-xl" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Uploaded Documents List */}
      {activeTab === 'uploaded' && (
        <div className="glass rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-bold">
              Uploaded Documents ({uploadedDocuments.length})
            </h2>
            {uploadedDocuments.length > 0 && (
              <button
                onClick={() => {
                  if (confirm('Clear all uploaded documents?')) {
                    clearUploadedDocuments();
                  }
                }}
                className="px-4 py-2 text-sm text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
              >
                Clear All
              </button>
            )}
          </div>

          {uploadedDocuments.length === 0 ? (
            <div className="text-center py-12">
              <FiCloud className="text-6xl text-white/20 mx-auto mb-4" />
              <p className="text-white/60">No documents uploaded yet</p>
              <p className="text-white/40 text-sm mt-2">
                Import files from Google Drive to extract their text content for analysis
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
              {uploadedDocuments.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                      {doc.source === 'google-drive' ? (
                        <FiCloud className="text-white" />
                      ) : (
                        <FiFileText className="text-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate flex items-center gap-2">
                        {doc.name}
                        {doc.source === 'google-drive' && (
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-xs flex-shrink-0">
                            Drive
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-white/60 flex items-center gap-4">
                        {doc.mimeType && (
                          <span className="px-2 py-0.5 bg-white/10 rounded text-xs">
                            {doc.mimeType.split('/').pop()}
                          </span>
                        )}
                        <span>{(doc.text?.length || 0).toLocaleString()} chars extracted</span>
                        <span>
                          {new Date(doc.extractedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(doc.id)}
                    className="p-2 text-white/40 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  >
                    <FiTrash2 className="text-xl" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
