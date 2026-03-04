# BIC Electron - Firmador de PDFs

## ¿Qué hace esta aplicación?

Permite recibir una lista de URLs de archivos PDF desde una web (usando un protocolo personalizado `bic://`), mostrar los archivos, permitir la selección, pedir el password del token y firmar los PDFs usando una aplicación Java.

---

## 1. Instalación y ejecución

1. Instala las dependencias:

```bash
npm install
npm install --save-dev electron
npm install --save-dev electron-builder
```

2. Ajusta la ruta del JAR en `main.js`:

Busca la línea:
```js
const jarPath = path.resolve(__dirname, '../target/tu-app-java.jar');
```
Cambia `tu-app-java.jar` por el nombre real de tu JAR.

3. Ejecuta la app en modo desarrollo:

```bash
npx electron .
```

---

## 2. Registrar el protocolo personalizado en Windows

Electron ya intenta registrar el protocolo `bic://` automáticamente, pero para asegurarte:

1. Abre una terminal como administrador y ejecuta:

```reg
REG ADD "HKCU\Software\Classes\bic" /ve /d "URL:BIC Protocol" /f
REG ADD "HKCU\Software\Classes\bic" /v "URL Protocol" /d "" /f
REG ADD "HKCU\Software\Classes\bic\shell\open\command" /ve /d "\"RUTA_COMPLETA_ELECTRON.EXE\" \"%1\"" /f
```

Reemplaza `RUTA_COMPLETA_ELECTRON.EXE` por la ruta al ejecutable de tu app Electron (o a `electron.exe` si usas desarrollo).

---

## 3. Llamar a la app desde una web

Desde una página web, puedes lanzar la app con:

```js
window.location.href = 'bic://firmar?files=https://servidor.com/archivo1.pdf,https://servidor.com/archivo2.pdf';
```

Esto abrirá la app Electron y mostrará la lista de archivos para firmar.

---

## 4. Sistema de Logging

La aplicación registra automáticamente todos los mensajes de consola en archivos de log ubicados en:

**Ubicación de logs:**
- Windows: `C:\Users\[usuario]\.bic\logs\`
- macOS/Linux: `~/.bic/logs/`

**Formato de archivos:**
- Nombre: `bic-YYYY-MM-DD.log` (un archivo por día)
- Ejemplo: `bic-2026-03-03.log`

**Niveles de log:**
- `INFO`: Información general (console.log, console.info)
- `WARN`: Advertencias (console.warn)
- `ERROR`: Errores (console.error)
- `DEBUG`: Información de depuración (console.debug)

**Formato de entrada:**
```
[2026-03-03T10:30:45.123Z] [INFO] Mensaje de log
[2026-03-03T10:30:46.456Z] [ERROR] Error detectado: descripción del error
```

**Características:**
- Los logs se escriben tanto en archivo como en consola
- Se capturan errores no manejados (uncaughtException, unhandledRejection)
- Los objetos se serializan automáticamente a JSON
- Cada inicio de aplicación registra información del sistema

**Ver logs:**
```bash
# Windows
type %USERPROFILE%\.bic\logs\bic-2026-03-03.log

# macOS/Linux
cat ~/.bic/logs/bic-2026-03-03.log
```

---

## 5. Notas

- La app descarga los PDFs seleccionados a una carpeta temporal antes de firmar.
- El password y las rutas locales se pasan como argumentos a la app Java.
- El resultado de la firma se muestra en la interfaz.
- Los logs se mantienen indefinidamente, considera limpiarlos periódicamente.

---

¿Dudas o problemas? ¡Contacta al desarrollador! 

