/**
 * Proceso principal de la aplicación Electron
 * Encargado de:
 *  - Crear ventana principal
 *  - Manejar protocolo personalizado bic://
 *  - Descarga, firma y subida de PDFs
 *  - Comunicación con procesos Java
 */

const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const fs = require("fs");
const https = require("https");
const http = require("http");
const url = require("url");
const FormData = require("form-data");
const os = require("os");
const path = require("path");
const pako = require("pako");
const { v4: uuidv4 } = require("uuid");
const { spawn } = require("child_process");

// --- SISTEMA DE LOGGING ---
const logDir = path.join(os.homedir(), ".bic", "logs");
const logFile = path.join(logDir, `bic-${new Date().toISOString().split('T')[0]}.log`);

// Crear directorio de logs si no existe
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Función para escribir en el log
function writeLog(level, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg, null, 2);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  const logEntry = `[${timestamp}] [${level}] ${message}\n`;
  
  // Escribir al archivo de log
  fs.appendFileSync(logFile, logEntry, 'utf8');
}

// Sobrescribir console.log, console.error, console.warn, console.info
const originalConsole = {
  log: console.log,
  error: console.error,
  warn: console.warn,
  info: console.info,
  debug: console.debug
};

console.log = function(...args) {
  writeLog('INFO', ...args);
  originalConsole.log.apply(console, args);
};

console.error = function(...args) {
  writeLog('ERROR', ...args);
  originalConsole.error.apply(console, args);
};

console.warn = function(...args) {
  writeLog('WARN', ...args);
  originalConsole.warn.apply(console, args);
};

console.info = function(...args) {
  writeLog('INFO', ...args);
  originalConsole.info.apply(console, args);
};

console.debug = function(...args) {
  writeLog('DEBUG', ...args);
  originalConsole.debug.apply(console, args);
};

// Log de inicio de aplicación
console.log('='.repeat(80));
console.log('Aplicación BIC iniciada');
console.log('Versión de Electron:', process.versions.electron);
console.log('Versión de Node:', process.versions.node);
console.log('Sistema Operativo:', os.platform(), os.release());
console.log('Archivo de log:', logFile);
console.log('='.repeat(80));

// --- VARIABLES GLOBALES ---
let mainWindow;
let pdfUrls = [];
let firmados = [];
let subidos = [];
let local = false;
let bicHome;
const firmaPath = path.join(__dirname, "firma.png");

// Registrar protocolo personalizado
app.setAsDefaultProtocolClient("bic");

// --- CREAR VENTANA PRINCIPAL ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 650,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  bicHome = path.join(os.homedir(), ".bic");
  mainWindow.loadFile("index.html");
}

// --- FUNCIONES AUXILIARES ---

/**
 * Decodifica un string Base64 y lo descomprime con gzip
 */
function decodeAndUnzip(base64Str) {
  try{
    const val = atob(base64Str);
    if(val) return val;
  } catch (err) {
    console.error("Esta comprimido..");  
  }
  try {
    let b64 = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) {
      b64 += "=";
    }
    const bytes = Buffer.from(b64, "base64");
    return pako.ungzip(bytes, { to: "string" });
  } catch (err) {
    console.error("Error al decodificar/unzip:", err);
    return null;
  }
}

/**
 * Descarga archivo remoto y lo agrega a pdfUrls
 */
