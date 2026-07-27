import { FiInfo } from 'react-icons/fi';
import { SettingsCard } from '../../ui';
import { APP_VERSION } from '../../../utils/appVersion';

export function AboutSection() {
  return (
    <SettingsCard title="About" icon={<FiInfo />} iconGradient="from-slate-500 to-slate-600">
      <dl className="space-y-2 text-white/80">
        <div className="flex gap-2">
          <dt className="font-semibold">Version:</dt>
          <dd data-testid="app-version">{APP_VERSION}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">Developer:</dt>
          <dd>AeroGap</dd>
        </div>
      </dl>
      <p className="pt-4 mt-4 border-t border-white/10 text-white/80">
        This application uses Claude AI to perform comprehensive aviation quality assessments
        against regulatory standards including 14 CFR Part 145, EASA regulations, and industry
        best practices.
      </p>
    </SettingsCard>
  );
}
