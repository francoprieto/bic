const { app, protocol, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

const fs = require('fs');
const https = require('https');
const http = require('http');
const { execFile } = require('child_process');
const os = require('os');


let mainWindow;
let pdfUrls = [];
let bicHome;
let firmaSimple = true;

// Registrar protocolo personalizado
app.setAsDefaultProtocolClient('bic');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  bicHome = os.homedir + path.sep + '.bic' + path.sep;

  mainWindow.loadFile('index.html');
}

// Función para descargar y notificar PDF
function descargarYNotificarPDF(paramsurl, bicHome, mainWindow, dialog) {
  const nombreArchivo = path.basename(paramsurl.split('?')[0]);
  const destino = path.join(bicHome, nombreArchivo);
  descargarArchivo(paramsurl, destino)
    .then(() => {
      pdfUrls = [destino];
      if (mainWindow) {
        mainWindow.webContents.send('set-pdf-urls', pdfUrls);
      }
    })
    .catch(err => {
      dialog.showErrorBox('Error', 'Error al descargar parámetros: ' + err.message);
    });
}

// Manejar apertura con protocolo personalizado
app.on('open-url', (event, url) => {
  event.preventDefault();
  // Extraer parámetros de la URL
  const urlObj = new URL(url);
  
  if (urlObj.protocol === 'bic:') {
    const filesParam = urlObj.searchParams.get('files');
    if (filesParam) {
      console.log("Entra a lista simple", filesParam);
      pdfUrls = filesParam.split(',');
      if (mainWindow) {
        mainWindow.webContents.send('set-pdf-urls', pdfUrls);
      }
    } else {
      const paramsurl = urlObj.searchParams.get('paramsurl');
      if (paramsurl) {
        descargarYNotificarPDF(paramsurl, bicHome, mainWindow, dialog);
      }
    }
  }
});

app.whenReady().then(() => {
  createWindow();
  // Si la app se abre con argumentos (por ejemplo, desde protocolo personalizado)
  if (process.argv.length > 1) {
    const arg = process.argv.find(a => a.startsWith('bic://'));
    if (arg) {
      const urlObj = new URL(arg);
      const filesParam = urlObj.searchParams.get('files');
      if (filesParam) {
        console.log("Entra a lista simple", filesParam);
        pdfUrls = filesParam.split(',');
        if (mainWindow) {
          mainWindow.webContents.send('set-pdf-urls', pdfUrls);
        }
      } else {
        const paramsurl = urlObj.searchParams.get('paramsurl');
        if (paramsurl) {
          descargarYNotificarPDF(paramsurl, bicHome, mainWindow, dialog);
        }
      }
    }
  }

  console.log("lista de pdfs",pdfUrls.length);
  
  if (pdfUrls.length > 0 && mainWindow) {
    mainWindow.webContents.on('did-finish-load', () => {
      mainWindow.webContents.send('set-pdf-urls', pdfUrls);
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Función para descargar un archivo
function descargarArchivo(url, destino) {
  console.log("Descargando", url, "a", destino);
  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destino);
    protocolo.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error('Error al descargar: ' + url));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destino));
      });
    }).on('error', (err) => {
      fs.unlink(destino, () => reject(err));
    });
  });
}

ipcMain.on('firmar-pdfs', async (event, { pdfs, password }) => {
  try {
    // Descargar los PDFs seleccionados a una carpeta temporal
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bic-'));
    const rutasLocales = [];
    for (const url of pdfs) {
      const nombre = path.basename(url.split('?')[0]);
      const destino = path.join(tempDir, nombre);
      await descargarArchivo(url, destino);
      rutasLocales.push(destino);
    }
    // Ejecutar la aplicación Java
    // Ajusta la ruta y los argumentos según tu app Java
    const javaPath = 'java';
    const jarPath = path.resolve(__dirname, '../target/bic-jar-with-dependencies.jar'); // Ajusta el nombre del JAR
    const archivosParam = rutasLocales.join(',');
    const args = ['-jar', jarPath, `--pin=${password}`, `--archivos=${archivosParam}`, `--destino=C:\\temp`];
    execFile(javaPath, args, (error, stdout, stderr) => {
      if (error) {
        event.sender.send('firma-resultado', { success: false, error: stderr || error.message });
      } else {
        event.sender.send('firma-resultado', { success: true, output: stdout });
      }
    });
  } catch (err) {
    event.sender.send('firma-resultado', { success: false, error: err.message });
  }
}); 