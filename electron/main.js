const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// electron-updater is lazy-loaded after app.ready (it reads app.getVersion() at import time)
let autoUpdater = null;

let mainWindow = null;
let gateway = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
}

/**
 * Validate that critical files exist before attempting to start the gateway.
 * Throws with a clear diagnostic message if anything is missing.
 */
function validatePackagedFiles() {
  if (!app.isPackaged) return; // dev mode — files are in dist/

  const res = process.resourcesPath;
  const required = [
    { path: path.join(res, 'dist', 'server-bundle.js'), label: 'Server bundle' },
    { path: path.join(res, 'public', 'index.html'),     label: 'index.html' },
    { path: path.join(res, 'dist', 'node_modules', '7zip-min'), label: '7zip-min module', isDir: true },
  ];

  const missing = required.filter((f) =>
    f.isDir ? !fs.existsSync(f.path) : !fs.existsSync(f.path),
  );

  if (missing.length > 0) {
    const details = missing.map((f) => `  - ${f.label}: ${f.path}`).join('\n');
    throw new Error(
      `Packaged app is missing required files:\n${details}\n\n` +
      'This usually means the electron-builder extraResources are misconfigured.',
    );
  }
}

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
    // Validate that all required files exist in the packaged app
    validatePackagedFiles();

    // Use direct CDN URL (Cloudflare R2 custom domain with Vary: Origin transform rule).
    // Previously routed through /cdn/ proxy to bypass CORS, but CORS is now handled
    // by Cloudflare cache purge + Vary: Origin header on spo.zz.works.
    // Omit CHUNK_CDN_URL to use the default (https://spo.zz.works) from config.ts.

    // Use bundled server in packaged app, individual files in dev.
    // Packaged: explicit path via process.resourcesPath (no asar boundary guessing).
    // Dev: relative path from electron/ to project dist/.
    const serverPath = app.isPackaged
      ? path.join(process.resourcesPath, 'dist', 'server-bundle')
      : path.join(__dirname, '..', 'dist', 'server', 'server');
    const { startGateway } = require(serverPath);

    // Start the embedded gateway on a random localhost port.
    // resourcesPath tells getPublicDir() where extraResources live.
    // userDataPath redirects writable dirs (cache, webclient-cache) to %APPDATA%.
    // onListening fires as soon as HTTP server is up, BEFORE caches/services finish.
    gateway = await startGateway({
      host: '127.0.0.1',
      port: 0,
      singleUserMode: true,
      userDataPath: app.getPath('userData'),
      resourcesPath: process.resourcesPath,
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
    mainWindow.loadURL(
      `data:text/html,<h1>Gateway failed to start</h1><pre>${escapeHtml(err.message)}</pre>`,
    );
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
