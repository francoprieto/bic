package py.org.firmador.bic;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.itextpdf.text.BaseColor;
import com.itextpdf.text.DocumentException;
import com.itextpdf.text.Image;
import com.itextpdf.text.Rectangle;
import com.itextpdf.text.pdf.PdfReader;
import com.itextpdf.text.pdf.PdfSignatureAppearance;
import com.itextpdf.text.pdf.PdfStamper;
import com.itextpdf.text.pdf.security.*;
import net.glxn.qrgen.javase.QRCode;
import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import py.org.firmador.Log;
import py.org.firmador.dto.Conf;
import py.org.firmador.dto.Libs;
import py.org.firmador.dto.Resultado;
import py.org.firmador.exceptions.UnsupportedPlatformException;
import py.org.firmador.util.AparienciaUtil;
import py.org.firmador.util.ConfiguracionUtil;
import py.org.firmador.util.MensajeUtil;
import py.org.firmador.util.WebUtil;

import javax.security.auth.callback.Callback;
import javax.security.auth.callback.CallbackHandler;
import javax.security.auth.callback.PasswordCallback;
import javax.security.auth.callback.UnsupportedCallbackException;
import javax.security.auth.login.FailedLoginException;
import javax.swing.*;
import java.awt.*;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

public class FirmadorImpl implements Firmador{

    // Constantes para los nombres de parámetros
    private static final String PARAM_ARCHIVO = "archivo";
    private static final String PARAM_ARCHIVOS = "archivos";
    private static final String PARAM_DESTINO = "destino";
    private static final String PARAM_ARCHIVO_URI = "archivo-uri";
    private static final String PARAM_INIT = "init";
    private static final String PARAM_PIN = "pin";
    private static final String PARAM_CALLBACK_API = "callback-api";
    private static final String PARAM_CALLBACK_HEADERS = "callback-headers";
    private static final String PARAM_CALLBACK_PARAMETERS = "callback-parameters";
    private static final String PARAM_ARCHIVO_NOMBRE = "archivo-nombre";
    private static final String PARAM_ARCHIVO_HEADERS = "archivo-headers";
    public static final String PARAM_POSICION = "posicion";
    private static final String PARAM_USE_WINDOWS_STORE = "use-windows-store";

    public static final String PIN_ERROR="PIN o password incorrecto";

    /**
     * Valida los parámetros relacionados a archivos.
     * @param parametros Mapa de parámetros
     * @return true si los parámetros son válidos, false en caso contrario
     */
    private boolean validarParametrosArchivos(Map<String,String> parametros){

        if(parametros.containsKey(PARAM_ARCHIVO)){
            File archivo = new File(parametros.get(PARAM_ARCHIVO));
            if(!archivo.exists() || !archivo.isFile()){
                Log.error("El archivo " + archivo + " no es válido!");
                return false;
            }
            return true;
        }
        if(parametros.containsKey(PARAM_ARCHIVOS)){
            String[] archivos = parametros.get(PARAM_ARCHIVOS).split(",");
            for(String archivoPath : archivos){
                File archivo = new File(archivoPath);
                if(!archivo.exists() || !archivo.isFile()) {
                    Log.error("El archivo " + archivo + " no es válido!");
                    return false;
                }
            }
            return true;
        }
        if(parametros.containsKey(PARAM_ARCHIVO_URI)
                && !parametros.get(PARAM_ARCHIVO_URI).trim().isEmpty()) {
            return true;
        }
        if(parametros.containsKey(PARAM_DESTINO)){
            File destino = new File(parametros.get(PARAM_DESTINO));
            if(!destino.exists() || !destino.isDirectory()){
                Log.error("El directorio " + parametros.get(PARAM_DESTINO) + " no es válido!");
                return false;
            }
            return true;
        }

        Log.error("No se ha definido un archivo!");
        return false;
    }

