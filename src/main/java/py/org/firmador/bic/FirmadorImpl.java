package py.org.firmador.bic;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import py.org.firmador.util.ConfiguracionUtil;
import py.org.firmador.util.WebUtil;

import javax.security.auth.callback.Callback;
import javax.security.auth.callback.CallbackHandler;
import javax.security.auth.callback.PasswordCallback;
import javax.security.auth.callback.UnsupportedCallbackException;
import javax.swing.*;
import java.awt.*;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
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
    private static final String PARAM_POSICION = "posicion";

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
                && parametros.get(PARAM_ARCHIVO_URI).trim().length() > 0)
            return true;
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
        List<File> archivos;
        try{
            archivos = this.cachearArchivos(parametros, configuracion.getDownloadTimeout(), configuracion.getReadTimeout());
        }catch(IOException ex){
            Log.error("Error al cacherar los archivos", ex);
            return new Resultado("error", "Error al cacherar los archivos");
        }
        List<File> firmados = firmarArchivos(configuracion, parametros, archivos);
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
                if(res != null && res.trim().length() > 0){
                    if(resultados.trim().length() > 0) resultados += ",";
                    resultados += "[{\"archivo\":\"" + file.getName() + "\", \"resultado\":\"" + res + "\"}]";
                }
                if(file.getAbsolutePath().contains(".bic" + ConfiguracionUtil.SLASH + "cache"))
                    FileUtils.deleteQuietly(file);
            }
        }
        if(resultados.trim().length() == 0) return new Resultado("ok","(" + firmados.size() + ") Archivos firmados exitosamente");
        return new Resultado("ok",resultados);
    }

    /**
     * Firma una lista de archivos utilizando la configuración y parámetros dados.
     * @param configuracion Configuración de la aplicación
     * @param parametros Parámetros de la firma
     * @param archivos Archivos a firmar
     * @return Lista de archivos firmados
     */
    private List<File> firmarArchivos(Conf configuracion, Map<String,String> parametros, List<File> archivos){
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
                        Log.info("No es el slot " + s );
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
                            Key key = keyStore.getKey(alias, null); // Accedemos al private key del hardware
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
                    Log.warn("Configuracion no soportada: " + lib.getName() + " - " + file);
                }
                if(encontrado) break;
            }
            if(encontrado) break;
        }

        return archivosFirmados;
    }

    /**
     * Obtiene la posición de la firma en el PDF según los parámetros.
     * @param parametros Parámetros de la firma
     * @param pdf Lector PDF
     * @return Mapa con las coordenadas y página
     */
    private Map<String, Float> getPosicion(Map<String,String> parametros, PdfReader pdf){
        if(pdf == null) return new HashMap<>();
        ResourceBundle conf = ResourceBundle.getBundle("bic");
        Integer height = Integer.valueOf(conf.getString("firma.alto"));
        Integer width = Integer.valueOf(conf.getString("firma.ancho"));
        Integer margin = Integer.valueOf(conf.getString("firma.margen"));
        height = height + margin;
        width = width + margin;

        Map<String, Float> retorno = new HashMap<>();
        Rectangle cropBox = null;
        String pos = "";

        if(parametros.containsKey(PARAM_POSICION) && parametros.get(PARAM_POSICION) != null){
            ObjectMapper mapper = new ObjectMapper();
            try {
                Map<String, String> cp = mapper.readValue(parametros.get(PARAM_POSICION), Map.class);
                if(cp.containsKey("pagina")){
                    if(cp.get("pagina").equals("primera")){
                        retorno.put("pagina",1f);
                        cropBox = pdf.getCropBox(1);
                    }else if(cp.get("pagina").equals("ultima")) {
                        retorno.put("pagina", (float) pdf.getNumberOfPages());
                        cropBox = pdf.getCropBox(pdf.getNumberOfPages());
                    }else{
                        String pag = cp.get("pagina");
                        Integer ip = Integer.valueOf(pag);
                        if(ip.intValue() > pdf.getNumberOfPages()) ip = pdf.getNumberOfPages();
                        retorno.put("pagina",Float.valueOf(ip));
                        cropBox = pdf.getCropBox(ip);
                    }
                }
                if(cp.containsKey("lugar") && cp.get("lugar").trim().length() > 0)
                    pos = cp.get("lugar").trim();
            }catch(JsonProcessingException jpe){
                Log.warn("Posicion de la firma invalida, se asume valores por defecto!");
            }
        }

        if(cropBox == null){
            cropBox = pdf.getCropBox(1);
            retorno.put("pagina",1f);
        }

        if(cropBox != null){
            Float mitadFirmaFloat = width / 2f;
            Float mitadPaginaFloat = cropBox.getWidth() / 2f;
            int mitadFirma = mitadFirmaFloat.intValue();
            int mitadPagina = mitadPaginaFloat.intValue();

            // centro-inferior (default)
            retorno.put("eix", cropBox.getLeft(margin));
            retorno.put("eiy", cropBox.getBottom(margin));
            retorno.put("esx", cropBox.getLeft(mitadPagina + mitadFirma));
            retorno.put("esy", cropBox.getBottom(height));

            switch (pos) {
                case "esquina-superior-izquierda":
                    retorno.put("eix", cropBox.getLeft(margin));
                    retorno.put("eiy", cropBox.getTop(height));
                    retorno.put("esx", cropBox.getLeft(width));
                    retorno.put("esy", cropBox.getTop(margin));
                    break;
                case "esquina-superior-derecha":
                    retorno.put("eix", cropBox.getRight(width));
                    retorno.put("eiy", cropBox.getTop(height));
                    retorno.put("esx", cropBox.getRight(margin));
                    retorno.put("esy", cropBox.getTop(margin));
                    break;
                case "esquina-inferior-izquierda":
                    retorno.put("eix", cropBox.getLeft(margin));
                    retorno.put("eiy", cropBox.getBottom(margin));
                    retorno.put("esx", cropBox.getLeft(width));
                    retorno.put("esy", cropBox.getBottom(height));
                    break;
                case "esquina-inferior-derecha":
                    retorno.put("eix", cropBox.getRight(width));
                    retorno.put("eiy", cropBox.getBottom(margin));
                    retorno.put("esx", cropBox.getRight(margin));
                    retorno.put("esy", cropBox.getBottom(height));
                    break;
                case "centro-superior":
                    retorno.put("eix", cropBox.getLeft(margin));
                    retorno.put("eiy", cropBox.getTop(height));
                    retorno.put("esx", cropBox.getLeft(mitadPagina + mitadFirma));
                    retorno.put("esy", cropBox.getTop(margin));
                    break;
                default:
                    // Ya está el default
                    break;
            }
        }
        return retorno;
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
        try {
            PdfReader pdf = new PdfReader(archivo.getCanonicalPath());
            fos = new ByteArrayOutputStream();
            PdfStamper stp = PdfStamper.createSignature(pdf, fos, '\0');
            PdfSignatureAppearance sap = stp.getSignatureAppearance();
            Map<String,Float> coor = this.getPosicion(parametros, pdf);
            Rectangle firma = new Rectangle(coor.get("eix"), coor.get("eiy"), coor.get("esx"), coor.get("esy"));
            sap.setVisibleSignature(firma, coor.get("pagina").intValue(), null);
            sap.setCertificate(cert);
            X509Certificate x509Certificate = (X509Certificate) cert;
            Principal principal = x509Certificate.getSubjectDN();
            String fullDns = principal.getName();
            ByteArrayOutputStream qr = QRCode.from(fullDns).withSize(50, 50).stream();
            String[] dns = fullDns.split(",");
            Map<String,String> datos = new HashMap<>();
            datos.put("APELLIDOS","");
            datos.put("NOMBRES","");
            datos.put("SERIAL","");
            for(String dn : dns){
                if(dn.contains("SURNAME=")) datos.put("APELLIDOS",dn.replace("SURNAME=",""));
                if(dn.contains("GIVENNAME=")) datos.put("NOMBRES",dn.replace("GIVENNAME=",""));
                if(dn.contains("SERIALNUMBER=")) datos.put("SERIAL",dn.replace("SERIALNUMBER=",""));
            }
            String fecha = ConfiguracionUtil.ahora();
            if(fecha != null && fecha.trim().length() > 0)
                datos.put("FECHA", fecha);
            if(datos.containsKey("SERIAL"))
                datos.put("SERIAL", datos.get("SERIAL").trim().contains("CI") ? datos.get("SERIAL").trim().replace("CI", "CI ") : datos.get("SERIAL").trim());
            sap.setLayer2Text("Firmado digitalmente por:\n" + datos.get("APELLIDOS").trim() +
                                (datos.get("NOMBRES").length() > 0 ? ", " + datos.get("NOMBRES").trim() : "") +
                                (datos.get("SERIAL").length() > 0 ? "\n" + datos.get("SERIAL").trim() : "") +
                                (datos.get("FECHA").length() > 0 ? "\n" + datos.get("FECHA").trim() : ""));
            ExternalSignature es = new PrivateKeySignature(key, "SHA-1", provider.getName());
            ExternalDigest digest = new BouncyCastleDigest();
            Certificate[] certs = new Certificate[1];
            certs[0] = cert;
            sap.setSignatureGraphic(Image.getInstance(qr.toByteArray()));
            sap.setCertificationLevel(PdfSignatureAppearance.CERTIFIED_NO_CHANGES_ALLOWED);
            sap.setRenderingMode(PdfSignatureAppearance.RenderingMode.GRAPHIC_AND_DESCRIPTION);
            MakeSignature.signDetached(sap, digest, es, certs, null, null, null, 0, MakeSignature.CryptoStandard.CMS);
            byte[] data = fos.toByteArray();
            File firmado = new File(destino +  ConfiguracionUtil.SLASH + archivo.getName());
            FileUtils.writeByteArrayToFile(firmado , data);
            Log.info("Archivo " + firmado.getAbsolutePath() + " firmado exitosamente!");
            return firmado;
        } catch (IOException | DocumentException | GeneralSecurityException e) {
            Log.error("Error al firmar el archivo " + archivo.getName(), e);
            // No se usa System.exit, solo se retorna null
        }
        return null;
    }

    /**
     * Limpia el directorio de caché de archivos temporales.
     */
    private void cleanCache(){
        String cache = ConfiguracionUtil.getDirCache();
        File dir = new File(cache);
        if(dir != null && dir.exists() && dir.isDirectory()){
            for(File f : dir.listFiles())
                FileUtils.deleteQuietly(f);
        }
    }

    /**
     * Copia los archivos a firmar al directorio de caché, o descarga si es necesario.
     * @param parametros Parámetros de la firma
     * @param downloadTimeout Timeout de descarga
     * @param readTimeout Timeout de lectura
     * @return Lista de archivos en caché
     * @throws IOException Si ocurre un error de E/S
     */
    private List<File> cachearArchivos(Map<String,String> parametros, Long downloadTimeout, Long readTimeout) throws IOException {
        String cache = ConfiguracionUtil.getDirCache();
        List<File> archivosCacheados = new ArrayList<>();
        // Archivos locales
        if(parametros.containsKey(PARAM_ARCHIVO) || parametros.containsKey(PARAM_ARCHIVOS)){
            String[] files = null;
            if(parametros.containsKey(PARAM_ARCHIVO)) files = new String[]{ parametros.get(PARAM_ARCHIVO) };
            else if(parametros.containsKey(PARAM_ARCHIVOS)) files = parametros.get(PARAM_ARCHIVOS).split(",");
            for(String file: files) {
                File src = new File(file);
                File des = new File(cache + ConfiguracionUtil.SLASH + src.getName());
                if (!src.equals(des)){
                    if (des.exists()) FileUtils.deleteQuietly(des);
                    FileUtils.copyFile(src, des);
                    archivosCacheados.add(des);
                }else archivosCacheados.add(src);
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
