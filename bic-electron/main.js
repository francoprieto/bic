const { app, protocol, BrowserWindow, ipcMain, dialog } = require("electron");


const fs = require("fs");
const https = require("https");
const http = require("http");
const FormData = require("form-data");
const os = require("os");
const path = require("path");
const pako = require("pako");

const { execFile, spawn } = require("child_process");
const { exitCode } = require("process");

const firmaPath = path.join(__dirname, "firma.png");

let mainWindow;
let pdfUrls = [];
let firmados = [];
let subidos = [];
let bicHome;
let firmaSimple = true;

// Registrar protocolo personalizado
app.setAsDefaultProtocolClient("bic");

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

  bicHome = os.homedir + path.sep + ".bic" + path.sep;
  mainWindow.loadFile("index.html");
}

// Variable global para almacenar el contenido del PDF en memoria
let pdfBuffer = null;

// Nueva función para leer archivo remoto en variable
function leerArchivoRemotoEnVariable(jsonParams, mainWindow, dialog) {
  const url = jsonParams.uri;
  const headers = jsonParams.headers || {};

  return new Promise((resolve, reject) => {
    let protocolo;

    let opt = { medhod: "GET" };

    const uri = new URL(url);
    opt["hostname"] = uri.hostname;
    opt["port"] = uri.port;
    opt["path"] = uri.pathname + uri.search;
    opt["headers"] = headers;

    if (url.startsWith("https")) {
      protocolo = https;
      process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;
    } else {
      protocolo = http;
    }
    console.log("request", opt);
    let data = [];
    protocolo
      .get(opt, (response) => {
        if (response.statusCode !== 200) {
          dialog.showErrorBox(
            "Error",
            "Error al leer los parámetros: " + response.statusCode
          );
          return;
        }
        response.on("data", (chunk) => {
          data.push(chunk);
        });
        response.on("end", () => {
          resolve(Buffer.concat(data));
          const parms = JSON.parse(data);
          parms.forEach((element) => {
            pdfUrls.push(element);
          });
        });
      })
      .on("error", (err) => {
        dialog.showErrorBox(
          "Error",
          "Error al leer los parametros: " + err.message
        );
      });
  });
}

