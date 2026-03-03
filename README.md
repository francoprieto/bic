# bic
Programa para firmar documentos digitalmente

## Características

- Firma digital de documentos PDF usando tokens PKCS#11 (eToken, ePass, bit4id, SafeSign, ACS, etc.)
- **Soporte para certificados del almacén de Windows** - Usa certificados instalados en el sistema Windows sin necesidad de token físico
- Interfaz gráfica con Electron
- Firma por lotes con paginación
- Personalización de posición y apariencia de la firma
- Descarga y subida de archivos remotos
- Modo oscuro

## Uso del Almacén de Certificados de Windows

En sistemas Windows, puedes usar certificados instalados en el almacén del sistema en lugar de tokens físicos:

1. Marca la casilla "Usar almacén de Windows" en la interfaz
2. El campo de contraseña se deshabilitará automáticamente
3. Al firmar, se mostrará un diálogo para seleccionar el certificado deseado
4. Los certificados se muestran con información del emisor y fecha de caducidad

### Parámetros de línea de comandos

Para usar el almacén de Windows desde la línea de comandos:

```bash
java -jar bic-jar-with-dependencies.jar --use-windows-store=true --archivos=documento.pdf --destino=./firmados
```

## Compilación

```bash
mvn clean package
```

El JAR se generará en `target/bic-jar-with-dependencies.jar`

## Construcción del instalador Electron

```bash
cd bic-electron
node tooling.js fat win64
npm run build
```

El script `tooling.js` compilará automáticamente el JAR de Java antes de crear el instalador.
