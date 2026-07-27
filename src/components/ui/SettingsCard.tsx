import type { ReactNode } from 'react';
import { GlassCard } from './GlassCard';

export interface SettingsCardProps {
  title: ReactNode;
  /** Sub-heading under the title. */
  description?: ReactNode;
  /** Icon rendered inside the gradient chip. Omit to hide the chip entirely. */
  icon?: ReactNode;
  /** Tailwind gradient pair for the icon chip, e.g. "from-sky to-sky-light". */
  iconGradient?: string;
  /** Right-aligned slot in the header — status badges, small actions. */
  status?: ReactNode;
  children?: ReactNode;
  className?: string;
  id?: string;
}

/**
 * Standard settings section card. Replaces the copy-pasted
 * `glass rounded-2xl p-6` + gradient-chip header block that was repeated
 * throughout Settings.tsx.
 */
export function SettingsCard({
  title,
  description,
  icon,
  iconGradient = 'from-sky to-sky-light',
  status,
  children,
  className = '',
  id,
}: SettingsCardProps) {
  return (
    <GlassCard id={id} className={['p-6', className].filter(Boolean).join(' ')} padding="none">
      <div className="flex items-start gap-3 mb-4">
        {icon && (
          <div
            aria-hidden
            className={`w-10 h-10 rounded-xl bg-gradient-to-br ${iconGradient} flex items-center justify-center flex-shrink-0 text-white`}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-xl font-display font-bold text-white">{title}</h3>
          {description && <p className="text-sm text-white/60 mt-0.5">{description}</p>}
        </div>
        {status && <div className="flex-shrink-0">{status}</div>}
      </div>
      {children}
    </GlassCard>
  );
}
