package py.org.firmador;

import java.util.HashMap;
import java.util.Map;
import java.util.Map.Entry;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import py.org.firmador.birome.Firmador;
import py.org.firmador.birome.FirmadorImpl;
import py.org.firmador.dto.Resultado;

public class App {
    public static void main( String[] args ){
        if(args == null || args.length == 0){
            Log.error("Debe definir parametros!");
            System.exit(1);
        }

        Map<String,String> parametros = new HashMap<>();
        for(String par : args){
            Entry<String,String> entrada = checkParametro(par);
            if(entrada == null) System.exit(1);
            parametros.put(entrada.getKey(), entrada.getValue());
        }

        Firmador bic = new FirmadorImpl();
        Resultado res = bic.firmar(parametros);

        ObjectMapper mapper = new ObjectMapper();

        String json = "";
        try{
            json = mapper.writeValueAsString(res);
        }catch(JsonProcessingException jpe){
            Log.error("Error al procesar respuesta", jpe);
            System.exit(1);
        }

        Log.info("Listo! " + json);
        System.exit(0);
    }

    private static Entry<String,String> checkParametro(String param){
        if(!param.startsWith("--") || !param.contains("=")){
            Log.error("Parametro " + param + " no es válido, debe contar con el siguiente formato: --parametro=valor");
            return null;
        }
        param = param.replace("--", "");
        String[] claveValor = param.split("=");
        String[] permitidos = Firmador.PARAMS;
        boolean existe = false;
        for(String par : permitidos){
            if(claveValor[0].equals(par)){
                existe = true;
                break;
            }
        }
        if(!existe){
            Log.error("Parametro " + claveValor[0] + " no es concido");
            return null;
        } 
        Map<String,String> retorno = new HashMap<>();
        retorno.put(claveValor[0], claveValor[1]);
        return retorno.entrySet().iterator().next();
    }

}
