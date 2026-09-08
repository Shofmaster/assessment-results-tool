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
 * Query string that opens the Library with the "link manuals folder" prompt.
 * Read by the SPA (src/components/CompanyLibrary.tsx); keep the two in step.
 */
const LINK_MANUALS_QUERY = 'link=manuals';

/**
 * @typedef {object} WorkspaceMenuDeps
 * @property {string} hostedHost           e.g. "app.example.com", for the label
 * @property {'online'|'offline'|null} current
 * @property {boolean} startOnline         the persisted preference: probe and open online when reachable
 * @property {(target: 'online'|'offline') => void} onSwitch
 * @property {(enabled: boolean) => void} onSetStartOnline
 */

/**
 * @param {object} deps
 * @param {() => import('electron').BrowserWindow|null} deps.getWindow
 * @param {() => string|null} deps.getServerUrl  origin the app is currently served from
 * @param {() => string} deps.getLogDir
 * @param {() => string} deps.getDataRoot
 * @param {string} deps.mode
 * @param {() => Promise<void>} deps.onCheckForUpdates
 * @param {boolean} [deps.updatesEnabled]
 * @param {() => Promise<void>} [deps.onLinkManualsFolder]  native folder picker + navigate
 * @param {WorkspaceMenuDeps|null} [deps.workspaces]  null when the build has no hosted URL
 */
function buildMenu(deps) {
  const {
    getWindow,
    getServerUrl,
    getLogDir,
    getDataRoot,
    mode,
    onCheckForUpdates,
    updatesEnabled,
    onLinkManualsFolder,
    workspaces,
  } = deps;

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
        {
          label: 'Link manuals folder...',
          // Opens the native OS folder dialog immediately, then navigates to
          // Library so the SPA can register files and build the search index.
          click: () => {
            if (typeof onLinkManualsFolder === 'function') {
              void onLinkManualsFolder();
              return;
            }
            goTo(`/library?${LINK_MANUALS_QUERY}`)();
          },
        },
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
    // Only when the build knows a hosted application. A build without one has
    // exactly one workspace, and a menu with a single, always-selected radio
    // item would advertise a choice that does not exist.
    ...(workspaces
      ? [
          {
            label: 'W&orkspace',
            submenu: [
              {
                label: `Online \u2014 ${workspaces.hostedHost}`,
                type: 'radio',
                checked: workspaces.current === 'online',
                click: () => workspaces.onSwitch('online'),
              },
              {
                label: 'Offline \u2014 this computer',
                type: 'radio',
                checked: workspaces.current === 'offline',
                click: () => workspaces.onSwitch('offline'),
              },
              { type: 'separator' },
              {
                label: 'Start online when available',
                type: 'checkbox',
                checked: workspaces.startOnline,
                click: (item) => workspaces.onSetStartOnline(item.checked),
              },
              { type: 'separator' },
              {
                label: 'About workspaces...',
                click: () => showWorkspaceHelp(deps),
              },
            ],
          },
        ]
      : []),
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
  const { getWindow, getServerUrl, getDataRoot, getLogDir, mode, workspaces } = deps;

  const workspaceLine = workspaces
    ? `Workspace: ${
        workspaces.current === 'online'
          ? `online (${workspaces.hostedHost})`
          : workspaces.current === 'offline'
            ? 'offline (this computer)'
            : 'not yet chosen'
      }`
    : null;

  const detail = [
    `Version:  ${app.getVersion()}`,
    `Mode:     ${mode}`,
    workspaceLine,
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

/**
 * Workspace > About workspaces.
 *
 * The one thing a user must understand to not lose track of their work: the
 * two workspaces hold different data. Said once, here, in plain words, rather
 * than inferred from a company list that looks different after a switch.
 */
function showWorkspaceHelp(deps) {
  const { getWindow, workspaces } = deps;
  const options = {
    type: 'info',
    title: 'Workspaces',
    message: 'AeroGap has two workspaces.',
    detail:
      'OFFLINE (this computer) - the default\n' +
      'AeroGap running on this computer, with its data stored here. Works without a ' +
      'connection. Sign in with your AeroGap account and, while online, the companies ' +
      'of that account are mirrored here so they are available when the connection is ' +
      'lost.\n\n' +
      `ONLINE (${workspaces.hostedHost})\n` +
      'The website itself, live in this window. Needs an internet connection. Use it ' +
      'when you need something that only exists on the website.\n\n' +
      'AeroGap starts offline. Tick "Start online when available" to open the website ' +
      'instead whenever it can be reached.',
    buttons: ['Close'],
  };
  const win = getWindow();
  if (win && !win.isDestroyed()) dialog.showMessageBoxSync(win, options);
  else dialog.showMessageBoxSync(options);
}

module.exports = { buildMenu, showAbout, showWorkspaceHelp, LINK_MANUALS_QUERY };
