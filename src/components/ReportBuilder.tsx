import { useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiFileText, FiDownload, FiCheckSquare, FiSquare, FiLoader,
  FiBookOpen, FiAlertTriangle, FiTrendingUp, FiList, FiUsers, FiCheckCircle,
  FiCalendar, FiBarChart2,
} from 'react-icons/fi';
import { toast } from 'sonner';
import { useAppStore } from '../store/appStore';
import {
  useAnalyses,
  useEntityIssues,
  useSimulationResults,
  useDocumentReviews,
  useInspectionScheduleItems,
  useProjects,
} from '../hooks/useConvexData';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard } from './ui';
import {
  MasterReportGenerator,
  type ReportSections,
  type ReportData,
} from '../services/masterReportGenerator';

interface SectionConfig {
  key: keyof ReportSections;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ALL_SECTIONS: SectionConfig[] = [
  { key: 'coverPage', label: 'Cover Page', description: 'Title, organization name, project, and date', icon: FiBookOpen },
  { key: 'executiveSummary', label: 'Executive Summary', description: 'Compliance score, gap counts, and active CARs overview', icon: FiBarChart2 },
  { key: 'complianceScorecard', label: 'Compliance Scorecard', description: 'Per-category compliance scores with visual bars', icon: FiTrendingUp },
  { key: 'openFindings', label: 'Open Findings & Observations', description: 'All non-closed CARs with corrective action details', icon: FiAlertTriangle },
  { key: 'carStatusSummary', label: 'CAR Status Summary', description: 'CARs grouped by lifecycle status (open, in-progress, closed)', icon: FiCheckCircle },
  { key: 'simulationTranscript', label: 'Simulation Transcript', description: 'Audit simulation discrepancies and Round 1 excerpt', icon: FiUsers },
  { key: 'paperworkReviewFindings', label: 'Paperwork Review Findings', description: 'Document comparison findings from completed reviews', icon: FiCheckSquare },
  { key: 'recommendations', label: 'Recommendations', description: 'High/medium/low priority improvement recommendations', icon: FiList },
  { key: 'inspectionSchedule', label: 'Inspection Schedule', description: 'Recurring inspection and calibration requirements', icon: FiCalendar },
];

const DEFAULT_SECTIONS: ReportSections = {
  coverPage: true,
  executiveSummary: true,
  complianceScorecard: true,
  openFindings: true,
  carStatusSummary: true,
  simulationTranscript: false,
  paperworkReviewFindings: false,
  recommendations: true,
  inspectionSchedule: false,
};

function countLabel(items: any[] | undefined | null, singular: string, plural?: string): string {
  if (!items || items.length === 0) return 'None';
  return `${items.length} ${items.length === 1 ? singular : (plural ?? singular + 's')}`;
}

export default function ReportBuilder() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const navigate = useNavigate();
  const activeProjectId = useAppStore((s) => s.activeProjectId);
  const projects = (useProjects() ?? []) as any[];
  const activeProject = projects.find((p: any) => p._id === activeProjectId);

  const analyses = (useAnalyses(activeProjectId ?? undefined) ?? []) as any[];
  const entityIssues = (useEntityIssues(activeProjectId ?? undefined) ?? []) as any[];
  const simResults = (useSimulationResults(activeProjectId ?? undefined) ?? []) as any[];
  const docReviews = (useDocumentReviews(activeProjectId ?? undefined) ?? []) as any[];
  const scheduleItems = (useInspectionScheduleItems(activeProjectId ?? undefined) ?? []) as any[];

  const [sections, setSections] = useState<ReportSections>({ ...DEFAULT_SECTIONS });
  const [selectedSimId, setSelectedSimId] = useState<string>('');
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [generatingDOCX, setGeneratingDOCX] = useState(false);

  const toggleSection = (key: keyof ReportSections) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const latestAnalysis = analyses.length > 0
    ? analyses.sort((a: any, b: any) => b.analysisDate.localeCompare(a.analysisDate))[0]
    : undefined;

  const selectedSim = simResults.find((s: any) => s._id === selectedSimId) ?? (simResults.length > 0 ? simResults[0] : undefined);

