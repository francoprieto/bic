package py.org.firmador.birome;

import com.fasterxml.jackson.core.JsonProcessingException;
import org.apache.commons.io.FileUtils;
import org.apache.commons.io.FilenameUtils;
import py.org.firmador.Log;
import py.org.firmador.dto.Conf;
import py.org.firmador.exceptions.UnsupportedPlatformException;
import py.org.firmador.util.ConfiguracionUtil;
import py.org.firmador.util.WebUtil;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

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
    public String firmar(Map<String,String> parametros){
        Conf configuracion = null;
        try {
            if (parametros.containsKey("init") && parametros.get("init").equals("true"))
                configuracion = ConfiguracionUtil.init(true);
            else
                configuracion = ConfiguracionUtil.init();
        }catch(UnsupportedPlatformException exception){
            Log.error("Plataforma no soportada");
            return "error";
        }

        if(!this.validarParametrosArchivos(parametros)) return "error";

        List<File> archivos = null;
        try{
            archivos = this.cachearArchivos(parametros, configuracion.getDownloadTimeout(), configuracion.getReadTimeout());
        }catch(IOException ex){
            Log.error("Error al cacherar los archivos", ex);
            return "error";
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
