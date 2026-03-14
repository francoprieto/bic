'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

const protocol = require('./protocol');
const signer   = require('./signer');
const store    = require('./store');
const logger   = require('./logger');

let mainWindow = null;

// ─── Protocolo personalizado ─────────────────────────────────────────────────
app.setAsDefaultProtocolClient('bic');

// ─── Crear ventana ────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 660,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}

// ─── App ready ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  logger.init();
  createWindow();

  // Argumento bic:// pasado al abrir la app (Windows / Linux)
  const bicArg = process.argv.find(a => a.startsWith('bic://'));
  if (bicArg) {
    await mainWindow.webContents.once('did-finish-load', () => {});
    await protocol.handle(bicArg, mainWindow);
  } else {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('mode-local');
    });
  }
});

// macOS: bic:// llega por open-url
app.on('open-url', async (event, url) => {
  event.preventDefault();
  if (!mainWindow) return;
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => protocol.handle(url, mainWindow));
  } else {
    await protocol.handle(url, mainWindow);
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// Configuración
ipcMain.handle('get-config',  () => store.getConfig());
ipcMain.handle('save-config', (_, config) => store.saveConfig(config));

// Perfiles
ipcMain.handle('get-profiles',    ()           => store.getProfiles());
ipcMain.handle('save-profiles',   (_, profiles) => store.saveProfiles(profiles));

// Imagen de firma
ipcMain.handle('save-signature-image', (_, buffer, ext, profileId) => {
  const dir  = path.join(os.homedir(), '.bic');
  const file = path.join(dir, `firma-${profileId}.${ext}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, Buffer.from(buffer));
  return file;
});

ipcMain.handle('get-signature-image', (_, profileId) => {
  const dir = path.join(os.homedir(), '.bic');
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const file = path.join(dir, `firma-${profileId}.${ext}`);
    if (fs.existsSync(file)) return fs.readFileSync(file).toString('base64');
  }
  return null;
});

// Seleccionar archivos locales
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

// Listar certificados (llama al JAR)
ipcMain.handle('list-certs', async (_, params) => {
  return signer.listCerts(params);
});

// Firmar (llama al JAR)
ipcMain.on('sign', (event, payload) => {
  signer.sign(payload, mainWindow);
});

// Reset
ipcMain.on('reset', () => {
  protocol.reset();
});
