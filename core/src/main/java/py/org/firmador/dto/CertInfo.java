package py.org.firmador.dto;

import lombok.Data;

/**
 * Información de un certificado disponible para firma.
 * Se usa para que Electron liste los certificados y el usuario elija uno.
 */
@Data
public class CertInfo {
    private String alias;
    private String cn;          // Common Name del sujeto
    private String issuer;      // CN del emisor
    private String expiry;      // Fecha de vencimiento yyyy-MM-dd
    private String serial;      // Número de serie del certificado
    private String source;      // "pkcs11" | "windows-store" | "pkcs12" | "nss"
}
