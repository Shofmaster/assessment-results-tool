import { Suspense, lazy, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { FiMenu } from 'react-icons/fi';
import { Toaster } from 'sonner';
import AuthGate from './components/AuthGate';
import ErrorBoundary from './components/ErrorBoundary';
import MigrationBanner from './components/MigrationBanner';
import Sidebar from './components/Sidebar';
import { useIsAdmin } from './hooks/useConvexData';
const Dashboard = lazy(() => import('./components/Dashboard'));
const LibraryManager = lazy(() => import('./components/LibraryManager'));
const AnalysisView = lazy(() => import('./components/AnalysisView'));
const AuditSimulation = lazy(() => import('./components/AuditSimulation'));
const Settings = lazy(() => import('./components/Settings'));
const ProjectManager = lazy(() => import('./components/ProjectManager'));
const RevisionTracker = lazy(() => import('./components/RevisionTracker'));
const PaperworkReview = lazy(() => import('./components/PaperworkReview'));
const GuidedAudit = lazy(() => import('./components/GuidedAudit'));
const EntityIssues = lazy(() => import('./components/EntityIssues'));
const InspectionSchedule = lazy(() => import('./components/InspectionSchedule'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));

const VIEW_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/library': 'Library',
  '/analysis': 'Analysis',
  '/audit': 'Audit Simulation',
  '/review': 'Paperwork Review',
  '/entity-issues': 'Entity issues',
  '/guided-audit': 'Guided Audit',
  '/revisions': 'Revisions',
  '/schedule': 'Schedule',
  '/projects': 'Projects',
  '/settings': 'Settings',
  '/admin': 'Admin',
};

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const viewTitle = VIEW_TITLES[location.pathname] || 'AeroGap';
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  // When a component requests navigation via setCurrentView (e.g. GoogleDriveImport), sync to router
  useEffect(() => {
    if (!currentView) return;
    const path = currentView.startsWith('/') ? currentView : `/${currentView}`;
    navigate(path);
    setCurrentView(null);
  }, [currentView, navigate, setCurrentView]);

  return (
    <AuthGate>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            color: '#f1f5f9',
            backdropFilter: 'blur(12px)',
          },
        }}
        richColors
        closeButton
      />
      <div className="flex h-dvh min-h-0 bg-gradient-to-br from-navy-900 to-navy-700 overflow-hidden">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Sidebar
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
          onNavigate={() => setMobileSidebarOpen(false)}
        />

        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
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
              <div className="text-xs text-white/70 truncate">AeroGap</div>
            </div>
          </header>

          <main id="main-content" className="flex-1 min-h-0 overflow-auto overflow-x-hidden" tabIndex={-1}>
            <MigrationBanner />
            <Suspense
              fallback={
                <div className="flex flex-col items-center justify-center h-full gap-6 p-8">
                  <div className="relative h-12 w-12">
                    <div className="absolute inset-0 rounded-full border-2 border-white/10" />
                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-sky animate-spin" />
                  </div>
                  <div className="w-full max-w-md space-y-4">
                    <div className="h-4 w-3/4 mx-auto rounded-full bg-white/5 animate-pulse" />
                    <div className="h-3 w-1/2 mx-auto rounded-full bg-white/5 animate-pulse [animation-delay:150ms]" />
                    <div className="h-3 w-2/3 mx-auto rounded-full bg-white/5 animate-pulse [animation-delay:300ms]" />
                  </div>
                  <span className="text-sm text-white/70 tracking-wide">Loading&hellip;</span>
                </div>
              }
            >
              <Routes>
                <Route path="/" element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
                <Route path="/library" element={<ErrorBoundary><LibraryManager /></ErrorBoundary>} />
                <Route path="/analysis" element={<ErrorBoundary><AnalysisView /></ErrorBoundary>} />
                <Route path="/audit" element={<ErrorBoundary><AuditSimulation /></ErrorBoundary>} />
                <Route path="/review" element={<ErrorBoundary><PaperworkReview /></ErrorBoundary>} />
                <Route path="/entity-issues" element={<ErrorBoundary><EntityIssues /></ErrorBoundary>} />
                <Route path="/guided-audit" element={<ErrorBoundary><GuidedAudit /></ErrorBoundary>} />
                <Route path="/revisions" element={<ErrorBoundary><RevisionTracker /></ErrorBoundary>} />
                <Route path="/schedule" element={<ErrorBoundary><InspectionSchedule /></ErrorBoundary>} />
                <Route path="/projects" element={<ErrorBoundary><ProjectManager /></ErrorBoundary>} />
                <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
                {isAdmin && <Route path="/admin" element={<ErrorBoundary><AdminPanel /></ErrorBoundary>} />}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}

export default App;
