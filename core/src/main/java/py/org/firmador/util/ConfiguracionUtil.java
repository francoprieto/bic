package py.org.firmador.util;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.commons.io.FileUtils;
import org.apache.commons.net.ntp.NTPUDPClient;
import org.apache.commons.net.ntp.TimeInfo;
import py.org.firmador.Log;
import py.org.firmador.dto.Conf;
import py.org.firmador.dto.Libs;

import java.io.*;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.text.SimpleDateFormat;
import java.util.*;

public class ConfiguracionUtil {

    public static final String WIN   = "win";
    public static final String LINUX = "ux";
    public static final String MAC   = "mac";
    public static final String SLASH = File.separator;
    public static final String HOME  = System.getProperty("user.home");

    private static final Path BIC_HOME    = Paths.get(HOME, ".bic");
    private static final Path BIC_CONFIG  = BIC_HOME.resolve("bic.json");
    private static final Path BIC_CACHE   = BIC_HOME.resolve("cache");
    private static final Path BIC_SIGNED  = BIC_HOME.resolve("firmados");
    private static final Path BIC_CFG_TMP = BIC_HOME.resolve("bic.cfg");

    // -------------------------------------------------------------------------
    // Directorios
    // -------------------------------------------------------------------------

    public static String getDirCache() {
        try { Files.createDirectories(BIC_CACHE); } catch (IOException ignored) {}
        return BIC_CACHE.toString();
    }

    public static String getDirFirmados() {
        try { Files.createDirectories(BIC_SIGNED); } catch (IOException ignored) {}
        return BIC_SIGNED.toString();
    }

    // -------------------------------------------------------------------------
    // Sistema operativo
    // -------------------------------------------------------------------------

    public static String getOS() {
        String os = System.getProperty("os.name", "").toLowerCase();
        if (os.contains("win"))   return WIN;
        if (os.contains("mac"))   return MAC;
        if (os.contains("linux")) return LINUX;
        throw new IllegalStateException("Sistema operativo no soportado: " + os);
    }

    // -------------------------------------------------------------------------
    // Configuración PKCS11 (archivo temporal para SunPKCS11)
    // -------------------------------------------------------------------------

    public static String toConfFile(Map<String, String> confs) {
        try {
            Files.createDirectories(BIC_HOME);
            Files.deleteIfExists(BIC_CFG_TMP);
            StringBuilder sb = new StringBuilder();
            for (Map.Entry<String, String> e : confs.entrySet()) {
                sb.append(e.getKey()).append(" = ").append(e.getValue()).append("\n");
            }
            Files.write(BIC_CFG_TMP, sb.toString().getBytes(StandardCharsets.UTF_8));
            return BIC_CFG_TMP.toString();
        } catch (IOException e) {
            Log.error("Error al escribir archivo de configuración PKCS11", e);
            return null;
        }
    }

    // -------------------------------------------------------------------------
    // Inicialización / detección de librerías
    // -------------------------------------------------------------------------

    public static Conf init() {
        return init(false);
    }

    public static Conf init(boolean force) {
        try {
            Files.createDirectories(BIC_HOME);
            Files.createDirectories(BIC_CACHE);
            Files.createDirectories(BIC_SIGNED);
        } catch (IOException e) {
            Log.error("No se pudo crear directorio .bic", e);
        }

        if (!force && Files.exists(BIC_CONFIG)) {
            return leerConfig();
        }

        // Detectar librerías PKCS11 en el sistema
        ResourceBundle props = ResourceBundle.getBundle("bic");
        String os = getOS();
        String baseDir = props.getString(os);
        String excludeKey = os + ".exclude";
        Set<String> excludes = new HashSet<>();
        if (props.containsKey(excludeKey)) {
            excludes.addAll(Arrays.asList(props.getString(excludeKey).split(";")));
        }

        // Construir lista de tokens desde properties
        List<Libs> libs = new ArrayList<>();
        int i = 0;
        while (props.containsKey(i + ".name")) {
            String name    = props.getString(i + ".name");
            String libName = props.getString(i + "." + os + "lib");
            List<String> found = buscarLibrerias(baseDir, libName, excludes);
            if (!found.isEmpty()) {
                Libs lib = new Libs();
                lib.setName(name);
                lib.setFiles(found);
                libs.add(lib);
                Log.info("Librería encontrada: " + name + " -> " + found);
            }
            i++;
        }

        Conf conf = new Conf();
        conf.setDownloadTimeout(Long.parseLong(props.getString("download.timeout")));
        conf.setReadTimeout(Long.parseLong(props.getString("read.timeout")));
        conf.setLibs(libs);

        // Persistir
        try {
            ObjectMapper mapper = new ObjectMapper();
            mapper.writerWithDefaultPrettyPrinter().writeValue(BIC_CONFIG.toFile(), conf);
        } catch (IOException e) {
            Log.error("No se pudo guardar configuración", e);
        }

        return conf;
    }

    private static Conf leerConfig() {
        try {
            return new ObjectMapper().readValue(BIC_CONFIG.toFile(), Conf.class);
        } catch (IOException e) {
            Log.error("Error al leer bic.json, regenerando...", e);
            return init(true);
        }
    }

    private static List<String> buscarLibrerias(String baseDir, String libName, Set<String> excludes) {
        List<String> found = new ArrayList<>();
        File dir = new File(baseDir);
        if (!dir.exists()) return found;
        buscarRecursivo(dir, libName, excludes, found, 0);
        return found;
    }

    private static void buscarRecursivo(File dir, String libName, Set<String> excludes, List<String> found, int depth) {
        if (depth > 5) return;
        File[] entries = dir.listFiles();
        if (entries == null) return;
        for (File entry : entries) {
            if (entry.isDirectory()) {
                if (!excludes.contains(entry.getName())) {
                    buscarRecursivo(entry, libName, excludes, found, depth + 1);
                }
            } else if (entry.getName().equalsIgnoreCase(libName) || entry.getName().startsWith(libName)) {
                found.add(entry.getAbsolutePath());
            }
        }
    }

    // -------------------------------------------------------------------------
    // Fecha NTP
    // -------------------------------------------------------------------------

    public static String ahora() {
        try {
            ResourceBundle props = ResourceBundle.getBundle("bic");
            String ntpServer = props.getString("ntp.server");
            NTPUDPClient client = new NTPUDPClient();
            client.setDefaultTimeout(3000);
            client.open();
            TimeInfo info = client.getTime(InetAddress.getByName(ntpServer));
            info.computeDetails();
            long ntpTime = info.getMessage().getTransmitTimeStamp().getTime();
            client.close();
            return new SimpleDateFormat("dd/MM/yyyy HH:mm:ss").format(new Date(ntpTime));
        } catch (Exception e) {
            Log.warn("No se pudo obtener hora NTP, usando hora local");
            return new SimpleDateFormat("dd/MM/yyyy HH:mm:ss").format(new Date());
        }
    }
}
