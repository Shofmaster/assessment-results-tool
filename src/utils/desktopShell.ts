/**
 * Is this page running inside the AeroGap desktop shell?
 *
 * The shell's preload installs `window.aerogapShell` on the application's own
 * origins only (selfhost/desktop/preload.cjs), so its presence is the signal.
 * Used for copy and entry points that only make sense in a program the user
 * installed - above all, pointing at the folder where the manuals live.
 */
export function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false;
  const shell = (window as unknown as { aerogapShell?: unknown }).aerogapShell;
  return typeof shell === 'object' && shell !== null;
}

/**
 * Query string the shell's File > "Link manuals folder..." menu item navigates
 * to. Mirrors LINK_MANUALS_QUERY in selfhost/desktop/menu.cjs.
 */
export const LINK_MANUALS_PARAM = 'link';
export const LINK_MANUALS_VALUE = 'manuals';