    /**
     * Firma los archivos según los parámetros y configuración.
     * @param parametros Mapa de parámetros
     * @return Resultado de la operación
     */
    public Resultado firmar(Map<String,String> parametros){
        //this.cleanCache();
        Conf configuracion;
        try {
            if (parametros.containsKey(PARAM_INIT) && "true".equals(parametros.get(PARAM_INIT))) {
                configuracion = ConfiguracionUtil.init(true);
                return new Resultado("ok","Configuración inicial exitosa");
            } else {
                configuracion = ConfiguracionUtil.init();
            }
        } catch(UnsupportedPlatformException exception){
            Log.error("Plataforma no soportada");
            return new Resultado("error", "Plataforma no soportada");
        }
        if(!this.validarParametrosArchivos(parametros)) return new Resultado("error", "Parametros inválidos");
        List<File> archivos = this.cachearArchivos(parametros, configuracion.getDownloadTimeout(), configuracion.getReadTimeout());
        if(archivos == null || archivos.isEmpty()){
            Log.error("Error al cacherar los archivos");
            return new Resultado("error", "Error al cacherar los archivos");
        }

        List<File> firmados = null;
        try {
            // Verificar si se debe usar el almacén de Windows
            boolean useWindowsStore = parametros.containsKey(PARAM_USE_WINDOWS_STORE) 
                && "true".equalsIgnoreCase(parametros.get(PARAM_USE_WINDOWS_STORE));
            
            if (useWindowsStore) {
                firmados = firmarArchivosWindowsStore(parametros, archivos);
            } else {
                firmados = firmarArchivos(configuracion, parametros, archivos);
            }
        } catch (FailedLoginException e) {
            return new Resultado("error", PIN_ERROR);
        }

        if(firmados == null || firmados.isEmpty())
            return new Resultado("error", "Archivos no firmados\nVerifique que el token este conectado.");
        String resultados = "";
        if(parametros.containsKey(PARAM_CALLBACK_API)){
            Map<String,String> headers = new HashMap<>();
            try {
                if (parametros.containsKey(PARAM_CALLBACK_HEADERS))
                    headers = WebUtil.getHeaders(parametros.get(PARAM_CALLBACK_HEADERS));
            }catch(JsonProcessingException jpe){
                Log.error("El JSON de callback-headers " + parametros.get(PARAM_CALLBACK_HEADERS) + " no es valido!", jpe);
                return new Resultado("error", "El JSON de callback-headers " + parametros.get(PARAM_CALLBACK_HEADERS) + " no es valido!");
            }
            Map<String,String> params = new HashMap<>();
            try {
                if (parametros.containsKey(PARAM_CALLBACK_PARAMETERS))
                    params = WebUtil.getHeaders(parametros.get(PARAM_CALLBACK_PARAMETERS));
            }catch(JsonProcessingException jpe){
                Log.error("El JSON de callback-parameters " + parametros.get(PARAM_CALLBACK_PARAMETERS) + " no es valido!", jpe);
                return new Resultado("error", "El JSON de callback-parameters " + parametros.get(PARAM_CALLBACK_PARAMETERS) + " no es valido!");
            }
            for(File file : firmados){
                String res = WebUtil.upload(file, parametros.get(PARAM_CALLBACK_API), headers, params);
                if(res != null && !res.trim().isEmpty()){
                    if(!resultados.trim().isEmpty()) {
                        resultados += ",";
                    }
                    resultados += "[{\"archivo\":\"" + file.getName() + "\", \"resultado\":\"" + res + "\"}]";
                }
            }
        }
        if(resultados.trim().isEmpty()) {
            return new Resultado("ok","(" + firmados.size() + ") Archivos firmados exitosamente");
        }
        return new Resultado("ok",resultados);
    }

