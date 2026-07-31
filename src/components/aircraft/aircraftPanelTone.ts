/**
 * The aircraft panels (types CRUD, add-aircraft modal) are mounted from two
 * visually different surfaces: the cream/amber "logbook paper" theme used by
 * Logbook Management and Company Library, and the navy/sky glass theme used by
 * the Fleet page. Rather than fork the components, they take a `tone` and pull
 * their colors from here. `paper` is the default so existing mounts are
 * unchanged.
 */
export type PanelTone = 'paper' | 'glass';

export interface PanelToneClasses {
  shell: string;
  heading: string;
  /** Modal titles, which carry the serif display face on the paper surfaces. */
  modalHeading: string;
  description: string;
  closeButton: string;
  label: string;
  input: string;
  select: string;
  subtleNote: string;
  hintLoading: string;
  hintIdle: string;
  link: string;
  listWrapper: string;
  listRow: string;
  listPrimary: string;
  listSecondary: string;
  listEmpty: string;
  iconButton: string;
  iconButtonDanger: string;
  cancelButton: string;
  primaryButton: string;
}

export const PANEL_TONES: Record<PanelTone, PanelToneClasses> = {
  paper: {
    shell: 'bg-[#fffaf2] border border-amber-300/80 rounded-xl shadow-2xl text-stone-800',
    heading: 'text-lg font-semibold text-stone-900',
    modalHeading: "text-lg font-semibold text-stone-900 font-['Source_Serif_4',serif]",
    description: 'text-xs text-stone-600',
    closeButton: 'text-stone-500 hover:text-stone-800',
    label: 'block text-xs text-stone-600 mb-1',
    input:
      'w-full px-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-800 focus:outline-none focus:border-sky-600',
    select:
      'w-full px-3 py-2 bg-[#fffef9] border border-amber-300 rounded-lg text-sm text-stone-800 focus:outline-none focus:border-sky-600',
    subtleNote: 'text-[10px] text-stone-500 mt-1',
    hintLoading: 'border-sky-300 bg-sky-50 text-sky-900',
    hintIdle: 'border-amber-300/80 bg-[#fffef9] text-stone-600',
    link: 'text-sky-800 hover:text-sky-950 underline underline-offset-2',
    listWrapper: 'divide-y divide-amber-200/80 border border-amber-200 rounded-lg overflow-hidden',
    listRow: 'bg-[#fffdf7] hover:bg-amber-50/50',
    listPrimary: 'font-medium text-sm text-stone-800 truncate',
    listSecondary: 'text-xs text-stone-500',
    listEmpty: 'px-4 py-6 text-sm text-stone-500 text-center',
    iconButton: 'p-1.5 text-stone-500 hover:text-sky-800',
    iconButtonDanger: 'p-1.5 text-stone-500 hover:text-red-700',
    cancelButton: 'px-4 py-2 text-sm text-stone-600 hover:text-stone-900',
    primaryButton:
      'px-4 py-2 text-sm font-medium bg-sky-700 text-white border border-sky-900/20 rounded-lg hover:bg-sky-800 disabled:opacity-50',
  },
  glass: {
    shell: 'glass border border-white/15 rounded-2xl shadow-2xl text-white',
    heading: 'text-lg font-display font-bold text-white',
    modalHeading: 'text-lg font-display font-bold text-white',
    description: 'text-xs text-white/60',
    closeButton: 'text-white/50 hover:text-white',
    label: 'block text-xs text-white/60 mb-1',
    input:
      'w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder:text-white/35 focus:outline-none focus:border-sky-light',
    // Native option lists inherit the page background, which is transparent on
    // glass — pin them to the sidebar navy so they stay readable.
    select:
      'w-full px-3 py-2 bg-white/10 border border-white/20 rounded-lg text-sm text-white focus:outline-none focus:border-sky-light [&>option]:bg-navy-900 [&>option]:text-white',
    subtleNote: 'text-[10px] text-white/45 mt-1',
    hintLoading: 'border-sky-light/40 bg-sky/15 text-sky-100',
    hintIdle: 'border-white/15 bg-white/5 text-white/65',
    link: 'text-sky-300 hover:text-sky-200 underline underline-offset-2',
    listWrapper: 'divide-y divide-white/5 border border-white/10 rounded-lg overflow-hidden',
    listRow: 'bg-white/[0.03] hover:bg-white/[0.07]',
    listPrimary: 'font-medium text-sm text-white truncate',
    listSecondary: 'text-xs text-white/55',
    listEmpty: 'px-4 py-6 text-sm text-white/55 text-center',
    iconButton: 'p-1.5 text-white/55 hover:text-sky-300',
    iconButtonDanger: 'p-1.5 text-white/55 hover:text-rose-300',
    cancelButton: 'px-4 py-2 text-sm text-white/60 hover:text-white',
    primaryButton:
      'px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-sky to-sky-light text-white hover:shadow-lg hover:shadow-sky/30 disabled:opacity-50',
  },
};