async function leerArchivoRemotoEnVariable(jsonParams) {
  try {
    const url = jsonParams.uri;
    const headers = jsonParams.headers || {};
    
    let opt = {
      method: "GET",
      hostname: new URL(url).hostname,
      port: new URL(url).port,
      path: new URL(url).pathname + new URL(url).search,
      headers,
    };

    // Esperar la configuración antes de continuar
    try {
      const c = await getConfs();
      if (c?.proxy) {
        opt['proxy'] = c.proxy;
      }
    } catch (confError) {
      console.warn('No se pudo cargar configuración de proxy:', confError);
    }

    console.log('conf ::::: ', JSON.stringify(opt, null, 2));
    
    return new Promise((resolve, reject) => {
      const protocolo = url.startsWith("https") ? https : http;
      if (url.startsWith("https")) {
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
      }

      let data = [];
      const request = protocolo.get(opt, (response) => {
        if (response.statusCode !== 200) {
          const errorMsg = `Error al leer parámetros: HTTP ${response.statusCode}`;
          console.error(errorMsg);
          dialog.showErrorBox("Error", errorMsg);
          return reject(new Error(errorMsg));
        }

        response.on("data", (chunk) => data.push(chunk));
        response.on("end", () => {
          try {
            const rawData = Buffer.concat(data).toString();
            console.log('Datos recibidos:', rawData);
            const params = JSON.parse(rawData);
            
            if (!Array.isArray(params)) {
              throw new Error('El archivo JSON debe contener un array de objetos');
            }
            
            pdfUrls.push(...params);
            console.log(`${params.length} archivos agregados a la lista`);
            resolve();
          } catch (err) {
            console.error('Error al procesar respuesta:', err);
            dialog.showErrorBox("Error", "Error al procesar datos: " + err.message);
            reject(err);
          }
        });
      });

      request.on("error", (err) => {
        console.error('Error en petición HTTP:', err);
        dialog.showErrorBox("Error", "Error al leer los parámetros: " + err.message);
        reject(err);
      });

      request.end();
    });
  } catch (error) {
    console.error('Error en leerArchivoRemotoEnVariable:', error);
    throw error;
  }
}

