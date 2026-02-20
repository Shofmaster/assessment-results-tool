import { useRef } from 'react';
import { FiFileText, FiFolder, FiBriefcase, FiDownload } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { downloadAssessmentsExport } from '../utils/exportAssessment';
import { useAppStore } from '../store/appStore';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import {
  useProject,
  useAssessments,
  useDocuments,
  useAnalyses,
  useAnalysis,
  useAddAssessment,
} from '../hooks/useConvexData';
import { Button, GlassCard } from './ui';

export default function Dashboard() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const navigate = useNavigate();

  const project = useProject(activeProjectId || undefined) as any;
  const assessments = (useAssessments(activeProjectId || undefined) || []) as any[];
  const regulatoryFiles = (useDocuments(activeProjectId || undefined, 'regulatory') || []) as any[];
  const entityDocuments = (useDocuments(activeProjectId || undefined, 'entity') || []) as any[];
  const smsDocuments = (useDocuments(activeProjectId || undefined, 'sms') || []) as any[];
  const analyses = (useAnalyses(activeProjectId || undefined) || []) as any[];
  const latestAnalysisId = analyses.length > 0
    ? analyses.slice().sort((a: any, b: any) => (a.analysisDate > b.analysisDate ? 1 : -1)).slice(-1)[0]?._id
    : undefined;
  const currentAnalysis = useAnalysis(latestAnalysisId ?? undefined);
  const addAssessment = useAddAssessment();

  if (!activeProjectId || !project) {
    return (
      <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <GlassCard padding="xl" className="text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/70 mb-6">
            Choose an existing project from the sidebar or create a new one to get started.
          </p>
          <Button
            size="lg"
            onClick={() => navigate('/projects')}
            icon={<FiBriefcase />}
            className="mx-auto"
          >
            Go to Projects
          </Button>
        </GlassCard>
      </div>
    );
  }

  const handleImportAssessment = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        for (const item of items) {
          const data = item.data ?? item;
          await addAssessment({
            projectId: activeProjectId as any,
            originalId: `assessment-${Date.now()}`,
            data,
            importedAt: (item.importedAt as string) ?? new Date().toISOString(),
          });
        }
      }
    };
    input.click();
  };

  const handleExportAssessments = () => {
    const items = assessments.map((a: any) => ({
      data: a.data,
      companyName: a.data?.companyName,
      importedAt: a.importedAt,
    }));
    downloadAssessmentsExport(items);
  };

  const stats = [
    {
      label: 'Assessments',
      value: assessments.length,
      icon: FiFileText,
      color: 'from-sky to-sky-light',
    },
    {
      label: 'Regulatory Files',
      value: regulatoryFiles.length,
      icon: FiFolder,
      color: 'from-amber-500 to-amber-400',
    },
    {
      label: 'Entity Documents',
      value: entityDocuments.length,
      icon: FiFolder,
      color: 'from-green-500 to-green-400',
    },
    {
      label: 'SMS Data',
      value: smsDocuments.length,
      icon: FiFolder,
      color: 'from-teal-500 to-teal-400',
    },
  ];

  return (
    <div ref={containerRef} className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sky-lighter/60 text-sm mb-1">
          <FiBriefcase className="text-xs" />
          <span>{project.name}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-white/70 text-lg">
          Assess compliance against Part 145, IS-BAO, EASA & AS9100
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat: any) => {
          const Icon = stat.icon;
          return (
            <GlassCard
              key={stat.label}
              hover
              className="hover:transform hover:scale-105"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}
                >
                  <Icon className="text-white text-xl" />
                </div>
              </div>
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <div className="text-white/70 text-sm">{stat.label}</div>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="mb-8 border border-white/15">
        <h2 className="text-xl font-display font-bold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Button
            size="lg"
            onClick={handleImportAssessment}
            icon={<FiFileText className="text-xl" />}
            className="w-full justify-start gap-3 py-4 px-4 text-left h-auto"
          >
            <span className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
              <span className="font-semibold">Import Assessment</span>
              <span className="text-sm font-normal opacity-90">Load JSON assessment data</span>
            </span>
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={handleExportAssessments}
            disabled={assessments.length === 0}
            icon={<FiDownload className="text-xl" />}
            className="w-full justify-start gap-3 py-4 px-4 text-left h-auto"
          >
            <span className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
              <span className="font-semibold">Export Assessments</span>
              <span className="text-sm font-normal text-white/70">Save all assessments to JSON file</span>
            </span>
          </Button>

          <Button
            variant="secondary"
            size="lg"
            onClick={() => navigate('/library')}
            icon={<FiFolder className="text-xl" />}
            className="w-full justify-start gap-3 py-4 px-4 text-left h-auto md:col-span-2"
          >
            <span className="flex flex-col items-start gap-0.5 flex-1 min-w-0">
              <span className="font-semibold">Manage Library</span>
              <span className="text-sm font-normal text-white/70">Add regulatory files & documents</span>
            </span>
          </Button>
        </div>
      </GlassCard>

      {currentAnalysis && (
        <GlassCard className="border border-white/15">
          <h2 className="text-xl font-display font-bold mb-4">Latest Analysis</h2>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="min-w-0">
                <div className="font-semibold text-lg truncate">{currentAnalysis.companyName}</div>
                <div className="text-white/70 text-sm">
                  Analyzed on {new Date(currentAnalysis.analysisDate).toLocaleDateString()}
                </div>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-3xl font-bold mb-1 text-accent-gold">
                  {currentAnalysis.compliance.overall}%
                </div>
                <div className="text-white/70 text-sm">Compliance Score</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">
                  {currentAnalysis.compliance.criticalGaps}
                </div>
                <div className="text-white/70 text-sm">Critical</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-400">
                  {currentAnalysis.compliance.majorGaps}
                </div>
                <div className="text-white/70 text-sm">Major</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-sky-light">
                  {currentAnalysis.compliance.minorGaps}
                </div>
                <div className="text-white/70 text-sm">Minor</div>
              </div>
            </div>

            <Button
              size="lg"
              fullWidth
              onClick={() => navigate('/analysis')}
              className="mt-4"
            >
              View Full Analysis
            </Button>
          </div>
        </GlassCard>
      )}

      {assessments.length === 0 && (
        <GlassCard padding="lg" className="text-center mt-6">
          <div className="inline-flex items-center justify-center mb-4 w-20 h-20 text-sky-lighter">
            <svg
              viewBox="0 0 64 64"
              className="w-full h-full animate-spin"
              style={{ animationDuration: '3s' }}
              aria-hidden
            >
              {/* Outer cowling */}
              <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.4" />
              <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.6" />
              {/* Fan blades (spinning part) */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <ellipse
                  key={deg}
                  cx="32"
                  cy="32"
                  rx="20"
                  ry="4"
                  fill="currentColor"
                  opacity="0.9"
                  transform={`rotate(${deg} 32 32)`}
                />
              ))}
              {/* Hub */}
              <circle cx="32" cy="32" r="6" fill="currentColor" opacity="0.8" />
              <circle cx="32" cy="32" r="3" fill="currentColor" />
            </svg>
          </div>
          <h2 className="text-2xl font-display font-bold mb-2">Get Started</h2>
          <p className="text-white/70 mb-6">
            Import your first assessment to begin comprehensive compliance analysis
          </p>
          <Button size="lg" onClick={handleImportAssessment}>
            Import Assessment
          </Button>
        </GlassCard>
      )}
    </div>
  );
}
