import type { ReactNode } from 'react';

export type PageHeaderVariant = 'hero' | 'compact';

export type PageHeaderProps = {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  variant?: PageHeaderVariant;
  /** Optional element rendered before the title (e.g. icon). */
  leading?: ReactNode;
  className?: string;
  headingRef?: React.RefObject<HTMLHeadingElement | null>;
  headingId?: string;
};

/**
 * Shared page title chrome. Use `hero` for primary workflow pages and
 * `compact` for denser tool surfaces (Library, Manual Writer).
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  variant = 'hero',
  leading,
  className = '',
  headingRef,
  headingId,
}: PageHeaderProps) {
  const titleClass =
    variant === 'hero'
      ? 'text-3xl sm:text-4xl font-display font-bold bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent'
      : 'text-xl lg:text-2xl font-display font-bold text-white';

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-6 ${className}`.trim()}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {leading}
          <h1
            ref={headingRef as React.RefObject<HTMLHeadingElement>}
            id={headingId}
            tabIndex={-1}
            className={titleClass}
          >
            {title}
          </h1>
        </div>
        {subtitle ? (
          <div className="mt-1 text-sm text-white/70 max-w-2xl">{subtitle}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div> : null}
    </div>
  );
}
