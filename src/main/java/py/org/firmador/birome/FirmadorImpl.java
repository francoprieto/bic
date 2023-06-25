package py.org.firmador.birome;

import py.org.firmador.Log;
import py.org.firmador.dto.Conf;
import py.org.firmador.exceptions.UnsupportedPlatformException;
import py.org.firmador.util.ConfiguracionUtil;

import java.util.Map;

public class FirmadorImpl implements Firmador{
    public String firmar(Map<String,String> parametros){
        Conf configuracion = null;
        try {
            if (parametros.containsKey("init") && parametros.get("init").equals("true"))
                configuracion = ConfiguracionUtil.init(true);
            else
                configuracion = ConfiguracionUtil.init();
        }catch(UnsupportedPlatformException exception){
            Log.error("Plataforma no soportada");
            return "error";
        }



        return null;
    }
}
