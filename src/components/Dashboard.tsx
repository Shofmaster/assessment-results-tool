import { useAppStore } from '../store/appStore';
import { FiFileText, FiFolder, FiBriefcase } from 'react-icons/fi';

export default function Dashboard() {
  const assessments = useAppStore((state) => state.assessments);
  const regulatoryFiles = useAppStore((state) => state.regulatoryFiles);
  const entityDocuments = useAppStore((state) => state.entityDocuments);
  const currentAnalysis = useAppStore((state) => state.currentAnalysis);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const addAssessment = useAppStore((state) => state.addAssessment);
  const activeProjectId = useAppStore((state) => state.activeProjectId);
  const getActiveProject = useAppStore((state) => state.getActiveProject);

  const activeProject = getActiveProject();

  // No active project — prompt to select or create one
  if (!activeProjectId || !activeProject) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="glass rounded-2xl p-12 text-center max-w-lg">
          <div className="text-6xl mb-4">📁</div>
          <h2 className="text-2xl font-display font-bold mb-2">Select a Project</h2>
          <p className="text-white/60 mb-6">
            Choose an existing project from the sidebar or create a new one to get started.
          </p>
          <button
            onClick={() => setCurrentView('projects')}
            className="px-8 py-3 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all flex items-center gap-2 mx-auto"
          >
            <FiBriefcase />
            Go to Projects
          </button>
        </div>
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
        const data = JSON.parse(text);
        addAssessment({
          id: `assessment-${Date.now()}`,
          data,
          importedAt: new Date().toISOString(),
        });
      }
    };
    input.click();
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
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 text-sky-lighter/60 text-sm mb-1">
          <FiBriefcase className="text-xs" />
          <span>{activeProject.name}</span>
        </div>
        <h1 className="text-4xl font-display font-bold mb-2 bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
          Dashboard
        </h1>
        <p className="text-white/60 text-lg">
          Comprehensive aviation quality assessment analysis powered by Claude AI
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="glass glass-hover rounded-2xl p-6 transition-all duration-300 hover:transform hover:scale-105"
            >
              <div className="flex items-center justify-between mb-4">
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}
                >
                  <Icon className="text-white text-xl" />
                </div>
              </div>
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <div className="text-white/60 text-sm">{stat.label}</div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <div className="glass rounded-2xl p-6 mb-8">
        <h2 className="text-xl font-display font-bold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={handleImportAssessment}
            className="flex items-center gap-3 p-4 bg-gradient-to-r from-sky to-sky-light rounded-xl hover:shadow-lg hover:shadow-sky/30 transition-all"
          >
            <FiFileText className="text-2xl" />
            <div className="text-left">
              <div className="font-semibold">Import Assessment</div>
              <div className="text-sm opacity-90">Load JSON assessment data</div>
            </div>
          </button>

          <button
            onClick={() => setCurrentView('library')}
            className="flex items-center gap-3 p-4 glass glass-hover rounded-xl transition-all"
          >
            <FiFolder className="text-2xl" />
            <div className="text-left">
              <div className="font-semibold">Manage Library</div>
              <div className="text-sm text-white/60">Add regulatory files & documents</div>
            </div>
          </button>
        </div>
      </div>

      {/* Recent Analysis */}
      {currentAnalysis && (
        <div className="glass rounded-2xl p-6">
          <h2 className="text-xl font-display font-bold mb-4">Latest Analysis</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-lg">{currentAnalysis.companyName}</div>
                <div className="text-white/60 text-sm">
                  Analyzed on {new Date(currentAnalysis.analysisDate).toLocaleDateString()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold mb-1">
                  {currentAnalysis.compliance.overall}%
                </div>
                <div className="text-white/60 text-sm">Compliance Score</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/10">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">
                  {currentAnalysis.compliance.criticalGaps}
                </div>
                <div className="text-white/60 text-sm">Critical</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-amber-400">
                  {currentAnalysis.compliance.majorGaps}
                </div>
                <div className="text-white/60 text-sm">Major</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-sky-light">
                  {currentAnalysis.compliance.minorGaps}
                </div>
                <div className="text-white/60 text-sm">Minor</div>
              </div>
            </div>

            <button
              onClick={() => setCurrentView('analysis')}
              className="w-full py-3 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all mt-4"
            >
              View Full Analysis
            </button>
          </div>
        </div>
      )}

      {/* Getting Started */}
      {assessments.length === 0 && (
        <div className="glass rounded-2xl p-8 text-center">
          <div className="text-sky-lighter text-6xl mb-4">🚀</div>
          <h2 className="text-2xl font-display font-bold mb-2">Get Started</h2>
          <p className="text-white/60 mb-6">
            Import your first assessment to begin comprehensive compliance analysis
          </p>
          <button
            onClick={handleImportAssessment}
            className="px-8 py-3 bg-gradient-to-r from-sky to-sky-light rounded-xl font-semibold hover:shadow-lg hover:shadow-sky/30 transition-all"
          >
            Import Assessment
          </button>
        </div>
      )}
    </div>
  );
}