    /**
     * Firma una lista de archivos utilizando la configuración y parámetros dados.
     * @param configuracion Configuración de la aplicación
     * @param parametros Parámetros de la firma
     * @param archivos Archivos a firmar
     * @return Lista de archivos firmados
     */
    private List<File> firmarArchivos(Conf configuracion, Map<String,String> parametros, List<File> archivos) throws FailedLoginException {
        Provider providerPKCS11 = Security.getProvider(Firmador.SUN_PKCS11_PROVIDER_NAME);
        List<Libs> libs = configuracion.getLibs();
        List<File> archivosFirmados = new ArrayList<>();
        String pin = null;

        if(parametros.containsKey(PARAM_PIN) && parametros.get(PARAM_PIN) != null)
            pin = parametros.get(PARAM_PIN).trim();

        for(Libs lib : libs){
            boolean encontrado = false;
            for(String file : lib.getFiles()){
                boolean configurado = false;
                for(int s=0; s<10; s++) {
                    try {
                        Map<String, String> confs = new HashMap<>();
                        confs.put("slot", String.valueOf(s));
                        confs.put("name", lib.getName());
                        confs.put("library", file);
                        String conf = ConfiguracionUtil.toConfFile(confs);
                        providerPKCS11 = providerPKCS11.configure(conf);
                        configurado = true;
                        break;
                    }catch(Exception pe){
                        //Log.info("No es el slot " + s );
                    }
                }

                if(!configurado){
                    Log.error("La configuración es inválida");
                    return new ArrayList<>();
                }

                java.security.Security.addProvider(providerPKCS11);
                KeyStore.Builder builder;
                if(pin == null){
                    // Solicita el PIN al usuario
                    KeyStore.CallbackHandlerProtection chp = new KeyStore.CallbackHandlerProtection(new CallbackHandler() {
                        public void handle(Callback[] callbacks) throws IOException, UnsupportedCallbackException {
                            for (Callback callback : callbacks) {
                                if (callback instanceof PasswordCallback) {
                                    PasswordCallback passwordCallback = (PasswordCallback) callback;
                                    char[] password = promptForPassword();
                                    if (password != null) {
                                        passwordCallback.setPassword(password);
                                    }
                                } else {
                                    throw new UnsupportedCallbackException(callback);
                                }
                            }
                        }
                        private char[] promptForPassword() {
                            AtomicReference<char[]> passwordRef = new AtomicReference<>();
                            JPasswordField passwordField = new JPasswordField(20);
                            JPanel panel = new JPanel(new BorderLayout());
                            panel.add(new JLabel("Ingrese su PIN:"), BorderLayout.NORTH);
                            panel.add(passwordField, BorderLayout.CENTER);

                            int option = JOptionPane.showConfirmDialog(null, panel, "Autenticación", JOptionPane.OK_CANCEL_OPTION, JOptionPane.PLAIN_MESSAGE);
                            if (option == JOptionPane.OK_OPTION) {
                                passwordRef.set(passwordField.getPassword());
                            }
                            return passwordRef.get();
                        }
                    });
                    builder = KeyStore.Builder.newInstance("PKCS11", providerPKCS11, chp);
                }else{
                    KeyStore.ProtectionParameter pp = new KeyStore.PasswordProtection(pin.toCharArray());
                    builder = KeyStore.Builder.newInstance("PKCS11", providerPKCS11, pp);
                }
                Certificate cert = null;
                X509Certificate x509Certificate;
                PrivateKey privateKey = null;
                try {
                    KeyStore keyStore = builder.getKeyStore();
                    java.util.Enumeration<String> aliases = keyStore.aliases();
                    String alias = null;
                    while (aliases.hasMoreElements()) {
                        alias = aliases.nextElement();
                        cert = keyStore.getCertificate(alias);
                        x509Certificate = (X509Certificate) cert;
                        if (x509Certificate.getKeyUsage()[0]) {
                            Key key = keyStore.getKey(alias, null); // Acceder a la clave privada del hardware
                            privateKey = (PrivateKey) key;
                            break;
                        }
                    }
                    for(File archivo : archivos) {
                        if(archivo.exists() && archivo.isFile()) {
                            File firmado = this.procesarFirma(archivo, privateKey, providerPKCS11, cert, parametros);

                            if(firmado != null && firmado.exists() && firmado.isFile())
                                archivosFirmados.add(firmado);
                        }
                    }
                    encontrado = true;
                } catch (NoSuchAlgorithmException | UnrecoverableKeyException e) {
                    Log.error("No se pudo obtener el certificado y la clave privada: " + lib.getName() + " - " + file);
                    return new ArrayList<>();
                } catch (KeyStoreException e) {
                    encontrado = false;
                    String error = MensajeUtil.getStackTraceAsString(e);
                    if (error != null && error.contains("javax.security.auth.login.FailedLoginException")){
                        Log.error(PIN_ERROR);
                        throw new FailedLoginException();
                    }else
                        Log.warn("Configuracion no soportada: " + lib.getName() + " - " + file);
                }
                if(encontrado) break;
            }
            if(encontrado) break;
        }

        return archivosFirmados;
    }

