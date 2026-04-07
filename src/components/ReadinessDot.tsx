import type { ScopeReadinessLevel } from '../utils/readinessSeverity';
import { scopeLevelAriaLabel } from '../utils/readinessSeverity';

const BASE = 'inline-block shrink-0 rounded-full h-2 w-2';

function scopeClass(level: ScopeReadinessLevel, isDarkMode: boolean): string {
  const ring = isDarkMode ? 'ring-1 ring-white/25' : 'ring-1 ring-slate-900/15';
  switch (level) {
    case 'no_project':
    case 'needs_company':
      return `${BASE} ${ring} ${isDarkMode ? 'bg-amber-400' : 'bg-amber-500'}`;
    case 'loading':
      return `${BASE} ${ring} ${isDarkMode ? 'bg-white/35' : 'bg-slate-400'} animate-pulse`;
    case 'overdue':
      return `${BASE} ${ring} ${isDarkMode ? 'bg-red-400' : 'bg-red-600'}`;
    case 'due_soon':
      return `${BASE} ${ring} ${isDarkMode ? 'bg-amber-400' : 'bg-amber-500'}`;
    case 'clear':
      return `${BASE} ${ring} ${isDarkMode ? 'bg-emerald-400' : 'bg-emerald-600'}`;
    default:
      return `${BASE} ${ring} bg-slate-400`;
  }
}

type ReadinessDotProps = {
  level: ScopeReadinessLevel;
  isDarkMode: boolean;
  className?: string;
};

export function ReadinessDot({ level, isDarkMode, className = '' }: ReadinessDotProps) {
  return (
    <span
      className={`${scopeClass(level, isDarkMode)} ${className}`}
      title={scopeLevelAriaLabel(level)}
      aria-label={scopeLevelAriaLabel(level)}
    />
  );
}

type NavAttentionDotProps = {
  level: 'overdue' | 'due_soon';
  isDarkMode: boolean;
  title: string;
  className?: string;
};

/** Smaller accent for nav rows (attention only). */
export function NavAttentionDot({ level, isDarkMode, title, className = '' }: NavAttentionDotProps) {
  const ring = isDarkMode ? 'ring-1 ring-white/25' : 'ring-1 ring-slate-900/15';
  const fill =
    level === 'overdue'
      ? isDarkMode
        ? 'bg-red-400'
        : 'bg-red-600'
      : isDarkMode
        ? 'bg-amber-400'
        : 'bg-amber-500';
  return (
    <span
      className={`inline-block shrink-0 rounded-full h-1.5 w-1.5 ${ring} ${fill} ${className}`}
      title={title}
      aria-hidden
    />
  );
}

type NavSectionActivityDotProps = {
  isDarkMode: boolean;
  title: string;
  className?: string;
};

/** Indicates the destination has saved data (not attention / due-state). */
export function NavSectionActivityDot({
  isDarkMode,
  title,
  className = '',
}: NavSectionActivityDotProps) {
  const ring = isDarkMode ? 'ring-1 ring-white/25' : 'ring-1 ring-slate-900/15';
  const fill = isDarkMode ? 'bg-sky-400' : 'bg-sky-600';
  return (
    <span
      className={`inline-block shrink-0 rounded-full h-1.5 w-1.5 ${ring} ${fill} ${className}`}
      title={title}
      aria-label={title}
    />
  );
}
