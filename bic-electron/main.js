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

// Variable global para almacenar el contenido del PDF en memoria
let pdfBuffer = null;

// Nueva función para leer archivo remoto en variable
function leerArchivoRemotoEnVariable(url, mainWindow, dialog) {
  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith('https') ? https : http;
    let data = [];
    protocolo.get(url, (response) => {
      if (response.statusCode !== 200) {
        dialog.showErrorBox('Error', 'Error al leer los parámetros: ' + url);
        return;
      }
      response.on('data', (chunk) => {
        data.push(chunk);
      });
      response.on('end', () => {
        resolve(Buffer.concat(data));
        const parms = JSON.parse(data);
        parms.forEach(element => {
          pdfUrls.push(element);
        });
      });
    }).on('error', (err) => {
      dialog.showErrorBox('Error', 'Error al leer los parametros: ' + err.message);
    });
  });
}

function leerArchivoSimple(filesParam, mainWindow, dialog){
  const lista = filesParam.split(','); 
  lista.forEach(element=>{
    const cleanUrl = element.split(/[?#]/)[0];
    pdfUrls.push({"nombre": cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1), "url": element});
  });
  if (mainWindow) {
    mainWindow.webContents.send('set-pdf-urls', pdfUrls);
  }
}

// Manejar apertura con protocolo personalizado
app.on('open-url', (event, url) => {
  event.preventDefault();
  // Extraer parámetros de la URL
  const urlObj = new URL(url);
  
  if (urlObj.protocol === 'bic:') {
    const filesParam = urlObj.searchParams.get('files');
    if (filesParam) {
      leerArchivoSimple(filesParam, mainWindow, dialog);
    } else {
      const paramsurl = urlObj.searchParams.get('paramsurl');
      if (paramsurl) {
        leerArchivoRemotoEnVariable(paramsurl, mainWindow, dialog);
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
        leerArchivoSimple(filesParam, mainWindow, dialog);
        if (pdfUrls.length > 0 && mainWindow) {
          mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.send('set-pdf-urls', pdfUrls);
          });
        }
      } else {
        const paramsurl = urlObj.searchParams.get('paramsurl');
        if (paramsurl) {
          leerArchivoRemotoEnVariable(paramsurl, mainWindow, dialog).then(()=>{
            if (pdfUrls.length > 0 && mainWindow) {
              mainWindow.webContents.on('did-finish-load', () => {
                mainWindow.webContents.send('set-pdf-urls', pdfUrls);
              });
            }
          });
        }
      }
    }
  }

});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Función para descargar un archivo
function descargarArchivo(pdf, destino) {
  
  const url = pdf.url;
  let opt = {medhod: 'GET'};

  if(pdf.headers) opt['headers'] = pdf.headers;

  return new Promise((resolve, reject) => {

    let protocolo;

    const uri = new URL(url);
    opt['hostname'] = uri.hostname;
    opt['port'] = uri.port;
    opt['path'] = uri.pathname;

    if(url.startsWith('https')){
      protocolo = https;
    }else{
      protocolo = http;
    }

    const file = fs.createWriteStream(destino);
    protocolo.get(opt, (response) => {
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

// Obtener el directorio home del usuario
ipcMain.handle('get-home-dir', () => {
  return os.homedir();
});

// Obtener las configuraciones del localStorage
ipcMain.handle('get-confs', async () => {
  try {
    // Enviar mensaje al renderer para que obtenga las configuraciones del localStorage
    const confs = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const confs = localStorage.getItem('conf');
        return confs ? JSON.parse(confs) : null;
      })()
    `);
    return confs;
  } catch (error) {
    console.error('Error al obtener configuraciones:', error);
    return null;
  }
});

ipcMain.on('firmar-pdfs', async (event, { pdfs, password }) => {
  // Obtener las configuraciones del localStorage
  let confs = null;
  try {
    // Esperar a que la ventana esté completamente cargada
    if (!mainWindow.webContents.isLoading()) {
      confs = await mainWindow.webContents.executeJavaScript(`
        (() => {
          const confs = localStorage.getItem('conf');
          return confs ? JSON.parse(confs) : null;
        })()
      `);
      console.log('Configuraciones obtenidas:', confs);
    } else {
      console.log('Ventana aún cargando, esperando...');
      // Esperar a que termine de cargar
      await new Promise(resolve => {
        mainWindow.webContents.once('did-finish-load', resolve);
      });
      confs = await mainWindow.webContents.executeJavaScript(`
        (() => {
          const confs = localStorage.getItem('conf');
          return confs ? JSON.parse(confs) : null;
        })()
      `);
      console.log('Configuraciones obtenidas después de cargar:', confs);
    }
  } catch (error) {
    console.error('Error al obtener configuraciones:', error);
  }
  
  let posicion={};
  if(confs.pagina === 'pp') posicion['pargina'] = 'primera';
  else if(confs.pagina === 'up') posicion['pargina'] = 'ultima';
  else posicion['pargina'] = Number(confs.numeroPagina);

  if(confs.posicion === 'ci') posicion['lugar'] = 'centro-inferior';
  else if(confs.posicion === 'cs') posicion['lugar'] = 'centro-superior';
  else if(confs.posicion === 'esi') posicion['lugar'] = 'esquina-superior-izquierda';
  else if(confs.posicion === 'esd') posicion['lugar'] = 'esquina-superior-derecha';
  else if(confs.posicion === 'eii') posicion['lugar'] = 'esquina-inferior-izquierda';
  else if(confs.posicion === 'eid') posicion['lugar'] = 'esquina-inferior-derecha';

  console.log("pos",JSON.stringify(posicion));
  
  const dir = confs.directorio;

  // Ejecutar la aplicación Java
  // Ajusta la ruta y los argumentos según tu app Java
  const javaPath = 'java';
  const jarPath = path.resolve(__dirname, '../target/bic-jar-with-dependencies.jar');
  
  try {
    // Descargar los PDFs seleccionados a una carpeta temporal
    const rutasLocales = [];
    for (const pdf of pdfs) {
      const nombre = pdf.nombre;
      const destino = path.join(bicHome, "downloads", nombre);
      await descargarArchivo(pdf, destino);
      rutasLocales.push(destino);
    }

    const position = JSON.stringify(posicion);
    // Ajusta el nombre del JAR
    const archivosParam = rutasLocales.join(',');
    const args = ['-jar', jarPath, `--pin=${password}`, `--archivos=${archivosParam}`, `--destino=${dir}`, `--posicion=${position}`];
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