    /**
     * Firma una lista de archivos utilizando certificados del almacén de Windows.
     * @param parametros Parámetros de la firma
     * @param archivos Archivos a firmar
     * @return Lista de archivos firmados
     * @throws FailedLoginException Si falla la autenticación
     */
    private List<File> firmarArchivosWindowsStore(Map<String,String> parametros, List<File> archivos) throws FailedLoginException {
        List<File> archivosFirmados = new ArrayList<>();
        
        try {
            // Cargar almacén de certificados Windows-MY
            KeyStore keyStore = KeyStore.getInstance("Windows-MY");
            keyStore.load(null, null);
            
            // Obtener todos los alias
            java.util.Enumeration<String> aliases = keyStore.aliases();
            List<String> aliasList = new ArrayList<>();
            Map<String, Certificate> certMap = new HashMap<>();
            
            while (aliases.hasMoreElements()) {
                String alias = aliases.nextElement();
                Certificate cert = keyStore.getCertificate(alias);
                if (cert instanceof X509Certificate) {
                    X509Certificate x509 = (X509Certificate) cert;
                    // Verificar si el certificado tiene capacidad de firma digital
                    boolean[] keyUsage = x509.getKeyUsage();
                    if (keyUsage != null && keyUsage[0]) {
                        aliasList.add(alias);
                        certMap.put(alias, cert);
                    }
                }
            }
            
            if (aliasList.isEmpty()) {
                Log.error("No se encontraron certificados válidos en el almacén de Windows");
                return new ArrayList<>();
            }
            
            // Si hay múltiples certificados, permitir al usuario elegir
            String selectedAlias;
            if (aliasList.size() == 1) {
                selectedAlias = aliasList.get(0);
            } else {
                selectedAlias = mostrarDialogoSeleccionCertificado(aliasList, certMap);
                if (selectedAlias == null) {
                    Log.error("No se seleccionó ningún certificado");
                    return new ArrayList<>();
                }
            }
            
            // Obtener certificado y clave privada
            Certificate cert = keyStore.getCertificate(selectedAlias);
            Key key = keyStore.getKey(selectedAlias, null);
            
            if (!(key instanceof PrivateKey)) {
                Log.error("No se pudo obtener la clave privada del certificado");
                return new ArrayList<>();
            }
            
            PrivateKey privateKey = (PrivateKey) key;
            
            // Firmar todos los archivos
            for(File archivo : archivos) {
                if(archivo.exists() && archivo.isFile()) {
                    File firmado = this.procesarFirma(archivo, privateKey, null, cert, parametros);
                    if(firmado != null && firmado.exists() && firmado.isFile()) {
                        archivosFirmados.add(firmado);
                    }
                }
            }
            
        } catch (KeyStoreException | NoSuchAlgorithmException | CertificateException | 
                 IOException | UnrecoverableKeyException e) {
            Log.error("Error al acceder al almacén de certificados de Windows", e);
            String error = MensajeUtil.getStackTraceAsString(e);
            if (error != null && error.contains("javax.security.auth.login.FailedLoginException")){
                throw new FailedLoginException();
            }
            return new ArrayList<>();
        }
        
        return archivosFirmados;
    }
    
    /**
     * Muestra un diálogo para que el usuario seleccione un certificado.
     * @param aliases Lista de alias de certificados
     * @param certMap Mapa de certificados
     * @return Alias seleccionado o null si se cancela
     */
    private String mostrarDialogoSeleccionCertificado(List<String> aliases, Map<String, Certificate> certMap) {
        String[] opciones = new String[aliases.size()];
        
        for (int i = 0; i < aliases.size(); i++) {
            String alias = aliases.get(i);
            Certificate cert = certMap.get(alias);
            if (cert instanceof X509Certificate) {
                X509Certificate x509 = (X509Certificate) cert;
                Principal subject = x509.getSubjectDN();
                String subjectStr = subject.getName();
                
                // Extraer CN (Common Name) para mostrar
                String cn = alias;
                String[] parts = subjectStr.split(",");
                for (String part : parts) {
                    if (part.trim().startsWith("CN=")) {
                        cn = part.trim().substring(3);
                        break;
                    }
                }
                
                // Formato: CN - Emisor - Vencimiento
                String issuer = x509.getIssuerDN().getName();
                String issuerCN = issuer;
                for (String part : issuer.split(",")) {
                    if (part.trim().startsWith("CN=")) {
                        issuerCN = part.trim().substring(3);
                        break;
                    }
                }
                
                SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd");
                String expiry = sdf.format(x509.getNotAfter());
                
                opciones[i] = cn + " (Emitido por: " + issuerCN + ", Caduca: " + expiry + ")";
            } else {
                opciones[i] = alias;
            }
        }
        
        String seleccion = (String) JOptionPane.showInputDialog(
            null,
            "Selecciona el ID digital que desees usar para la firma:",
            "Firmar con un ID digital",
            JOptionPane.QUESTION_MESSAGE,
            null,
            opciones,
            opciones[0]
        );
        
        if (seleccion == null) {
            return null;
        }
        
        // Encontrar el alias correspondiente a la selección
        for (int i = 0; i < opciones.length; i++) {
            if (opciones[i].equals(seleccion)) {
                return aliases.get(i);
            }
        }
        
        return null;
    }



