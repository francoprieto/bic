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
      width: 800,
      height: 700,
      autoHideMenuBar: true,
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

// Configuración y perfiles
ipcMain.handle('get-state',           ()                    => store.getState());
ipcMain.handle('save-profile-config', (_, profileId, cfg)  => store.saveProfileConfig(profileId, cfg));
ipcMain.handle('create-profile',      (_, name)            => store.createProfile(name));
ipcMain.handle('rename-profile',      (_, profileId, name) => store.renameProfile(profileId, name));
ipcMain.handle('delete-profile',      (_, profileId)       => store.deleteProfile(profileId));
ipcMain.handle('set-current-profile', (_, profileId)       => store.setCurrentProfile(profileId));

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

/** Devuelve la ruta absoluta de la imagen del perfil, o null si no existe. */
function getSignatureImagePath(profileId) {
  const dir = path.join(os.homedir(), '.bic');
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const file = path.join(dir, `firma-${profileId}.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

// Seleccionar archivos locales
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

// Seleccionar directorio de salida
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  return result.canceled ? null : result.filePaths[0];
});

// Obtener info de página de un PDF (dimensiones, total de páginas y contenido base64)
ipcMain.handle('get-pdf-page-info', (_, filePath) => {
  try {
    const buf = fs.readFileSync(filePath);
    const raw = buf.toString('binary');

    // Contar páginas: buscar /Type /Page (no /Pages)
    const pageMatches = raw.match(/\/Type\s*\/Page(?!s)\b/g);
    const totalPages = pageMatches ? pageMatches.length : 1;

    // Extraer todos los MediaBox
    const mediaBoxes = [];
    const mbRegex = /\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/g;
    let m;
    while ((m = mbRegex.exec(raw)) !== null) {
      mediaBoxes.push({
        x: parseFloat(m[1]), y: parseFloat(m[2]),
        w: parseFloat(m[3]), h: parseFloat(m[4]),
      });
    }

    // Usar el primer MediaBox encontrado (aplica a la mayoría de PDFs)
    const box = mediaBoxes.length > 0 ? mediaBoxes[0] : { x: 0, y: 0, w: 595, h: 842 };

    return {
      width: box.w - box.x,
      height: box.h - box.y,
      totalPages,
      base64: buf.toString('base64'),
    };
  } catch (e) {
    return { width: 595, height: 842, totalPages: 1, error: e.message };
  }
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
  // Resolver ruta absoluta de imagen del perfil activo antes de firmar
  const profileId = payload.profileId || 'default';
  const imagenPath = getSignatureImagePath(profileId);
  if (imagenPath) {
    payload.config = { ...payload.config, imagenPath };
  }
  signer.sign(payload, mainWindow);
});

// Reset
ipcMain.on('reset', () => {
  protocol.reset();
});

// Abrir archivo con la app por defecto del sistema
ipcMain.handle('open-file', (_, filePath) => {
  const { shell } = require('electron');
  shell.openPath(filePath);
});

// Borrar imagen de firma de un perfil
ipcMain.handle('delete-signature-image', (_, profileId) => {
  const dir = path.join(os.homedir(), '.bic');
  for (const ext of ['png', 'jpg', 'jpeg']) {
    const file = path.join(dir, `firma-${profileId}.${ext}`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      return true;
    }
  }
  return false;
});
