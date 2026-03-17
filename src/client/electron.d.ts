/** Update status event from the Electron main process via IPC */
interface ElectronUpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  version?: string;
  percent?: number;
  message?: string;
}

/** API exposed by electron/preload.js via contextBridge */
interface ElectronUpdaterAPI {
  onUpdateStatus: (callback: (data: ElectronUpdateStatus) => void) => void;
  installUpdate: () => void;
  checkForUpdate: () => void;
}

declare global {
  interface Window {
    electronUpdater?: ElectronUpdaterAPI;
  }
}

export {};
