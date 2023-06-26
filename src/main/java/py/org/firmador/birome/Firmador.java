package py.org.firmador.birome;

import java.util.Map;

public interface Firmador {
    
    public static final String[] PARAMS={
        "pin"               // 0 Pin del token
        , "archivo"         // 1 Archivo individual local a firmar
        , "archivos"        // 2 Lista de archivos locales a firmar separados con coma 
        , "archivo-uri"     // 3 Uri de archivo a descargar y firmar
        , "archivo-headers" // 4 Headers de archivo a descargar y firmar
        , "callback-api"    // 5 API de callback para envio de archivos firmados
        , "callback-headers"// 6 JSON que representa el header del callback
        , "callback-parameters" // 7 JSON que representa los parametros del callback
        , "posicion"        // 8 JSON quer tiene parametros x y de la posicion de la firma, ejemplo : {"x": 10, "y": 150}
        , "init"            // 9 init=true ejecuta el proceso de autoconfiguracion
    };

    public String firmar(Map<String,String> parametros);
}