/**
 * Procesa lista de archivos enviada en la URL
 */
  function leerArchivoSimple(filesParam) {
    if(!filesParam || filesParam.trim() === '') {
      return;
    }
    
    const lista = filesParam.split(",");
    lista.forEach((element) => {
      const cleanUrl = element.split(/[?#]/)[0];
      const uid = uuidv4();
      pdfUrls.push({
        nombre: path.basename(cleanUrl),
        url: element,
        id: uid
      });
    });
    
    if (mainWindow) {
      local = true;
      mainWindow.webContents.send("set-pdf-urls", pdfUrls);
    }
  }

// --- MANEJAR PROTOCOLO PERSONALIZADO ---
app.on("open-url", async (event, url) => {
  console.log('Protocolo personalizado recibido:', url);
  event.preventDefault();
  const urlObj = new URL(url);

  if (urlObj.protocol !== "bic:") return;

  try {
    const filesParam = urlObj.searchParams.get("files");
    if (filesParam) {
      leerArchivoSimple(filesParam);
      if (mainWindow) {
        console.log('Enviando', pdfUrls.length, 'archivos a la ventana (files)');
        
        // Si la ventana ya está cargada, enviar inmediatamente
        if (mainWindow.webContents.isLoading()) {
          console.log('Ventana cargando, esperando...');
          mainWindow.webContents.once('did-finish-load', () => {
            console.log('Ventana cargada, enviando archivos');
            mainWindow.webContents.send("set-pdf-urls", pdfUrls);
          });
        } else {
          console.log('Ventana ya cargada, enviando archivos inmediatamente');
          mainWindow.webContents.send("set-pdf-urls", pdfUrls);
        }
      }
      return;
    }

    let paramsurl = urlObj.searchParams.get("gzipurl") || urlObj.searchParams.get("paramsurl");
    if (!paramsurl) {
      console.log('No se encontró paramsurl o gzipurl');
      return;
    }
    
    const val = decodeAndUnzip(paramsurl) || paramsurl;
    
    if (val) {
      const jsonParams = JSON.parse(val);
      console.log('Parámetros JSON parseados:', jsonParams);
      await leerArchivoRemotoEnVariable(jsonParams);
      
      // Enviar la lista de PDFs a la ventana después de cargarlos
      if (pdfUrls.length > 0 && mainWindow) {
        console.log('Enviando', pdfUrls.length, 'archivos a la ventana (paramsurl)');
        console.log('Lista de PDFs:', JSON.stringify(pdfUrls, null, 2));
        
        // Si la ventana ya está cargada, enviar inmediatamente
        if (mainWindow.webContents.isLoading()) {
          console.log('Ventana cargando, esperando...');
          mainWindow.webContents.once('did-finish-load', () => {
            console.log('Ventana cargada, enviando archivos');
            mainWindow.webContents.send("set-pdf-urls", pdfUrls);
          });
        } else {
          console.log('Ventana ya cargada, enviando archivos inmediatamente');
          mainWindow.webContents.send("set-pdf-urls", pdfUrls);
        }
      } else {
        console.log('No hay PDFs para enviar o mainWindow no existe');
        console.log('pdfUrls.length:', pdfUrls.length);
        console.log('mainWindow:', !!mainWindow);
      }
    }
  } catch (err) {
    console.error("Error procesando open-url:", err);
    console.error("Stack:", err.stack);
  }
});

// --- CUANDO APP ESTÁ LISTA ---
app.whenReady().then(async () => {
  createWindow();

  // Esperar un momento para que la ventana se inicialice
  await new Promise(resolve => setTimeout(resolve, 100));

  // Manejo de parámetros iniciales (cuando app abre con bic://)
  const arg = process.argv.find((a) => a.startsWith("bic://"));
  if (!arg){
    console.log('No se encontró argumento bic://, modo local');
    local = true;
    mainWindow.webContents.on("did-finish-load", () => {
      mainWindow.webContents.send("archivos-locales", local);
    });    
    return;
  } 

  console.log('Argumento bic:// encontrado:', arg);
  const urlObj = new URL(arg);
  const filesParam = urlObj.searchParams.get("files");

  if (filesParam) {
    console.log('Parámetro files encontrado');
    leerArchivoSimple(filesParam);
    
    // Esperar a que la ventana cargue
    await new Promise((resolve) => {
      if (mainWindow.webContents.isLoading()) {
        console.log('Ventana está cargando, esperando...');
        mainWindow.webContents.once("did-finish-load", resolve);
      } else {
        console.log('Ventana ya cargada');
        resolve();
      }
    });
    
    console.log('Enviando', pdfUrls.length, 'archivos a la ventana');
    mainWindow.webContents.send("set-pdf-urls", pdfUrls);
  } else {
    let paramsurl = urlObj.searchParams.get("gzipurl") || urlObj.searchParams.get("paramsurl");
    if (!paramsurl) {
      console.log('No se encontró paramsurl o gzipurl');
      return;
    }

    console.log('Parámetro paramsurl/gzipurl encontrado');
    const val = decodeAndUnzip(paramsurl) || paramsurl;
    if (val) {
      try {
        const jsonParams = JSON.parse(val);
        console.log('JSON parseado, llamando a leerArchivoRemotoEnVariable');
        await leerArchivoRemotoEnVariable(jsonParams);
        
        console.log('Archivos cargados, pdfUrls.length:', pdfUrls.length);
        
        if (pdfUrls.length > 0 && mainWindow) {
          // Esperar a que la ventana cargue
          await new Promise((resolve) => {
            if (mainWindow.webContents.isLoading()) {
              console.log('Ventana está cargando, esperando...');
              mainWindow.webContents.once("did-finish-load", resolve);
            } else {
              console.log('Ventana ya cargada');
              resolve();
            }
          });
          
          console.log('Enviando', pdfUrls.length, 'archivos a la ventana');
          console.log('Lista de PDFs:', JSON.stringify(pdfUrls, null, 2));
          mainWindow.webContents.send("set-pdf-urls", pdfUrls);
        } else {
          console.log('No hay archivos para enviar o mainWindow no existe');
        }
      } catch (error) {
        console.error('Error procesando paramsurl:', error);
        console.error('Stack:', error.stack);
      }
    }
  }
});

ipcMain.on("reset-app", () => {
  pdfUrls = [];
  firmados = [];
  subidos = [];
});

// --- SALIR CUANDO TODAS LAS VENTANAS SE CIERREN ---
app.on("window-all-closed", () => {
  console.log('Todas las ventanas cerradas');
  if (process.platform !== "darwin") {
    console.log('Cerrando aplicación');
    app.quit();
  }
});

// --- MANEJADORES DE ERRORES GLOBALES ---
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
  console.error('Stack:', error.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promesa rechazada no manejada:', reason);
  console.error('Promesa:', promise);
});

app.on('before-quit', () => {
  console.log('Aplicación cerrándose...');
  console.log('='.repeat(80));
});

// --- DESCARGAR ARCHIVO ---
function descargarArchivo(pdf, destino, ssl, proxy) {
  const url = pdf.url;
  
  // Usar urlHeaders si existe, sino headers
  const headers = pdf.urlHeaders || pdf.headers || {};
  
  let opt = {
    method: "GET",
    hostname: new URL(url).hostname,
    port: new URL(url).port,
    path: new URL(url).pathname + new URL(url).search,
    headers: headers,
  };
  
  console.log('Opciones de descarga:', JSON.stringify(opt, null, 2));
  
  if(proxy) {
    opt['proxy'] = proxy;
  }

  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith("https") ? https : http;
    
    if (url.startsWith("https")) {
      process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = ssl ? 0 : 1;
    }

    const file = fs.createWriteStream(destino);
    protocolo.get(opt, (response) => {
        console.log('Respuesta HTTP:', response.statusCode, 'para', url);
        
        if (response.statusCode !== 200) {
          const errorMsg = `Error al descargar ${pdf.nombre}: HTTP ${response.statusCode}`;
          console.error(errorMsg);
          dialog.showErrorBox("Error", errorMsg);
          return reject(new Error(errorMsg));
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            console.log('Archivo descargado exitosamente:', destino);
            resolve(destino);
          });
        });
      })
      .on("error", (err) => {
        console.error('Error al descargar:', url, err);
        dialog.showErrorBox("Error", `Error al descargar: ${url}\n${err}`);
        fs.unlink(destino, () => reject(err));
      });
  });
}

