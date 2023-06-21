package py.org.firmador;

import py.org.firmador.util.PropertiesUtil;

import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.ResourceBundle;

public class Test {

    public static void main( String[] args ) throws Exception{
        ResourceBundle bicConf = ResourceBundle.getBundle("bic");
        Map<String,List<String>> libs = PropertiesUtil.getLibraries(bicConf);
        for(Map.Entry<String,List<String>> entry : libs.entrySet()){
            for(String file : entry.getValue())
                Log.info("Archivo tipo " + entry.getKey() + " : " + file);
        }
    }
}
