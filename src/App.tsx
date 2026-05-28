import { Suspense, lazy, useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAppStore } from './store/appStore';
import { FiHelpCircle, FiHome, FiMenu, FiMoon, FiSun } from 'react-icons/fi';
import { Toaster } from 'sonner';
import AuthGate from './components/AuthGate';
import ErrorBoundary from './components/ErrorBoundary';
import MigrationBanner from './components/MigrationBanner';
import Sidebar from './components/Sidebar';
import {
  useIsAdmin,
  useIsAerogapEmployee,
  useListWhereCanManageProjectsCompanies,
  useMyAdminCompanies,
} from './hooks/useConvexData';
import { useTheme } from './context/ThemeContext';
import { LEGAL_DOC_BY_PATH } from './legal/legalContent';
const CompanyLibrary = lazy(() => import('./components/CompanyLibrary'));
const TechnicalPublicationViewer = lazy(() => import('./components/TechnicalPublicationViewer'));
const ComplianceReport = lazy(() => import('./components/ComplianceReport'));
const AnalysisView = lazy(() => import('./components/AnalysisView'));
const AuditSimulation = lazy(() => import('./components/AuditSimulation'));
const Settings = lazy(() => import('./components/Settings'));
const RevisionTracker = lazy(() => import('./components/RevisionTracker'));
const PaperworkReview = lazy(() => import('./components/PaperworkReview'));
const GuidedAudit = lazy(() => import('./components/GuidedAudit'));
const EntityIssues = lazy(() => import('./components/EntityIssues'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard'));
const ReportBuilder = lazy(() => import('./components/ReportBuilder'));
const ManualWriter = lazy(() => import('./components/ManualWriter'));
const ManualManagement = lazy(() => import('./components/ManualManagement'));
const LogbookRouteGuard = lazy(() => import('./components/LogbookRouteGuard'));
const LogbookEntryReviewPage = lazy(() => import('./components/LogbookEntryReviewPage'));
const FleetView = lazy(() => import('./components/FleetView'));
const Form337 = lazy(() => import('./components/Form337'));
const AerogapDashboard = lazy(() => import('./components/AerogapDashboard'));
const CompanyBrowser = lazy(() => import('./components/CompanyBrowser'));
const TenantCompanyAdmin = lazy(() => import('./components/TenantCompanyAdmin'));
const Checklists = lazy(() => import('./components/Checklists'));
const HelpCenter = lazy(() => import('./components/HelpCenter'));
const SplashPage = lazy(() => import('./components/SplashPage'));
const Roster = lazy(() => import('./components/Roster'));
const ComplianceDashboard = lazy(() => import('./components/ComplianceDashboard'));
const CompanyProjectsPage = lazy(() => import('./components/CompanyProjectsPage'));
const DctCompliance = lazy(() => import('./components/DctCompliance'));
const InspectionSchedule = lazy(() => import('./components/InspectionSchedule'));
const LegalPage = lazy(() => import('./components/public/LegalPage'));

const VIEW_TITLES: Record<string, string> = {
  '/splash': 'Home',
  '/': 'Logbook Management',
  '/library': 'Library',
  '/compliance-report': 'Compliance report',
  '/analysis': 'Analysis',
  '/audit': 'Audit Simulation',
  '/review': 'Paperwork Review',
  '/entity-issues': 'CARs & Issues',
  '/roster': 'Roster',
  '/guided-audit': 'Guided Audit',
  '/revisions': 'Revisions',
  '/schedule': 'Recurring Schedule',
  '/logbook': 'Logbook Management',
  '/logbook/entry-review': 'Entry Review',
  '/form-337': 'FAA Form 337',
  '/analytics': 'Analytics',
  '/report': 'Report Builder',
  '/checklists': 'Checklists',
  '/manual-writer': 'Manual Writer',
  '/manual-management': 'Manual Management',
  '/aerogap-dashboard': 'AeroGap Dashboard',
  '/companies': 'Companies',
  '/company-admin': 'Company admin',
  '/settings': 'Settings',
  '/admin': 'Admin',
  '/help': 'Help Center',
  '/quality-command-center': 'Quality & Compliance',
  '/compliance-dashboard': 'Quality & Compliance',
  '/dct-compliance': 'DCT Compliance',
  '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service',
};

function CompanyAdminHomeRoute() {
  const adminCompanies = useMyAdminCompanies();
  const managedCompanies = useListWhereCanManageProjectsCompanies();
  if (adminCompanies === undefined || managedCompanies === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3 p-8">
        <div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-sky animate-spin" />
        <p className="text-sm text-white/70">Loading company access...</p>
      </div>
    );
  }
  if (!managedCompanies.length) {
    return (
      <div className="w-full min-w-0 p-4 sm:p-6 lg:p-8 h-full min-h-0 overflow-auto">
        <div className="max-w-3xl mx-auto rounded-2xl border border-amber-300/30 bg-amber-500/10 p-5">
          <h1 className="text-xl font-semibold text-white">Company administration access required</h1>
          <p className="text-sm text-white/70 mt-2">
            Your account does not currently have company administrator or manager membership.
          </p>
          <p className="text-sm text-white/70 mt-2">
            Ask an organization admin to grant <code>company_admin</code> or <code>company_manager</code>.
          </p>
          <div className="mt-4">
            <Link
              to="/settings"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-sky-light/40 bg-sky/20 text-sky-lighter text-sm font-medium hover:bg-sky/30 transition-colors"
            >
              Back to Settings
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <TenantCompanyAdmin />;
}

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const isAerogapEmployee = useIsAerogapEmployee();
  const { theme, toggleTheme } = useTheme();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const viewTitle = /^\/companies\/[^/]+\/projects$/.test(location.pathname)
    ? 'Company projects'
    : VIEW_TITLES[location.pathname] || 'AeroGap';
  const currentView = useAppStore((s) => s.currentView);
  const setCurrentView = useAppStore((s) => s.setCurrentView);

  // When a component requests navigation via setCurrentView (e.g. GoogleDriveImport), sync to router
  useEffect(() => {
    if (!currentView) return;
    const path = currentView.startsWith('/') ? currentView : `/${currentView}`;
    navigate(path);
    setCurrentView(null);
  }, [currentView, navigate, setCurrentView]);

  const isDarkMode = theme === 'dark';
  const toasterStyle = isDarkMode
    ? {
        background: 'rgba(15, 23, 42, 0.95)',
        border: '1px solid rgba(255,255,255,0.1)',
        color: '#f1f5f9',
        backdropFilter: 'blur(12px)',
      }
    : {
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid rgba(15, 23, 42, 0.12)',
        color: '#0f172a',
        backdropFilter: 'blur(12px)',
      };

  const themeToggleLabel = isDarkMode ? 'Switch to light mode' : 'Switch to dark mode';
  const desktopHeaderClass = isDarkMode
    ? 'border-white/10 bg-navy-900/40'
    : 'border-slate-200/90 bg-white/72 shadow-sm shadow-slate-300/30';
  const mobileHeaderClass = isDarkMode
    ? 'border-white/10 bg-navy-900/40'
    : 'border-slate-200/90 bg-white/80 shadow-sm shadow-slate-300/30';
  const headerTitleClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const headerButtonClass = isDarkMode
    ? 'border-white/15 text-white/80 hover:text-white hover:bg-white/5'
    : 'border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100';
  const desktopControlClass = `inline-flex h-9 items-center justify-center gap-2 px-3 rounded-lg border text-sm font-medium transition-colors ${headerButtonClass}`;
  const mobileIconControlClass = `inline-flex h-9 w-9 items-center justify-center rounded-lg border transition-colors ${headerButtonClass}`;
  const mobileTextControlClass = `inline-flex h-9 items-center justify-center gap-1.5 px-3 rounded-lg border text-xs font-medium transition-colors ${headerButtonClass}`;
  const desktopActionIconClass = 'text-[15px]';
  const mobileActionIconClass = 'text-base';

  return (
    <AuthGate>
      <Toaster
        position="top-right"
        toastOptions={{
          style: toasterStyle,
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
          <header className={`hidden md:flex items-center justify-between px-5 py-3 border-b backdrop-blur ${desktopHeaderClass}`}>
            <div className="min-w-0">
              <div className={`text-sm font-semibold tracking-wide truncate ${headerTitleClass}`}>{viewTitle}</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className={desktopControlClass}
                aria-label={themeToggleLabel}
                title={themeToggleLabel}
              >
                {isDarkMode ? <FiSun className={desktopActionIconClass} /> : <FiMoon className={desktopActionIconClass} />}
                <span className="text-sm font-medium">{isDarkMode ? 'Light' : 'Dark'} mode</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/help')}
                className={desktopControlClass}
                aria-label="Open Help Center"
              >
                <FiHelpCircle className={desktopActionIconClass} />
                <span className="text-sm font-medium">Help</span>
              </button>
            </div>
          </header>
          <header className={`md:hidden flex items-center gap-3 px-4 py-3 border-b backdrop-blur ${mobileHeaderClass}`}>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              className={`p-2 -ml-2 rounded-lg transition-colors ${
                isDarkMode ? 'text-white/60 hover:text-white hover:bg-white/5' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
              aria-label="Open menu"
              aria-expanded={mobileSidebarOpen}
              aria-controls="mobile-sidebar"
            >
                <FiMenu className={mobileActionIconClass} />
            </button>
            <div className="min-w-0">
              <div className={`text-sm font-semibold truncate ${headerTitleClass}`}>{viewTitle}</div>
              <button
                type="button"
                onClick={() => navigate('/splash')}
                className={`text-left max-w-full underline-offset-2 hover:underline ${
                  isDarkMode ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <span className={`block text-xs font-semibold truncate ${headerTitleClass}`}>AeroGap</span>
              </button>
            </div>
            <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={toggleTheme}
                className={mobileIconControlClass}
                aria-label={themeToggleLabel}
                title={themeToggleLabel}
              >
                {isDarkMode ? <FiSun className={mobileActionIconClass} /> : <FiMoon className={mobileActionIconClass} />}
              </button>
              <button
                type="button"
                onClick={() => navigate('/splash')}
                className={mobileIconControlClass}
                aria-label="Go to home"
              >
                <FiHome className={mobileActionIconClass} />
              </button>
              <button
                type="button"
                onClick={() => navigate('/help')}
                className={mobileTextControlClass}
                aria-label="Open Help Center"
              >
                <FiHelpCircle className={mobileActionIconClass} />
                <span className="text-xs font-medium">Help</span>
              </button>
            </div>
          </header>

          <main id="main-content" className="flex min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto" tabIndex={-1}>
            <MigrationBanner />
            <div className="flex min-h-0 flex-1 flex-col">
            <Suspense
              fallback={
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 p-8">
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
                <Route path="/" element={<Navigate to="/splash" replace />} />
                <Route path="/splash" element={<ErrorBoundary><SplashPage /></ErrorBoundary>} />
                <Route path="/library" element={<ErrorBoundary><CompanyLibrary /></ErrorBoundary>} />
                <Route
                  path="/library/publication/:publicationId"
                  element={<ErrorBoundary><TechnicalPublicationViewer /></ErrorBoundary>}
                />
                <Route path="/compliance-report" element={<ErrorBoundary><ComplianceReport /></ErrorBoundary>} />
                <Route path="/analysis" element={<ErrorBoundary><AnalysisView /></ErrorBoundary>} />
                <Route path="/audit" element={<ErrorBoundary><AuditSimulation /></ErrorBoundary>} />
                <Route path="/review" element={<ErrorBoundary><PaperworkReview /></ErrorBoundary>} />
                <Route path="/quality-command-center" element={<ErrorBoundary><ComplianceDashboard /></ErrorBoundary>} />
                <Route path="/compliance-dashboard" element={<Navigate to="/quality-command-center" replace />} />
                <Route path="/entity-issues" element={<ErrorBoundary><EntityIssues /></ErrorBoundary>} />
                <Route path="/roster" element={<ErrorBoundary><Roster /></ErrorBoundary>} />
                <Route path="/guided-audit" element={<ErrorBoundary><GuidedAudit /></ErrorBoundary>} />
                <Route path="/revisions" element={<ErrorBoundary><RevisionTracker /></ErrorBoundary>} />
                <Route path="/dct-compliance" element={<ErrorBoundary><DctCompliance /></ErrorBoundary>} />
                <Route path="/schedule" element={<ErrorBoundary><InspectionSchedule /></ErrorBoundary>} />
                <Route path="/logbook" element={<ErrorBoundary><LogbookRouteGuard /></ErrorBoundary>} />
                <Route path="/logbook/entry-review" element={<ErrorBoundary><LogbookEntryReviewPage /></ErrorBoundary>} />
                <Route path="/fleet" element={<ErrorBoundary><FleetView /></ErrorBoundary>} />
                <Route path="/form-337" element={<ErrorBoundary><Form337 /></ErrorBoundary>} />
                <Route path="/analytics" element={<ErrorBoundary><AnalyticsDashboard /></ErrorBoundary>} />
                <Route path="/report" element={<ErrorBoundary><ReportBuilder /></ErrorBoundary>} />
                <Route path="/checklists" element={<ErrorBoundary><Checklists /></ErrorBoundary>} />
                <Route path="/manual-writer" element={<ErrorBoundary><ManualWriter /></ErrorBoundary>} />
                <Route path="/manual-management" element={<ErrorBoundary><ManualManagement /></ErrorBoundary>} />
                {isAerogapEmployee && <Route path="/aerogap-dashboard" element={<ErrorBoundary><AerogapDashboard /></ErrorBoundary>} />}
                {isAerogapEmployee && <Route path="/companies" element={<ErrorBoundary><CompanyBrowser /></ErrorBoundary>} />}
                <Route
                  path="/companies/:companyId/projects"
                  element={<ErrorBoundary><CompanyProjectsPage /></ErrorBoundary>}
                />
                <Route path="/company-admin" element={<ErrorBoundary><CompanyAdminHomeRoute /></ErrorBoundary>} />
                <Route path="/projects" element={<Navigate to="/logbook" replace />} />
                <Route path="/settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
                {isAdmin && <Route path="/admin" element={<ErrorBoundary><AdminPanel /></ErrorBoundary>} />}
                <Route path="/help" element={<ErrorBoundary><HelpCenter /></ErrorBoundary>} />
                <Route path="/privacy" element={<ErrorBoundary><LegalPage doc={LEGAL_DOC_BY_PATH.get('/privacy')!} /></ErrorBoundary>} />
                <Route path="/terms" element={<ErrorBoundary><LegalPage doc={LEGAL_DOC_BY_PATH.get('/terms')!} /></ErrorBoundary>} />
                <Route path="*" element={<Navigate to="/splash" replace />} />
              </Routes>
            </Suspense>
            </div>
          </main>
        </div>
      </div>
    </AuthGate>
  );
}

export default App;
