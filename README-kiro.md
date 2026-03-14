# BIC v2 — Arquitectura rediseñada

## Estructura

```
bic/
├── core/          # Componente Java (firma digital)
│   ├── pom.xml
│   └── src/
└── app/           # Componente Electron (UI + orquestación)
    ├── package.json
    ├── main/
    │   ├── index.js      # Entry point, IPC handlers
    │   ├── protocol.js   # Manejo de bic://
    │   ├── signer.js     # Invocación del JAR + upload
    │   ├── store.js      # Configuración persistente (~/.bic/app-config.json)
    │   └── logger.js     # Logging a archivo
    ├── renderer/
    │   ├── index.html
    │   ├── preload.js
    │   └── app.js
    └── scripts/
        └── build.js      # Build script (Maven + electron-builder)
```

## Cambios principales respecto a v1

| Aspecto | v1 | v2 |
|---------|----|----|
| Java UI | JOptionPane, JFileChooser en el JAR | Sin Swing. Electron maneja toda la UI |
| Selección de certificado | Diálogo Swing | Electron lista certs (`--cmd=listar-certs`) y el usuario elige |
| main.js | 1100 líneas monolíticas | Dividido en `protocol.js`, `signer.js`, `store.js`, `logger.js` |
| Configuración | localStorage (renderer) | `~/.bic/app-config.json` (accesible desde main y renderer) |
| Perfiles | localStorage | Mismo archivo JSON, gestionado desde main process |
| Build | JAVA_HOME hardcodeado | Detección automática via `/usr/libexec/java_home` |
| Protocolo JAR | `--cmd` implícito | `--cmd=init \| listar-certs \| firmar` explícito |
| Resultado JAR | stdout mezclado | Línea `RESULT:{json}` siempre presente |

## Comandos del JAR

```bash
# Inicializar (detectar librerías PKCS11)
java -jar bic-core.jar --cmd=init

# Listar certificados disponibles
java -jar bic-core.jar --cmd=listar-certs --cert-source=pkcs11 --pin=1234
java -jar bic-core.jar --cmd=listar-certs --cert-source=windows-store
java -jar bic-core.jar --cmd=listar-certs --cert-source=pkcs12 --cert-file=/ruta/cert.p12 --pin=pass

# Firmar
java -jar bic-core.jar --cmd=firmar \
  --archivos=/tmp/doc.pdf \
  --pin=1234 \
  --cert-source=pkcs11 \
  --posicion='{"pagina":"primera","lugar":"centro-inferior"}' \
  --destino=/tmp/firmados
```

## Desarrollo

```bash
# Compilar JAR
cd core && mvn clean package -DskipTests

# Instalar dependencias Electron
cd app && npm install

# Ejecutar en modo desarrollo
cd app && npm start

# Build para macOS ARM64
cd app && npm run build:mac-arm
```

## Protocolo bic://

```
bic://firmar?files=http://servidor/doc.pdf,http://servidor/doc2.pdf
bic://?paramsurl=BASE64_JSON
bic://?gzipurl=BASE64_GZIP_JSON
```

El JSON decodificado tiene la forma:
```json
{ "uri": "http://servidor/archivos.json", "headers": { "Authorization": "Bearer TOKEN" } }
```
