package py.org.firmador.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.commons.io.FileUtils;
import org.apache.commons.net.ntp.NTPUDPClient;
import org.apache.commons.net.ntp.TimeInfo;
import org.apache.commons.net.ntp.TimeStamp;
import py.org.firmador.Log;
import py.org.firmador.dto.Conf;
import py.org.firmador.dto.Libs;
import py.org.firmador.exceptions.UnsupportedPlatformException;

import java.io.*;
import java.net.InetAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.text.SimpleDateFormat;
import java.util.*;

/**
 * Utilidad para la configuración de la aplicación de firma digital.
 * Proporciona métodos para inicializar configuración, detectar librerías, obtener rutas y sincronizar fecha.
 */
public class ConfiguracionUtil {
    public static final String WIN="win";
    public static final String LINUX="ux";
    public static final String MAC="mac";

    public static final String SLASH = File.separator;

    public static final String HOME = System.getProperty("user.home");
    
    // Rutas comunes precalculadas
    private static final Path BIC_HOME_PATH = Paths.get(HOME, ".bic");
    private static final Path BIC_CONFIG_PATH = BIC_HOME_PATH.resolve("bic.json");
    private static final Path BIC_CACHE_PATH = BIC_HOME_PATH.resolve("cache");
    private static final Path BIC_FIRMADOS_PATH = BIC_HOME_PATH.resolve("firmados");
    private static final Path BIC_CFG_PATH = BIC_HOME_PATH.resolve("bic.cfg");

    /**
     * Inicializa la configuración desde archivo o recursos.
     * @return Objeto de configuración
     * @throws UnsupportedPlatformException Si el sistema operativo no es soportado
     */
    public static Conf init() throws UnsupportedPlatformException{
        return init(false);
    }

    /**
     * Lee las propiedades de configuración desde un archivo JSON.
     * @param file Ruta del archivo JSON
     * @return Objeto de configuración o null si ocurre un error
     */
    private static Conf leerPropiedades(String file){
        ObjectMapper mapper = new ObjectMapper();
        try {
            return mapper.readValue(new File(file), Conf.class);
        } catch(IOException ioe){
            Log.error("Error al leer la configuracion", ioe);
            return null;
        }
    }

    /**
     * Escribe un archivo de configuración temporal a partir de un mapa de parámetros.
     * @param confs Mapa de configuración
     * @return Ruta del archivo de configuración generado, o null si ocurre un error
     */
    public static String toConfFile(Map<String,String> confs){
        if (confs == null) {
            return null;
        }

        try {
            // Asegurar que el directorio .bic existe
            Files.createDirectories(BIC_HOME_PATH);
            
            // Eliminar archivo existente si hay uno
            Files.deleteIfExists(BIC_CFG_PATH);
            
            // Construir contenido
            StringBuilder content = new StringBuilder();
            for (Map.Entry<String, String> entrada : confs.entrySet()) {
                content.append(entrada.toString()).append("\n");
            }
            
            // Escribir archivo
            Files.write(BIC_CFG_PATH, content.toString().getBytes(StandardCharsets.UTF_8));
            return BIC_CFG_PATH.toString();
        } catch (IOException io) {
            Log.error("Error al escribir " + BIC_CFG_PATH, io);
            return null;
        }
    }


    /**
     * Obtiene el directorio de caché de la aplicación, creándolo si no existe.
     * @return Ruta del directorio de caché
     */
    public static String getDirCache(){
        return ensureDirectoryExists(BIC_CACHE_PATH);
    }

    /**
     * Obtiene el directorio de archivos firmados, creándolo si no existe.
     * @return Ruta del directorio de firmados
     */
    public static String getDirFirmados(){
        return ensureDirectoryExists(BIC_FIRMADOS_PATH);
    }

    /**
     * Asegura que un directorio exista, creándolo si es necesario.
     * @param path Path del directorio
     * @return Ruta del directorio como String
     */
    private static String ensureDirectoryExists(Path path){
        try {
            Files.createDirectories(path);
            return path.toString();
        } catch (IOException e) {
            Log.error("Error al crear directorio: " + path, e);
            return path.toString();
        }
    }

    /**
     * Asegura que un directorio exista, creándolo si es necesario.
     * @param pathStr Ruta del directorio como String
     * @return Ruta del directorio
     */
    private static String ensureDirectoryExists(String pathStr){
        return ensureDirectoryExists(Paths.get(pathStr));
    }

