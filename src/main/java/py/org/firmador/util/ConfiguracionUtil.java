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
import java.text.SimpleDateFormat;
import java.util.*;

public class ConfiguracionUtil {
    public static final String WIN="win";
    public static final String LINUX="ux";
    public static final String MAC="mac";

    public static final String SLASH = File.separator;

    public static final String HOME = System.getProperty("user.home");

    public static Conf init() throws UnsupportedPlatformException{
        Conf out = init(false);
        return out;
    }

    private static Conf leerPropiedades(String file){
        ObjectMapper mapper = new ObjectMapper();
        Conf conf = null;
        try {
            conf = mapper.readValue(new File(file), Conf.class);
        }catch(IOException ioe){
            Log.error("Error al leer la configuracion", ioe);
            System.exit(1);
        }
        return conf;
    }

    public static String toConfFile(Map<String,String> confs){

            // Obtenemos la ruta temporal del sistema para crear el archivo de configuracion
            String tmp = HOME + SLASH + ".bic" + SLASH + "bic.cfg";
            File cfg = new File(tmp);

            // Elimina la configuracion previamente configurada, si pasamos parametros
            if (confs != null)
                FileUtils.deleteQuietly(cfg);

            // Si existe el archivo, significa que es una configuracion previa
            if (cfg.exists())
                return tmp;

            if (confs == null)
                return null;

            // Si no hay configuracion previa se crea una nueva y se retorna esta
            // configuracion
            try (OutputStream output = new FileOutputStream(tmp)) {
                for (Map.Entry<String, String> entrada : confs.entrySet())
                    FileUtils.writeByteArrayToFile(cfg, (entrada.toString() + "\n").getBytes(), true);

            } catch (IOException io) {
                Log.error("Error al escribir " + tmp, io);
                return "";
            }

            return tmp;
    }


    public static String getDirCache(){
        String path = HOME + SLASH + ".bic" + SLASH + "cache";
        File file = new File(path);
        if(!file.exists()) file.mkdir();
        return path;
    }

    public static String getDirFirmados(){
        String path = HOME + SLASH + ".bic" + SLASH + "firmados";
        File file = new File(path);
        if(!file.exists()) file.mkdir();
        return path;
    }

    public static Conf init(boolean reload) throws UnsupportedPlatformException {
        ResourceBundle bicConf = ResourceBundle.getBundle("bic");
        File conf = new File(HOME + SLASH + ".bic" + SLASH + "bic.json");
        Conf configuracion = null;
        Map<String,List<String>> drivers = null;
        if(conf.exists() && !reload) {
            configuracion = leerPropiedades(conf.getAbsolutePath());
            return configuracion;
        }else{
            File bicHome = new File(HOME + SLASH + ".bic");
            bicHome.mkdir();
            drivers = getLibraries(bicConf);
        }
        String retorno = null;
        try {
            Map<String, Object> params = new HashMap<>();
            String downloadTimeout = bicConf.getString("download.timeout");
            String uploadTimeout = bicConf.getString("read.timeout");
            params.put("download.timeout", Long.valueOf(downloadTimeout));
            params.put("read.timeout", Long.valueOf(uploadTimeout));
            retorno = getJsonConf(drivers, params);
            if(retorno == null){
                Log.error("La configuración no es válida, debe inicializar la aplicación");
                System.exit(1);
                return null;
            }
            FileUtils.writeByteArrayToFile(conf, retorno.getBytes());
            configuracion = leerPropiedades(conf.getAbsolutePath());
        }catch(IOException e){
            Log.error("No se pudo detectar librerias", e);
            System.exit(1);
        }
        Log.info("conf en json: " + retorno);

        return configuracion;
    }

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

    private static void find(File raiz, String[] buscados, List<File> encontrados, List<String> excluidos){
        if(raiz == null) return;
        List<File> archivos = new ArrayList<>();
        try{
            for(File f : raiz.listFiles()){
                if(f.isFile()){
                    for(String buscado: buscados){
                        if(f.getName().equals(buscado) && !f.getName().endsWith(".conf")){
                            archivos.add(f);
                            break;
                        }
                    }
                }
            }
        }catch(Exception ex){
            return;
        }

        encontrados.addAll(archivos);

        if(raiz.listFiles() != null) {
            for (File dir : raiz.listFiles()) {
                if (!dir.isFile() && !excluidos.contains(dir.getName().toLowerCase().trim())) {
                    find(dir, buscados, encontrados, excluidos);
                }
            }
        }
    }

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

    public static String getOS() throws UnsupportedPlatformException {
        String os = System.getProperty("os.name", "generic").toLowerCase();
        if(os.contains("win")) return WIN;
        if(os.contains("nux")) return LINUX;
        if(os.contains("mac") || os.contains("darwin")) return MAC;
        throw new UnsupportedPlatformException("Sistema Operativo no soportado");
    }

    public static String ahora(){
        ResourceBundle bicConf = ResourceBundle.getBundle("bic");
        String server = bicConf.getString("ntp.server");
        NTPUDPClient client = new NTPUDPClient();
        SimpleDateFormat sdf = new SimpleDateFormat("dd/MM/yyyy HH:mm:ss");

        // We want to timeout if a response takes longer than 10 seconds
        client.setDefaultTimeout(10_000);
        Long offset = 0L;
        try {
            InetAddress inetAddress = InetAddress.getByName(server);
            TimeInfo timeInfo = client.getTime(inetAddress);
            timeInfo.computeDetails();
            if (timeInfo.getOffset() != null) {
                timeInfo = timeInfo;
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
