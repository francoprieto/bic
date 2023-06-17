package py.org.firmador.dto;

import lombok.Data;

@Data
public class Resultado {
    private String tipo;
    private String mensaje;
    public Resultado(String tipo, String mensaje){
        this.tipo = tipo;
        this.mensaje = mensaje;
    }
}