// --- HANDLERS IPC ---
ipcMain.handle("get-home-dir", () => os.homedir());

ipcMain.handle("get-confs", async () => {
  try {
    return await mainWindow.webContents.executeJavaScript(`
      (() => {
        const confs = localStorage.getItem('conf');
        return confs ? JSON.parse(confs) : null;
      })()
    `);
  } catch (error) {
    console.error("Error al obtener configuraciones:", error);
    return null;
  }
});

ipcMain.handle("save-signature-image", async (event, buffer, ext) => {
  const targetPath = path.join(__dirname, `firma.${ext}`);
  fs.writeFileSync(targetPath, Buffer.from(buffer));
  return `firma.${ext}`;
});

ipcMain.handle("save-default-image", async () => {
  const targetPath = firmaPath;
  const sourcePath = path.join(__dirname, "default.png");
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
});

ipcMain.handle("select-files", async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: ['pdf']
  });
  const seleccion = result.filePaths;
  let lista = '';
  for(let i=0; i<seleccion.length;i++){
    if(i > 0) lista += ',';
    const path = seleccion[i].replace('C:','file://C').replaceAll('\\','/');
    if(path.toLocaleLowerCase().endsWith('.pdf'))
      lista += path;
  }
  leerArchivoSimple(lista);
});

// --- SUBIR ARCHIVOS ---
function uploadFiles(pdfs, ssl, proxy, event) {
  subidos = [];
  
  let errores = [];
  let completados = 0;
  const cant = pdfs.length;

  const finalizar = () => {
    if (completados === cant) sendUploadSummary(event, errores);
  };

  pdfs.forEach((pdf) => {
    if (!pdf.callback) {
      completados++;
      return finalizar();
    }

    event.sender.send("firma-progreso", "Subiendo...");
    try {
      const form = new FormData();
      const url = pdf.callback;
      const method = pdf.callbackMethod || "POST";
      const headers = JSON.parse(pdf.callbackHeaders || "{}");
      const atributo = pdf.callbackAtributo || "file";
      const filePath = pdf.local || path.join(bicHome, "cache", pdf.nombre);

      if (!fs.existsSync(filePath)) {
        const msg = "Archivo no encontrado para subir: " + filePath;
        errores.push(msg);
        subidos.push({ id: pdf.id, subido: false, msg });
        completados++;
        return finalizar();
      }

      // Agregar campos extra del body
      const body = JSON.parse(pdf.callbackBody || "{}");
      for (const key in body) {
        if (key !== atributo) {
          form.append(key, String(body[key]));
        }
      }

      form.append(atributo, fs.createReadStream(filePath));
      let formHeaders = form.getHeaders();

      // Mezclar headers del PDF
      Object.entries(headers).forEach(([key, value]) => {
        if (typeof value === "string") formHeaders[key] = value;
      });

      const uri = new URL(url);
      let opt = {
        method,
        hostname: uri.hostname,
        port: uri.port,
        path: uri.pathname + uri.search,
        headers: formHeaders,
      };

      if(proxy)
        opt['proxy'] = proxy;

      const protocolo = url.startsWith("https") ? https : http;
      if (url.startsWith("https")){ 
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = ssl ? 0 : 1 
      };

      const req = protocolo.request(opt, (res) => {
        let responseData = "";
        res.on("data", (chunk) => (responseData += chunk));
        res.on("end", () => {
          completados++;
          if (res.statusCode !== 200) {
            const msg = `No se pudo subir ${pdf.nombre}: (HTTP ${res.statusCode}) ${responseData}`;
            errores.push(msg);
            subidos.push({ id: pdf.id, subido: false, msg });
          } else {
            subidos.push({ id: pdf.id, subido: true, msg: "" });
          }
          finalizar();
        });
      });

      form.pipe(req);

      req.on("error", (err) => {
        completados++;
        const msg = "No se pudo subir: " + err.toString();
        errores.push(msg);
        subidos.push({ id: pdf.id, subido: false, msg });
        finalizar();
      });
    } catch (err) {
      completados++;
      errores.push("Error inesperado: " + err.message);
      finalizar();
    }
  });
}

