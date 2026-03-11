import { contextBridge, ipcRenderer } from 'electron';

// Expose the local server host so the renderer can connect via WebSocket
contextBridge.exposeInMainWorld('electronHost', 'localhost:8080');

// Expose a minimal IPC API for OS integrations
contextBridge.exposeInMainWorld('electronAPI', {
  // Notify main process to minimize to tray instead of closing
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
  // Listen for update events from main process
  onUpdateAvailable: (callback: () => void) =>
    ipcRenderer.on('update-available', () => callback()),
  onUpdateDownloaded: (callback: () => void) =>
    ipcRenderer.on('update-downloaded', () => callback()),
  // Trigger install and restart
  installUpdate: () => ipcRenderer.send('install-update'),
});
