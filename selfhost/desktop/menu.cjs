/**
 * The application menu.
 *
 * The previous menu had Edit and View only - enough for copy/paste and zoom,
 * but it read as a browser chrome that had lost its address bar rather than as
 * an application. A File menu, a Window menu and a Help menu with an About box
 * are what people check to decide whether something is a real program.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * No File > Save. The app persists continuously to a local database; a Save
 * item would imply an unsaved-changes model that does not exist, and its
 * absence is less confusing than a no-op.
 *
 * Menu items that act on the application navigate the SPA by URL rather than
 * calling into it. The page is a web app served over loopback with no
 * privileged bridge, and adding one so a menu item could call a function would
 * mean giving the renderer a channel to the main process for the sake of
 * cosmetics.
 */
const { Menu, shell, dialog, app } = require('electron');

/**
 * @param {object} deps
 * @param {() => import('electron').BrowserWindow|null} deps.getWindow
 * @param {() => string|null} deps.getServerUrl
 * @param {() => string} deps.getLogDir
 * @param {() => string} deps.getDataRoot
 * @param {string} deps.mode
 * @param {() => Promise<void>} deps.onCheckForUpdates
 * @param {boolean} [deps.updatesEnabled]
 */
function buildMenu(deps) {
  const { getWindow, getServerUrl, getLogDir, getDataRoot, mode, onCheckForUpdates, updatesEnabled } = deps;

  /** Navigate the SPA to a route, if it is loaded. */
  const goTo = (route) => () => {
    const win = getWindow();
    const base = getServerUrl();
    if (!win || win.isDestroyed() || !base) return;
    void win.loadURL(`${base}${route}`);
  };

  const template = [
    {
      label: '&File',
      submenu: [
        { label: 'Projects', accelerator: 'CmdOrCtrl+Shift+P', click: goTo('/projects') },
        { label: 'Library', accelerator: 'CmdOrCtrl+Shift+L', click: goTo('/library') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: goTo('/settings') },
        { type: 'separator' },
        {
          label: 'Open data folder',
          // Where a customer's records actually live. Worth one click, because
          // "where is my data" is the first question an on-prem buyer asks and
          // the answer is the reason they chose this product.
          click: () => shell.openPath(getDataRoot()),
          visible: mode === 'desktop',
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' },
      ],
    },
    { role: 'editMenu', label: '&Edit' },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
    { role: 'windowMenu', label: '&Window' },
    {
      label: '&Help',
      submenu: [
        ...(updatesEnabled
          ? [{ label: 'Check for updates...', click: () => void onCheckForUpdates() }, { type: 'separator' }]
          : []),
        { label: 'Open logs folder', click: () => shell.openPath(getLogDir()) },
        {
          label: 'Open in browser',
          // Separates "the shell is broken" from "the backend is down" in one
          // click, which is the first thing support will ask.
          click: () => {
            const base = getServerUrl();
            if (base) void shell.openExternal(base);
          },
        },
        { type: 'separator' },
        { label: 'About AeroGap', click: () => showAbout(deps) },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}

/**
 * About box.
 *
 * Reports the things support actually needs: version, mode, where the data is,
 * and where the app is listening. Deliberately copyable - a customer reading
 * values off a screenshot gets them wrong.
 */
function showAbout(deps) {
  const { getWindow, getServerUrl, getDataRoot, getLogDir, mode } = deps;

  const detail = [
    `Version:  ${app.getVersion()}`,
    `Mode:     ${mode}`,
    `Address:  ${getServerUrl() || 'not started'}`,
    mode === 'desktop' ? `Data:     ${getDataRoot()}` : null,
    `Logs:     ${getLogDir()}`,
  ]
    .filter(Boolean)
    .join('\n');

  const win = getWindow();
  const options = {
    type: 'info',
    title: 'About AeroGap',
    message: 'AeroGap',
    detail,
    buttons: ['Copy details', 'Close'],
    defaultId: 1,
    cancelId: 1,
  };

  const choice = win && !win.isDestroyed()
    ? dialog.showMessageBoxSync(win, options)
    : dialog.showMessageBoxSync(options);

  if (choice === 0) {
    // require here rather than at module load: clipboard is not needed unless
    // someone opens this box.
    require('electron').clipboard.writeText(detail);
  }
}

module.exports = { buildMenu, showAbout };
