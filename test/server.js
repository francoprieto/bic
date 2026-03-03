/**
 * Servidor de prueba para simular descarga y upload de archivos PDF
 * Puerto: 3100
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3100;
const TEST_DIR = __dirname;

// Crear directorio para archivos subidos si no existe
const UPLOAD_DIR = path.join(TEST_DIR, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Función para parsear multipart/form-data
function parseMultipartFormData(buffer, boundary) {
  const parts = [];
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  let start = 0;

  while (start < buffer.length) {
    const boundaryIndex = buffer.indexOf(boundaryBuffer, start);
    if (boundaryIndex === -1) break;

    const nextBoundaryIndex = buffer.indexOf(boundaryBuffer, boundaryIndex + boundaryBuffer.length);
    if (nextBoundaryIndex === -1) break;

    const partBuffer = buffer.slice(boundaryIndex + boundaryBuffer.length, nextBoundaryIndex);
    
    // Buscar el final de los headers (doble CRLF)
    const headerEndIndex = partBuffer.indexOf('\r\n\r\n');
    if (headerEndIndex === -1) {
      start = nextBoundaryIndex;
      continue;
    }

    const headersBuffer = partBuffer.slice(0, headerEndIndex);
    const headers = headersBuffer.toString('utf-8');
    
    // Extraer nombre del campo
    const nameMatch = headers.match(/name="([^"]+)"/);
    const filenameMatch = headers.match(/filename="([^"]+)"/);
    
    if (nameMatch) {
      const fieldName = nameMatch[1];
      const filename = filenameMatch ? filenameMatch[1] : null;
      
      // El contenido empieza después de \r\n\r\n y termina antes de \r\n
      const contentStart = headerEndIndex + 4;
      const contentEnd = partBuffer.length - 2; // Quitar \r\n final
      const content = partBuffer.slice(contentStart, contentEnd);
      
      parts.push({
        fieldName,
        filename,
        content: filename ? content : content.toString('utf-8')
      });
    }

    start = nextBoundaryIndex;
  }

  return parts;
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  console.log(`[${new Date().toISOString()}] ${req.method} ${pathname}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle OPTIONS (preflight)
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Servir archivos estáticos del directorio test
  if (req.method === 'GET' && pathname.startsWith('/test/')) {
    const filePath = path.join(TEST_DIR, pathname.replace('/test/', ''));
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        '.pdf': 'application/pdf',
        '.json': 'application/json',
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg'
      };

      const contentType = contentTypes[ext] || 'application/octet-stream';
      
      res.writeHead(200, { 'Content-Type': contentType });
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
      
      console.log(`  → Sirviendo archivo: ${filePath}`);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Archivo no encontrado');
      console.log(`  → Archivo no encontrado: ${filePath}`);
    }
    return;
  }

  // Endpoint de upload
  if (req.method === 'POST' && pathname.startsWith('/test/upload/')) {
    const fileId = pathname.split('/').pop();
    console.log(`  → Upload solicitado para ID: ${fileId}`);

    let body = [];
    
    req.on('data', chunk => {
      body.push(chunk);
    });

    req.on('end', () => {
      const buffer = Buffer.concat(body);
      
      // Obtener el boundary del Content-Type
      const contentType = req.headers['content-type'] || '';
      const boundaryMatch = contentType.match(/boundary=(.+)$/);
      
      if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const parts = parseMultipartFormData(buffer, boundary);
        
        console.log(`  → Partes recibidas: ${parts.length}`);
        
        // Buscar el archivo
        const filePart = parts.find(p => p.filename);
        
        if (filePart) {
          const uploadPath = path.join(UPLOAD_DIR, filePart.filename);
          fs.writeFileSync(uploadPath, filePart.content);
          
          console.log(`  → Archivo guardado: ${uploadPath} (${filePart.content.length} bytes)`);
          
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            message: 'Archivo subido exitosamente',
            fileId: fileId,
            filename: filePart.filename,
            size: filePart.content.length,
            path: uploadPath
          }));
        } else {
          console.log(`  → No se encontró archivo en la petición`);
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            message: 'No se encontró archivo en la petición'
          }));
        }
      } else {
        console.log(`  → Content-Type no es multipart/form-data`);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: false,
          message: 'Content-Type debe ser multipart/form-data'
        }));
      }
    });

    req.on('error', (err) => {
      console.error('  → Error en upload:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        success: false,
        message: 'Error al procesar upload: ' + err.message
      }));
    });
    
    return;
  }

  // Ruta raíz - mostrar información
  if (pathname === '/' || pathname === '/test' || pathname === '/test/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Servidor de Prueba BIC</title>
        <style>
          body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
          h1 { color: #333; }
          .endpoint { background: #f5f5f5; padding: 10px; margin: 10px 0; border-radius: 5px; }
          .method { display: inline-block; padding: 2px 8px; border-radius: 3px; font-weight: bold; }
          .get { background: #61affe; color: white; }
          .post { background: #49cc90; color: white; }
          code { background: #f0f0f0; padding: 2px 6px; border-radius: 3px; }
          .uploads { background: #e7f3ff; padding: 15px; margin: 20px 0; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>🔐 Servidor de Prueba BIC</h1>
        <p>Servidor corriendo en <strong>http://localhost:${PORT}</strong></p>
        
        <h2>Endpoints Disponibles:</h2>
        
        <div class="endpoint">
          <span class="method get">GET</span>
          <code>/test/index.html</code>
          <p>Página de prueba con enlace bic://</p>
        </div>
        
        <div class="endpoint">
          <span class="method get">GET</span>
          <code>/test/archivos.json</code>
          <p>JSON con lista de archivos para firmar</p>
        </div>
        
        <div class="endpoint">
          <span class="method get">GET</span>
          <code>/test/*.pdf</code>
          <p>Archivos PDF de prueba</p>
        </div>
        
        <div class="endpoint">
          <span class="method post">POST</span>
          <code>/test/upload/:fileId</code>
          <p>Endpoint para subir archivos firmados (multipart/form-data)</p>
        </div>
        
        <div class="uploads">
          <h3>📁 Archivos Subidos:</h3>
          <p>Los archivos subidos se guardan en: <code>${UPLOAD_DIR}</code></p>
          ${fs.existsSync(UPLOAD_DIR) ? 
            fs.readdirSync(UPLOAD_DIR).map(f => `<li>${f}</li>`).join('') || '<p>No hay archivos subidos aún</p>' 
            : '<p>Directorio de uploads no existe</p>'}
        </div>
        
        <h2>Pruebas:</h2>
        <ul>
          <li><a href="/test/index.html">Abrir página de prueba</a></li>
          <li><a href="/test/archivos.json">Ver archivos.json</a></li>
        </ul>
      </body>
      </html>
    `);
    return;
  }

  // 404 para otras rutas
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Ruta no encontrada');
});

server.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log(`🚀 Servidor de prueba BIC iniciado`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`📁 Directorio: ${TEST_DIR}`);
  console.log(`📤 Uploads: ${UPLOAD_DIR}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Endpoints disponibles:');
  console.log(`  GET  http://localhost:${PORT}/test/index.html`);
  console.log(`  GET  http://localhost:${PORT}/test/archivos.json`);
  console.log(`  GET  http://localhost:${PORT}/test/*.pdf`);
  console.log(`  POST http://localhost:${PORT}/test/upload/:fileId`);
  console.log('');
  console.log('Presiona Ctrl+C para detener el servidor');
  console.log('='.repeat(60));
});

// Manejo de cierre graceful
process.on('SIGINT', () => {
  console.log('\n\n🛑 Deteniendo servidor...');
  server.close(() => {
    console.log('✅ Servidor detenido');
    process.exit(0);
  });
});
