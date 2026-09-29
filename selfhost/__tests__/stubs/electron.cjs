/**
 * Stand-in so desktop modules can load under the selfhost vitest job.
 * That job does not install the Electron binary. Tests that need a real
 * dialog or window do not belong here.
 */
module.exports = {
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  },
  ipcMain: {
    handle() {},
  },
  BrowserWindow: {
    fromWebContents() {
      return null;
    },
  },
};