    /**
     * Inicializa la configuración, forzando recarga si se indica.
     * @param reload true para forzar recarga, false para usar configuración existente si está disponible
     * @return Objeto de configuración
     * @throws UnsupportedPlatformException Si el sistema operativo no es soportado
     */
    public static Conf init(boolean reload) throws UnsupportedPlatformException {
        // Si existe configuración y no se fuerza recarga, retornarla
        if (!reload && Files.exists(BIC_CONFIG_PATH)) {
            Conf configuracion = leerPropiedades(BIC_CONFIG_PATH.toString());
            if (configuracion != null) {
                return configuracion;
            }
        }

        // Asegurar que el directorio .bic existe
        try {
            Files.createDirectories(BIC_HOME_PATH);
        } catch (IOException e) {
            Log.error("No se pudo crear el directorio .bic", e);
            return null;
        }

        // Cargar configuración desde recursos
        ResourceBundle bicConf;
        try {
            bicConf = ResourceBundle.getBundle("bic");
        } catch (MissingResourceException e) {
            Log.error("No se pudo cargar el archivo de recursos bic.properties", e);
            return null;
        }

        // Obtener librerías del sistema
        Map<String, List<String>> drivers;
        try {
            drivers = getLibraries(bicConf);
        } catch (UnsupportedPlatformException e) {
            Log.error("Sistema operativo no soportado", e);
            throw e;
        }

        // Construir configuración JSON
        try {
            Map<String, Object> params = new HashMap<>();
            String downloadTimeout = bicConf.getString("download.timeout");
            String uploadTimeout = bicConf.getString("read.timeout");
            params.put("download.timeout", Long.valueOf(downloadTimeout));
            params.put("read.timeout", Long.valueOf(uploadTimeout));
            
            String jsonConf = getJsonConf(drivers, params);
            if (jsonConf == null) {
                Log.error("La configuración no es válida, debe inicializar la aplicación");
                return null;
            }

            // Escribir configuración a archivo
            Files.write(BIC_CONFIG_PATH, jsonConf.getBytes(StandardCharsets.UTF_8));
            
            Log.info("conf en json: " + jsonConf);
            
            // Leer y retornar configuración
            return leerPropiedades(BIC_CONFIG_PATH.toString());
        } catch (IOException e) {
            Log.error("No se pudo detectar librerías o escribir configuración", e);
            return null;
        }
    }

    /**
     * Busca las librerías necesarias según el sistema operativo y configuración.
     * @param bicConf ResourceBundle con la configuración
     * @return Mapa de librerías encontradas
     * @throws UnsupportedPlatformException Si el sistema operativo no es soportado
     */
    public static Map<String,List<String>> getLibraries(ResourceBundle bicConf) throws UnsupportedPlatformException {
        String os = getOS();
        String base = null;
        String excludeStrings = null;
        switch (os){
            case WIN:
                base = bicConf.getString(WIN);
                excludeStrings = bicConf.getString("win.exclude");
                os = WIN;
                break;
            case LINUX:
                base = bicConf.getString(LINUX);
                excludeStrings = bicConf.getString("ux.exclude");
                os = LINUX;
                break;
            case MAC:
                excludeStrings = bicConf.getString("mac.exclude");
                base = bicConf.getString(MAC);
                os = MAC;
                break;
            default:
                break;
        }
        if(base == null) return new HashMap<>();
        String[] excludes = new String[0];
        if(excludeStrings != null) excludes = excludeStrings.split(";");
        List<String> excluidos = new ArrayList<>();
        for(String exc : excludes)
            excluidos.add(exc.toLowerCase().trim());
        Map<String,String> libsCandidatas = new HashMap<>();
        int i = 0;
        while(i >= 0){
            String nombre = null;
            try{
                nombre = bicConf.getString(i + ".name");
            }catch(MissingResourceException mre){
                i = -1;
                break;
            }
            String lib = bicConf.getString(i + "." + os + "lib");
            libsCandidatas.put(nombre, lib);
            i++;
        }
        String[] paths = base.split(";");
        Map<String,List<String>> libs = new HashMap<>();
        Map<String,List<String>> buscados = new HashMap<>();
        for(Map.Entry<String,String> entrada: libsCandidatas.entrySet()){
            if(!buscados.containsKey(entrada.getKey())) buscados.put(entrada.getKey(), new ArrayList<String>());
            buscados.get(entrada.getKey()).add(entrada.getValue());
        }
        for(String path : paths){
            File raiz = new File(path);
            for(Map.Entry<String,List<String>> entrada : buscados.entrySet()) {
                String[] archivos = entrada.getValue().toArray(new String[0]);
                if (raiz.exists()) {
                    List<File> librerias = new ArrayList<>();
                    find(raiz, archivos, librerias, excluidos);
                    if (!librerias.isEmpty()) {
                        for (File file : librerias) {
                            if(!libs.containsKey(entrada.getKey())) libs.put(entrada.getKey(),new ArrayList<String>());
                            libs.get(entrada.getKey()).add(file.getAbsolutePath());
                        }
                    }
                }
            }
        }
        return libs;
    }

