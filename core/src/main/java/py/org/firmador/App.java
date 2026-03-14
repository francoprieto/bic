package py.org.firmador;

import com.fasterxml.jackson.databind.ObjectMapper;
import py.org.firmador.bic.Firmador;
import py.org.firmador.bic.FirmadorImpl;
import py.org.firmador.dto.Resultado;

import java.util.*;

/**
 * Punto de entrada del JAR.
 *
 * Uso:
 *   java -jar bic-core.jar --cmd=init
 *   java -jar bic-core.jar --cmd=listar-certs --cert-source=pkcs11 --pin=1234
 *   java -jar bic-core.jar --cmd=firmar --archivos=/tmp/doc.pdf --pin=1234 --posicion={...}
 *
 * Siempre imprime un JSON en stdout como última línea:
 *   {"tipo":"ok","mensaje":"..."}
 *   {"tipo":"error","mensaje":"..."}
 */
public class App {

    public static void main(String[] args) {
        if (args == null || args.length == 0) {
            salir(Resultado.error("Sin parámetros. Use --cmd=init | --cmd=listar-certs | --cmd=firmar"), 1);
        }

        Map<String, String> params = new HashMap<>();
        for (String arg : args) {
            if (!arg.startsWith("--") || !arg.contains("=")) {
                salir(Resultado.error("Parámetro inválido: " + arg + ". Formato esperado: --clave=valor"), 2);
            }
            String[] kv = arg.substring(2).split("=", 2);
            if (!estaPermitido(kv[0])) {
                salir(Resultado.error("Parámetro desconocido: " + kv[0]), 2);
            }
            params.put(kv[0], kv[1]);
        }

        Firmador firmador = new FirmadorImpl();
        Resultado resultado = firmador.ejecutar(params);

        salir(resultado, resultado.getTipo().equals("error") ? 1 : 0);
    }

    private static boolean estaPermitido(String key) {
        return Arrays.asList(Firmador.PARAMS).contains(key);
    }

    private static void salir(Resultado resultado, int code) {
        try {
            String json = new ObjectMapper().writeValueAsString(resultado);
            // Siempre en stdout para que Electron lo capture fácilmente
            System.out.println("RESULT:" + json);
        } catch (Exception e) {
            System.out.println("RESULT:{\"tipo\":\"error\",\"mensaje\":\"Error interno\"}");
        }
        System.exit(code);
    }
}
