'use strict';

/**
 * Manejo del protocolo personalizado bic://
 *
 * Formatos soportados:
 *   bic://firmar?files=URL1,URL2
 *   bic://?paramsurl=BASE64_JSON   (JSON: { uri, headers })
 *   bic://?gzipurl=BASE64_GZIP_JSON
 */

const https  = require('https');
const http   = require('http');
const path   = require('path');
const pako   = require('pako');
const { v4: uuidv4 } = require('uuid');

let pendingFiles = [];

function reset() {
  pendingFiles = [];
}

async function handle(rawUrl, getWindow) {
  // Aceptar tanto una ventana directa como una función que la resuelve
  const resolveWindow = typeof getWindow === 'function' ? getWindow : () => getWindow;
  process.stderr.write(`[PROTOCOL] handle() rawUrl: ${rawUrl}\n`);
  try {
    if (!rawUrl.startsWith('bic:')) return;

    const normalized = rawUrl.replace(/^bic:\/\//, 'http://bic/').replace(/^bic:\?/, 'http://bic/?');
    process.stderr.write(`[PROTOCOL] normalized: ${normalized}\n`);
    const urlObj = new URL(normalized);

    const filesParam  = urlObj.searchParams.get('files');
    const paramsParam = urlObj.searchParams.get('paramsurl') || urlObj.searchParams.get('gzipurl');
    process.stderr.write(`[PROTOCOL] filesParam=${filesParam} paramsParam=${paramsParam ? paramsParam.substring(0,20)+'...' : null}\n`);

    if (filesParam) {
      pendingFiles = parseSimpleFiles(filesParam);
    } else if (paramsParam) {
      const json = decodeParam(paramsParam);
      if (!json) return;
      const jsonParams = JSON.parse(json);
      pendingFiles = await fetchFileList(jsonParams);
    }

    process.stderr.write(`[PROTOCOL] pendingFiles.length=${pendingFiles.length}\n`);
    if (pendingFiles.length > 0) {
      sendToRenderer(resolveWindow(), pendingFiles);
    }
  } catch (err) {
    process.stderr.write(`[PROTOCOL] Error: ${err.stack || err.message}\n`);
    console.error('Error procesando protocolo bic://', err.message);
  }
}

function parseSimpleFiles(filesParam) {
  return filesParam.split(',')
    .map(u => u.trim())
    .filter(u => u.startsWith('http://') || u.startsWith('https://') || u.startsWith('file://'))
    .map(u => ({
      id:     uuidv4(),
      nombre: path.basename(u.split(/[?#]/)[0]),
      url:    u,
    }));
}

async function fetchFileList({ uri, headers = {} }) {
  return new Promise((resolve, reject) => {
    const parsed   = new URL(uri);
    const protocol = uri.startsWith('https') ? https : http;
    const options  = {
      hostname: parsed.hostname,
      port:     parsed.port || (uri.startsWith('https') ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      headers,
    };

    if (uri.startsWith('https')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    const req = protocol.get(options, res => {
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} al obtener lista de archivos`));
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const list = JSON.parse(Buffer.concat(chunks).toString());
          if (!Array.isArray(list)) throw new Error('Se esperaba un array JSON');
          resolve(list);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function decodeParam(param) {
  // Normalizar Base64: URL-safe (-_) → estándar (+/)
  let b64 = param.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';

  // Intentar Base64 plano primero
  try {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    JSON.parse(decoded); // validar que sea JSON válido
    return decoded;
  } catch (_) {}

  // Intentar Base64 + gzip
  try {
    const bytes = Buffer.from(b64, 'base64');
    return pako.ungzip(bytes, { to: 'string' });
  } catch (e) {
    console.error('No se pudo decodificar paramsurl:', e.message);
    return null;
  }
}

function sendToRenderer(mainWindow, files) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    process.stderr.write(`[PROTOCOL] sendToRenderer: mainWindow destruida o null\n`);
    return;
  }
  const wc = mainWindow.webContents;
  if (!wc || wc.isDestroyed()) {
    process.stderr.write(`[PROTOCOL] sendToRenderer: webContents destruido\n`);
    return;
  }
  const isLoading = wc.isLoading();
  process.stderr.write(`[PROTOCOL] sendToRenderer: isLoading=${isLoading} files=${files.length}\n`);
  if (isLoading) {
    wc.once('did-finish-load', () => {
      if (!wc.isDestroyed()) {
        process.stderr.write(`[PROTOCOL] sendToRenderer: enviando set-files tras did-finish-load\n`);
        wc.send('set-files', files);
      }
    });
  } else {
    process.stderr.write(`[PROTOCOL] sendToRenderer: enviando set-files directo\n`);
    wc.send('set-files', files);
  }
}

module.exports = { handle, reset };
