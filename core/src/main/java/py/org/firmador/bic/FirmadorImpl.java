package py.org.firmador.bic;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import py.org.firmador.dto.*;
import py.org.firmador.util.AparienciaUtil;
import py.org.firmador.util.ConfiguracionUtil;
import py.org.firmador.util.WebUtil;

import javax.security.auth.login.FailedLoginException;
import java.io.*;
import java.nio.file.*;
import java.security.*;
import java.security.cert.Certificate;
import java.security.cert.X509Certificate;
import java.text.SimpleDateFormat;
import java.util.*;

public class FirmadorImpl implements Firmador {

    @Override
    public Resultado ejecutar(Map<String, String> params) {
        String cmd = params.getOrDefault("cmd", "firmar");
        return switch (cmd) {
            case "init"         -> cmdInit();
            case "listar-certs" -> cmdListarCerts(params);
            case "firmar"       -> cmdFirmar(params);
            default             -> Resultado.error("Comando desconocido: " + cmd);
        };
    }

    // =========================================================================
    // CMD: init
    // =========================================================================

    private Resultado cmdInit() {
        Conf conf = ConfiguracionUtil.init(true);
        if (conf == null) return Resultado.error("No se pudo inicializar la configuración");
        int total = conf.getLibs() == null ? 0 : conf.getLibs().size();
        return Resultado.ok("Configuración inicializada. Librerías encontradas: " + total);
    }

    // =========================================================================
    // CMD: listar-certs
    // =========================================================================

    private Resultado cmdListarCerts(Map<String, String> params) {
        String source = params.getOrDefault("cert-source", "pkcs11");
        String pin    = params.get("pin");

        List<CertInfo> certs = switch (source) {
            case "windows-store" -> listarWindowsStore();
            case "pkcs12"        -> listarPKCS12(params.get("cert-file"), pin);
            case "nss"           -> listarNSS(pin);
            default              -> listarPKCS11(pin);
        };

        Resultado r = Resultado.ok("Certificados encontrados: " + certs.size());
        r.setCertificados(certs);
        return r;
    }

    // =========================================================================
    // CMD: firmar
    // =========================================================================

    private Resultado cmdFirmar(Map<String, String> params) {
        Conf conf = ConfiguracionUtil.init();
        if (conf == null) conf = ConfiguracionUtil.init(true);
        if (conf == null) return Resultado.error("Configuración no disponible. Ejecute --cmd=init primero.");

        List<File> archivos = cachearArchivos(params, conf.getDownloadTimeout(), conf.getReadTimeout());
        if (archivos.isEmpty()) return Resultado.error("No se encontraron archivos para firmar");

        String source = params.getOrDefault("cert-source", "pkcs11");
        String pin    = params.get("pin");
        String alias  = params.get("cert-alias");

        List<File> firmados;
        try {
            firmados = switch (source) {
                case "windows-store" -> firmarConStore("Windows-MY", null, alias, params, archivos);
                case "pkcs12"        -> firmarConPKCS12(params.get("cert-file"), pin, alias, params, archivos);
                case "nss"           -> firmarConNSS(pin, alias, params, archivos);
                default              -> firmarConPKCS11(conf, pin, alias, params, archivos);
            };
        } catch (FailedLoginException e) {
            return Resultado.error("PIN o contraseña incorrectos");
        }

        if (firmados.isEmpty()) return Resultado.error("No se firmó ningún archivo. Verifique que el token esté conectado.");

        // Callback upload
        String resultados = subirFirmados(firmados, params);
        if (resultados != null) return Resultado.ok(resultados);

        return Resultado.ok("(" + firmados.size() + ") archivo(s) firmado(s) exitosamente");
    }

    // =========================================================================
    // Listar certificados
    // =========================================================================

    private List<CertInfo> listarPKCS11(String pin) {
        Conf conf = ConfiguracionUtil.init();
        if (conf == null || conf.getLibs() == null) return List.of();

        Provider base = Security.getProvider("SunPKCS11");
        if (base == null) { Log.warn("SunPKCS11 no disponible"); return List.of(); }

        for (Libs lib : conf.getLibs()) {
            for (String file : lib.getFiles()) {
                for (int slot = 0; slot < 10; slot++) {
                    try {
                        Map<String, String> cfg = Map.of("slot", String.valueOf(slot), "name", lib.getName(), "library", file);
                        Provider p = base.configure(ConfiguracionUtil.toConfFile(cfg));
                        Security.addProvider(p);
                        KeyStore ks = abrirKeyStore("PKCS11", p, pin);
                        if (ks == null) continue;
                        List<CertInfo> certs = extraerCertInfos(ks, "pkcs11");
                        if (!certs.isEmpty()) return certs;
                    } catch (Exception ignored) {}
                }
            }
        }
        return List.of();
    }

