'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const os   = require('os');
const fs   = require('fs');

// Capturar errores no manejados antes de cualquier otra cosa
process.on('uncaughtException', (err) => {
  process.stderr.write(`[FATAL] uncaughtException: ${err.stack || err.message}\n`);
  try {
    const logDir = path.join(os.homedir(), '.bic', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, 'crash.log'), `[${new Date().toISOString()}] ${err.stack || err.message}\n`);
  } catch (_) {}
});

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`[FATAL] unhandledRejection: ${reason}\n`);
});

const protocol = require('./protocol');
const signer   = require('./signer');
const store    = require('./store');
const logger   = require('./logger');

let mainWindow = null;

// Log inmediato para confirmar arranque
process.stderr.write(`[STARTUP] BIC iniciando. argv: ${process.argv.join(' ')}\n`);

// ─── Protocolo personalizado ─────────────────────────────────────────────────
app.setAsDefaultProtocolClient('bic');

// ─── Crear ventana ────────────────────────────────────────────────────────────
function createWindow() {
  try {
    mainWindow = new BrowserWindow({
      width: 820,
      height: 660,
      webPreferences: {
        preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    const htmlPath = path.join(__dirname, '..', 'renderer', 'index.html');
    process.stderr.write(`[STARTUP] Cargando: ${htmlPath} (existe: ${fs.existsSync(htmlPath)})\n`);
    mainWindow.loadFile(htmlPath);
    mainWindow.webContents.on('did-fail-load', (e, code, desc) => {
      process.stderr.write(`[ERROR] did-fail-load: ${code} ${desc}\n`);
    });
  } catch (err) {
    process.stderr.write(`[FATAL] createWindow: ${err.stack || err.message}\n`);
  }
}

let pendingBicUrl = null; // URL bic:// pendiente de procesar

// ─── App ready ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  process.stderr.write(`[STARTUP] app.whenReady() resuelto\n`);
  logger.init();
  createWindow();

  const bicArg = process.argv.find(a => a.startsWith('bic://'));
  process.stderr.write(`[STARTUP] bicArg=${bicArg || 'ninguno'}\n`);
  if (bicArg) pendingBicUrl = bicArg;
});

// macOS: bic:// llega por open-url (app ya abierta o lanzada desde browser)
app.on('open-url', (event, url) => {
  event.preventDefault();
  process.stderr.write(`[OPEN-URL] recibido: ${url}\n`);
  pendingBicUrl = url;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    process.stderr.write(`[OPEN-URL] renderer ya listo, procesando\n`);
    const url2 = pendingBicUrl;
    pendingBicUrl = null;
    protocol.handle(url2, () => mainWindow);
  }
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

// ─── IPC handlers ─────────────────────────────────────────────────────────────

// Renderer listo: procesar URL pendiente o enviar mode-local
ipcMain.on('renderer-ready', () => {
  process.stderr.write(`[IPC] renderer-ready. pendingBicUrl=${pendingBicUrl || 'ninguno'}\n`);
  if (pendingBicUrl) {
    const url = pendingBicUrl;
    pendingBicUrl = null;
    // Pasar función que resuelve mainWindow en el momento de enviar
    protocol.handle(url, () => mainWindow);
  } else {
    mainWindow.webContents.send('mode-local');
  }
});

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

// Seleccionar certificado .p12
ipcMain.handle('select-cert', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Certificado', extensions: ['p12', 'pfx'] }],
  });
  return result.canceled ? null : result.filePaths[0];
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
