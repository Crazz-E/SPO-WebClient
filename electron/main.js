const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');

// electron-updater is lazy-loaded after app.ready (it reads app.getVersion() at import time)
let autoUpdater = null;

let mainWindow = null;
let gateway = null;

// ---------------------------------------------------------------------------
// Auto-updater
// ---------------------------------------------------------------------------

function setupAutoUpdater() {
  // Lazy-load after app.ready — electron-updater reads app.getVersion() at require time
  autoUpdater = require('electron-updater').autoUpdater;

  // Beta versions should see pre-release updates
  autoUpdater.allowPrerelease = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  // Log to stdout (visible in dev; in packaged builds consider electron-log)
  autoUpdater.logger = {
    info: (...args) => console.log('[AutoUpdater]', ...args),
    warn: (...args) => console.warn('[AutoUpdater]', ...args),
    error: (...args) => console.error('[AutoUpdater]', ...args),
    debug: (...args) => console.log('[AutoUpdater:debug]', ...args),
  };

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    console.log(`[AutoUpdater] Update available: ${info.version}`);
    sendUpdateStatus('available', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    sendUpdateStatus('not-available');
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus('downloading', { percent: Math.round(progress.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log(`[AutoUpdater] Update downloaded: ${info.version}`);
    sendUpdateStatus('downloaded', { version: info.version });

    // Prompt user via native dialog
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'Restart the application to apply the update.',
      })
      .then((result) => {
        if (result.response === 0) {
          // Small delay to avoid NSIS first-attempt failure (electron-builder #6555)
          setTimeout(() => autoUpdater.quitAndInstall(false, true), 1000);
        }
      });
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Error:', err.message);
    sendUpdateStatus('error', { message: err.message });
    // Silently continue — user is offline, rate limited, or no releases exist
  });

  // IPC: renderer can request install or manual check
  ipcMain.on('install-update', () => {
    setTimeout(() => autoUpdater.quitAndInstall(false, true), 1000);
  });
  ipcMain.on('check-for-update', () => {
    autoUpdater.checkForUpdates().catch(() => {});
  });

  // Check for updates (non-blocking, errors are caught by the 'error' event)
  autoUpdater.checkForUpdates().catch(() => {});
}

function sendUpdateStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }
}

// ---------------------------------------------------------------------------
// Window + Gateway
// ---------------------------------------------------------------------------

async function createWindow() {
  // Show a splash message in the title while gateway starts
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Starpeace Online — Starting gateway...',
    icon: path.join(__dirname, 'icons', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Remove the default menu bar
  mainWindow.setMenuBarVisibility(false);

  try {
    // Route CDN requests through the local gateway proxy to bypass CORS
    // (the gateway's /cdn/* endpoint relays to spo.zz.works server-side)
    process.env.CHUNK_CDN_URL = '';

    // Use bundled server in packaged app, individual files in dev
    const serverPath = app.isPackaged
      ? '../dist/server-bundle'
      : '../dist/server/server';
    const { startGateway } = require(serverPath);

    // Start the embedded gateway on a random localhost port.
    // userDataPath redirects writable dirs (cache, webclient-cache) to %APPDATA%.
    // onListening fires as soon as HTTP server is up, BEFORE caches/services finish.
    gateway = await startGateway({
      host: '127.0.0.1',
      port: 0,
      singleUserMode: true,
      userDataPath: app.getPath('userData'),
      onListening: (port) => {
        console.log(`[Electron] Gateway listening on port ${port}`);
        mainWindow.setTitle('Starpeace Online');
        mainWindow.loadURL(`http://127.0.0.1:${port}`);
      },
    });

    console.log(`[Electron] Gateway fully ready on port ${gateway.port}`);
  } catch (err) {
    console.error('[Electron] Gateway failed to start:', err);
    mainWindow.setTitle('Starpeace Online — Error');
    mainWindow.loadURL(`data:text/html,<h1>Gateway failed to start</h1><pre>${err.message}</pre>`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', async () => {
  await createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', async () => {
  if (gateway) {
    console.log('[Electron] Shutting down gateway...');
    const shutdownPromise = gateway.shutdown();
    const timeout = new Promise(r => setTimeout(r, 8000));
    await Promise.race([shutdownPromise, timeout]);
    console.log('[Electron] Gateway shutdown complete');
  }
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
