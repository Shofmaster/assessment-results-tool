import { useState } from 'react';
import { useAppStore } from '../store/appStore';
import { RevisionChecker } from '../services/revisionChecker';
import type { DocumentRevision, RevisionStatus } from '../types/revisionTracking';
import {
  FiRefreshCw,
  FiSearch,
  FiCheckCircle,
  FiAlertTriangle,
  FiHelpCircle,
  FiLoader,
  FiAlertOctagon,
  FiFile,
  FiFolder,
  FiCloud,
  FiGlobe,
} from 'react-icons/fi';

const statusConfig: Record<RevisionStatus, { icon: typeof FiCheckCircle; color: string; label: string }> = {
  current: { icon: FiCheckCircle, color: 'text-green-400', label: 'Current' },
  outdated: { icon: FiAlertTriangle, color: 'text-amber-400', label: 'Outdated' },
  unknown: { icon: FiHelpCircle, color: 'text-white/40', label: 'Not Checked' },
  checking: { icon: FiLoader, color: 'text-sky-400', label: 'Checking...' },
  error: { icon: FiAlertOctagon, color: 'text-red-400', label: 'Error' },
};

const typeIcons = {
  regulatory: FiFolder,
  entity: FiFile,
  uploaded: FiCloud,
};

const typeBadgeColors = {
  regulatory: 'bg-sky/20 text-sky-lighter',
  entity: 'bg-purple-500/20 text-purple-300',
  uploaded: 'bg-green-500/20 text-green-400',
};

