import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFocusViewHeading } from '../../hooks/useFocusViewHeading';

export interface SettingsSection {
  id: string;
  label: string;
  icon?: ReactNode;
  /** Small count/status pill rendered after the label (e.g. pending approvals). */
  badge?: ReactNode;
  /** Optional cluster heading; sections sharing a group render together. */
  group?: string;
  render: () => ReactNode;
}

export interface SettingsShellProps {
  title: string;
  subtitle?: ReactNode;
  /** Rendered next to the page title — e.g. a scope indicator. */
  titleIcon?: ReactNode;
  sections: SettingsSection[];
  activeId: string;
  onActiveIdChange: (id: string) => void;
  /** Keeps the URL hash in sync so /settings#integrations deep-links work. */
  syncHash?: boolean;
}

/**
 * Shared settings layout: a sticky left-rail section nav beside a content panel
 * that renders only the active section. Collapses to a horizontally scrollable
 * pill row below `md`. Used by both the user Settings page and the Admin panel
 * so the two surfaces navigate identically.
 */
export function SettingsShell({
  title,
  subtitle,
  titleIcon,
  sections,
  activeId,
  onActiveIdChange,
  syncHash = false,
}: SettingsShellProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  useFocusViewHeading(containerRef);

  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  // Group sections into clusters, preserving declaration order.
  const groups = useMemo(() => {
    const out: { name: string | undefined; items: SettingsSection[] }[] = [];
    for (const section of sections) {
      const last = out[out.length - 1];
      if (last && last.name === section.group) last.items.push(section);
      else out.push({ name: section.group, items: [section] });
    }
    return out;
  }, [sections]);

  // Adopt an incoming hash on mount so deep links land on the right section.
  useEffect(() => {
    if (!syncHash) return;
    const fromHash = window.location.hash.replace(/^#/, '');
    if (fromHash && sections.some((s) => s.id === fromHash) && fromHash !== activeId) {
      onActiveIdChange(fromHash);
    }
    // mount only — later changes are driven by clicks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useCallback(
    (id: string) => {
      onActiveIdChange(id);
      if (syncHash) window.history.replaceState(null, '', `#${id}`);
    },
    [onActiveIdChange, syncHash],
  );

  const navItem = (section: SettingsSection, isActive: boolean) => (
    <button
      key={section.id}
      type="button"
      onClick={() => select(section.id)}
      aria-current={isActive ? 'page' : undefined}
      className={[
        'flex items-center gap-2.5 w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
        'whitespace-nowrap md:whitespace-normal',
        isActive
          ? 'bg-sky/20 text-sky-lighter border border-sky-light/30'
          : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent',
      ].join(' ')}
    >
      {section.icon && (
        <span aria-hidden className="flex-shrink-0">
          {section.icon}
        </span>
      )}
      <span className="flex-1 min-w-0">{section.label}</span>
      {section.badge}
    </button>
  );

  return (
    <div ref={containerRef} className="w-full min-w-0 p-3 sm:p-6 lg:p-8 h-full min-h-0">
      <div className="flex items-center gap-3 mb-6">
        {titleIcon}
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-display font-bold bg-gradient-to-r from-white to-sky-lighter bg-clip-text text-transparent">
            {title}
          </h1>
          {subtitle && <p className="text-white/70 text-sm mt-0.5">{subtitle}</p>}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        <nav
          aria-label={`${title} sections`}
          className={[
            'w-full md:w-56 lg:w-64 flex-shrink-0',
            // mobile: horizontal scroller; desktop: sticky vertical rail
            'flex md:block gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0',
            'md:sticky md:top-4 md:max-h-[calc(100vh-6rem)] md:overflow-y-auto',
          ].join(' ')}
        >
          {groups.map((group, i) => (
            <div key={group.name ?? `group-${i}`} className="contents md:block md:mb-4">
              {group.name && (
                <p className="hidden md:block px-3 mb-1 text-xs font-semibold uppercase tracking-wide text-white/40">
                  {group.name}
                </p>
              )}
              <div className="contents md:block md:space-y-1">
                {group.items.map((section) => navItem(section, section.id === active?.id))}
              </div>
            </div>
          ))}
        </nav>

        <div className="flex-1 min-w-0 w-full">
          {active && (
            <section aria-label={active.label} className="space-y-6">
              {active.render()}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
