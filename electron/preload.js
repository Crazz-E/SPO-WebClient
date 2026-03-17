const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronUpdater', {
  /** Register a callback for update status events from the main process */
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (_event, data) => callback(data));
  },
  /** Request the main process to install a downloaded update and restart */
  installUpdate: () => ipcRenderer.send('install-update'),
  /** Request a manual update check */
  checkForUpdate: () => ipcRenderer.send('check-for-update'),
});
