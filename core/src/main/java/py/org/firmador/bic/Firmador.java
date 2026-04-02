package py.org.firmador.bic;

import py.org.firmador.dto.Resultado;
import java.util.Map;

/**
 * Interfaz principal del firmador.
 *
 * Comandos disponibles (parámetro "cmd"):
 *   init          → Detecta librerías PKCS11 y guarda configuración
 *   listar-certs  → Lista certificados disponibles (para que Electron muestre selector)
 *   firmar        → Firma los archivos indicados
 *
 * Parámetros de firma:
 *   pin                  → PIN del token / contraseña del certificado
 *   archivo              → Ruta local de un PDF
 *   archivos             → Rutas locales separadas por coma
 *   archivo-uri          → URL de PDF a descargar y firmar
 *   archivo-headers      → JSON con headers para la descarga
 *   archivo-nombre       → Nombre del archivo descargado
 *   destino              → Directorio donde guardar los PDFs firmados
 *   posicion             → JSON con configuración de posición/apariencia de la firma
 *   callback-api         → URL a la que subir el PDF firmado
 *   callback-headers     → JSON con headers del callback
 *   callback-parameters  → JSON con parámetros del callback
 *   cert-source          → "pkcs11" | "windows-store" | "pkcs12" | "nss"
 *   cert-alias           → Alias del certificado a usar (de listar-certs)
 *   cert-file            → Ruta al archivo .p12/.pfx (solo para cert-source=pkcs12)
 *   quiet                → "true" suprime popups Swing
 */
public interface Firmador {

    String[] PARAMS = {
        "cmd",
        "pin",
        "archivo",
        "archivos",
        "archivo-uri",
        "archivo-headers",
        "archivo-nombre",
        "destino",
        "posicion",
        "callback-api",
        "callback-headers",
        "callback-parameters",
        "cert-source",
        "cert-alias",
        "cert-file",
        "quiet"
    };

    Resultado ejecutar(Map<String, String> params);
}