function leerArchivoSimple(filesParam, mainWindow, dialog) {
  const lista = filesParam.split(",");
  lista.forEach((element) => {
    const cleanUrl = element.split(/[?#]/)[0];
    pdfUrls.push({
      nombre: cleanUrl.substring(cleanUrl.lastIndexOf("/") + 1),
      url: element,
    });
  });
  if (mainWindow) {
    mainWindow.webContents.send("set-pdf-urls", pdfUrls);
  }
}

// Manejar apertura con protocolo personalizado
app.on("open-url", (event, url) => {
  event.preventDefault();
  // Extraer parámetros de la URL
  const urlObj = new URL(url);

  if (urlObj.protocol === "bic:") {
    const filesParam = urlObj.searchParams.get("files");
    if (filesParam) {
      leerArchivoSimple(filesParam, mainWindow, dialog);
    } else {
      let paramsurl = urlObj.searchParams.get("gzipurl");
      let val = '';
      if (paramsurl) {
        let b64 = paramsurl.replace(/-/g, '+').replace(/_/g, '/');;
        while (b64.length % 4) b64 += '=';
        const bytes = Buffer.from(b64, 'base64');     // Buffer (Uint8Array)
        val = pako.ungzip(bytes, { to: 'string' });
      }else{
        paramsurl = urlObj.searchParams.get("paramsurl");
        if(paramsurl) val = paramsurl;
      }

      if (paramsurl) {
        let b64 = paramsurl.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) b64 += '=';
        const bytes = Buffer.from(b64, 'base64');     // Buffer (Uint8Array)
        val = pako.ungzip(bytes, { to: 'string' });
        if (val) {
          const jsonParams = JSON.parse(val);
          leerArchivoRemotoEnVariable(jsonParams, mainWindow, dialog);
        }
      }
    }
  }
});

app.whenReady().then(() => {
  createWindow();
  // Si la app se abre con argumentos (por ejemplo, desde protocolo personalizado)
  if (process.argv.length > 1) {
    const arg = process.argv.find((a) => a.startsWith("bic://"));
    if (arg) {
      const urlObj = new URL(arg);
      const filesParam = urlObj.searchParams.get("files");
      if (filesParam) {
        leerArchivoSimple(filesParam, mainWindow, dialog);
        if (pdfUrls.length > 0 && mainWindow) {
          mainWindow.webContents.on("did-finish-load", () => {
            mainWindow.webContents.send("set-pdf-urls", pdfUrls);
          });
        }
      } else {
        let paramsurl = urlObj.searchParams.get("gzipurl");
        let val = '';
        if (paramsurl) {
          let b64 = paramsurl.replace(/-/g, '+').replace(/_/g, '/');;
          while (b64.length % 4) b64 += '=';
          const bytes = Buffer.from(b64, 'base64');     // Buffer (Uint8Array)
          val = pako.ungzip(bytes, { to: 'string' });
        }else{
          paramsurl = urlObj.searchParams.get("paramsurl");
          if(paramsurl) val = paramsurl;
        }
        
        if (val) {
          const jsonParams = JSON.parse(val);
          leerArchivoRemotoEnVariable(jsonParams, mainWindow, dialog).then(
            () => {
              if (pdfUrls.length > 0 && mainWindow) {
                mainWindow.webContents.on("did-finish-load", () => {
                  mainWindow.webContents.send("set-pdf-urls", pdfUrls);
                });
              }
            }
          );
        }

      }
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Función para descargar un archivo
function descargarArchivo(pdf, destino, ssl) {
  const url = pdf.url;
  let opt = { medhod: "GET" };

  if (pdf.headers) opt["headers"] = pdf.headers;

  return new Promise((resolve, reject) => {
    let protocolo;

    const uri = new URL(url);
    opt["hostname"] = uri.hostname;
    opt["port"] = uri.port;
    opt["path"] = uri.pathname + uri.search;

    if (url.startsWith("https")) {
      protocolo = https;
      process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = ssl ? 0 : 1;
    } else {
      protocolo = http;
    }

    const file = fs.createWriteStream(destino);
    protocolo
      .get(opt, (response) => {
        if (response.statusCode !== 200) {
          dialog.showErrorBox(
            "Error",
            "Error al descargar: " + response.statusCode
          );
          return;
        }
        response.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve(destino));
        });
      })
      .on("error", (err) => {
        dialog.showErrorBox("Error", "Error al descargar: " + url + "\n" + err);
        fs.unlink(destino, () => reject(err));
      });
  });
}

// Obtener el directorio home del usuario
ipcMain.handle("get-home-dir", () => {
  return os.homedir();
});

// Obtener las configuraciones del localStorage
ipcMain.handle("get-confs", async () => {
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
  const targetPath = path.join(__dirname, "firma.png");
  const sourcePath = path.join(__dirname, "default.png");
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
});

function uploadFiles(pdfs, ssl, event){
  subidos = [];
  event.sender.send('firma-progreso','Subiendo...');

  let errores = [];
  let completados = 0;
  const cant = pdfs.length;

  pdfs.forEach((pdf) => {
  
    if (pdf.callback) {

      const form = new FormData();
      console.log("PDF----> " + pdf.callbackHeaders);
      const url = pdf.callback;
      const method = pdf.callbackMethod || "POST";
      const headers = JSON.parse(pdf.callbackHeaders ? pdf.callbackHeaders : "{}");
      const atributo = pdf.callbackAtributo || "file";
      let encontrado = true;

      // Leer el archivo firmado
      const filePath = path.join(
        pdf.local ? pdf.local : path.join(bicHome, "cache", pdf.nombre)
      );

      if (!fs.existsSync(filePath)) {
        errores.push("Archivo no encontrado para subir: " + filePath);
        event.sender.send("java-output", { type: "stderr", data: "Archivo no encontrado para subir: " + filePath });
        subidos.push({id: pdf.id, subido: false, msg: "Archivo no encontrado para subir: " + filePath});
        completados++;
        if (completados === cant) {
          sendUploadSummary(event, errores);
        }
        return;
      }

    
      // Agregar campos adicionales si existen en callbackBody
      const body = JSON.parse(pdf.callbackBody) || {};
      
      if (typeof body === "object" && body !== null) {
        for (const key in body) {
          if (key !== atributo) {
            const valBody = body[key];
            if (typeof valBody !== "object" && valBody !== null){
              console.log("Agregando el campo " + key + " al body, con valor:  " + valBody.toString());
              form.append(key, valBody.toString());
            }
          }
        }
      }
      
      form.append(atributo, fs.createReadStream(filePath));

      let opt = { method: method };
      let formHeaders = form.getHeaders();
      
      if(headers && typeof headers === "object") {
        for (const key in headers) {
          // Only set headers with valid types
          const value = headers[key];
          if (
            typeof value === "string" ||
            Buffer.isBuffer(value) ||
            value instanceof Uint8Array
          ) {
            formHeaders[key.toString()] = value;
            console.log("Agregando " + key + " : " + value + " a los headers");
          } else {
            console.warn("Header ignorado por tipo inválido:", key, value);
          }
        }
      }

      const uri = new URL(url);
      opt["hostname"] = uri.hostname;
      opt["port"] = uri.port;
      opt["path"] = uri.pathname + uri.search;
      opt["headers"] = formHeaders;

      console.log("upload opts", opt);

      let protocolo;
      if (url.startsWith("https")) {
        process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = ssl ? 0 : 1;
        protocolo = https;
      } else {
        protocolo = http;
      }

      console.log("Subiendo a", url, "con opciones", opt);

      const req = protocolo.request(opt, (res) => {
        let responseData = "";
        res.on("data", (chunk) => {
          responseData += chunk;
        });
        res.on("end", () => {
          completados++;

          if(res.statusCode > 200){
            errores.push(`No se pudo subir ${pdf.nombre}: (HTTP ${res.statusCode}) ${responseData}`);
            event.sender.send("java-output", { type: "stderr", data: `No se pudo subir ${pdf.nombre}: (HTTP ${res.statusCode}) ${responseData}` });
            subidos.push({id: pdf.id, subido: false, msg: `No se pudo subir ${pdf.nombre}: (HTTP ${res.statusCode}) ${responseData}`});
          }else if(res.statusCode === 200)
            subidos.push({id: pdf.id, subido: true, msg: ''});
          
          if (completados === cant) {
            sendUploadSummary(event, errores);
          }
        });
      });
      
      form.pipe(req);

      req.on("error", (err) => {
        completados++;
        errores.push('No se pudo subir: ' + err);
        event.sender.send("java-output", { type: "stderr", data: `No se pudo subir: ${err.toString()}` });
        subidos.push({id: pdf.id, subido: false, msg: `No se pudo subir: ${err.toString()}`});
        if (completados === cant) {
          sendUploadSummary(event, errores);
        }        
      });

    }else{
      completados++;
      if (completados === cant) {
        sendUploadSummary(event, errores);
      }      
    }

  });
 
}

function sendUploadSummary(event, errores) {
  console.log("Subida finalizada. Errores:", errores);

  let msg = {};
  if (errores.length === 0) {
    msg='{"mensaje":"Todos los archivos se subieron correctamente."}';
    event.sender.send("firma-resultado", {
      success: true,
      output: msg,
      exitCode: 0,
      firmados: firmados,
      subidos: []
    });
  } else {
    msg='{"mensaje":"Algunos archivos no se subieron correctamente."}';
    event.sender.send("firma-resultado", {
      success: false,
      output: msg,
      exitCode: 1,
      firmados: firmados,
      subidos: subidos
    });
  }
}

ipcMain.on("firmar-pdfs", async (event, { pdfs, password }) => {
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
    } else {
      console.log("Ventana aún cargando, esperando...");
      // Esperar a que termine de cargar
      await new Promise((resolve) => {
        mainWindow.webContents.once("did-finish-load", resolve);
      });
      confs = await mainWindow.webContents.executeJavaScript(`
        (() => {
          const confs = localStorage.getItem('conf');
          return confs ? JSON.parse(confs) : null;
        })()
      `);
      console.log("Configuraciones obtenidas después de cargar:", confs);
    }
  } catch (error) {
    console.error("Error al obtener configuraciones:", error);
  }

  let posicion = {};
  if (confs.pagina === "pp") posicion["pagina"] = "primera";
  else if (confs.pagina === "up") posicion["pagina"] = "ultima";
  else posicion["pagina"] = confs.numeroPagina;

  if (confs.posicion === "ci") posicion["lugar"] = "centro-inferior";
  else if (confs.posicion === "cs") posicion["lugar"] = "centro-superior";
  else if (confs.posicion === "esi")
    posicion["lugar"] = "esquina-superior-izquierda";
  else if (confs.posicion === "esd")
    posicion["lugar"] = "esquina-superior-derecha";
  else if (confs.posicion === "eii")
    posicion["lugar"] = "esquina-inferior-izquierda";
  else if (confs.posicion === "eid")
    posicion["lugar"] = "esquina-inferior-derecha";

  if (confs.ms) posicion["mt"] = confs.ms;
  if (confs.mi) posicion["mb"] = confs.mb;
  if (confs.ml) posicion["ml"] = confs.ml;
  if (confs.mr) posicion["mr"] = confs.mr;

  if (confs.largo) posicion["ancho"] = confs.largo;
  if (confs.alto) posicion["alto"] = confs.alto;

  const targetPath = path.join(__dirname, "firma.png");
  const sourcePath = path.join(__dirname, "default.png");
  const targetStat = fs.statSync(targetPath);
  const sourceStat = fs.statSync(sourcePath);

  if (targetStat.size !== sourceStat.size) posicion["imagen"] = targetPath;

  const dir = confs.directorio;
  const ssl = confs.inseguro ? confs.inseguro : false;
  const manual = confs.manual ? confs.manual : false;
  // Ejecutar la aplicación Java
  // Ajusta la ruta y los argumentos según tu app Java
  const javaExec = path.join(".", "resources", "jdk", "bin", "java");
  const javaPath = fs.existsSync(javaExec) ? javaExec : "java";
  const jarPath = path.resolve(
    __dirname,
    "../target/bic-jar-with-dependencies.jar"
  );

  console.log("JAVA_HOME", javaPath);

  try {
    // Descargar los PDFs seleccionados a una carpeta temporal
    const rutasLocales = [];

    if (!fs.existsSync(path.join(bicHome, "cache")))
      fs.mkdirSync(path.join(bicHome, "cache"), { recursive: true });

    for (const pdf of pdfs) {
      const nombre = pdf.nombre;
      const destino = path.join(bicHome, "cache", nombre);
      pdf["local"] = path.join(dir, nombre);
      event.sender.send("firma-progreso","Descargando...");
      await descargarArchivo(pdf, destino, ssl).then(() => {
        event.sender.send("java-output", { type: "stdout", data: 'Descargado: ' + pdf.url });
      });
      rutasLocales.push(destino);
    }

    event.sender.send("firma-progreso","Firmando...");

    const position = JSON.stringify(posicion).replaceAll('"', '"');
    // Ajusta el nombre del JAR
    const archivosParam = rutasLocales.join(",");

    const args = [
      "-jar",
      jarPath,
      `--quiet=true`,
      `--pin=${password}`,
      `--archivos=${archivosParam}`,
      `--destino=${dir}`,
      `--posicion=${position}`,
    ];

    // Usar spawn para mejor control del output en tiempo real
    const javaProcess = spawn(javaPath, args, {
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
    });

    let stdoutData = "";
    let stderrData = "";
    let ultimoMensaje = "";

    // Capturar stdout en tiempo real
    javaProcess.stdout.on("data", (data) => {
      const output = data.toString();
      if (output) ultimoMensaje = output.trim();
      stdoutData += output;
      console.log("Java stdout:", output);
      // Enviar output en tiempo real al renderer
      event.sender.send("java-output", { type: "stdout", data: output });
    });

    // Capturar stderr en tiempo real
    javaProcess.stderr.on("data", (data) => {
      const output = data.toString();
      if (output) ultimoMensaje = output.trim();
      stderrData += output;
      console.log("Java stderr:", output);
      // Enviar output en tiempo real al renderer
      event.sender.send("java-output", { type: "stderr", data: output });
    });

    // Manejar cuando el proceso termina
    javaProcess.on("close", (code) => {
      console.log(`Proceso Java terminado con codigo: ${code}`);

      // Limpiar archivos de cache después de la firma
      try {
        const cacheDir = path.join(bicHome, "cache");
        if (fs.existsSync(cacheDir)) {
          const files = fs.readdirSync(cacheDir);
          files.forEach((file) => {
            const filePath = path.join(cacheDir, file);
            if (fs.statSync(filePath).isFile()) {
              fs.unlinkSync(filePath);
              console.log(`Archivo eliminado de cache: ${file}`);
            }
          });
        }
      } catch (cleanupError) {
        console.error("Error al limpiar cache:", cleanupError);
      }
      const partesMensaje = ultimoMensaje.split("{");
      ultimoMensaje =
        partesMensaje.length > 1 ? partesMensaje[1].trim() : ultimoMensaje;
      ultimoMensaje = ultimoMensaje.startsWith("{")
        ? ultimoMensaje.trim()
        : "{" + ultimoMensaje.trim();
      
      firmados = [];

      if (code === 0) {
        
        pdfs.forEach((pdf) => {
          firmados.push(pdf.id);
        });        

        if(manual)
          event.sender.send("firma-resultado", {
            success: true,
            output: ultimoMensaje,
            exitCode: code,
            firmados: firmados,
            subidos: []
          });
        else if(!manual) 
          uploadFiles(pdfs, ssl, event);

      } else {
        event.sender.send("firma-resultado", {
          success: false,
          output: ultimoMensaje,
          exitCode: code,
          firmados: [],
          subidos: []
        });
      }
    });

    // Manejar errores del proceso
    javaProcess.on("error", (error) => {
      console.error("Error ejecutando Java:", error);
      event.sender.send("firma-resultado", {
        success: false,
        output: error.message,
        exitCode: 1,
        firmados: [],
        subidos: []
      });
    });
  } catch (err) {
    event.sender.send("firma-resultado", {
      success: false,
      output: err.message,
      exitCode: 1,
      firmados: [],
      subidos: []
    });
  }
});
