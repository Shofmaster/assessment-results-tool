import { useUser } from '@clerk/clerk-react';
import { FiLogOut, FiMonitor, FiUser } from 'react-icons/fi';
import { Button, Field, SettingsCard } from '../../ui';
import { useTheme } from '../../../context/ThemeContext';
import { useAppSignOut } from '../../../hooks/useAppSignOut';

export function GeneralSection() {
  const { preference, setPreference } = useTheme();
  const signOutWithCleanup = useAppSignOut();
  const { user } = useUser();

  return (
    <>
      <SettingsCard
        title="Theme"
        description="How the app appears on this device."
        icon={<FiMonitor />}
        iconGradient="from-indigo-500 to-sky-500"
      >
        <Field
          label="Display mode"
          help="System follows your operating system appearance preference."
        >
          {({ id, describedBy }) => (
            <select
              id={id}
              aria-describedby={describedBy}
              value={preference}
              onChange={(e) => setPreference(e.target.value as 'light' | 'dark' | 'system')}
              className="w-full sm:w-72 px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:border-sky-light transition-colors text-white"
            >
              <option value="system" className="bg-navy text-white">
                System
              </option>
              <option value="light" className="bg-navy text-white">
                Light
              </option>
              <option value="dark" className="bg-navy text-white">
                Dark
              </option>
            </select>
          )}
        </Field>
      </SettingsCard>

      {user && (
        <SettingsCard
          title="Account"
          description="The identity used for sign-in and audit trails."
          icon={<FiUser />}
          iconGradient="from-purple-500 to-indigo-600"
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {user.imageUrl ? (
              <img
                src={user.imageUrl}
                alt=""
                className="w-12 h-12 rounded-full"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div
                aria-hidden
                className="w-12 h-12 rounded-full bg-sky/20 flex items-center justify-center text-lg text-sky-light font-medium"
              >
                {(user.fullName || user.primaryEmailAddress?.emailAddress || '?')[0]}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-lg font-medium truncate">
                {user.fullName || user.primaryEmailAddress?.emailAddress}
              </div>
              <div className="text-sm text-white/50 truncate">
                {user.primaryEmailAddress?.emailAddress}
              </div>
            </div>
            <Button
              variant="secondary"
              icon={<FiLogOut />}
              className="w-full sm:w-auto text-red-400"
              onClick={() => void signOutWithCleanup()}
            >
              Sign Out
            </Button>
          </div>
        </SettingsCard>
      )}
    </>
  );
}