    private List<CertInfo> listarWindowsStore() {
        try {
            KeyStore ks = KeyStore.getInstance("Windows-MY");
            ks.load(null, null);
            return extraerCertInfos(ks, "windows-store");
        } catch (Exception e) {
            Log.error("Error al acceder al almacén Windows", e);
            return List.of();
        }
    }

    private List<CertInfo> listarPKCS12(String certFile, String pin) {
        if (certFile == null) return List.of();
        try {
            KeyStore ks = KeyStore.getInstance("PKCS12");
            try (FileInputStream fis = new FileInputStream(certFile)) {
                ks.load(fis, pin != null ? pin.toCharArray() : null);
            }
            return extraerCertInfos(ks, "pkcs12");
        } catch (Exception e) {
            Log.error("Error al leer PKCS12: " + certFile, e);
            return List.of();
        }
    }

    private List<CertInfo> listarNSS(String pin) {
        File configFile = null;
        Provider nssProvider = null;
        try {
            String nssPath = encontrarNSSPath();
            if (nssPath == null) return List.of();

            Provider base = Security.getProvider("SunPKCS11");
            if (base == null) return List.of();

            configFile = crearConfigNSS(nssPath);
            nssProvider = base.configure(configFile.getAbsolutePath());
            Security.addProvider(nssProvider);

            KeyStore ks = abrirKeyStore("PKCS11", nssProvider, pin);
            if (ks == null) return List.of();
            return extraerCertInfos(ks, "nss");
        } catch (Exception e) {
            Log.warn("NSS no disponible: " + e.getMessage());
            return List.of();
        } finally {
            limpiarNSS(nssProvider, configFile);
        }
    }

    private List<CertInfo> extraerCertInfos(KeyStore ks, String source) throws KeyStoreException {
        List<CertInfo> result = new ArrayList<>();
        Enumeration<String> aliases = ks.aliases();
        while (aliases.hasMoreElements()) {
            String alias = aliases.nextElement();
            Certificate cert = ks.getCertificate(alias);
            if (!(cert instanceof X509Certificate x509)) continue;
            boolean[] usage = x509.getKeyUsage();
            if (usage == null || !usage[0]) continue;

            CertInfo info = new CertInfo();
            info.setAlias(alias);
            info.setCn(extraerCN(x509.getSubjectX500Principal().getName()));
            info.setIssuer(extraerCN(x509.getIssuerX500Principal().getName()));
            info.setExpiry(new SimpleDateFormat("yyyy-MM-dd").format(x509.getNotAfter()));
            info.setSerial(x509.getSerialNumber().toString(16));
            info.setSource(source);
            result.add(info);
        }
        return result;
    }

    // =========================================================================
    // Firmar con distintas fuentes
    // =========================================================================

    private List<File> firmarConPKCS11(Conf conf, String pin, String alias,
                                        Map<String, String> params, List<File> archivos) throws FailedLoginException {
        Provider base = Security.getProvider("SunPKCS11");
        if (base == null) { Log.error("SunPKCS11 no disponible"); return List.of(); }

        for (Libs lib : conf.getLibs()) {
            for (String file : lib.getFiles()) {
                for (int slot = 0; slot < 10; slot++) {
                    try {
                        Map<String, String> cfg = Map.of("slot", String.valueOf(slot), "name", lib.getName(), "library", file);
                        Provider p = base.configure(ConfiguracionUtil.toConfFile(cfg));
                        Security.addProvider(p);
                        KeyStore ks = abrirKeyStore("PKCS11", p, pin);
                        if (ks == null) continue;

                        KeyPair kp = obtenerClaves(ks, alias, pin != null ? pin.toCharArray() : null);
                        if (kp == null) continue;

                        return procesarFirmas(archivos, kp.privateKey(), p, kp.cert(), params);
                    } catch (FailedLoginException e) {
                        throw e;
                    } catch (Exception ignored) {}
                }
            }
        }
        return List.of();
    }

