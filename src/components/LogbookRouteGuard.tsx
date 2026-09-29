import { Link } from 'react-router';
import { FiLock } from 'react-icons/fi';
import {
  useIsAdmin,
  useListWhereCanManageProjectsCompanies,
  useLogbookAccess,
  useMyAdminCompanies,
} from '../hooks/useConvexData';
import { logbookGateCopy } from '../utils/logbookGate';
import LogbookManagement from './LogbookManagement';

export default function LogbookRouteGuard() {
  const access = useLogbookAccess();
  const isPlatformAdmin = useIsAdmin() === true;
  const adminCompanies = useMyAdminCompanies();
  const managedCompanies = useListWhereCanManageProjectsCompanies();
  const canEditCompanyPolicy =
    (adminCompanies?.length ?? 0) > 0 || (managedCompanies?.length ?? 0) > 0;

  if (!access.ready) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] p-8 text-white/70">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-sky animate-spin mb-3" />
        Checking logbook access...
      </div>
    );
  }

  if (access.enabled) {
    return <LogbookManagement />;
  }

  const copy = logbookGateCopy({ isPlatformAdmin, canEditCompanyPolicy });

  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] p-8">
      <div className="glass rounded-2xl p-8 max-w-xl w-full space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
          <FiLock className="text-2xl" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-white mb-2">{copy.title}</h2>
          <p className="text-sm text-white/70">{copy.summary}</p>
        </div>
        <ol className="text-sm text-white/75 space-y-3 list-decimal pl-5">
          {copy.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className="text-sm text-white/60">{copy.entryReviewNote}</p>
        {copy.actions.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {copy.actions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky text-navy-900 font-medium hover:bg-sky-light transition-colors"
              >
                {action.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
