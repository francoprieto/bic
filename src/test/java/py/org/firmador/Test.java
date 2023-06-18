package py.org.firmador;

import py.org.firmador.util.PropertiesUtil;

import java.io.File;
import java.util.List;
import java.util.Map;
import java.util.ResourceBundle;

public class Test {

    public static void main( String[] args ) throws Exception{
        ResourceBundle bicConf = ResourceBundle.getBundle("bic");
        String home = File.separator;
        Log.info("SLASH: " + home);
    }
}