    private List<File> firmarConStore(String storeType, Provider provider, String alias,
                                       Map<String, String> params, List<File> archivos) throws FailedLoginException {
        try {
            KeyStore ks = KeyStore.getInstance(storeType);
            ks.load(null, null);
            KeyPair kp = obtenerClaves(ks, alias, null);
            if (kp == null) return List.of();
            return procesarFirmas(archivos, kp.privateKey(), provider, kp.cert(), params);
        } catch (FailedLoginException e) {
            throw e;
        } catch (Exception e) {
            Log.error("Error al acceder al almacén " + storeType, e);
            return List.of();
        }
    }

    private List<File> firmarConPKCS12(String certFile, String pin, String alias,
                                        Map<String, String> params, List<File> archivos) throws FailedLoginException {
        if (certFile == null) { Log.error("cert-file no especificado"); return List.of(); }
        try {
            KeyStore ks = KeyStore.getInstance("PKCS12");
            try (FileInputStream fis = new FileInputStream(certFile)) {
                ks.load(fis, pin != null ? pin.toCharArray() : null);
            }
            KeyPair kp = obtenerClaves(ks, alias, pin != null ? pin.toCharArray() : null);
            if (kp == null) return List.of();
            return procesarFirmas(archivos, kp.privateKey(), null, kp.cert(), params);
        } catch (FailedLoginException e) {
            throw e;
        } catch (Exception e) {
            Log.error("Error al leer PKCS12", e);
            if (e.getMessage() != null && e.getMessage().toLowerCase().contains("password")) throw new FailedLoginException();
            return List.of();
        }
    }

    private List<File> firmarConNSS(String pin, String alias,
                                     Map<String, String> params, List<File> archivos) throws FailedLoginException {
        File configFile = null;
        Provider nssProvider = null;
        try {
            String nssPath = encontrarNSSPath();
            if (nssPath == null) { Log.error("NSS no encontrado"); return List.of(); }

            Provider base = Security.getProvider("SunPKCS11");
            if (base == null) return List.of();

            configFile = crearConfigNSS(nssPath);
            nssProvider = base.configure(configFile.getAbsolutePath());
            Security.addProvider(nssProvider);

            KeyStore ks = abrirKeyStore("PKCS11", nssProvider, pin);
            if (ks == null) return List.of();

            KeyPair kp = obtenerClaves(ks, alias, pin != null ? pin.toCharArray() : null);
            if (kp == null) return List.of();

            return procesarFirmas(archivos, kp.privateKey(), nssProvider, kp.cert(), params);
        } catch (FailedLoginException e) {
            throw e;
        } catch (Exception e) {
            Log.warn("NSS no disponible: " + e.getMessage());
            return List.of();
        } finally {
            limpiarNSS(nssProvider, configFile);
        }
    }

    // =========================================================================
    // Helpers de KeyStore
    // =========================================================================

    private KeyStore abrirKeyStore(String type, Provider provider, String pin) {
        try {
            KeyStore ks = provider != null ? KeyStore.getInstance(type, provider) : KeyStore.getInstance(type);
            ks.load(null, pin != null ? pin.toCharArray() : null);
            return ks;
        } catch (Exception e) {
            return null;
        }
    }

    /** Obtiene la clave privada y certificado del alias indicado (o el primero válido). */
    private KeyPair obtenerClaves(KeyStore ks, String alias, char[] pin) throws Exception {
        if (alias != null) {
            Certificate cert = ks.getCertificate(alias);
            Key key = ks.getKey(alias, pin);
            if (cert instanceof X509Certificate && key instanceof PrivateKey pk) {
                return new KeyPair(pk, cert);
            }
        }
        // Buscar el primero con capacidad de firma digital
        Enumeration<String> aliases = ks.aliases();
        while (aliases.hasMoreElements()) {
            String a = aliases.nextElement();
            Certificate cert = ks.getCertificate(a);
            if (!(cert instanceof X509Certificate x509)) continue;
            boolean[] usage = x509.getKeyUsage();
            if (usage == null || !usage[0]) continue;
            Key key = ks.getKey(a, pin);
            if (key instanceof PrivateKey pk) return new KeyPair(pk, cert);
        }
        return null;
    }

    private record KeyPair(PrivateKey privateKey, Certificate cert) {}

    // =========================================================================
    // Firma de archivos
    // =========================================================================

    private List<File> procesarFirmas(List<File> archivos, PrivateKey key, Provider provider,
                                       Certificate cert, Map<String, String> params) {
        List<File> firmados = new ArrayList<>();
        for (File archivo : archivos) {
            if (!archivo.exists()) continue;
            File firmado = firmarArchivo(archivo, key, provider, cert, params);
            if (firmado != null) firmados.add(firmado);
        }
        return firmados;
    }

