import { Suspense, lazy, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { FiMenu } from 'react-icons/fi';
import { Toaster } from 'sonner';
import AuthGate from './components/AuthGate';
import ErrorBoundary from './components/ErrorBoundary';
import MigrationBanner from './components/MigrationBanner';
import Sidebar from './components/Sidebar';
import { useIsAdmin, useUserSettings } from './hooks/useConvexData';
import { setProvider, setModel, DEFAULT_PROVIDER, DEFAULT_MODEL } from './services/modelConfig';

const Dashboard = lazy(() => import('./components/Dashboard'));
const LibraryManager = lazy(() => import('./components/LibraryManager'));
const AnalysisView = lazy(() => import('./components/AnalysisView'));
const AuditSimulation = lazy(() => import('./components/AuditSimulation'));
const Settings = lazy(() => import('./components/Settings'));
const ProjectManager = lazy(() => import('./components/ProjectManager'));
const RevisionTracker = lazy(() => import('./components/RevisionTracker'));
const PaperworkReview = lazy(() => import('./components/PaperworkReview'));
const GuidedAudit = lazy(() => import('./components/GuidedAudit'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));

const VIEW_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/library': 'Library',
  '/analysis': 'Analysis',
  '/audit': 'Audit Simulation',
  '/review': 'Paperwork Review',
  '/guided-audit': 'Guided Audit',
  '/revisions': 'Revisions',
  '/projects': 'Projects',
  '/settings': 'Settings',
  '/admin': 'Admin',
};

/** Routes for Ctrl+1 .. Ctrl+7 (must match Sidebar menu order for first 7 items). */
const NAV_SHORTCUT_ROUTES: [number, string][] = [
  [1, '/'],
  [2, '/guided-audit'],
  [3, '/library'],
  [4, '/analysis'],
  [5, '/audit'],
  [6, '/review'],
  [7, '/revisions'],
];

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const userSettings = useUserSettings();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const viewTitle = VIEW_TITLES[location.pathname] || 'Assessment Analyzer';
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  // When a component requests navigation via setCurrentView (e.g. GoogleDriveImport), sync to router
  useEffect(() => {
    if (!currentView) return;
    const path = currentView.startsWith('/') ? currentView : `/${currentView}`;
    navigate(path);
    setCurrentView(null);
  }, [currentView, navigate, setCurrentView]);

  // Sync LLM provider and model from Convex into module-level config
  useEffect(() => {
    const provider = (userSettings?.llmProvider as 'anthropic' | 'openai') || DEFAULT_PROVIDER;
    const model = userSettings?.llmModel ?? userSettings?.claudeModel ?? DEFAULT_MODEL;
    setProvider(provider);
    setModel(model);
  }, [userSettings?.llmProvider, userSettings?.llmModel, userSettings?.claudeModel]);

  // Keyboard shortcuts: Ctrl+1 .. Ctrl+7 for view navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;
      const target = e.target as HTMLElement;
      const inInput = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if (!isCtrl || inInput) return;

      const num = e.key >= '1' && e.key <= '7' ? parseInt(e.key, 10) : 0;
      if (!num) return;

      const entry = NAV_SHORTCUT_ROUTES.find(([n]) => n === num);
      if (entry) {
        e.preventDefault();
        navigate(entry[1]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [navigate]);

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
      <div className="flex h-dvh bg-gradient-to-br from-navy-900 to-navy-700 overflow-hidden">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
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
              <div className="text-xs text-white/70 truncate">Aviation Quality</div>
            </div>
          </header>

          <main id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
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
                <Route path="/guided-audit" element={<ErrorBoundary><GuidedAudit /></ErrorBoundary>} />
                <Route path="/revisions" element={<ErrorBoundary><RevisionTracker /></ErrorBoundary>} />
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
