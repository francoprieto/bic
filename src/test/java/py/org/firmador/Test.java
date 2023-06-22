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
<<<<<<< HEAD
        for(String key: libs.keySet()){
            Log.info(key + "------");
            for(String file : libs.get(key)){
                Log.info("--- " + file);
            }
=======
        for(Map.Entry<String,List<String>> entry : libs.entrySet()){
            for(String file : entry.getValue())
                Log.info("Archivo tipo " + entry.getKey() + " : " + file);
>>>>>>> ae61e71975d8d8c8566c24190db03a72003a7532
        }
    }
}