function sendUploadSummary(event, errores) {
  console.log("Subida finalizada. Errores:", errores);

  if (errores.length === 0) {
    event.sender.send("firma-resultado", {
      success: true,
      output: '{"mensaje":"Todos los archivos se subieron correctamente."}',
      exitCode: 0,
      firmados,
      subidos: [],
    });
  } else {
    event.sender.send("firma-resultado", {
      success: false,
      output: '{"mensaje":"Algunos archivos no se subieron correctamente."}',
      exitCode: 1,
      firmados,
      subidos,
    });
  }
}

async function getConfs() {
  let confs = null;
  try {
    if (!mainWindow.webContents.isLoading()) {
      confs = await mainWindow.webContents.executeJavaScript(
        `localStorage.getItem('conf') ? JSON.parse(localStorage.getItem('conf')) : null`
      );
    } else {
      await new Promise((resolve) => mainWindow.webContents.once("did-finish-load", resolve));
      confs = await mainWindow.webContents.executeJavaScript(
        `localStorage.getItem('conf') ? JSON.parse(localStorage.getItem('conf')) : null`
      );
    }
  } catch (error) {
    console.error("Error al obtener configuraciones:", error);
    return event.sender.send("firma-resultado", {
      success: false,
      output: error.message,
      exitCode: 1,
      firmados: [],
      subidos: [],
    });
  }
  return confs;
}

