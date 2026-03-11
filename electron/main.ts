import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  globalShortcut,
  ipcMain,
  Notification,
} from 'electron';
import * as path from 'path';
import { autoUpdater } from 'electron-updater';

// ---------------------------------------------------------------------------
// Single-instance lock
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const PORT = process.env['PORT'] ?? '8080';
const APP_URL = `http://localhost:${PORT}`;
const ICON_PATH = path.join(__dirname, '../electron/assets/icon.png');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverReady = false;

// ---------------------------------------------------------------------------
// Start the Node.js gateway server (same process, compiled server.js)
// ---------------------------------------------------------------------------
function startGateway(): void {
  // server.js auto-starts on require — __dirname inside server resolves correctly
  // to dist/server/, so PUBLIC_DIR and CACHE_DIR paths remain valid
  require('../server/server.js');
  serverReady = true;
}

// ---------------------------------------------------------------------------
// Wait for the gateway HTTP server to accept connections before loading URL
// ---------------------------------------------------------------------------
async function waitForServer(retries = 20, delayMs = 200): Promise<void> {
  const http = await import('http');
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      const req = http.get(APP_URL, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        attempts++;
        if (attempts >= retries) {
          reject(new Error(`Gateway not ready after ${retries} attempts`));
        } else {
          setTimeout(check, delayMs);
        }
      });
      req.end();
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------
function createTray(): void {
  let icon = nativeImage.createEmpty();
  try {
    icon = nativeImage.createFromPath(ICON_PATH);
  } catch {
    // Icon not yet available — tray will use empty image
  }

  tray = new Tray(icon);
  tray.setToolTip('Starpeace Online');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show', click: () => mainWindow?.show() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );

  tray.on('double-click', () => mainWindow?.show());
}

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', () => {
    mainWindow?.webContents.send('update-available');
    if (Notification.isSupported()) {
      new Notification({
        title: 'Starpeace Online',
        body: 'Une mise à jour est disponible et sera installée automatiquement.',
      }).show();
    }
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err: Error) => {
    console.error('[Updater] Error:', err.message);
  });

  // Check on startup (skip in dev to avoid GitHub API calls)
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.error('[Updater] Check failed:', err.message);
    });
  }
}

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------
function setupIpc(): void {
  ipcMain.on('minimize-to-tray', () => {
    mainWindow?.hide();
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });
}

// ---------------------------------------------------------------------------
// Main window
// ---------------------------------------------------------------------------
async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Starpeace Online',
    show: false, // shown after ready-to-show to avoid flash
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Hide menu bar (game UI handles navigation)
  mainWindow.setMenuBarVisibility(false);

  // Show window once content is ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Minimize to tray on close instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuiting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // Wait for server then load
  await waitForServer();
  await mainWindow.loadURL(APP_URL);
}

// ---------------------------------------------------------------------------
// Global shortcuts
// ---------------------------------------------------------------------------
function registerShortcuts(): void {
  // Ctrl+Shift+S — show/hide the window
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

// Restore window when a second instance tries to launch
app.on('second-instance', () => {
  mainWindow?.show();
  mainWindow?.focus();
});

app.on('ready', async () => {
  startGateway();
  createTray();
  setupIpc();
  registerShortcuts();
  setupAutoUpdater();

  try {
    await createWindow();
  } catch (err) {
    console.error('[Electron] Failed to load app:', err);
    app.quit();
  }
});

// Prevent default quit so tray minimize works; set flag on explicit quit
let isQuiting = false;
app.on('before-quit', () => {
  isQuiting = true;
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// macOS: re-create window when dock icon is clicked with no open windows
app.on('activate', () => {
  if (mainWindow === null) {
    createWindow().catch(console.error);
  } else {
    mainWindow.show();
  }
});