    /**
     * Procesa la firma de un archivo PDF.
     * @param archivo Archivo a firmar
     * @param key Clave privada
     * @param provider Proveedor PKCS11
     * @param cert Certificado
     * @param parametros Parámetros de la firma
     * @return Archivo firmado o null si ocurre un error
     */
    private File procesarFirma(File archivo, PrivateKey key, Provider provider, Certificate cert, Map<String,String> parametros){
        String destino = parametros.containsKey(PARAM_DESTINO) ? parametros.get(PARAM_DESTINO) : ConfiguracionUtil.getDirFirmados();
        ByteArrayOutputStream fos = null;
        PdfReader pdf = null;
        ByteArrayOutputStream qr = null;
        PdfStamper stp = null;
        try {
            pdf = new PdfReader(archivo.getCanonicalPath());
            fos = new ByteArrayOutputStream();
            stp = PdfStamper.createSignature(pdf, fos, '\0');
            PdfSignatureAppearance sap = stp.getSignatureAppearance();
            Map<String,Float> coor = AparienciaUtil.getPosicion(parametros, pdf);
            Rectangle firma = new Rectangle(coor.get("eix"), coor.get("eiy"), coor.get("esx"), coor.get("esy"));
            sap.setVisibleSignature(firma, coor.get("pagina").intValue(), null);
            sap.setCertificate(cert);
            X509Certificate x509Certificate = (X509Certificate) cert;
            Principal principal = x509Certificate.getSubjectDN();
            String fullDns = principal.getName();
            int tam = coor.get("hqr").intValue();
            byte[] img = AparienciaUtil.getImagen(parametros);
            if(img == null) {
                qr = QRCode.from(fullDns).withSize(tam, tam).stream();
                String[] dns = fullDns.split(",");
                Map<String, String> datos = new HashMap<>();
                datos.put("APELLIDOS", "");
                datos.put("NOMBRES", "");
                datos.put("SERIAL", "");
                for (String dn : dns) {
                    if (dn.contains("SURNAME=")) datos.put("APELLIDOS", dn.replace("SURNAME=", ""));
                    if (dn.contains("GIVENNAME=")) datos.put("NOMBRES", dn.replace("GIVENNAME=", ""));
                    if (dn.contains("SERIALNUMBER=")) datos.put("SERIAL", dn.replace("SERIALNUMBER=", ""));
                }
                String fecha = ConfiguracionUtil.ahora();
                if (fecha != null && fecha.trim().length() > 0)
                    datos.put("FECHA", fecha);
                if (datos.containsKey("SERIAL"))
                    datos.put("SERIAL", datos.get("SERIAL").trim().contains("CI") ? datos.get("SERIAL").trim().replace("CI", "CI ") : datos.get("SERIAL").trim());
                sap.setLayer2Text("Firmado digitalmente por:\n" + datos.get("APELLIDOS").trim() +
                        (datos.get("NOMBRES").length() > 0 ? ", " + datos.get("NOMBRES").trim() : "") +
                        (datos.get("SERIAL").length() > 0 ? "\n" + datos.get("SERIAL").trim() : "") +
                        (datos.get("FECHA").length() > 0 ? "\n" + datos.get("FECHA").trim() : ""));
            }
            ExternalSignature es = new PrivateKeySignature(key, "SHA-1", provider != null ? provider.getName() : "SunMSCAPI");
            ExternalDigest digest = new BouncyCastleDigest();
            Certificate[] certs = new Certificate[1];
            certs[0] = cert;

            if(img == null) {
                sap.setSignatureGraphic(Image.getInstance(qr.toByteArray()));
                sap.setRenderingMode(PdfSignatureAppearance.RenderingMode.GRAPHIC_AND_DESCRIPTION);
            }else {
                sap.setSignatureGraphic(Image.getInstance(img));
                sap.setRenderingMode(PdfSignatureAppearance.RenderingMode.GRAPHIC);
            }
            sap.setCertificationLevel(PdfSignatureAppearance.CERTIFIED_NO_CHANGES_ALLOWED);

            MakeSignature.signDetached(sap, digest, es, certs, null, null, null, 0, MakeSignature.CryptoStandard.CMS);
            byte[] data = fos.toByteArray();
            File firmado = new File(destino +  ConfiguracionUtil.SLASH + archivo.getName());
            FileUtils.writeByteArrayToFile(firmado , data);
            Log.info("Archivo " + firmado.getAbsolutePath() + " firmado exitosamente!");
            return firmado;
        } catch (IOException | DocumentException | GeneralSecurityException e) {
            Log.error("Error al firmar el archivo " + archivo.getName(), e);
            // No se usa System.exit, solo se retorna null
        }finally{
            try {
                if (qr != null) {
                    qr.close();
                }
                if (stp != null) {
                    stp.close();
                }
                if (pdf != null) {
                    pdf.close();
                }
                if (fos != null) {
                    fos.close();
                }
                // Pequeño retraso para asegurar que los recursos se liberen completamente
                Thread.sleep(100);
            }catch(Exception ex) { 
                Log.warn("Error al cerrar recursos: " + ex.getMessage());
            }
        }
        return null;
    }

