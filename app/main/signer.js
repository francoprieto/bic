'use strict';

/**
 * Módulo de firma: orquesta la descarga de PDFs, invocación del JAR y upload.
 * Toda la comunicación con Java pasa por este módulo.
 */

const { spawn }  = require('child_process');
const path       = require('path');
const os         = require('os');
const fs         = require('fs');
const https      = require('https');
const http       = require('http');
const FormData   = require('form-data');
const { v4: uuidv4 } = require('uuid');

const JAR_NAME = 'bic-core-jar-with-dependencies.jar';

// ─── Ruta al JAR ─────────────────────────────────────────────────────────────
function getJarPath() {
  // En producción (empaquetado), el JAR está en extraResources/target/
  if (process.resourcesPath) {
    const packed = path.join(process.resourcesPath, 'target', JAR_NAME);
    if (fs.existsSync(packed)) return packed;
  }

  // En desarrollo, buscar en el directorio raíz del proyecto
  const dev = path.join(__dirname, '..', '..', 'core', 'target', JAR_NAME);
  if (fs.existsSync(dev)) return dev;

  throw new Error(`JAR no encontrado. Ejecute: mvn package en core/`);
}

// ─── Ruta a Java ─────────────────────────────────────────────────────────────
function getJavaCmd() {
  // JRE empaquetado (fat build)
  if (process.resourcesPath) {
    const bundled = path.join(process.resourcesPath, 'jdk', 'bin', 'java');
    if (fs.existsSync(bundled))          return bundled;
    if (fs.existsSync(bundled + '.exe')) return bundled + '.exe';
  }

  // En macOS, detectar Java 17 via java_home
  if (process.platform === 'darwin') {
    try {
      const { execSync } = require('child_process');
      const j17 = execSync('/usr/libexec/java_home -v 17 2>/dev/null').toString().trim();
      if (j17) return path.join(j17, 'bin', 'java');
    } catch (_) {}
  }

  // JAVA_HOME del entorno
  if (process.env.JAVA_HOME) return path.join(process.env.JAVA_HOME, 'bin', 'java');

  return 'java';
}

