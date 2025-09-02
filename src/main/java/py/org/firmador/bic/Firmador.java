package py.org.firmador.bic;

import py.org.firmador.dto.Resultado;

import java.util.Map;

public interface Firmador {
    public static final String SUN_PKCS11_PROVIDER_NAME = "SunPKCS11";
    public static final String[] PARAMS={
            "pin"                   // 0 Pin del token
            , "archivo"             // 1 Archivo individual local a firmar
            , "archivos"            // 2 Lista de archivos locales a firmar separados con coma
            , "archivo-uri"         // 3 Uri de archivo a descargar y firmar
            , "archivo-headers"     // 4 Headers de archivo a descargar y firmar
            , "archivo-nombre"      // 5 Nombre del archivo descargado
            , "callback-api"        // 6 API de callback para envio de archivos firmados
            , "callback-headers"    // 7 JSON que representa el header del callback
            , "callback-parameters" // 8 JSON que representa los parametros del callback
            , "destino"             // 9 Directorio destino donde se guardan el o los archivos firmados
            , "posicion"            // 10 JSON que tiene parametros esquina inferior izquierda x,y, y esquina superior derecha x,y, ademas el número de pagina
            , "init"                // 11 init=true ejecuta el proceso de autoconfiguracion
            , "quiet"           // 12 quiet=true hace que el proceso no emita popups
    };

    public Resultado firmar(Map<String,String> parametros);
}
