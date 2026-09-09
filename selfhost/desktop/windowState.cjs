/**
 * Remember where the window was.
 *
 * A program that opens at the same size and place you left it feels like a
 * desktop application; one that resets to a default rectangle every launch
 * feels like a web page in a frame. This is a small thing that people notice
 * constantly without being able to name it.
 *
 * THE FAILURE MODE THIS GUARDS AGAINST
 * Saved coordinates go stale. Someone docks a laptop, maximises AeroGap on the
 * second monitor, closes it, and undocks. Restoring those coordinates puts the
 * window at x=2400 on a machine whose only display is 1920 wide - the app is
 * running, the taskbar shows it, and there is nothing on screen. The user
 * concludes it is broken, and they are not wrong.
 *
 * So the restored rectangle is always validated against the displays that exist
 * RIGHT NOW, and falls back to a centred default if it does not intersect one.
 */
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = { width: 1440, height: 900 };
const MINIMUM = { width: 1024, height: 700 };

/** How much of the window must be on a real display for the state to be used. */
const MIN_VISIBLE_PX = 100;

function stateFile(userDataDir) {
  return path.join(userDataDir, 'window-state.json');
}

function read(userDataDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(userDataDir), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return null;
    return parsed;
  } catch {
    // Missing or corrupt: use defaults. Never a reason to fail to open.
    return null;
  }
}

/**
 * True when the saved rectangle overlaps a currently-connected display by
 * enough to be grabbable.
 *
 * @param {{x:number,y:number,width:number,height:number}} bounds
 * @param {Array<{workArea:{x:number,y:number,width:number,height:number}}>} displays
 */
function isOnScreen(bounds, displays) {
  if (typeof bounds.x !== 'number' || typeof bounds.y !== 'number') return false;

  return displays.some((display) => {
    const area = display.workArea;
    const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
    const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
    return overlapX >= MIN_VISIBLE_PX && overlapY >= MIN_VISIBLE_PX;
  });
}

/**
 * Options to pass to BrowserWindow.
 *
 * @param {string} userDataDir
 * @param {Array} displays  from screen.getAllDisplays()
 */
function restore(userDataDir, displays) {
  const saved = read(userDataDir);
  if (!saved) return { ...DEFAULTS, maximized: false };

  const width = Math.max(MINIMUM.width, Number(saved.width) || DEFAULTS.width);
  const height = Math.max(MINIMUM.height, Number(saved.height) || DEFAULTS.height);
  const maximized = Boolean(saved.maximized);

  const bounds = { x: saved.x, y: saved.y, width, height };
  if (!isOnScreen(bounds, displays)) {
    // Let the OS centre it on the primary display.
    return { width, height, maximized };
  }

  return { x: saved.x, y: saved.y, width, height, maximized };
}

/**
 * Persist the window's position.
 *
 * A maximized window reports the size of the screen, so saving THAT would mean
 * un-maximizing restores to a full-screen-sized window that is not maximized -
 * a subtly wrong state that is hard to get out of. getNormalBounds() reports
 * the underlying restored rectangle instead.
 */
function save(userDataDir, win) {
  if (!win || win.isDestroyed()) return;
  try {
    const bounds = win.getNormalBounds();
    fs.mkdirSync(userDataDir, { recursive: true });
    fs.writeFileSync(
      stateFile(userDataDir),
      JSON.stringify({ ...bounds, maximized: win.isMaximized() }, null, 2),
      'utf8',
    );
  } catch {
    // Losing window position is never worth interrupting anyone over.
  }
}

module.exports = { restore, save, isOnScreen, stateFile, DEFAULTS, MINIMUM };
