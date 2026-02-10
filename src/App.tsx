import { Suspense, lazy } from 'react';
import { useAppStore } from './store/appStore';
import AuthGate from './components/AuthGate';
import Sidebar from './components/Sidebar';
import MigrationBanner from './components/MigrationBanner';
import { useIsAdmin } from './hooks/useConvexData';

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

  return (
    <AuthGate>
      <div className="flex h-screen bg-gradient-to-br from-navy-900 to-navy-700">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          <MigrationBanner />
          <Suspense
            fallback={
              <div className="p-8 text-white/60">
                Loading…
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
    </AuthGate>
  );
}

export default App;
