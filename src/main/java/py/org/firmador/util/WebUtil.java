package py.org.firmador.util;

import org.apache.commons.io.FileUtils;
import py.org.firmador.Log;

import java.io.File;
import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;

public class WebUtil {

    public static boolean descargar(String origen, String destino, Long dto, Long rto) throws IOException {
        URL url = getArchivoURL(origen);
        if(url == null) return false;
        FileUtils.copyURLToFile(url, new File(destino), dto.intValue(), rto.intValue());
        return true;
    }

    private static URL getArchivoURL(String archivo) {
        URL url = null;
        try {
            url = new URL(archivo);
        } catch (MalformedURLException e) {
            Log.error("URL invalida: " + archivo);
        }
        return url;
    }

}
