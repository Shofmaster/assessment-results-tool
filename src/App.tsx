import { Suspense, lazy, useMemo, useState } from 'react';
import { FiMenu } from 'react-icons/fi';
import AuthGate from './components/AuthGate';
import MigrationBanner from './components/MigrationBanner';
import Sidebar from './components/Sidebar';
import { useIsAdmin } from './hooks/useConvexData';
import { useAppStore } from './store/appStore';

const Dashboard = lazy(() => import('./components/Dashboard'));
const LibraryManager = lazy(() => import('./components/LibraryManager'));
const AnalysisView = lazy(() => import('./components/AnalysisView'));
const AuditSimulation = lazy(() => import('./components/AuditSimulation'));
const Settings = lazy(() => import('./components/Settings'));
const ProjectManager = lazy(() => import('./components/ProjectManager'));
const RevisionTracker = lazy(() => import('./components/RevisionTracker'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));

function App() {
  const currentView = useAppStore((state) => state.currentView);
  const isAdmin = useIsAdmin();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const viewTitle = useMemo(() => {
    switch (currentView) {
      case 'dashboard':
        return 'Dashboard';
      case 'library':
        return 'Library';
      case 'analysis':
        return 'Analysis';
      case 'audit':
        return 'Audit Simulation';
      case 'revisions':
        return 'Revisions';
      case 'projects':
        return 'Projects';
      case 'settings':
        return 'Settings';
      case 'admin':
        return 'Admin';
      default:
        return 'Assessment Analyzer';
    }
  }, [currentView]);

  return (
    <AuthGate>
      <div className="flex h-dvh bg-gradient-to-br from-navy-900 to-navy-700 overflow-hidden">
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          onNavigate={() => setMobileSidebarOpen(false)}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-navy-900/40 backdrop-blur">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className="p-2 -ml-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Open menu"
              aria-expanded={mobileSidebarOpen}
              aria-controls="mobile-sidebar"
            >
              <FiMenu className="text-xl" />
            </button>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{viewTitle}</div>
              <div className="text-xs text-white/40 truncate">Aviation Quality</div>
            </div>
          </header>

          <main className="flex-1 overflow-auto">
            <MigrationBanner />
            <Suspense
              fallback={
                <div className="p-8 text-white/60">
                  Loading...
                </div>
              }
            >
              {currentView === 'dashboard' && <Dashboard />}
              {currentView === 'library' && <LibraryManager />}
              {currentView === 'analysis' && <AnalysisView />}
              {currentView === 'audit' && <AuditSimulation />}
              {currentView === 'settings' && <Settings />}
              {currentView === 'revisions' && <RevisionTracker />}
              {currentView === 'projects' && <ProjectManager />}
              {currentView === 'admin' && isAdmin && <AdminPanel />}
            </Suspense>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}

export default App;
