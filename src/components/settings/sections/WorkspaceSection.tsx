import { Link } from 'react-router-dom';
import { FiBriefcase, FiFolder } from 'react-icons/fi';
import { SettingsCard } from '../../ui';

export function WorkspaceSection({
  myAdminCompanies,
  projectManageCompanies,
}: {
  myAdminCompanies: { _id: string; name: string }[] | undefined;
  projectManageCompanies: { _id: string; name: string }[] | undefined;
}) {
  const isCompanyAdmin = !!myAdminCompanies && myAdminCompanies.length > 0;
  const canOpenCompanyAdmin = isCompanyAdmin || !!projectManageCompanies?.length;

  return (
    <>
      {canOpenCompanyAdmin && (
        <SettingsCard
          title="Company administration"
          description="Organization profile, repair station type, class ratings, capabilities, and policy controls."
          icon={<FiBriefcase />}
          iconGradient="from-sky to-indigo-500"
        >
          <p className="text-sm text-white/60 mb-4">
            {isCompanyAdmin ? (
              <>
                You are a company admin for {myAdminCompanies!.length} organization
                {myAdminCompanies!.length === 1 ? '' : 's'} and can also manage members and
                delegated support.
              </>
            ) : (
              <>
                You have company manager access. Member management and delegated support remain
                admin-only.
              </>
            )}
          </p>
          <Link
            to="/company-admin"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-sky-light/40 bg-sky/20 text-sky-lighter text-sm font-medium hover:bg-sky/30 transition-colors"
          >
            Open company admin
          </Link>
        </SettingsCard>
      )}

      {!!projectManageCompanies?.length && (
        <SettingsCard
          title="Company projects"
          description="Create or delete projects for organizations you administer or manage."
          icon={<FiFolder />}
          iconGradient="from-emerald-500 to-sky-500"
        >
          <p className="text-sm text-white/60 mb-4">
            Deletion uses a strict confirmation on the project page.
          </p>
          <ul className="flex flex-wrap gap-2">
            {projectManageCompanies.map((c) => (
              <li key={c._id}>
                <Link
                  to={`/companies/${c._id}/projects`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 text-white/90 text-sm font-medium hover:bg-white/10 transition-colors"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </SettingsCard>
      )}
    </>
  );
}
