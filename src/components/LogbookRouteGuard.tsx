import { FiLock, FiSettings } from 'react-icons/fi';
import { useNavigate } from 'react-router-dom';
import { useUserSettings } from '../hooks/useConvexData';
import LogbookManagement from './LogbookManagement';

export default function LogbookRouteGuard() {
  const settings = useUserSettings();
  const navigate = useNavigate();

  if (settings === undefined) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[360px] p-8 text-white/70">
        <div className="h-8 w-8 rounded-full border-2 border-white/20 border-t-sky animate-spin mb-3" />
        Checking logbook access...
      </div>
    );
  }

  if (settings?.logbookEnabled === true) {
    return <LogbookManagement />;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[420px] p-8">
      <div className="glass rounded-2xl p-8 max-w-lg w-full text-center space-y-5">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-amber-300">
          <FiLock className="text-2xl" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-white mb-2">Logbook Module Disabled</h2>
          <p className="text-sm text-white/70">
            This account does not currently have Logbook access enabled. Contact your admin to enable the add-on or standalone Logbook module.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky text-navy-900 font-medium hover:bg-sky-light transition-colors"
        >
          <FiSettings />
          Go to Settings
        </button>
      </div>
    </div>
  );
}
