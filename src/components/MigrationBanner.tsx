import { useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiCheck, FiUploadCloud, FiX } from 'react-icons/fi';
import {
  useProjects,
  useCreateProject,
  useAddAssessment,
  useAddDocument,
  useAddAnalysis,
  useAddSimulationResult,
  useSetDocumentRevisions,
  useAddProjectAgentDoc,
  useUpsertUserSettings,
} from '../hooks/useConvexData';

type LegacyProject = Record<string, any>;

type LegacyPayload = {
  projects?: LegacyProject[];
};

const DISMISS_KEY = 'convex_migration_dismissed';
const DONE_KEY = 'convex_migration_done';

function findLegacyPayload(): { key: string; payload: LegacyPayload } | null {
  const candidates: Array<{ key: string; payload: LegacyPayload }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.projects)) {
        candidates.push({ key, payload: parsed });
      }
    } catch {
      // ignore
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.payload.projects?.length || 0) - (a.payload.projects?.length || 0));
  return candidates[0];
}

export default function MigrationBanner() {
  const projects = (useProjects() || []) as any[];
  const createProject = useCreateProject();
  const addAssessment = useAddAssessment();
  const addDocument = useAddDocument();
  const addAnalysis = useAddAnalysis();
  const addSimulationResult = useAddSimulationResult();
  const setDocumentRevisions = useSetDocumentRevisions();
  const addProjectAgentDoc = useAddProjectAgentDoc();
  const upsertSettings = useUpsertUserSettings();

  const [legacy, setLegacy] = useState<{ key: string; payload: LegacyPayload } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const dismissed = useMemo(() => localStorage.getItem(DISMISS_KEY) === '1', []);
  const done = useMemo(() => localStorage.getItem(DONE_KEY) === '1', []);

  useEffect(() => {
    if (dismissed || done) return;
    const found = findLegacyPayload();
    if (found) setLegacy(found);
  }, [dismissed, done]);

  if (dismissed || done || !legacy) return null;
  if (projects.length > 0) return null;

  const legacyProjects = legacy.payload.projects || [];

  const migrate = async () => {
    setIsMigrating(true);
    setError(null);

    try {
      let firstProjectId: string | null = null;

      for (const legacyProject of legacyProjects) {
        const projectId = await createProject({
          name: legacyProject.name || 'Migrated Project',
          description: legacyProject.description || undefined,
        });

        if (!firstProjectId) firstProjectId = projectId as any;

        // Assessments
        if (Array.isArray(legacyProject.assessments)) {
          for (const assessment of legacyProject.assessments) {
            await addAssessment({
              projectId: projectId as any,
              originalId: assessment.id || `assessment-${Date.now()}`,
              data: assessment,
              importedAt: assessment.importedAt || new Date().toISOString(),
            });
          }
        }

        // Documents
        const addDocs = async (docs: any[], category: string) => {
          for (const doc of docs) {
            await addDocument({
              projectId: projectId as any,
              category,
              name: doc.name || doc.filename || 'Document',
              path: doc.path || doc.sourcePath || doc.name || 'unknown',
              source: doc.source || 'local',
              mimeType: doc.mimeType || undefined,
              size: doc.size || doc.sizeBytes || undefined,
              extractedText: doc.extractedText || doc.text || undefined,
              extractedAt: doc.extractedAt || doc.importedAt || new Date().toISOString(),
            });
          }
        };

        if (Array.isArray(legacyProject.documents)) {
          const byCategory: Record<string, any[]> = { regulatory: [], entity: [], uploaded: [] };
          for (const doc of legacyProject.documents) {
            const category = doc.category || doc.documentType || doc.type || 'uploaded';
            if (!byCategory[category]) byCategory[category] = [];
            byCategory[category].push(doc);
          }
          for (const [category, docs] of Object.entries(byCategory)) {
            if (docs.length > 0) await addDocs(docs, category);
          }
        }

        if (Array.isArray(legacyProject.regulatoryFiles)) {
          await addDocs(legacyProject.regulatoryFiles, 'regulatory');
        }
        if (Array.isArray(legacyProject.entityDocuments)) {
          await addDocs(legacyProject.entityDocuments, 'entity');
        }
        if (Array.isArray(legacyProject.uploadedDocuments)) {
          await addDocs(legacyProject.uploadedDocuments, 'uploaded');
        }

        // Analyses
        if (Array.isArray(legacyProject.analyses)) {
          for (const analysis of legacyProject.analyses) {
            await addAnalysis({
              projectId: projectId as any,
              assessmentId: analysis.assessmentId || 'unknown',
              companyName: analysis.companyName || 'Unknown',
              analysisDate: analysis.analysisDate || new Date().toISOString(),
              findings: analysis.findings || [],
              recommendations: analysis.recommendations || [],
              compliance: analysis.compliance || { overall: 0, criticalGaps: 0, majorGaps: 0, minorGaps: 0 },
              documentAnalyses: analysis.documentAnalyses || undefined,
              combinedInsights: analysis.combinedInsights || undefined,
            });
          }
        }

        // Simulation Results
        if (Array.isArray(legacyProject.simulationResults)) {
          for (const sim of legacyProject.simulationResults) {
            await addSimulationResult({
              projectId: projectId as any,
              originalId: sim.id || `sim-${Date.now()}`,
              name: sim.name || 'Simulation',
              assessmentId: sim.assessmentId || 'unknown',
              assessmentName: sim.assessmentName || 'Unknown',
              agentIds: sim.agentIds || [],
              totalRounds: sim.totalRounds || 1,
              messages: sim.messages || [],
              createdAt: sim.createdAt || new Date().toISOString(),
              thinkingEnabled: sim.thinkingEnabled ?? false,
              selfReviewMode: sim.selfReviewMode || 'off',
            });
          }
        }

        // Document Revisions
        if (Array.isArray(legacyProject.documentRevisions)) {
          await setDocumentRevisions({
            projectId: projectId as any,
            revisions: legacyProject.documentRevisions.map((r: any) => ({
              originalId: r.id || r.originalId || `rev-${Date.now()}`,
              documentName: r.documentName || 'Document',
              documentType: r.documentType || 'uploaded',
              sourceDocumentId: r.sourceDocumentId || r.id || 'unknown',
              category: r.category || undefined,
              detectedRevision: r.detectedRevision || 'Unknown',
              latestKnownRevision: r.latestKnownRevision || 'Unknown',
              isCurrentRevision: r.isCurrentRevision ?? undefined,
              lastCheckedAt: r.lastCheckedAt ?? undefined,
              searchSummary: r.searchSummary || '',
              status: r.status || 'unknown',
            })),
          });
        }

        // Agent Knowledge Bases (project-specific)
        const kb = legacyProject.agentKnowledgeBases || legacyProject.agentKnowledgeBase;
        if (kb && typeof kb === 'object') {
          for (const [agentId, docs] of Object.entries(kb as Record<string, any[]>)) {
            if (!Array.isArray(docs)) continue;
            for (const doc of docs) {
              await addProjectAgentDoc({
                projectId: projectId as any,
                agentId,
                name: doc.name || 'KB Document',
                path: doc.path || doc.name || 'kb',
                source: doc.source || 'local',
                mimeType: doc.mimeType || undefined,
                extractedText: doc.text || doc.content || doc.extractedText || undefined,
                extractedAt: doc.addedAt || doc.extractedAt || new Date().toISOString(),
              });
            }
          }
        }
      }

      if (firstProjectId) {
        await upsertSettings({ activeProjectId: firstProjectId as any });
      }

      localStorage.setItem(DONE_KEY, '1');
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Migration failed');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="mx-8 mt-6 mb-2">
      <div className="glass rounded-2xl p-4 border border-amber-400/30">
        <div className="flex items-start gap-3">
          <div className="mt-1">
            {success ? (
              <FiCheck className="text-green-400" />
            ) : (
              <FiAlertTriangle className="text-amber-400" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-semibold text-white">Legacy data found</div>
            <div className="text-sm text-white/60">
              We detected {legacyProjects.length} project{legacyProjects.length === 1 ? '' : 's'} stored locally. You can migrate them into Convex now.
            </div>
            {error && <div className="text-sm text-red-300 mt-2">{error}</div>}
            {success && <div className="text-sm text-green-300 mt-2">Migration completed.</div>}
            <div className="mt-3 flex items-center gap-2">
              {!success && (
                <button
                  onClick={migrate}
                  disabled={isMigrating}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 text-amber-200 hover:bg-amber-500/30 transition-colors disabled:opacity-50"
                >
                  {isMigrating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-amber-200/40 border-t-amber-200 rounded-full animate-spin" />
                      Migrating...
                    </>
                  ) : (
                    <>
                      <FiUploadCloud />
                      Migrate to Convex
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => {
                  localStorage.setItem(DISMISS_KEY, '1');
                  setLegacy(null);
                }}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                <FiX />
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
