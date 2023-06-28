package py.org.firmador;

import py.org.firmador.util.ConfiguracionUtil;

public class Test {

    public static void main( String[] args ) throws Exception{
        /*
        ResourceBundle bicConf = ResourceBundle.getBundle("bic");
        Map<String,List<String>> libs = PropertiesUtil.getLibraries(bicConf);
        for(Map.Entry<String,List<String>> entry : libs.entrySet()){
            for(String file : entry.getValue())
                Log.info("Archivo tipo " + entry.getKey() + " : " + file);
        }
         */
        App.main(new String[]{"--pin=04209217","--archivos=/Users/francoprieto/Downloads/test.pdf,/Users/francoprieto/Downloads/CARLOS PRIETO 178121 ESTUDIO.PDF","--destino=/Users/francoprieto/Documents"});
    }
}
