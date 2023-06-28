package py.org.firmador.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.commons.io.FileUtils;
import py.org.firmador.Log;
import py.org.firmador.dto.Conf;
import py.org.firmador.dto.Libs;
import py.org.firmador.exceptions.UnsupportedPlatformException;

import java.io.*;
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
        }
        return conf;
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
                return null;
            }
            FileUtils.writeByteArrayToFile(conf, retorno.getBytes());
            configuracion = leerPropiedades(conf.getAbsolutePath());
        }catch(IOException e){
            Log.error("No se pudo detectar librerias", e);
        }
        Log.info("conf en json: " + retorno);

        return configuracion;
    }

    public static Map<String,List<String>> getLibraries(ResourceBundle bicConf) throws UnsupportedPlatformException {
        String os = getOS();
        String base = null;
        switch (os){
            case WIN:
                base = bicConf.getString(WIN);
                os = WIN;
                break;
            case LINUX:
                base = bicConf.getString(LINUX);
                os = LINUX;
                break;
            case MAC:
                base = bicConf.getString(MAC);
                os = MAC;
                break;
            default:
                break;
        }

        if(base == null) return new HashMap<>();

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
                    find(raiz, archivos, librerias);
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

    private static void find(File raiz, String[] buscados, List<File> encontrados){
        if(raiz == null) return;
        List<File> archivos = new ArrayList<>();
        try{
            for(File f : raiz.listFiles()){
                if(f.isFile()){
                    for(String buscado: buscados){
                        if(f.getName().contains(buscado) && !f.getName().endsWith(".conf")){
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
                if (!dir.isFile()) {
                    find(dir, buscados, encontrados);
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

}
