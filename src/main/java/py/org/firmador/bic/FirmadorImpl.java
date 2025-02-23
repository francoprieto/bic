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

    private boolean validarParametrosArchivos(Map<String,String> parametros){

        if(parametros.containsKey("archivo")){
            if(!(new File(parametros.get("archivo"))).exists()
                || !(new File(parametros.get("archivo"))).isFile()){
                Log.error("El archivo " + parametros.get("archivo") + " no es válido!");
                return false;
            }
            return true;
        }

        if(parametros.containsKey("archivos")){
            String[] archivos = parametros.get("archivos").split(",");
            for(String archivo : archivos){
                if(!(new File(archivo)).exists() || !(new File(archivo)).isFile()) {
                    Log.error("El archivo " + archivo + " no es válido!");
                    return false;
                }
            }
            return true;
        }

        if(parametros.containsKey("archivo-uri")
                && parametros.get("archivo-uri").trim().length() > 0)
            return true;

        if(parametros.containsKey("destino")){
            File destino = new File(parametros.get("destino"));
            if(!destino.exists() || !destino.isDirectory()){
                Log.error("El directorio " + parametros.get("destino") + " no es válido!");
                return false;
            }
            return true;
        }

        Log.error("No se ha definido un archivo!");

        return false;
    }
    public Resultado firmar(Map<String,String> parametros){
        Conf configuracion = null;
        try {
            if (parametros.containsKey("init") && parametros.get("init").equals("true")) {
                configuracion = ConfiguracionUtil.init(true);
                return new Resultado("ok","Configuración inicial exitosa");
            }else
                configuracion = ConfiguracionUtil.init();
        }catch(UnsupportedPlatformException exception){
            Log.error("Plataforma no soportada");
            return new Resultado("error", "Plataforma no soportada");
        }

        if(!this.validarParametrosArchivos(parametros)) return new Resultado("error", "Parametros inválidos");

        List<File> archivos = null;
        try{
            archivos = this.cachearArchivos(parametros, configuracion.getDownloadTimeout(), configuracion.getReadTimeout());
        }catch(IOException ex){
            Log.error("Error al cacherar los archivos", ex);
            return new Resultado("error", "Error al cacherar los archivos");
        }

        List<File> firmados = firmarArchivos(configuracion, parametros, archivos);
        String resultados = "";
        if(parametros.containsKey("callback-api")){
            Map<String,String> headers = new HashMap<>();
            try {
                if (parametros.containsKey("callback-headers"))
                    headers = WebUtil.getHeaders(parametros.get("callback-headers"));
            }catch(JsonProcessingException jpe){
                Log.error("El JSON de callback-headers " + parametros.get("callback-headers") + " no es valido!", jpe);
                return new Resultado("error", "El JSON de callback-headers " + parametros.get("callback-headers") + " no es valido!");
            }
            Map<String,String> params = new HashMap<>();
            try {
                if (parametros.containsKey("callback-parameters"))
                    params = WebUtil.getHeaders(parametros.get("callback-parameters"));
            }catch(JsonProcessingException jpe){
                Log.error("El JSON de callback-parameters " + parametros.get("callback-parameters") + " no es valido!", jpe);
                return new Resultado("error", "El JSON de callback-parameters " + parametros.get("callback-parameters") + " no es valido!");
            }
            for(File file : firmados){
                String res = WebUtil.upload(file, parametros.get("callback-api"), headers, params);
                if(res != null && res.trim().length() > 0){
                    if(resultados.trim().length() > 0) resultados += ",";
                    resultados += "[{\"archivo\":\"" + file.getName() + "\", \"resultado\":\"" + res + "\"}]";
                }
                if(file.getAbsolutePath().contains(".bic" + ConfiguracionUtil.SLASH + "cache"))
                    FileUtils.deleteQuietly(file);
            }
        }
        if(resultados.trim().length() == 0) return new Resultado("ok","Archivos firmados");

        return new Resultado("ok",resultados);
    }

    private List<File> firmarArchivos(Conf configuracion, Map<String,String> parametros, List<File> archivos){
        Provider providerPKCS11 = Security.getProvider(Firmador.SUN_PKCS11_PROVIDER_NAME);
        List<Libs> libs = configuracion.getLibs();
        List<File> retorno = new ArrayList<>();
        String pin = null;
        if(parametros.containsKey("pin") && parametros.get("pin") != null)
            pin = parametros.get("pin").trim();
        for(Libs lib : libs){
            boolean romper = false;
            for(String file : lib.getFiles()){
                boolean configurado = false;
                for(int s=0; s<10; s++) {
                    try {
                        Map<String, String> confs = new HashMap<>();
                        confs.put("slot", s + "");
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
                    System.exit(1);
                    return null;
                }

                java.security.Security.addProvider(providerPKCS11);
                KeyStore.Builder builder = null;
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
                                retorno.add(firmado);
                        }
                    }
                    romper = true;
                } catch (NoSuchAlgorithmException | UnrecoverableKeyException e) {
                    Log.error("No se pudo obtener el certificado y la clave privada: " + lib.getName() + " - " + file);
                    return new ArrayList<>();
                } catch (KeyStoreException e) {
                    romper = false;
                    Log.warn("Configuracion no soportada: " + lib.getName() + " - " + file);
                }
                if(romper) break;
            }
            if(romper) break;
        }

        return retorno;
    }

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

        if(parametros.containsKey("posicion") && parametros.get("posicion") != null){
            ObjectMapper mapper = new ObjectMapper();
            try {
                Map<String, String> cp = mapper.readValue(parametros.get("posicion"), Map.class);
                if(cp.containsKey("pagina")){
                    if(cp.get("pagina").equals("primera")){
                        retorno.put("pagina",Float.valueOf(1));
                        cropBox = pdf.getCropBox(1);
                    }else if(cp.get("pagina").equals("ultima")) {
                        retorno.put("pagina", Float.valueOf(pdf.getNumberOfPages()));
                        cropBox = pdf.getCropBox(pdf.getNumberOfPages());
                    }else{
                        retorno.put("pagina",Float.valueOf(cp.get("pagina")));
                        cropBox = pdf.getCropBox(Integer.valueOf(cp.get("pagina")));
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
            retorno.put("pagina",Float.valueOf(1));
        }

        if(cropBox != null){

            Float mitadFirmaFloat = Float.valueOf(width / 2);
            Float mitadPaginaFloat = Float.valueOf(cropBox.getWidth() / 2);
            Integer mitadFirma = mitadFirmaFloat.intValue();
            Integer mitadPagina = mitadPaginaFloat.intValue();

            // centro-inferior (default)
            retorno.put("eix", cropBox.getLeft(margin));
            retorno.put("eiy", cropBox.getBottom(margin));
            retorno.put("esx", cropBox.getLeft(mitadPagina + mitadFirma));
            retorno.put("esy", cropBox.getBottom(height));

            if(pos.equals("esquina-superior-izquierda")) {
                retorno.put("eix", cropBox.getLeft(margin));
                retorno.put("eiy", cropBox.getTop(height));
                retorno.put("esx", cropBox.getLeft(width));
                retorno.put("esy", cropBox.getTop(margin));
            }else if(pos.equals("esquina-superior-derecha")){
                retorno.put("eix", cropBox.getRight(width));
                retorno.put("eiy", cropBox.getTop(height));
                retorno.put("esx", cropBox.getRight(margin));
                retorno.put("esy", cropBox.getTop(margin));
            }else if(pos.equals("esquina-inferior-izquierda")) {
                retorno.put("eix", cropBox.getLeft(margin));
                retorno.put("eiy", cropBox.getBottom(margin));
                retorno.put("esx", cropBox.getLeft(width));
                retorno.put("esy", cropBox.getBottom(height));
            }else if(pos.equals("esquina-inferior-derecha")){
                retorno.put("eix", cropBox.getRight(width));
                retorno.put("eiy", cropBox.getBottom(margin));
                retorno.put("esx", cropBox.getRight(margin));
                retorno.put("esy", cropBox.getBottom(height));
            }else if(pos.equals("centro-superior")){
                retorno.put("eix", cropBox.getLeft(margin));
                retorno.put("eiy", cropBox.getTop(height));
                retorno.put("esx", cropBox.getLeft(mitadPagina + mitadFirma));
                retorno.put("esy", cropBox.getTop(margin));
            }
        }

        return retorno;
    }

    private File procesarFirma(File archivo, PrivateKey key, Provider provider, Certificate cert, Map<String,String> parametros){
        String destino = null;

        if(parametros.containsKey("destino")) destino = parametros.get("destino");
        else destino = ConfiguracionUtil.getDirFirmados();

        ByteArrayOutputStream fos = null;
        try {
            // reader and stamper
            PdfReader pdf = new PdfReader(archivo.getCanonicalPath());

            fos = new ByteArrayOutputStream();

            PdfStamper stp = PdfStamper.createSignature(pdf, fos, '\0');
            PdfSignatureAppearance sap = stp.getSignatureAppearance();

            Rectangle cropBox = pdf.getCropBox(1);

            Map<String,Float> coor = this.getPosicion(parametros, pdf);
            Rectangle firma = new Rectangle(Float.valueOf(coor.get("eix"))
                    ,Float.valueOf(coor.get("eiy"))
                    ,Float.valueOf(coor.get("esx"))
                    ,Float.valueOf(coor.get("esy")));
            sap.setVisibleSignature(firma, coor.get("pagina").intValue(), null);
            sap.setCertificate(cert);

            X509Certificate x509Certificate = (X509Certificate) cert;

            Principal principal = x509Certificate.getSubjectDN();
            String fullDns = principal.getName();

            ByteArrayOutputStream qr = QRCode.from(fullDns)
                                        .withSize(50, 50)
                                        .stream();

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

            sap.setLayer2Text("Firmado digitalmente por:\n" + datos.get("APELLIDOS").trim() + ""
                                + (datos.get("NOMBRES").length() > 0 ? ", " + datos.get("NOMBRES").trim() : "")
                                + (datos.get("SERIAL").length() > 0 ? "\n" + datos.get("SERIAL").trim() : "")
                                + (datos.get("FECHA").length() > 0 ? "\n" + datos.get("FECHA").trim() : ""));

            // digital signature
            ExternalSignature es = new PrivateKeySignature(key, "SHA-1", provider.getName());
            ExternalDigest digest = new BouncyCastleDigest();
            Certificate[] certs = new Certificate[1];
            certs[0] = cert;

            //sap.setImage(Image.getInstance(qr.toByteArray()));
            sap.setSignatureGraphic(Image.getInstance(qr.toByteArray()));

            sap.setCertificationLevel(PdfSignatureAppearance.CERTIFIED_NO_CHANGES_ALLOWED);
            sap.setRenderingMode(PdfSignatureAppearance.RenderingMode.GRAPHIC_AND_DESCRIPTION);

            // Signs the document using the detached mode, CMS or CAdES equivalent
            MakeSignature.signDetached(sap, digest, es, certs, null, null, null, 0, MakeSignature.CryptoStandard.CMS);

            byte[] data = fos.toByteArray();
            File firmado = new File(destino +  ConfiguracionUtil.SLASH + archivo.getName());
            FileUtils.writeByteArrayToFile(firmado , data);
            Log.info("Archivo " + firmado.getAbsolutePath() + " firmado exitosamente!");
            return firmado;
        } catch (IOException | DocumentException | GeneralSecurityException e) {
            Log.error("Error al firmar el archivo " + archivo.getName(), e);
            System.exit(1);
        }
        return null;
    }

    private List<File> cachearArchivos(Map<String,String> parametros, Long downloadTimeout, Long readTimeout) throws IOException {
        String cache = ConfiguracionUtil.getDirCache();
        List<File> retorno = new ArrayList<>();

        // Los archivos locales copiamos al directorio cache
        if(parametros.containsKey("archivo") || parametros.containsKey("archivos")){
            String[] files = null;
            if(parametros.containsKey("archivo")) files = new String[]{ parametros.get("archivo") };
            else if(parametros.containsKey("archivos")) files = parametros.get("archivos").split(",");

            for(String file: files) {
                File src = new File(file);
                File des = new File(cache + ConfiguracionUtil.SLASH + src.getName());

                // Eliminamos si existe un archivo con el mismo nombre anterior
                if(des.exists())
                    FileUtils.deleteQuietly(des);

                FileUtils.copyFile(src, des);
                retorno.add(des);
            }
            return retorno;
        }

        if(parametros.containsKey("archivo-uri")){
            String nombreArchivo = (parametros.containsKey("archivo-nombre") ? parametros.get("archivo-nombre").trim() : null);
            if(nombreArchivo == null) nombreArchivo = FilenameUtils.getName(parametros.get("archivo-uri"));
            Map<String,String> headers = null;
            if(parametros.containsKey("archivo-headers")){
                try {
                    headers = WebUtil.getHeaders(parametros.get("archivo-headers"));
                }catch(JsonProcessingException jpe){
                    Log.error("Error al leer los headers para descargar el archivo", jpe);
                    return new ArrayList<>();
                }
            }
            if(headers == null && WebUtil.descargar(parametros.get("archivo-uri"), cache + ConfiguracionUtil.SLASH + nombreArchivo, downloadTimeout, readTimeout)){
                retorno.add(new File(cache + ConfiguracionUtil.SLASH + nombreArchivo));
                return retorno;
            }
            if(headers != null && WebUtil.descargar(parametros.get("archivo-uri"), cache + ConfiguracionUtil.SLASH + nombreArchivo, headers, downloadTimeout, readTimeout)){
                retorno.add(new File(cache + ConfiguracionUtil.SLASH + nombreArchivo));
                return retorno;
            }
        }

        return new ArrayList<>();

    }
}
