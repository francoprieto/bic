# Registro del Protocolo bic:// en Linux

Este documento explica cómo registrar y usar el protocolo personalizado `bic://` en Linux.

## Instalación Automática (Recomendado)

Si instalas la aplicación usando el paquete `.deb`, el protocolo se registra automáticamente:

```bash
sudo dpkg -i dist/bic-electron_1.0.0_amd64.deb
```

Después de la instalación, reinicia tu navegador.

## Instalación Manual

Si usas AppImage o instalaste manualmente, ejecuta el script de registro:

```bash
cd bic-electron
./register-protocol.sh
```

Este script:
1. Detecta la ubicación del ejecutable
2. Crea el archivo `.desktop` necesario
3. Registra el protocolo `bic://` en el sistema
4. Actualiza la base de datos de aplicaciones

## Verificar el Registro

Para verificar que el protocolo está registrado correctamente:

```bash
xdg-mime query default x-scheme-handler/bic
```

Debería mostrar: `bic-electron.desktop`

## Probar el Protocolo

### Desde la Terminal

```bash
xdg-open 'bic://test'
```

### Desde el Navegador

Abre el archivo `test-protocol.html` en tu navegador:

```bash
firefox test-protocol.html
# o
google-chrome test-protocol.html
```

Haz clic en cualquiera de los enlaces de prueba.

## Ejemplos de Uso

### Firmar un archivo local

```html
<a href="bic://?files=file:///home/usuario/documento.pdf">Firmar PDF</a>
```

### Firmar múltiples archivos

```html
<a href="bic://?files=file:///home/usuario/doc1.pdf,file:///home/usuario/doc2.pdf">
    Firmar Múltiples PDFs
</a>
```

### Firmar archivo remoto

```html
<a href="bic://?files=https://ejemplo.com/documento.pdf">Firmar PDF Remoto</a>
```

### Con parámetros comprimidos

```html
<a href="bic://?paramsurl=eyJ1cmkiOiJodHRwczovL2V4YW1wbGUuY29tL2FyY2hpdm9zLmpzb24ifQ==">
    Firmar con Parámetros
</a>
```

## Navegadores Soportados

- Firefox
- Chrome/Chromium
- Microsoft Edge
- Brave
- Opera
- Otros navegadores basados en Chromium

## Solución de Problemas

### El navegador no reconoce el protocolo

1. Verifica que la aplicación esté instalada:
   ```bash
   which bic-electron
   ```

2. Ejecuta el script de registro manualmente:
   ```bash
   ./register-protocol.sh
   ```

3. Reinicia el navegador completamente (cierra todas las ventanas)

4. Verifica el registro:
   ```bash
   xdg-mime query default x-scheme-handler/bic
   ```

### El navegador pide permiso cada vez

Algunos navegadores (como Firefox) pueden pedir confirmación la primera vez que usas un protocolo personalizado. Marca la opción "Recordar mi elección" para evitar que pregunte cada vez.

### Permisos denegados

Si obtienes errores de permisos, asegúrate de que el ejecutable tenga permisos de ejecución:

```bash
chmod +x /ruta/al/bic-electron
```

### Desregistrar el protocolo

Si necesitas desregistrar el protocolo:

```bash
# Eliminar el archivo .desktop
rm ~/.local/share/applications/bic-electron.desktop

# Actualizar la base de datos
update-desktop-database ~/.local/share/applications
```

## Desarrollo y Depuración

Para ver los logs de la aplicación cuando se abre desde el protocolo:

```bash
# Ver logs en tiempo real
tail -f ~/.bic/logs/bic-$(date +%Y-%m-%d).log
```

## Construcción del Instalador

Para construir el instalador con el registro del protocolo incluido:

```bash
# Compilar el JAR
mvn clean package

# Construir el instalador
cd bic-electron
npm run build-slim-linux-x64
```

El instalador `.deb` incluirá automáticamente:
- El archivo `.desktop` con el registro del protocolo
- El script post-install que registra el protocolo
- Los permisos necesarios

## Notas Técnicas

### Archivo .desktop

El archivo `.desktop` se crea en:
- Sistema: `/usr/share/applications/bic-electron.desktop`
- Usuario: `~/.local/share/applications/bic-electron.desktop`

### Registro del Protocolo

El protocolo se registra usando:
```bash
xdg-mime default bic-electron.desktop x-scheme-handler/bic
```

### Formato del Protocolo

El protocolo sigue el formato estándar de URL:
```
bic://[host][?parametros]
```

Parámetros soportados:
- `files`: Lista de archivos separados por comas
- `paramsurl`: Parámetros codificados en base64
- `gzipurl`: Parámetros comprimidos con gzip y codificados en base64

## Referencias

- [XDG MIME Applications](https://specifications.freedesktop.org/mime-apps-spec/mime-apps-spec-latest.html)
- [Desktop Entry Specification](https://specifications.freedesktop.org/desktop-entry-spec/desktop-entry-spec-latest.html)
- [Electron Protocol Handler](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app)
