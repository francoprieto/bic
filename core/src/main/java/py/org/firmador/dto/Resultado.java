package py.org.firmador.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import java.util.List;

@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class Resultado {
    private String tipo;       // "ok" | "error"
    private String mensaje;
    private List<CertInfo> certificados; // solo para el comando "listar-certs"

    public Resultado(String tipo, String mensaje) {
        this.tipo = tipo;
        this.mensaje = mensaje;
    }

    public static Resultado ok(String mensaje) {
        return new Resultado("ok", mensaje);
    }

    public static Resultado error(String mensaje) {
        return new Resultado("error", mensaje);
    }
}
