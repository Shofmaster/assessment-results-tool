import type { ReactNode } from 'react';
import { GlassCard } from './GlassCard';

export type EmptyStateVariant = 'no-project' | 'no-data' | 'filter-empty' | 'default';

export type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  variant?: EmptyStateVariant;
  className?: string;
};

/**
 * Shared empty state — modest framed icon, clear title, optional hint and CTA.
 * Promoted from LibraryEmptyState for use across Audit, Fleet, Analytics, etc.
 */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  variant = 'default',
  className = '',
}: EmptyStateProps) {
  const padded = variant === 'no-project' ? 'py-16' : 'py-12';

  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-center ${padded} ${className}`.trim()}>
      {icon ? (
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-2xl text-white/50">
          {icon}
        </div>
      ) : null}
      <div className="max-w-sm">
        <p className="text-sm font-medium text-white/85">{title}</p>
        {hint ? <p className="mt-1 text-xs text-white/70">{hint}</p> : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export type ProjectGateProps = {
  title?: string;
  hint?: string;
  action?: ReactNode;
  className?: string;
};

/** Single “select a project” gate — no emoji forks. */
export function ProjectGate({
  title = 'Select a project',
  hint = 'Choose a project from the sidebar to continue.',
  action,
  className = '',
}: ProjectGateProps) {
  return (
    <GlassCard border className={`max-w-lg mx-auto ${className}`.trim()}>
      <EmptyState
        variant="no-project"
        title={title}
        hint={hint}
        action={action}
        icon={
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5A1.5 1.5 0 014.5 6h4.379a1.5 1.5 0 011.06.44l.872.872a1.5 1.5 0 001.06.438H19.5A1.5 1.5 0 0121 8.75v8.75a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 17.5V7.5z" />
          </svg>
        }
      />
    </GlassCard>
  );
}
