package py.org.firmador;

import java.util.HashMap;
import java.util.Map;
import java.util.Map.Entry;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import py.org.firmador.bic.Firmador;
import py.org.firmador.bic.FirmadorImpl;
import py.org.firmador.dto.Resultado;
import py.org.firmador.util.MensajeUtil;

/**
 * Aplicación principal para la firma digital de documentos.
 * Procesa los argumentos de línea de comandos, valida los parámetros y ejecuta la firma.
 */
public class App {
    /**
     * Método principal de la aplicación.
     * @param args Argumentos de línea de comandos en formato --parametro=valor
     */
    public static void main( String[] args ){
        if(args == null || args.length == 0){
            Log.error("Debe definir parametros!");
            System.exit(1);
        }

        Map<String,String> parametros = new HashMap<>();
        for(String par : args){
            Entry<String,String> entrada = checkParametro(par);
            if(entrada == null) {
                System.exit(2);
            }
            parametros.put(entrada.getKey(), entrada.getValue());
        }

        Firmador firmador = new FirmadorImpl();
        Resultado resultado = firmador.firmar(parametros);

        ObjectMapper mapper = new ObjectMapper();
        String json = "";
        try{
            json = mapper.writeValueAsString(resultado);
        }catch(JsonProcessingException jpe){
            Log.error("Error al procesar respuesta", jpe);
            System.exit(3);
        }
        boolean quiet = false;
        if(parametros.containsKey("quiet") && parametros.get("quiet").equals("true")) quiet = true;
        if(!quiet) MensajeUtil.showMessage(resultado);

        if(resultado.getTipo().equalsIgnoreCase("error")) {
            Log.error(json);
            System.exit(1);
        }else
            Log.info("Listo! " + json);

        System.exit(0);
    }

    /**
     * Valida y extrae el parámetro en formato --clave=valor.
     * @param param Parámetro recibido por línea de comandos
     * @return Entrada clave-valor válida, o null si el formato es incorrecto o el parámetro no es permitido
     */
    private static Entry<String,String> checkParametro(String param){
        if(param == null || !param.startsWith("--") || !param.contains("=")){
            Log.error("Parametro " + param + " no es válido, debe contar con el siguiente formato: --parametro=valor");
            return null;
        }
        param = param.replaceFirst("--", "");
        String[] claveValor = param.split("=", 2);
        if(claveValor.length != 2) {
            Log.error("Parametro " + param + " no es válido, debe contar con el siguiente formato: --parametro=valor");
            return null;
        }
        String[] permitidos = Firmador.PARAMS;
        boolean existe = false;
        for(String permitido : permitidos){
            if(claveValor[0].equals(permitido)){
                existe = true;
                break;
            }
        }
        if(!existe){
            Log.error("Parametro " + claveValor[0] + " no es conocido");
            return null;
        }
        Map<String,String> retorno = new HashMap<>();
        retorno.put(claveValor[0], claveValor[1]);
        return retorno.entrySet().iterator().next();
    }

}
