# Servidor de Prueba BIC

Servidor HTTP simple para probar la funcionalidad de descarga y upload de archivos PDF firmados.

## Características

- Sirve archivos estáticos (HTML, JSON, PDF)
- Endpoint de upload con multipart/form-data
- CORS habilitado
- Logs detallados de todas las peticiones
- Guarda archivos subidos en `test/uploads/`

## Iniciar el servidor

### Windows
```bash
start-server.bat
```

### Linux/macOS
```bash
chmod +x start-server.sh
./start-server.sh
```

### Manualmente
```bash
cd test
node server.js
```

## Endpoints

### GET /test/index.html
Página de prueba con enlace `bic://` para iniciar la aplicación.

### GET /test/archivos.json
JSON con la lista de archivos para firmar. Incluye:
- URLs de descarga
- Headers de autenticación
- Callbacks de upload
- Metadata adicional

### GET /test/*.pdf
Archivos PDF de prueba:
- `A4-test-1.pdf`
- `oficio-test-2.pdf`
- `carta-test-3.pdf`

### POST /test/upload/:fileId
Endpoint para subir archivos firmados.

**Content-Type:** `multipart/form-data`

**Parámetros:**
- `:fileId` - ID del archivo (en la URL)
- Campo de archivo en el body (cualquier nombre)

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Archivo subido exitosamente",
  "fileId": "archivo01",
  "filename": "A4-test-1.pdf",
  "size": 12345,
  "path": "/path/to/uploads/A4-test-1.pdf"
}
```

**Respuesta de error:**
```json
{
  "success": false,
  "message": "Descripción del error"
}
```

## Estructura de archivos

```
test/
├── server.js              # Servidor Node.js
├── start-server.bat       # Script de inicio (Windows)
├── start-server.sh        # Script de inicio (Linux/macOS)
├── index.html             # Página de prueba
├── archivos.json          # Lista de archivos
├── A4-test-1.pdf          # PDF de prueba
├── oficio-test-2.pdf      # PDF de prueba
├── carta-test-3.pdf       # PDF de prueba
├── uploads/               # Directorio para archivos subidos (creado automáticamente)
└── README.md              # Este archivo
```

## Flujo de prueba

1. Iniciar el servidor: `node server.js`
2. Abrir en navegador: `http://localhost:3000/test/index.html`
3. Hacer clic en el botón "Firmar"
4. La aplicación BIC se abrirá con los archivos listados
5. Firmar los archivos
6. Los archivos firmados se subirán automáticamente a `/test/upload/:fileId`
7. Ver archivos subidos en `test/uploads/`

## Logs

El servidor muestra logs detallados de todas las operaciones:

```
[2026-03-03T18:00:00.000Z] GET /test/archivos.json
  → Sirviendo archivo: /path/to/test/archivos.json

[2026-03-03T18:00:01.000Z] GET /test/A4-test-1.pdf
  → Sirviendo archivo: /path/to/test/A4-test-1.pdf

[2026-03-03T18:00:05.000Z] POST /test/upload/archivo01
  → Upload solicitado para ID: archivo01
  → Partes recibidas: 2
  → Archivo guardado: /path/to/test/uploads/A4-test-1.pdf (12345 bytes)
```

## Requisitos

- Node.js (cualquier versión reciente)
- No requiere dependencias adicionales (usa módulos nativos de Node.js)

## Notas

- El servidor corre en el puerto 3000 por defecto
- Los archivos subidos se guardan en `test/uploads/`
- El servidor soporta CORS para permitir peticiones desde cualquier origen
- Presiona `Ctrl+C` para detener el servidor