  const buildReportData = useCallback((): ReportData => {
    return {
      projectName: activeProject?.name ?? 'Untitled Project',
      companyName: latestAnalysis?.companyName ?? activeProject?.name,
      reportDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
      latestAnalysis: latestAnalysis ?? undefined,
      entityIssues: entityIssues.length > 0 ? entityIssues : undefined,
      simulationResult: sections.simulationTranscript && selectedSim ? {
        name: selectedSim.name,
        messages: selectedSim.messages ?? [],
        discrepancies: selectedSim.discrepancies ?? [],
        agentIds: selectedSim.agentIds ?? [],
      } : undefined,
      documentReviews: docReviews.length > 0 ? docReviews : undefined,
      inspectionItems: scheduleItems.length > 0 ? scheduleItems : undefined,
    };
  }, [activeProject, latestAnalysis, entityIssues, sections.simulationTranscript, selectedSim, docReviews, scheduleItems]);

  const handleGeneratePDF = async () => {
    setGeneratingPDF(true);
    try {
      const gen = new MasterReportGenerator();
      const data = buildReportData();
      const bytes = await gen.generatePDF(sections, data);
      const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(activeProject?.name ?? 'AeroGap').replace(/\s+/g, '_')}_Audit_Report_${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF report downloaded');
    } catch (e: any) {
      toast.error(e?.message ?? 'PDF generation failed');
    } finally {
      setGeneratingPDF(false);
    }
  };