// ─── Ejecutar JAR ─────────────────────────────────────────────────────────────
function runJar(args) {
  return new Promise((resolve, reject) => {
    const jar  = getJarPath();
    const java = getJavaCmd();
    const proc = spawn(java, ['-jar', jar, ...args]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d.toString(); });
    proc.stderr.on('data', d => { stderr += d.toString(); });

    proc.on('close', code => {
      // Buscar la línea RESULT: en stdout
      const resultLine = stdout.split('\n').find(l => l.startsWith('RESULT:'));
      if (resultLine) {
        try {
          resolve(JSON.parse(resultLine.replace('RESULT:', '')));
          return;
        } catch (_) {}
      }
      if (code === 0) {
        resolve({ tipo: 'ok', mensaje: 'Completado' });
      } else {
        reject(new Error(stderr || `Proceso terminó con código ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

// ─── Listar certificados ──────────────────────────────────────────────────────
async function listCerts(params) {
  const args = ['--cmd=listar-certs'];
  if (params.certSource) args.push(`--cert-source=${params.certSource}`);
  if (params.pin)        args.push(`--pin=${params.pin}`);
  if (params.certFile)   args.push(`--cert-file=${params.certFile}`);

  try {
    return await runJar(args);
  } catch (e) {
    return { tipo: 'error', mensaje: e.message };
  }
}

// ─── Firmar ───────────────────────────────────────────────────────────────────
async function sign(payload, mainWindow) {
  const { files, pin, certSource, certAlias, certFile, config } = payload;

  const send = (channel, data) => mainWindow?.webContents.send(channel, data);

  try {
    // 0. Limpiar caché antes de firmar
    const cacheDir = path.join(os.homedir(), '.bic', 'cache');
    if (fs.existsSync(cacheDir)) {
      for (const file of fs.readdirSync(cacheDir)) {
        try { fs.unlinkSync(path.join(cacheDir, file)); } catch (_) {}
      }
    }

    // 1. Descargar archivos remotos a caché
    send('sign-progress', 'Descargando archivos...');
    const localFiles = await downloadFiles(files);

    // 2. Construir argumentos para el JAR
    const destDir   = config.directorio || path.join(os.homedir(), '.bic', 'firmados');
    fs.mkdirSync(destDir, { recursive: true });

    const posicion = buildPosicion(config);
    const args = [
      '--cmd=firmar',
      `--archivos=${localFiles.join(',')}`,
      `--destino=${destDir}`,
      `--posicion=${JSON.stringify(posicion)}`,
      `--cert-source=${certSource || 'pkcs11'}`,
      '--quiet=true',
    ];
    if (pin)       args.push(`--pin=${pin}`);
    if (certAlias) args.push(`--cert-alias=${certAlias}`);
    if (certFile)  args.push(`--cert-file=${certFile}`);

    // 3. Ejecutar firma
    send('sign-progress', 'Firmando...');
    const result = await runJar(args);

    if (result.tipo === 'error') {
      send('sign-result', { success: false, message: result.mensaje });
      return;
    }

    // 4. Upload callback (si aplica)
    const firmadosDir = destDir;
    const firmados = localFiles.map(f => path.join(firmadosDir, path.basename(f)));
    const subidos  = [];

    const filesToUpload = files.filter(f => f.callback);
    if (filesToUpload.length > 0) {
      send('sign-progress', 'Subiendo archivos firmados...');
      for (const fileInfo of filesToUpload) {
        const localSigned = path.join(firmadosDir, fileInfo.nombre);
        if (!fs.existsSync(localSigned)) continue;
        try {
          await uploadFile(localSigned, fileInfo);
          subidos.push(fileInfo.id);
        } catch (e) {
          console.error('Error al subir', fileInfo.nombre, e.message);
        }
      }
    }

    send('sign-result', {
      success:  true,
      message:  result.mensaje,
      firmados: firmados.map(f => path.basename(f)),
      firmadosDir: destDir,
      firmadosPaths: firmados,
      subidos,
    });

  } catch (err) {
    console.error('Error en sign():', err);
    send('sign-result', { success: false, message: err.message });
  }
}

// ─── Descargar archivos a caché ───────────────────────────────────────────────
async function downloadFiles(files) {
  const cacheDir = path.join(os.homedir(), '.bic', 'cache');
  fs.mkdirSync(cacheDir, { recursive: true });

  const localPaths = [];
  for (const f of files) {
    if (f.local) {
      localPaths.push(f.local);
      continue;
    }
    const dest = path.join(cacheDir, f.nombre || `${uuidv4()}.pdf`);
    await downloadOne(f.url, f.urlHeaders || {}, dest);
    localPaths.push(dest);
  }
  return localPaths;
}

function downloadOne(url, headers, dest) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(url);
    const protocol = url.startsWith('https') ? https : http;
    if (url.startsWith('https')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const options = {
      hostname: parsed.hostname,
      port:     parsed.port || (url.startsWith('https') ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      headers,
    };

    const req = protocol.get(options, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} al descargar ${url}`));
      const out = fs.createWriteStream(dest);
      res.pipe(out);
      out.on('finish', () => { out.close(); resolve(dest); });
      out.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

// ─── Upload callback ──────────────────────────────────────────────────────────
function uploadFile(localPath, fileInfo) {
  return new Promise((resolve, reject) => {
    const form = new FormData();

    // Parámetros del body
    if (fileInfo.callbackBody) {
      for (const [k, v] of Object.entries(fileInfo.callbackBody)) {
        form.append(k, String(v));
      }
    }

    // El archivo firmado
    const atributo = fileInfo.callbackAtributo || 'file';
    form.append(atributo, fs.createReadStream(localPath), path.basename(localPath));

    const headers = { ...form.getHeaders(), ...(fileInfo.callbackHeaders || {}) };
    const parsed  = new URL(fileInfo.callback);
    const protocol = fileInfo.callback.startsWith('https') ? https : http;

    const options = {
      method:   fileInfo.callbackMethod || 'POST',
      hostname: parsed.hostname,
      port:     parsed.port || (fileInfo.callback.startsWith('https') ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      headers,
    };

    const req = protocol.request(options, res => {
      res.resume();
      if (res.statusCode >= 200 && res.statusCode < 300) resolve();
      else reject(new Error(`HTTP ${res.statusCode}`));
    });
    req.on('error', reject);
    form.pipe(req);
  });
}

// ─── Construir objeto posicion para el JAR ────────────────────────────────────
function buildPosicion(config) {
  const pos = {
    pagina: config.pagina === 'np' ? (config.numeroPagina || '1') : config.pagina === 'up' ? 'ultima' : 'primera',
    lugar:  config.posicion || 'centro-inferior',
  };
  if (config.alto)  pos.alto  = config.alto;
  if (config.ancho) pos.ancho = config.ancho;
  if (config.mt)    pos.mt    = config.mt;
  if (config.mb)    pos.mb    = config.mb;
  if (config.ml)    pos.ml    = config.ml;
  if (config.mr)    pos.mr    = config.mr;
  if (config.imagenPath) pos.imagen = config.imagenPath;
  return pos;
}

module.exports = { listCerts, sign };
