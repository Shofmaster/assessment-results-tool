import type { ReactNode } from "react";
import { FiChevronDown, FiChevronRight } from "react-icons/fi";
import { GlassCard } from "../ui";

export const ROSTER_OPTION_SECTION_IDS = [
  "card-colors",
  "departments",
  "qualification-setup",
  "assignments",
  "requirement-types",
] as const;

export type RosterOptionSectionId = (typeof ROSTER_OPTION_SECTION_IDS)[number];

export function loadRosterOptionsSections(projectId: string | null): Record<string, boolean> {
  if (!projectId) return {};
  try {
    const raw = localStorage.getItem(`roster-options:${projectId}`);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export function saveRosterOptionsSections(projectId: string, state: Record<string, boolean>) {
  localStorage.setItem(`roster-options:${projectId}`, JSON.stringify(state));
}

export function defaultRosterSectionOpen(sectionId: RosterOptionSectionId): boolean {
  return sectionId === "card-colors" || sectionId === "departments";
}

export function isRosterSectionOpen(
  state: Record<string, boolean>,
  sectionId: RosterOptionSectionId,
): boolean {
  if (sectionId in state) return state[sectionId] ?? false;
  return defaultRosterSectionOpen(sectionId);
}

export function allRosterSectionsState(open: boolean): Record<string, boolean> {
  return Object.fromEntries(ROSTER_OPTION_SECTION_IDS.map((id) => [id, open]));
}

type Props = {
  sectionId: RosterOptionSectionId;
  title: string;
  summary?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
};

export function RosterOptionsSection({ sectionId, title, summary, open, onOpenChange, children }: Props) {
  return (
    <GlassCard className="!p-0 overflow-hidden">
      <button
        type="button"
        id={`roster-options-${sectionId}`}
        aria-expanded={open}
        aria-controls={`roster-options-panel-${sectionId}`}
        onClick={() => onOpenChange(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5 text-left hover:bg-white/[0.03] transition-colors"
      >
        <span className="text-white/45 shrink-0">{open ? <FiChevronDown /> : <FiChevronRight />}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-base font-semibold text-white">{title}</span>
          {!open && summary ? (
            <span className="block text-xs text-white/45 mt-0.5 truncate">{summary}</span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div
          id={`roster-options-panel-${sectionId}`}
          role="region"
          aria-labelledby={`roster-options-${sectionId}`}
          className="px-4 pb-4 sm:px-5 sm:pb-5 pt-3 sm:pt-4 border-t border-white/10"
        >
          {children}
        </div>
      ) : null}
    </GlassCard>
  );
}
