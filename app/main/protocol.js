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

async function handle(rawUrl, mainWindow) {
  const isDev = !process.resourcesPath || process.resourcesPath.includes('node_modules');
  if (isDev) process.stderr.write(`[PROTOCOL] handle() llamado con: ${rawUrl}\n`);
  try {
    if (!rawUrl.startsWith('bic:')) return;

    // new URL() no parsea bien protocolos custom como bic://firmar?files=...
    // porque trata "firmar" como hostname. Usamos http:// como proxy para parsear.
    const normalized = rawUrl.replace(/^bic:\/\//, 'http://bic/').replace(/^bic:\?/, 'http://bic/?');
    const urlObj = new URL(normalized);

    const filesParam  = urlObj.searchParams.get('files');
    const paramsParam = urlObj.searchParams.get('paramsurl') || urlObj.searchParams.get('gzipurl');

    if (filesParam) {
      pendingFiles = parseSimpleFiles(filesParam);
    } else if (paramsParam) {
      const json = decodeParam(paramsParam);
      if (!json) return;
      const jsonParams = JSON.parse(json);
      pendingFiles = await fetchFileList(jsonParams);
    }

    if (pendingFiles.length > 0) {
      if (isDev) process.stderr.write(`[PROTOCOL] Enviando ${pendingFiles.length} archivos al renderer\n`);
      sendToRenderer(mainWindow, pendingFiles);
    }
  } catch (err) {
    if (isDev) process.stderr.write(`[PROTOCOL] Error: ${err.message}\n`);
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
  if (!mainWindow) return;
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow.webContents.send('set-files', files);
    });
  } else {
    mainWindow.webContents.send('set-files', files);
  }
}

module.exports = { handle, reset };