    private File firmarArchivo(File archivo, PrivateKey key, Provider provider,
                                Certificate cert, Map<String, String> params) {
        String destino = params.containsKey("destino") ? params.get("destino") : ConfiguracionUtil.getDirFirmados();

        PdfReader pdf = null;
        ByteArrayOutputStream fos = null;
        PdfStamper stp = null;
        try {
            pdf = new PdfReader(archivo.getCanonicalPath());
            fos = new ByteArrayOutputStream();
            stp = PdfStamper.createSignature(pdf, fos, '\0');
            PdfSignatureAppearance sap = stp.getSignatureAppearance();

            Map<String, Float> pos = AparienciaUtil.getPosicion(params, pdf);
            sap.setVisibleSignature(
                new Rectangle(pos.get("eix"), pos.get("eiy"), pos.get("esx"), pos.get("esy")),
                pos.get("pagina").intValue(), null
            );
            sap.setCertificate(cert);

            byte[] imgBytes = AparienciaUtil.getImagen(params);
            if (imgBytes == null) {
                X509Certificate x509 = (X509Certificate) cert;
                String dn = x509.getSubjectX500Principal().getName();
                int qrSize = pos.get("hqr").intValue();
                ByteArrayOutputStream qr = QRCode.from(dn).withSize(qrSize, qrSize).stream();
                sap.setSignatureGraphic(Image.getInstance(qr.toByteArray()));
                sap.setRenderingMode(PdfSignatureAppearance.RenderingMode.GRAPHIC_AND_DESCRIPTION);
                sap.setLayer2Text(buildSignatureText(dn));
            } else {
                sap.setSignatureGraphic(Image.getInstance(imgBytes));
                sap.setRenderingMode(PdfSignatureAppearance.RenderingMode.GRAPHIC);
            }

            sap.setCertificationLevel(PdfSignatureAppearance.CERTIFIED_NO_CHANGES_ALLOWED);

            String providerName = provider != null ? provider.getName() : null;
            ExternalSignature es = new PrivateKeySignature(key, "SHA-256", providerName);
            MakeSignature.signDetached(sap, new BouncyCastleDigest(), es,
                new Certificate[]{cert}, null, null, null, 0, MakeSignature.CryptoStandard.CMS);

            stp.close();
            stp = null;

            File salida = new File(destino + ConfiguracionUtil.SLASH + archivo.getName());
            FileUtils.writeByteArrayToFile(salida, fos.toByteArray());
            Log.info("Firmado: " + salida.getAbsolutePath());
            return salida;

        } catch (Exception e) {
            Log.error("Error al firmar " + archivo.getName(), e);
            return null;
        } finally {
            try { if (stp != null) stp.close(); } catch (Exception ignored) {}
            if (pdf != null) pdf.close();
            try { if (fos != null) fos.close(); } catch (Exception ignored) {}
        }
    }

    private String buildSignatureText(String dn) {
        Map<String, String> datos = new HashMap<>(Map.of("APELLIDOS", "", "NOMBRES", "", "SERIAL", "", "FECHA", ""));
        for (String part : dn.split(",")) {
            if (part.contains("SURNAME="))     datos.put("APELLIDOS", part.replace("SURNAME=", "").trim());
            if (part.contains("GIVENNAME="))   datos.put("NOMBRES",   part.replace("GIVENNAME=", "").trim());
            if (part.contains("SERIALNUMBER="))datos.put("SERIAL",    part.replace("SERIALNUMBER=", "").trim());
        }
        String serial = datos.get("SERIAL");
        if (serial.contains("CI")) serial = serial.replace("CI", "CI ").trim();
        datos.put("SERIAL", serial);
        datos.put("FECHA", ConfiguracionUtil.ahora());

        return "Firmado digitalmente por:\n" + datos.get("APELLIDOS") +
               (datos.get("NOMBRES").isEmpty()  ? "" : ", " + datos.get("NOMBRES")) +
               (datos.get("SERIAL").isEmpty()   ? "" : "\n" + datos.get("SERIAL")) +
               (datos.get("FECHA").isEmpty()    ? "" : "\n" + datos.get("FECHA"));
    }

    // =========================================================================
    // Cachear archivos
    // =========================================================================