export default function RevisionTracker() {
  const regulatoryFiles = useAppStore((state) => state.regulatoryFiles);
  const entityDocuments = useAppStore((state) => state.entityDocuments);
  const uploadedDocuments = useAppStore((state) => state.uploadedDocuments);
  const documentRevisions = useAppStore((state) => state.documentRevisions);
  const setDocumentRevisions = useAppStore((state) => state.setDocumentRevisions);
  const updateDocumentRevision = useAppStore((state) => state.updateDocumentRevision);

  const [isScanning, setIsScanning] = useState(false);
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const totalDocs = documentRevisions.length;
  const currentCount = documentRevisions.filter((r) => r.status === 'current').length;
  const outdatedCount = documentRevisions.filter((r) => r.status === 'outdated').length;
  const unknownCount = documentRevisions.filter((r) => r.status === 'unknown' || r.status === 'error').length;

  const handleScanDocuments = async () => {
    setIsScanning(true);
    setError(null);

    try {
      const checker = new RevisionChecker();
      const revisions = await checker.extractRevisionLevels(
        regulatoryFiles,
        entityDocuments,
        uploadedDocuments
      );
      setDocumentRevisions(revisions);
    } catch (err) {
      setError(`Failed to scan documents: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleCheckSingle = async (revision: DocumentRevision) => {
    setCheckingId(revision.id);
    updateDocumentRevision(revision.id, { status: 'checking' });

    try {
      const checker = new RevisionChecker();
      const updates = await checker.checkCurrentRevision(revision);
      updateDocumentRevision(revision.id, updates);
    } catch (err) {
      updateDocumentRevision(revision.id, {
        status: 'error',
        searchSummary: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      });
    } finally {
      setCheckingId(null);
    }
  };

  const handleCheckAll = async () => {
    setIsCheckingAll(true);
    setError(null);

    try {
      const checker = new RevisionChecker();
      await checker.checkAllRevisions(documentRevisions, (id, updates) => {
        updateDocumentRevision(id, updates);
      });
    } catch (err) {
      setError(`Failed to check revisions: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsCheckingAll(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Revision Tracker
        </h1>
        <p className="text-white/60 text-lg">
          Track document revision levels and verify they are current using AI web search
        </p>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 flex items-start gap-3">
          <FiAlertOctagon className="text-xl flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Error</p>
            <p className="text-sm text-red-300/80">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="ml-auto text-red-300/60 hover:text-red-300">
            &times;
          </button>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={handleScanDocuments}
          disabled={isScanning}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FiSearch className={isScanning ? 'animate-spin' : ''} />
          {isScanning ? 'Scanning...' : 'Scan All Documents'}
        </button>

        {documentRevisions.length > 0 && (
          <button
            onClick={handleCheckAll}
            disabled={isCheckingAll || isScanning}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl font-semibold hover:shadow-lg hover:shadow-amber-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FiGlobe className={isCheckingAll ? 'animate-spin' : ''} />
            {isCheckingAll ? 'Checking...' : 'Verify All via Web Search'}
          </button>
        )}
      </div>

      {/* Summary Cards */}
      {documentRevisions.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <SummaryCard label="Total Documents" value={totalDocs} color="text-white" bgColor="from-white/10 to-white/5" />
          <SummaryCard label="Current" value={currentCount} color="text-green-400" bgColor="from-green-500/20 to-green-500/5" />
          <SummaryCard label="Outdated" value={outdatedCount} color="text-amber-400" bgColor="from-amber-500/20 to-amber-500/5" />
          <SummaryCard label="Not Checked" value={unknownCount} color="text-white/60" bgColor="from-white/10 to-white/5" />
        </div>
      )}

      {/* Document List */}
      <div className="glass rounded-2xl p-6">
        <h2 className="text-xl font-display font-bold mb-4">
          Document Revisions ({documentRevisions.length})
        </h2>

        {documentRevisions.length === 0 ? (
          <div className="text-center py-16">
            <FiRefreshCw className="text-6xl text-white/20 mx-auto mb-4" />
            <p className="text-white/60 text-lg">No revision data yet</p>
            <p className="text-white/40 text-sm mt-2 max-w-md mx-auto">
              Click "Scan All Documents" to analyze your project documents and detect their revision levels.
              Then use "Verify All via Web Search" to check if they are current.
            </p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[600px] overflow-y-auto scrollbar-thin pr-2">
            {documentRevisions.map((rev) => (
              <RevisionRow
                key={rev.id}
                revision={rev}
                isChecking={checkingId === rev.id || rev.status === 'checking'}
                onCheck={() => handleCheckSingle(rev)}
                disabled={isCheckingAll}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color, bgColor }: { label: string; value: number; color: string; bgColor: string }) {
  return (
    <div className={`glass rounded-xl p-4 bg-gradient-to-br ${bgColor}`}>
      <div className={`text-3xl font-display font-bold ${color}`}>{value}</div>
      <div className="text-sm text-white/60 mt-1">{label}</div>
    </div>
  );
}

function RevisionRow({
  revision,
  isChecking,
  onCheck,
  disabled,
}: {
  revision: DocumentRevision;
  isChecking: boolean;
  onCheck: () => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const StatusIcon = statusConfig[revision.status].icon;
  const statusColor = statusConfig[revision.status].color;
  const statusLabel = statusConfig[revision.status].label;
  const TypeIcon = typeIcons[revision.documentType];

  return (
    <div className="bg-white/5 hover:bg-white/10 rounded-xl transition-all">
      <div className="flex items-center gap-4 p-4">
        {/* Type Icon */}
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky to-sky-light flex items-center justify-center flex-shrink-0">
          <TypeIcon className="text-white" />
        </div>

        {/* Document Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate flex items-center gap-2">
            {revision.documentName}
            <span className={`px-1.5 py-0.5 rounded text-xs flex-shrink-0 ${typeBadgeColors[revision.documentType]}`}>
              {revision.documentType}
            </span>
            {revision.category && (
              <span className="px-1.5 py-0.5 bg-white/10 rounded text-xs text-white/60 flex-shrink-0">
                {revision.category}
              </span>
            )}
          </div>
          <div className="text-sm text-white/60 flex items-center gap-4 mt-1">
            <span>
              Detected: <span className="text-white/80 font-medium">{revision.detectedRevision}</span>
            </span>
            {revision.latestKnownRevision && (
              <span>
                Latest: <span className={`font-medium ${revision.isCurrentRevision === false ? 'text-amber-400' : 'text-green-400'}`}>
                  {revision.latestKnownRevision}
                </span>
              </span>
            )}
            {revision.lastCheckedAt && (
              <span className="text-white/40">
                Checked: {new Date(revision.lastCheckedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 ${statusColor}`}>
          <StatusIcon className={`text-sm ${isChecking ? 'animate-spin' : ''}`} />
          <span className="text-xs font-medium">{statusLabel}</span>
        </div>

        {/* Actions */}
        <button
          onClick={onCheck}
          disabled={disabled || isChecking || revision.detectedRevision === 'No revision detected'}
          className="px-3 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
          title={revision.detectedRevision === 'No revision detected' ? 'No revision detected to verify' : 'Check if current via web search'}
        >
          <FiGlobe className="text-xs" />
          Check
        </button>

        {/* Expand */}
        {revision.searchSummary && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="px-2 py-1.5 text-white/40 hover:text-white/80 transition-colors text-sm"
          >
            {expanded ? 'Hide' : 'Details'}
          </button>
        )}
      </div>

      {/* Expanded Details */}
      {expanded && revision.searchSummary && (
        <div className="px-4 pb-4 pl-18">
          <div className="p-3 bg-white/5 rounded-lg text-sm text-white/70 ml-14">
            <p className="font-medium text-white/80 mb-1">AI Search Summary:</p>
            <p>{revision.searchSummary}</p>
          </div>
        </div>
      )}
    </div>
  );
}
