import { useAppStore } from './store/appStore';
import AuthGate from './components/AuthGate';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import LibraryManager from './components/LibraryManager';
import AnalysisView from './components/AnalysisView';
import AuditSimulation from './components/AuditSimulation';
import Settings from './components/Settings';
import ProjectManager from './components/ProjectManager';
import RevisionTracker from './components/RevisionTracker';

function App() {
  const currentView = useAppStore((state) => state.currentView);

  return (
    <AuthGate>
      <div className="flex h-screen bg-gradient-to-br from-navy-900 to-navy-700">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {currentView === 'dashboard' && <Dashboard />}
          {currentView === 'library' && <LibraryManager />}
          {currentView === 'analysis' && <AnalysisView />}
          {currentView === 'audit' && <AuditSimulation />}
          {currentView === 'settings' && <Settings />}
          {currentView === 'revisions' && <RevisionTracker />}
          {currentView === 'projects' && <ProjectManager />}
        </main>
      </div>
    </AuthGate>
  );
}

export default App;
