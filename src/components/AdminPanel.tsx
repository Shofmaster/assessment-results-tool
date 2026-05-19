import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiShield, FiUsers, FiFile, FiBookOpen, FiCheckCircle, FiToggleRight, FiBook, FiSliders, FiCreditCard } from 'react-icons/fi';
import { useFocusViewHeading } from '../hooks/useFocusViewHeading';
import { Button, GlassCard } from './ui';
import { useUserSettings, useIsAerogapEmployee, useMyAdminCompanies } from '../hooks/useConvexData';
import type { UploadCategory } from '../services/documentTypeResolver';
import CompanyAdminPanel from './CompanyAdminPanel';
import AdminKbTab from './AdminKbTab';
import AdminRefDocsTab from './AdminRefDocsTab';
import AdminTogglesTab from './AdminTogglesTab';
import AdminUsersTab from './AdminUsersTab';
import AdminLibraryTab, { type LibrarySubTab } from './AdminLibraryTab';
import AdminAuditorDocsTab from './AdminAuditorDocsTab';
import AdminBillingTab from './billing/AdminBillingTab';

type TabId = 'kb' | 'refdocs' | 'users' | 'library' | 'auditor-docs' | 'toggles' | 'companies' | 'billing';

function NeedsCompanyScopeCard({ message, navigate }: { message: string; navigate: (path: string) => void }) {
  return (
    <GlassCard border rounded="xl" className="p-8 text-center max-w-lg mx-auto">
      <h3 className="text-lg font-display font-bold text-white mb-2">Select a company</h3>
      <p className="text-sm text-white/70 mb-6">{message}</p>
      <Button size="lg" onClick={() => navigate('/companies')}>Open Companies</Button>
    </GlassCard>
  );
}

export default function AdminPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);
  const navigate = useNavigate();
  const sidebarSettings = useUserSettings();
  const isStaff = useIsAerogapEmployee();
  const myAdminCompanies = useMyAdminCompanies() as any[] | undefined;
  const adminScopeCompanyId = isStaff
    ? (sidebarSettings?.activeCompanyId as string | undefined)
    : myAdminCompanies?.[0]?._id
      ? String(myAdminCompanies[0]._id)
      : undefined;
  const needsCompanyScope = Boolean(isStaff && !adminScopeCompanyId);

  const [tab, setTab] = useState<TabId>('kb');
  const [pendingToggleUserId, setPendingToggleUserId] = useState<string>('');
  const [librarySubTab, setLibrarySubTab] = useState<LibrarySubTab>('regulatory');

  const handleConfigureUser = (userId: string) => {
    setPendingToggleUserId(userId);
    setTab('toggles');
  };

  const handleRouteUploadForCategory = (category: UploadCategory) => {
    if (category === 'reference') { setTab('refdocs'); return; }
    setTab('library');
    setLibrarySubTab(category === 'sms' ? 'sms' : 'regulatory');
  };

  const tabBtn = (id: TabId, label: React.ReactNode) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-sky/20 text-sky-lighter border border-sky-light/30' : 'text-white/60 hover:text-white hover:bg-white/5'}`}
    >
      {label}
    </button>
  );

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
      <div className="flex items-center gap-3 mb-8">
        <FiShield className="text-3xl text-sky-light" />
        <div>
          <h1 className="text-2xl font-display font-bold text-white">Admin Panel</h1>
          <p className="text-white/70 text-sm">
            Manage shared knowledge bases and user roles
            {adminScopeCompanyId ? (
              <span className="text-sky-lighter/90"> · scoped to current company</span>
            ) : isStaff ? (
              <span className="text-amber-200/80"> · select a company in the sidebar or Companies page</span>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {tabBtn('kb', <><FiFile className="inline mr-2" />Knowledge Bases</>)}
        {tabBtn('refdocs', <><FiBookOpen className="inline mr-2" />Reference Documents</>)}
        {tabBtn('users', <><FiUsers className="inline mr-2" />Users</>)}
        {tabBtn('companies', <><FiShield className="inline mr-2" />Companies</>)}
        {tabBtn('billing', <><FiCreditCard className="inline mr-2" />Billing</>)}
        {tabBtn('toggles', <><FiToggleRight className="inline mr-2" />Feature Toggles</>)}
        {tabBtn('library', <><FiBook className="inline mr-2" />Library</>)}
        {tabBtn('auditor-docs', <><FiCheckCircle className="inline mr-2" />Auditor Docs</>)}
      </div>

      {tab === 'kb' && (
        needsCompanyScope
          ? <NeedsCompanyScopeCard navigate={navigate} message="Use the sidebar company scope or the Companies page before managing shared knowledge bases." />
          : <AdminKbTab adminScopeCompanyId={adminScopeCompanyId} isStaff={isStaff} />
      )}

      {tab === 'refdocs' && (
        needsCompanyScope
          ? <NeedsCompanyScopeCard navigate={navigate} message="Use the sidebar company scope or the Companies page before managing reference documents." />
          : <AdminRefDocsTab adminScopeCompanyId={adminScopeCompanyId} isStaff={isStaff} />
      )}

      {tab === 'toggles' && (
        needsCompanyScope
          ? <NeedsCompanyScopeCard navigate={navigate} message="User directory filtering uses your sidebar company scope. Choose a company to list tenant users and platform staff together." />
          : <AdminTogglesTab adminScopeCompanyId={adminScopeCompanyId} initialUserId={pendingToggleUserId} />
      )}

      {tab === 'users' && (
        needsCompanyScope
          ? <NeedsCompanyScopeCard navigate={navigate} message="The user list is filtered to the company in your sidebar scope (plus platform staff)." />
          : <AdminUsersTab adminScopeCompanyId={adminScopeCompanyId} onConfigureUser={handleConfigureUser} />
      )}

      {tab === 'library' && (
        needsCompanyScope
          ? <NeedsCompanyScopeCard navigate={navigate} message="Library management is aggregated for the tenant in your sidebar scope (all projects in that company)." />
          : <AdminLibraryTab adminScopeCompanyId={adminScopeCompanyId} librarySubTab={librarySubTab} onSetLibrarySubTab={setLibrarySubTab} />
      )}

      {tab === 'auditor-docs' && (
        needsCompanyScope
          ? <NeedsCompanyScopeCard navigate={navigate} message="Auditor coverage uses the library for the selected company. Set company scope in the sidebar first." />
          : <AdminAuditorDocsTab adminScopeCompanyId={adminScopeCompanyId} onRouteUploadForCategory={handleRouteUploadForCategory} />
      )}

      {tab === 'billing' && <AdminBillingTab />}

      {tab === 'companies' && (
        <GlassCard border rounded="xl">
          <div className="p-4 border-b border-white/10">
            <h3 className="text-lg font-display font-bold text-white">Company Structure</h3>
            <p className="text-xs text-white/60 mt-1">Manage companies, memberships, delegated support assignments, and company-level feature policy.</p>
          </div>
          <div className="p-4">
            <CompanyAdminPanel mode="platform" />
          </div>
        </GlassCard>
      )}
    </div>
  );
}
