import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiShield, FiUsers, FiFile, FiBookOpen, FiCheckCircle, FiToggleRight, FiBook, FiCreditCard, FiUserCheck, FiMessageSquare } from 'react-icons/fi';
import { Button, GlassCard } from './ui';
import { SettingsShell, type SettingsSection } from './settings/SettingsShell';
import { useUserSettings, useIsAerogapEmployee, useMyAdminCompanies, usePendingUsers } from '../hooks/useConvexData';
import type { UploadCategory } from '../services/documentTypeResolver';
import CompanyAdminPanel from './CompanyAdminPanel';
import AdminKbTab from './AdminKbTab';
import AdminRefDocsTab from './AdminRefDocsTab';
import AdminTogglesTab from './AdminTogglesTab';
import AdminUsersTab from './AdminUsersTab';
import AdminPendingTab from './AdminPendingTab';
import AdminFeedbackTab from './AdminFeedbackTab';
import AdminLibraryTab, { type LibrarySubTab } from './AdminLibraryTab';
import AdminAuditorDocsTab from './AdminAuditorDocsTab';
import AdminBillingTab from './billing/AdminBillingTab';

type TabId = 'kb' | 'refdocs' | 'users' | 'pending' | 'library' | 'auditor-docs' | 'toggles' | 'companies' | 'billing' | 'feedback';

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

  const pendingUsers = usePendingUsers() as any[] | undefined;
  const pendingCount = pendingUsers?.length ?? 0;

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

  /** Wraps a company-scoped tab so it degrades to the "pick a company" card. */
  const scoped = (message: string, render: () => React.ReactNode) => () =>
    needsCompanyScope ? (
      <NeedsCompanyScopeCard navigate={navigate} message={message} />
    ) : (
      render()
    );

  const sections = useMemo<SettingsSection[]>(
    () => [
      {
        id: 'kb',
        label: 'Knowledge Bases',
        icon: <FiFile />,
        group: 'Content',
        render: scoped(
          'Use the sidebar company scope or the Companies page before managing shared knowledge bases.',
          () => <AdminKbTab adminScopeCompanyId={adminScopeCompanyId} isStaff={isStaff} />,
        ),
      },
      {
        id: 'refdocs',
        label: 'Reference Documents',
        icon: <FiBookOpen />,
        group: 'Content',
        render: scoped(
          'Use the sidebar company scope or the Companies page before managing reference documents.',
          () => <AdminRefDocsTab adminScopeCompanyId={adminScopeCompanyId} isStaff={isStaff} />,
        ),
      },
      {
        id: 'library',
        label: 'Library',
        icon: <FiBook />,
        group: 'Content',
        render: scoped(
          'Library management is aggregated for the tenant in your sidebar scope (all projects in that company).',
          () => (
            <AdminLibraryTab
              adminScopeCompanyId={adminScopeCompanyId}
              librarySubTab={librarySubTab}
              onSetLibrarySubTab={setLibrarySubTab}
            />
          ),
        ),
      },
      {
        id: 'auditor-docs',
        label: 'Auditor Docs',
        icon: <FiCheckCircle />,
        group: 'Content',
        render: scoped(
          'Auditor coverage uses the library for the selected company. Set company scope in the sidebar first.',
          () => (
            <AdminAuditorDocsTab
              adminScopeCompanyId={adminScopeCompanyId}
              onRouteUploadForCategory={handleRouteUploadForCategory}
            />
          ),
        ),
      },
      {
        id: 'users',
        label: 'Users',
        icon: <FiUsers />,
        group: 'People',
        render: scoped(
          'The user list is filtered to the company in your sidebar scope (plus platform staff).',
          () => (
            <AdminUsersTab
              adminScopeCompanyId={adminScopeCompanyId}
              onConfigureUser={handleConfigureUser}
            />
          ),
        ),
      },
      {
        id: 'pending',
        label: 'Pending Approvals',
        icon: <FiUserCheck />,
        group: 'People',
        badge:
          pendingCount > 0 ? (
            <span className="inline-flex items-center justify-center rounded-full bg-amber-500/25 text-amber-200 text-[11px] font-semibold px-1.5 min-w-[1.25rem] h-5">
              {pendingCount}
            </span>
          ) : undefined,
        render: () => <AdminPendingTab />,
      },
      {
        id: 'feedback',
        label: 'Feedback',
        icon: <FiMessageSquare />,
        group: 'People',
        render: () => <AdminFeedbackTab />,
      },
      {
        id: 'companies',
        label: 'Companies',
        icon: <FiShield />,
        group: 'Platform',
        render: () => (
          <GlassCard border rounded="xl">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-lg font-display font-bold text-white">Company Structure</h3>
              <p className="text-xs text-white/60 mt-1">
                Manage companies, memberships, delegated support assignments, and company-level
                feature policy.
              </p>
            </div>
            <div className="p-4">
              <CompanyAdminPanel mode="platform" />
            </div>
          </GlassCard>
        ),
      },
      {
        id: 'billing',
        label: 'Billing',
        icon: <FiCreditCard />,
        group: 'Platform',
        render: () => <AdminBillingTab />,
      },
      {
        id: 'toggles',
        label: 'Feature Toggles',
        icon: <FiToggleRight />,
        group: 'Platform',
        render: scoped(
          'User directory filtering uses your sidebar company scope. Choose a company to list tenant users and platform staff together.',
          () => (
            <AdminTogglesTab
              adminScopeCompanyId={adminScopeCompanyId}
              initialUserId={pendingToggleUserId}
            />
          ),
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      adminScopeCompanyId,
      isStaff,
      needsCompanyScope,
      pendingCount,
      pendingToggleUserId,
      librarySubTab,
    ],
  );

  return (
    <SettingsShell
      title="Admin Panel"
      titleIcon={<FiShield className="text-3xl text-sky-light flex-shrink-0" aria-hidden />}
      subtitle={
        <>
          Manage shared knowledge bases and user roles
          {adminScopeCompanyId ? (
            <span className="text-sky-lighter/90"> · scoped to current company</span>
          ) : isStaff ? (
            <span className="text-amber-200/80">
              {' '}
              · select a company in the sidebar or Companies page
            </span>
          ) : null}
        </>
      }
      sections={sections}
      activeId={tab}
      onActiveIdChange={(id) => setTab(id as TabId)}
    />
  );
}
