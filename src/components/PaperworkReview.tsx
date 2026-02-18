import { useState } from 'react';
import { FiFileText, FiDownload, FiAlertTriangle } from 'react-icons/fi';
import { useAppStore } from '../store/appStore';
import { useDocuments } from '../hooks/useConvexData';
import type { PaperworkReviewForPdf } from '../services/paperworkReviewPdfGenerator';

export default function PaperworkReview() {
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const setCurrentView = useAppStore((state) => state.setCurrentView);

  const regulatoryDocs = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const entityDocs = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const uploadedDocs = (useDocuments(activeProjectId || undefined, 'uploaded') || []) as any[];

  const [exporting, setExporting] = useState(false);

  const allDocs = [...regulatoryDocs, ...entityDocs, ...uploadedDocs];

  const handleExportPDF = async () => {
    if (allDocs.length === 0) return;
    setExporting(true);
    try {
      const reviews: PaperworkReviewForPdf[] = allDocs.slice(0, 10).map((doc) => ({
        projectName: activeProjectId ? 'Current Project' : undefined,
        underReviewDocumentName: doc.name,
        referenceDocumentNames: 'Regulatory & entity documents',
        status: doc.extractedText ? 'completed' : 'draft',
        findings: doc.extractedText
          ? [{ severity: 'observation', description: 'Document on file for compliance review.' }]
          : [],
        createdAt: doc.extractedAt || new Date().toISOString(),
      }));
      const { PaperworkReviewPDFGenerator } = await import('../services/paperworkReviewPdfGenerator');
      const gen = new PaperworkReviewPDFGenerator();
      const bytes = await gen.generate(reviews);
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Paperwork-Review-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  if (!activeProjectId) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
        <div className="glass rounded-2xl p-12 text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to manage paperwork reviews.</p>
          <button
            onClick={() => setCurrentView('projects')}
            className="px-6 py-2 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold"
          >
            Go to Projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Paperwork Review
        </h1>
        <p className="text-white/60 text-lg">
          Document compliance review and export
        </p>
      </div>

      <div className="glass rounded-2xl p-6 mb-6">
        <h2 className="text-xl font-display font-bold mb-4 flex items-center gap-2">
          <FiFileText className="text-sky" />
          Library Documents
        </h2>
        {allDocs.length === 0 ? (
          <div className="text-center py-12 text-white/50">
            <FiAlertTriangle className="w-16 h-16 mx-auto mb-4 text-amber-400/60" />
            <p className="mb-4">No documents in your Library yet.</p>
            <p className="text-sm mb-6">
              Add regulatory, entity, or uploaded documents in the Library to include them in paperwork review exports.
            </p>
            <button
              onClick={() => setCurrentView('library')}
              className="px-6 py-2 bg-sky/20 text-sky-light rounded-xl font-semibold hover:bg-sky/30 transition-colors"
            >
              Go to Library
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
              {allDocs.map((doc) => (
                <div
                  key={doc._id}
                  className="flex items-center justify-between px-4 py-2 rounded-lg bg-white/5 text-sm"
                >
                  <span className="truncate text-white/80">{doc.name}</span>
                  <span className="text-xs text-white/40 flex-shrink-0 ml-2">
                    {doc.extractedText ? 'Ready' : 'No text'}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={handleExportPDF}
              disabled={exporting}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FiDownload className="w-5 h-5" />
              {exporting ? 'Exporting...' : 'Export Paperwork Review PDF'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
