import type { ReactNode } from 'react';

export type LibraryTabItem<Id extends string = string> = {
  id: Id;
  label: string;
  icon: ReactNode;
};

type Props<Id extends string> = {
  tabs: LibraryTabItem<Id>[];
  active: Id;
  onChange: (id: Id) => void;
};

/**
 * Underline tab strip — a calmer, non-wrapping alternative to pill tabs.
 * The active tab is marked by a bottom border in sky-light; the strip itself
 * carries the shared baseline so tabs read as one control, not floating chips.
 */
export default function LibraryTabs<Id extends string>({ tabs, active, onChange }: Props<Id>) {
  return (
    <div
      role="tablist"
      className="flex items-stretch gap-0.5 overflow-x-auto border-b border-white/10 scrollbar-thin"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`relative -mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'border-sky-light text-white'
                : 'border-transparent text-white/55 hover:text-white/90'
            }`}
          >
            <span className={isActive ? 'text-sky-light' : 'text-white/40'} aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
