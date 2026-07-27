/** Shared theme class strings for Splash "Ask an Expert" chrome. */
export function splashChatTheme(isDarkMode: boolean) {
  return {
    chatUtilityButtonClass: isDarkMode
      ? 'inline-flex h-8 items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 text-xs font-semibold text-white/90 hover:bg-white/10'
      : 'inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-100',
    chatUtilityStrongButtonClass: isDarkMode
      ? 'inline-flex h-8 items-center justify-center rounded-lg border border-white/25 bg-white/10 px-3 text-xs font-semibold text-white hover:bg-white/15'
      : 'inline-flex h-8 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-200',
    advancedRegionClass: isDarkMode
      ? 'mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4'
      : 'mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4',
    advancedSubPanelClass: isDarkMode
      ? 'mt-3 rounded-lg border border-white/10 bg-navy-900/40 p-3'
      : 'mt-3 rounded-lg border border-slate-200 bg-white p-3',
    advancedTitleClass: isDarkMode
      ? 'text-xs font-semibold uppercase tracking-wide text-white/70'
      : 'text-xs font-semibold uppercase tracking-wide text-slate-600',
    advancedLabelClass: isDarkMode
      ? 'text-xs font-semibold uppercase tracking-wide text-white/65'
      : 'text-xs font-semibold uppercase tracking-wide text-slate-600',
    advancedMutedClass: isDarkMode ? 'text-white/55' : 'text-slate-500',
    advancedBodyClass: isDarkMode ? 'text-white/85' : 'text-slate-800',
    advancedTextClass: isDarkMode ? 'text-white/60' : 'text-slate-600',
    advancedStrongClass: isDarkMode ? 'text-white' : 'text-slate-900',
    advancedChipButtonClass: isDarkMode
      ? 'shrink-0 rounded-lg border border-sky/40 bg-sky/15 px-3 py-1.5 text-xs font-semibold text-sky-light hover:bg-sky/25'
      : 'shrink-0 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100',
    advancedGhostButtonClass: isDarkMode
      ? 'shrink-0 rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10'
      : 'shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100',
    advancedOptionClass: isDarkMode
      ? 'flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2.5 text-left transition-colors hover:bg-white/10'
      : 'flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition-colors hover:bg-slate-50',
    checklistOfferClass: isDarkMode
      ? 'mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/5 p-3'
      : 'mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3',
    checklistOfferTextClass: isDarkMode ? 'text-sm text-white/85' : 'text-sm text-slate-700',
    checklistSecondaryButtonClass: isDarkMode
      ? 'rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-semibold text-white/90 hover:bg-white/10'
      : 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100',
  };
}