    /**
     * Busca recursivamente archivos en un directorio raíz que coincidan con los nombres dados, excluyendo carpetas.
     * @param raiz Directorio raíz
     * @param buscados Nombres de archivos a buscar
     * @param encontrados Lista donde se agregan los archivos encontrados
     * @param excluidos Lista de carpetas a excluir
     */
    private static void find(File raiz, String[] buscados, List<File> encontrados, List<String> excluidos){
        if(raiz == null || !raiz.exists()) {
            return;
        }
        
        File[] files = raiz.listFiles();
        if(files == null) {
            return;
        }
        
        for(File f : files){
            if(f.isFile()){
                for(String buscado: buscados){
                    if(f.getName().equals(buscado) && !f.getName().endsWith(".conf")){
                        encontrados.add(f);
                        break;
                    }
                }
            } else if(!excluidos.contains(f.getName().toLowerCase().trim())) {
                find(f, buscados, encontrados, excluidos);
            }
        }
    }

    /**
     * Genera un JSON de configuración a partir de un mapa de librerías y parámetros.
     * @param confMap Mapa de librerías
     * @param params Parámetros adicionales
     * @return String JSON de configuración
     * @throws JsonProcessingException Si ocurre un error al serializar
     */
    public static String getJsonConf(Map<String,List<String>> confMap, Map<String, Object> params) throws JsonProcessingException {
        if(confMap == null || confMap.isEmpty()) return null;
        Conf conf = new Conf();
        conf.setDownloadTimeout((Long)params.get("download.timeout"));
        conf.setReadTimeout((Long)params.get("read.timeout"));
        List<Libs> libs = new ArrayList<>();
        for(Map.Entry<String,List<String>> entrada : confMap.entrySet()){
            Libs lib = new Libs();
            lib.setName(entrada.getKey());
            lib.setFiles(entrada.getValue());
            libs.add(lib);
        }
        conf.setLibs(libs);
        ObjectMapper mapper = new ObjectMapper();
        return mapper.writeValueAsString(conf);
    }

    /**
     * Detecta el sistema operativo actual.
     * @return String identificador del sistema operativo
     * @throws UnsupportedPlatformException Si el sistema operativo no es soportado
     */
    public static String getOS() throws UnsupportedPlatformException {
        String os = System.getProperty("os.name", "generic").toLowerCase();
        if(os.contains("win")) return WIN;
        if(os.contains("nux")) return LINUX;
        if(os.contains("mac") || os.contains("darwin")) return MAC;
        throw new UnsupportedPlatformException("Sistema Operativo no soportado");
    }

    /**
     * Obtiene la fecha y hora actual, sincronizada con un servidor NTP si está configurado.
     * @return Fecha y hora en formato dd/MM/yyyy HH:mm:ss
     */
    public static String ahora(){
        ResourceBundle bicConf = ResourceBundle.getBundle("bic");
        String server = bicConf.getString("ntp.server");
        SimpleDateFormat sdf = new SimpleDateFormat("dd/MM/yyyy HH:mm:ss");
        if(server.isEmpty()) return sdf.format(new Date());
        NTPUDPClient client = new NTPUDPClient();
        // Timeout de 2 segundos
        client.setDefaultTimeout(2000);
        Long offset = 0L;
        try {
            InetAddress inetAddress = InetAddress.getByName(server);
            TimeInfo timeInfo = client.getTime(inetAddress);
            timeInfo.computeDetails();
            if (timeInfo.getOffset() != null) {
                offset = timeInfo.getOffset();
            }
            long currentTime = System.currentTimeMillis();
            TimeStamp atomicNtpTime = TimeStamp.getNtpTime(currentTime + offset);
            return sdf.format(atomicNtpTime.getTime());
        }catch(IOException ex){
            String out = sdf.format(new Date());
            Log.info("No se pudo obtener la fecha de " + server + " - retornamos " + out);
            return out;
        }
    }

}