    /**
     * Copia los archivos a firmar al directorio de caché, o descarga si es necesario.
     * @param parametros Parámetros de la firma
     * @param downloadTimeout Timeout de descarga
     * @param readTimeout Timeout de lectura
     * @return Lista de archivos en caché
     * @throws IOException Si ocurre un error de E/S
     */
    private List<File> cachearArchivos(Map<String,String> parametros, Long downloadTimeout, Long readTimeout) {
        String cache = ConfiguracionUtil.getDirCache();
        List<File> archivosCacheados = new ArrayList<>();
        // Archivos locales
        if(parametros.containsKey(PARAM_ARCHIVO) || parametros.containsKey(PARAM_ARCHIVOS)){
            String[] files = null;
            if(parametros.containsKey(PARAM_ARCHIVO)) files = new String[]{ parametros.get(PARAM_ARCHIVO) };
            else if(parametros.containsKey(PARAM_ARCHIVOS)) files = parametros.get(PARAM_ARCHIVOS).split(",");
            for(String file: files) {
                try {
                    File src = new File(file);
                    File des = new File(cache + ConfiguracionUtil.SLASH + src.getName());
                    if (!src.equals(des)){
                        if (des.exists()) FileUtils.deleteQuietly(des);
                        FileUtils.copyFile(src, des);
                        archivosCacheados.add(des);
                    }else {
                        archivosCacheados.add(src);
                    }
                } catch (IOException e) {
                    Log.error("Error al copiar archivo " + file, e);
                    return new ArrayList<>();
                }
            }
            return archivosCacheados;
        }
        // Descarga de archivo remoto
        if(parametros.containsKey(PARAM_ARCHIVO_URI)){
            String nombreArchivo = (parametros.containsKey(PARAM_ARCHIVO_NOMBRE) ? parametros.get(PARAM_ARCHIVO_NOMBRE).trim() : null);
            if(nombreArchivo == null) nombreArchivo = FilenameUtils.getName(parametros.get(PARAM_ARCHIVO_URI));
            Map<String,String> headers = null;
            if(parametros.containsKey(PARAM_ARCHIVO_HEADERS)){
                try {
                    headers = WebUtil.getHeaders(parametros.get(PARAM_ARCHIVO_HEADERS));
                }catch(JsonProcessingException jpe){
                    Log.error("Error al leer los headers para descargar el archivo", jpe);
                    return new ArrayList<>();
                }
            }
            if(headers == null && WebUtil.descargar(parametros.get(PARAM_ARCHIVO_URI), cache + ConfiguracionUtil.SLASH + nombreArchivo, downloadTimeout, readTimeout)){
                archivosCacheados.add(new File(cache + ConfiguracionUtil.SLASH + nombreArchivo));
                return archivosCacheados;
            }
            if(headers != null && WebUtil.descargar(parametros.get(PARAM_ARCHIVO_URI), cache + ConfiguracionUtil.SLASH + nombreArchivo, headers, downloadTimeout, readTimeout)){
                archivosCacheados.add(new File(cache + ConfiguracionUtil.SLASH + nombreArchivo));
                return archivosCacheados;
            }
        }
        return new ArrayList<>();
    }
}
