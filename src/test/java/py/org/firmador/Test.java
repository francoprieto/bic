package py.org.firmador;

import py.org.firmador.util.PropertiesUtil;

import java.util.List;
import java.util.Map;
import java.util.ResourceBundle;

public class Test {

    public static void main( String[] args ) throws Exception{
        ResourceBundle bicConf = ResourceBundle.getBundle("bic");
        Map<String, List<String>> params = PropertiesUtil.getLibraries(bicConf);
        for(Map.Entry<String, List<String>> entry: params.entrySet()){
            for(String archivo : entry.getValue())
                Log.info(entry.getKey() + " : " + archivo);
        }
    }
}
