/**
 * Main process for Electron app
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
  try {
    let b64 = base64Str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
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
function leerArchivoRemotoEnVariable(jsonParams) {
  const url = jsonParams.uri;
  const headers = jsonParams.headers || {};
  const opt = {
    method: "GET",
    hostname: new URL(url).hostname,
    port: new URL(url).port,
    path: new URL(url).pathname + new URL(url).search,
    headers,
  };

  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith("https") ? https : http;
    if (url.startsWith("https")) process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

    let data = [];
    protocolo
      .get(opt, (response) => {
        if (response.statusCode !== 200) {
          dialog.showErrorBox("Error", "Error al leer parámetros: " + response.statusCode);
          return reject(new Error("HTTP " + response.statusCode));
        }

        response.on("data", (chunk) => data.push(chunk));
        response.on("end", () => {
          try {
            const rawData = Buffer.concat(data).toString();
            const params = JSON.parse(rawData);
            pdfUrls.push(...params);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
      })
      .on("error", (err) => {
        dialog.showErrorBox("Error", "Error al leer los parametros: " + err.message);
        reject(err);
      });
  });
}

/**
 * Procesa lista de archivos enviada en la URL
 */
function leerArchivoSimple(filesParam) {
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
  event.preventDefault();
  const urlObj = new URL(url);

  if (urlObj.protocol !== "bic:") return;

  try {
    const filesParam = urlObj.searchParams.get("files");
    if (filesParam) {
      leerArchivoSimple(filesParam);
      return;
    }

    let paramsurl = urlObj.searchParams.get("gzipurl") || urlObj.searchParams.get("paramsurl");
    if (!paramsurl) return;

    const val = decodeAndUnzip(paramsurl) || paramsurl;
    if (val) {
      const jsonParams = JSON.parse(val);
      await leerArchivoRemotoEnVariable(jsonParams);
    }
  } catch (err) {
    console.error("Error procesando open-url:", err);
  }
});

// --- CUANDO APP ESTÁ LISTA ---
app.whenReady().then(() => {
  createWindow();

  // Manejo de parámetros iniciales (cuando app abre con bic://)
  const arg = process.argv.find((a) => a.startsWith("bic://"));
  if (!arg){
    local = true;
    mainWindow.webContents.on("did-finish-load", () => {
      mainWindow.webContents.send("archivos-locales", local);
    });    
    return;
  } 

  const urlObj = new URL(arg);
  const filesParam = urlObj.searchParams.get("files");

  if (filesParam) {
    leerArchivoSimple(filesParam);
    mainWindow.webContents.on("did-finish-load", () => {
      mainWindow.webContents.send("set-pdf-urls", pdfUrls);
    });
  } else {
    let paramsurl = urlObj.searchParams.get("gzipurl") || urlObj.searchParams.get("paramsurl");
    if (!paramsurl) return;

    const val = decodeAndUnzip(paramsurl) || paramsurl;
    if (val) {
      leerArchivoRemotoEnVariable(JSON.parse(val)).then(() => {
        if (pdfUrls.length > 0 && mainWindow) {
          mainWindow.webContents.on("did-finish-load", () => {
            mainWindow.webContents.send("set-pdf-urls", pdfUrls);
          });
        }
      });
    }
  }
});

// --- SALIR CUANDO TODAS LAS VENTANAS SE CIERREN ---
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --- DESCARGAR ARCHIVO ---
function descargarArchivo(pdf, destino, ssl) {
  const url = pdf.url;
  const opt = {
    method: "GET",
    hostname: new URL(url).hostname,
    port: new URL(url).port,
    path: new URL(url).pathname + new URL(url).search,
    headers: pdf.headers || {},
  };

  return new Promise((resolve, reject) => {
    const protocolo = url.startsWith("https") ? https : http;
    if (url.startsWith("https")) process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = ssl ? 0 : 1;

    const file = fs.createWriteStream(destino);
    protocolo
      .get(opt, (response) => {
        if (response.statusCode !== 200) {
          dialog.showErrorBox("Error", "Error al descargar: " + response.statusCode);
          return reject(new Error("HTTP " + response.statusCode));
        }
        response.pipe(file);
        file.on("finish", () => file.close(() => resolve(destino)));
      })
      .on("error", (err) => {
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
    console.log('archivo->', path);
    lista += path;
  }
  leerArchivoSimple(lista);
});

// --- SUBIR ARCHIVOS ---
function uploadFiles(pdfs, ssl, event) {
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
      const opt = {
        method,
        hostname: uri.hostname,
        port: uri.port,
        path: uri.pathname + uri.search,
        headers: formHeaders,
      };

      const protocolo = url.startsWith("https") ? https : http;
      if (url.startsWith("https")) process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = ssl ? 0 : 1;

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

// --- FIRMAR PDFs ---
ipcMain.on("firmar-pdfs", async (event, { pdfs, password }) => {
  // Recuperar configuraciones del localStorage
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
  const ssl = confs.inseguro || false;
  const manual = confs.manual || false;

  const javaExec = path.join(".", "resources", "jdk", "bin", "java");
  const javaPath = fs.existsSync(javaExec) ? javaExec : "java";
  const jarPath = path.resolve(__dirname, "../target/bic-jar-with-dependencies.jar");

  try {
    // Descargar PDFs
    const rutasLocales = [];
    const cacheDir = path.join(bicHome, "cache");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    for (const pdf of pdfs) {
      if(pdf.url?.startsWith('file://')){ // Cuando los archivos a firmar son locales
        const localFile = url.fileURLToPath(pdf.url);
        if(localFile.startsWith('\\\\c\\'))
          rutasLocales.push(localFile.replace('\\\\c\\','C:\\'));  
        else 
          rutasLocales.push(localFile);
      }else{ // Cuando hay que descargar los archivos a firmar
        const destino = path.join(cacheDir, pdf.nombre);
        pdf.local = path.join(dir, pdf.nombre);
        event.sender.send("firma-progreso", "Descargando...");
        await descargarArchivo(pdf, destino, ssl);
        rutasLocales.push(destino);
      }
    }

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
            uploadFiles(pdfs, ssl, event);
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