    private List<File> cachearArchivos(Map<String, String> params, Long dto, Long rto) {
        String cache = ConfiguracionUtil.getDirCache();
        List<File> result = new ArrayList<>();

        if (params.containsKey("archivo") || params.containsKey("archivos")) {
            String[] paths = params.containsKey("archivo")
                ? new String[]{params.get("archivo")}
                : params.get("archivos").split(",");

            for (String path : paths) {
                try {
                    File src = new File(path.trim());
                    File dst = new File(cache + ConfiguracionUtil.SLASH + src.getName());
                    if (!src.equals(dst)) {
                        FileUtils.deleteQuietly(dst);
                        FileUtils.copyFile(src, dst);
                    }
                    result.add(dst);
                } catch (IOException e) {
                    Log.error("Error al copiar " + path, e);
                }
            }
            return result;
        }

        if (params.containsKey("archivo-uri")) {
            String uri = params.get("archivo-uri");
            String nombre = params.containsKey("archivo-nombre")
                ? params.get("archivo-nombre").trim()
                : FilenameUtils.getName(uri);
            String dest = cache + ConfiguracionUtil.SLASH + nombre;

            Map<String, String> headers = Map.of();
            if (params.containsKey("archivo-headers")) {
                try { headers = WebUtil.getHeaders(params.get("archivo-headers")); }
                catch (JsonProcessingException e) { Log.error("Headers inválidos", e); return List.of(); }
            }

            boolean ok = headers.isEmpty()
                ? WebUtil.descargar(uri, dest, dto, rto)
                : WebUtil.descargar(uri, dest, headers, dto, rto);

            if (ok) result.add(new File(dest));
        }

        return result;
    }

    // =========================================================================
    // Callback upload
    // =========================================================================

    private String subirFirmados(List<File> firmados, Map<String, String> params) {
        if (!params.containsKey("callback-api")) return null;

        Map<String, String> headers = Map.of();
        Map<String, String> cbParams = Map.of();
        try {
            if (params.containsKey("callback-headers"))    headers  = WebUtil.getHeaders(params.get("callback-headers"));
            if (params.containsKey("callback-parameters")) cbParams = WebUtil.getHeaders(params.get("callback-parameters"));
        } catch (JsonProcessingException e) {
            Log.error("Headers de callback inválidos", e);
            return null;
        }

        StringBuilder sb = new StringBuilder();
        for (File f : firmados) {
            String res = WebUtil.upload(f, params.get("callback-api"), headers, cbParams);
            if (res != null && !res.isBlank()) {
                if (!sb.isEmpty()) sb.append(",");
                sb.append("{\"archivo\":\"").append(f.getName()).append("\",\"resultado\":\"").append(res).append("\"}");
            }
        }
        return sb.isEmpty() ? null : "[" + sb + "]";
    }

    // =========================================================================
    // NSS helpers
    // =========================================================================

    private String encontrarNSSPath() {
        String home = System.getProperty("user.home");
        String[] locations = {
            home + "/.mozilla/firefox",
            home + "/.pki/nssdb",
            home + "/snap/firefox/common/.mozilla/firefox"
        };
        for (String loc : locations) {
            File dir = new File(loc);
            if (!dir.exists()) continue;
            if (loc.contains("firefox")) {
                File[] profiles = dir.listFiles((d, n) ->
                    n.endsWith(".default") || n.endsWith(".default-release") || n.endsWith(".default-esr"));
                if (profiles != null) {
                    for (File p : profiles) {
                        if (new File(p, "cert9.db").exists()) return p.getAbsolutePath();
                    }
                }
            } else if (new File(dir, "cert9.db").exists()) {
                return loc;
            }
        }
        return null;
    }

    private File crearConfigNSS(String nssPath) throws IOException {
        File cfg = File.createTempFile("bic-nss-", ".cfg");
        cfg.deleteOnExit();
        Files.writeString(cfg.toPath(),
            "name = NSS\nnssSecmodDirectory = " + nssPath + "\nnssDbMode = readOnly\nattributes = compatibility\n");
        return cfg;
    }

    private void limpiarNSS(Provider provider, File configFile) {
        if (provider != null) {
            try { Security.removeProvider(provider.getName()); } catch (Exception ignored) {}
        }
        if (configFile != null) configFile.delete();
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    private String extraerCN(String dn) {
        for (String part : dn.split(",")) {
            if (part.trim().startsWith("CN=")) return part.trim().substring(3);
        }
        return dn;
    }
}