  const handleGenerateDOCX = async () => {
    setGeneratingDOCX(true);
    try {
      const gen = new MasterReportGenerator();
      const data = buildReportData();
      const blob = await gen.generateDOCX(sections, data);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(activeProject?.name ?? 'AeroGap').replace(/\s+/g, '_')}_Audit_Report_${new Date().toISOString().slice(0, 10)}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('DOCX report downloaded');
    } catch (e: any) {
      toast.error(e?.message ?? 'DOCX generation failed');
    } finally {
      setGeneratingDOCX(false);
    }
  };

  const selectedCount = Object.values(sections).filter(Boolean).length;

  // Preview: count items per section
  const openIssues = entityIssues.filter((i: any) => {
    const s = i.status ?? 'open';
    return s !== 'closed' && s !== 'voided';
  });
  const completedReviews = docReviews.filter((r: any) => r.status === 'completed');

  const sectionDataLabels: Partial<Record<keyof ReportSections, string>> = {
    executiveSummary: latestAnalysis ? `Based on analysis from ${new Date(latestAnalysis.analysisDate).toLocaleDateString()}` : 'No analysis found',
    complianceScorecard: latestAnalysis ? `${Object.keys(latestAnalysis.compliance?.byCategory ?? {}).length} categories` : 'No analysis found',
    openFindings: countLabel(openIssues, 'open CAR'),
    carStatusSummary: countLabel(entityIssues, 'CAR'),
    simulationTranscript: countLabel(simResults, 'simulation'),
    paperworkReviewFindings: countLabel(completedReviews, 'completed review'),
    recommendations: latestAnalysis ? countLabel(latestAnalysis.recommendations, 'recommendation') : 'No analysis found',
    inspectionSchedule: countLabel(scheduleItems, 'item'),
  };

  if (!activeProjectId) {
    return (
      <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0">
        <GlassCard padding="xl" className="text-center">
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">Pick or create a project to build a report.</p>
          <Button onClick={() => navigate('/projects')}>Go to Projects</Button>
        </GlassCard>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="p-3 sm:p-6 lg:p-8 w-full min-w-0 h-full overflow-auto">
      <div className="mb-6">
        <h1 className="text-3xl sm:text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Report Builder
        </h1>
        <p className="text-white/60 text-lg">
          Compose and export a professional audit report from all data sources.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Section selection panel */}
        <div className="lg:col-span-2 space-y-3">
          <GlassCard>
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Sections to Include</h2>
            <div className="space-y-2">
              {ALL_SECTIONS.map((sec) => {
                const enabled = sections[sec.key];
                const Icon = sec.icon;
                const dataLabel = sectionDataLabels[sec.key];
                return (
                  <button
                    key={sec.key}
                    type="button"
                    onClick={() => toggleSection(sec.key)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      enabled
                        ? 'bg-sky/10 border-sky/30 text-white'
                        : 'bg-white/3 border-white/8 text-white/60 hover:bg-white/5 hover:text-white/80'
                    }`}
                  >
                    <div className={`flex-shrink-0 ${enabled ? 'text-sky-light' : 'text-white/40'}`}>
                      {enabled ? <FiCheckSquare className="w-4 h-4" /> : <FiSquare className="w-4 h-4" />}
                    </div>
                    <Icon className={`w-4 h-4 flex-shrink-0 ${enabled ? 'text-sky-light' : 'text-white/40'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{sec.label}</div>
                      <div className="text-xs text-white/50 mt-0.5">{sec.description}</div>
                    </div>
                    {dataLabel && (
                      <span className={`text-xs flex-shrink-0 ${
                        dataLabel === 'None' || dataLabel.startsWith('No ')
                          ? 'text-white/30'
                          : 'text-sky-light/80'
                      }`}>
                        {dataLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </GlassCard>

          {/* Simulation selector (only when transcript section is on) */}
          {sections.simulationTranscript && simResults.length > 0 && (
            <GlassCard>
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Select Simulation</h2>
              <select
                value={selectedSimId}
                onChange={(e) => setSelectedSimId(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white focus:border-sky-light"
              >
                <option value="" className="bg-navy-900">Most recent simulation</option>
                {simResults.map((s: any) => (
                  <option key={s._id} value={s._id} className="bg-navy-900">
                    {s.name} — {new Date(s.createdAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </GlassCard>
          )}
        </div>

        {/* Preview + Generate panel */}
        <div className="space-y-4">
          <GlassCard>
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-4">Report Preview</h2>

            <div className="space-y-2 mb-5">
              <div className="text-xs text-white/50">Project</div>
              <div className="text-sm font-semibold text-white">{activeProject?.name ?? '—'}</div>
              {(latestAnalysis?.companyName || activeProject?.name) && (
                <>
                  <div className="text-xs text-white/50 mt-2">Organization</div>
                  <div className="text-sm text-white/90">{latestAnalysis?.companyName ?? activeProject?.name}</div>
                </>
              )}
              <div className="text-xs text-white/50 mt-2">Report Date</div>
              <div className="text-sm text-white/90">{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
            </div>

            {/* Section preview list */}
            <div className="border-t border-white/10 pt-4 mb-5">
              <div className="text-xs text-white/50 mb-3">{selectedCount} sections selected</div>
              <ol className="space-y-1">
                {ALL_SECTIONS.filter((s) => sections[s.key]).map((s, idx) => (
                  <li key={s.key} className="flex items-center gap-2 text-xs text-white/70">
                    <span className="text-white/30 w-4">{idx + 1}.</span>
                    <s.icon className="w-3 h-3 text-sky-light/70 flex-shrink-0" />
                    {s.label}
                  </li>
                ))}
              </ol>
              {selectedCount === 0 && (
                <p className="text-xs text-white/40 italic">No sections selected</p>
              )}
            </div>

            {/* Generate buttons */}
            <div className="space-y-2">
              <Button
                fullWidth
                icon={generatingPDF ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiFileText className="w-4 h-4" />}
                loading={generatingPDF}
                disabled={selectedCount === 0 || generatingPDF || generatingDOCX}
                onClick={handleGeneratePDF}
              >
                Generate PDF
              </Button>
              <Button
                fullWidth
                variant="secondary"
                icon={generatingDOCX ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiDownload className="w-4 h-4" />}
                loading={generatingDOCX}
                disabled={selectedCount === 0 || generatingPDF || generatingDOCX}
                onClick={handleGenerateDOCX}
              >
                Generate DOCX
              </Button>
            </div>
          </GlassCard>

          {/* Data availability summary */}
          <GlassCard>
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Data Available</h2>
            <div className="space-y-2 text-xs">
              {[
                { label: 'Analyses', count: analyses.length, path: '/analysis' },
                { label: 'CARs & Issues', count: entityIssues.length, path: '/entity-issues' },
                { label: 'Simulations', count: simResults.length, path: '/audit' },
                { label: 'Document Reviews', count: docReviews.length, path: '/review' },
                { label: 'Schedule Items', count: scheduleItems.length, path: '/schedule' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-white/60">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={item.count > 0 ? 'text-white/90 font-semibold' : 'text-white/30'}>{item.count}</span>
                    {item.count === 0 && (
                      <button
                        type="button"
                        onClick={() => navigate(item.path)}
                        className="text-sky-light/60 hover:text-sky-light underline"
                      >
                        Add
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
