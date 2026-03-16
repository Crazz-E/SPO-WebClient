const { app, BrowserWindow } = require('electron');

let mainWindow = null;
let gateway = null;

async function createWindow() {
  // Show a splash message in the title while gateway starts
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'Starpeace Online — Starting gateway...',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Remove the default menu bar
  mainWindow.setMenuBarVisibility(false);

  try {
    // Set Electron user data path BEFORE importing gateway
    // (app.getPath() only works after app.ready, so we do it here)
    const { setElectronUserDataPath } = require('../dist/server/paths');
    setElectronUserDataPath(app.getPath('userData'));

    // Route CDN requests through the local gateway proxy to bypass CORS
    // (the gateway's /cdn/* endpoint relays to spo.zz.works server-side)
    process.env.CHUNK_CDN_URL = '';

    // Import gateway (triggers service registration at module level)
    const { startGateway } = require('../dist/server/server');

    // Start the embedded gateway on a random localhost port
    gateway = await startGateway({
      host: '127.0.0.1',
      port: 0,
      singleUserMode: true,
    });

    console.log(`[Electron] Gateway ready on port ${gateway.port}`);
    mainWindow.setTitle('Starpeace Online');

    // Load the web client from the embedded HTTP server
    mainWindow.loadURL(`http://127.0.0.1:${gateway.port}`);
  } catch (err) {
    console.error('[Electron] Gateway failed to start:', err);
    mainWindow.setTitle('Starpeace Online — Error');
    mainWindow.loadURL(`data:text/html,<h1>Gateway failed to start</h1><pre>${err.message}</pre>`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', async () => {
  if (gateway) {
    console.log('[Electron] Shutting down gateway...');
    await gateway.shutdown();
    console.log('[Electron] Gateway shutdown complete');
  }
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