// --- FIRMAR PDFs ---
ipcMain.on("firmar-pdfs", async (event, { pdfs, password, useWindowsStore, config }) => {
  
  console.log("Entrando para la firma: " + JSON.stringify(pdfs));
  
  // Usar configuración del perfil seleccionado o recuperar del localStorage
  let confs = config;
  if (!confs) {
    confs = await getConfs();
  }
  if (!confs) return;

  // Construir objeto posición
  let posicion = {
    pagina: confs.pagina === "pp" ? "primera" : confs.pagina === "up" ? "ultima" : confs.numeroPagina,
  };

  const posiciones = {
    ci: "centro-inferior",
    cs: "centro-superior",
    esi: "esquina-superior-izquierda",
    esd: "esquina-superior-derecha",
    eii: "esquina-inferior-izquierda",
    eid: "esquina-inferior-derecha",
  };
  if (confs.posicion && posiciones[confs.posicion]) posicion.lugar = posiciones[confs.posicion];

  if (confs.ms) posicion.mt = confs.ms;
  if (confs.mi) posicion.mb = confs.mb;
  if (confs.ml) posicion.ml = confs.ml;
  if (confs.mr) posicion.mr = confs.mr;
  if (confs.largo) posicion.ancho = confs.largo;
  if (confs.alto) posicion.alto = confs.alto;

  // Si la firma personalizada es distinta de default, la usamos
  if (fs.statSync(firmaPath).size !== fs.statSync(path.join(__dirname, "default.png")).size) {
    posicion.imagen = firmaPath;
  }

  const dir = confs.directorio;
  
  // Validar que el directorio existe
  if (!dir || dir.trim() === '') {
    console.error('Error: El directorio de destino está vacío');
    event.sender.send("firma-resultado", {
      success: false,
      output: JSON.stringify({
        tipo: "ERROR",
        mensaje: "El directorio de destino no está configurado. Por favor, configúrelo en la pestaña Configuración."
      })
    });
    return;
  }
  
  console.log('Directorio de destino:', dir);
  
  // Asegurar que el directorio existe
  if (!fs.existsSync(dir)) {
    console.log('Creando directorio de destino:', dir);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error('Error al crear directorio de destino:', error);
      event.sender.send("firma-resultado", {
        success: false,
        output: JSON.stringify({
          tipo: "ERROR",
          mensaje: `No se pudo crear el directorio de destino: ${error.message}`
        })
      });
      return;
    }
  }
  
  const ssl = confs.inseguro || false;
  const manual = confs.manual || false;
  const proxy = confs.proxy || null;
  const javaExec = path.join(".", "resources", "jdk", "bin", "java");
  const javaPath = fs.existsSync(javaExec) ? javaExec : "java";
  const jarPath = path.resolve(__dirname, "../target/bic-jar-with-dependencies.jar");

  try {
    // Descargar PDFs
    const rutasLocales = [];
    const cacheDir = path.join(bicHome, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    console.log('Procesando', pdfs.length, 'archivos');
    
    for (const pdf of pdfs) {
      console.log('Procesando archivo:', pdf.nombre, 'URL:', pdf.url);
      
      if(pdf.url?.startsWith('file://')){ // Cuando los archivos a firmar son locales
        const localFile = url.fileURLToPath(pdf.url);
        if(localFile.startsWith('\\\\c\\'))
          rutasLocales.push(localFile.replace('\\\\c\\','C:\\'));  
        else 
          rutasLocales.push(localFile);
        console.log('Archivo local:', rutasLocales[rutasLocales.length - 1]);
      }else{ // Cuando hay que descargar los archivos a firmar
        const destino = path.join(cacheDir, pdf.nombre);
        pdf.local = path.join(dir, pdf.nombre);
        console.log('Descargando a:', destino);
        event.sender.send("firma-progreso", `Descargando ${pdf.nombre}...`);
        await descargarArchivo(pdf, destino, ssl, proxy);
        rutasLocales.push(destino);
        console.log('Descarga completada:', destino);
      }
    }

    console.log('Rutas locales para firmar:', rutasLocales);
    console.log('Directorio de destino:', dir);

    // Ejecutar proceso Java
    event.sender.send("firma-progreso", "Firmando...");
    const args = [
      "-jar",
      jarPath,
      `--quiet=true`,
      `--pin=${password}`,
      `--archivos=${rutasLocales.join(",")}`,
      `--destino=${dir}`,
      `--posicion=${JSON.stringify(posicion)}`,
    ];
    
    console.log('Argumentos de Java:', args);
    
    // Agregar parámetro de certificado de Windows si está marcado
    if (useWindowsStore) {
      args.push(`--use-windows-store=true`);
    }
   
    const javaProcess = spawn(javaPath, args, { stdio: ["pipe", "pipe", "pipe"] });

    let ultimoMensaje = "";

    javaProcess.stdout.on("data", (data) => {
      ultimoMensaje = data.toString().trim();
      event.sender.send("java-output", { type: "stdout", data: ultimoMensaje });
    });

    javaProcess.stderr.on("data", (data) => {
      ultimoMensaje = data.toString().trim();
      event.sender.send("java-output", { type: "stderr", data: ultimoMensaje });
    });

    javaProcess.on("close", (code) => {
      // Limpiar cache
      try {
        fs.readdirSync(cacheDir).forEach((f) => fs.unlinkSync(path.join(cacheDir, f)));
      } catch (cleanupError) {
        console.error("Error limpiando cache:", cleanupError);
      }
      
      if(code === 1){
        const errMsg = ultimoMensaje.replace('ERROR:','');
        event.sender.send("firma-resultado", {
          success: false,
          output: errMsg,
          exitCode: 1,
          firmados: [],
          subidos: [],
        });

      }else{

        firmados = code === 0 ? pdfs.map((p) => p.id) : [];
        const msg = ultimoMensaje.replace('INFO:','').replace('WARN:','').replace('Listo!','');

        if (code === 0) {
          
          if (manual || local) {
            event.sender.send("firma-resultado", {
              success: true,
              output: msg,
              exitCode: 0,
              firmados,
              subidos: [],
            });
          } else {
            uploadFiles(pdfs, ssl, confs.proxy, event);
          }
        } else {
          event.sender.send("firma-resultado", {
            success: false,
            output: msg,
            exitCode: code,
            firmados: [],
            subidos: [],
          });
        }

      }

    });

    javaProcess.on("error", (error) => {
      
      event.sender.send("firma-resultado", {
        success: false,
        output: JSON.stringify(errMsg),
        exitCode: 1,
        firmados: [],
        subidos: [],
      });
    });
  } catch (err) {
    
    const errMsg = {"mensaje": err.message};
    event.sender.send("firma-resultado", {
      success: false,
      output: JSON.stringify(errMsg),
      exitCode: 1,
      firmados: [],
      subidos: [],
    });
  }
});
