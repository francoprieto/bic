package py.org.firmador;

import py.org.firmador.dto.Conf;
import py.org.firmador.util.ConfiguracionUtil;

import java.util.ResourceBundle;

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
        String archivos = "--archivos=C:\\Users\\franco\\Downloads\\test.pdf,C:\\Users\\franco\\Downloads\\factura ccpa.pdf";
        String destino = "--destino=C:\\Users\\franco\\Documents";

        if(!ConfiguracionUtil.getOS().equals(ConfiguracionUtil.WIN)){
            archivos = "--archivos=/Users/francoprieto/Downloads/test.pdf,/Users/francoprieto/Downloads/Fact Contado 0010140021559.pdf";
            destino = "--destino=/Users/francoprieto/Documents";
        }

        String posicion = "--posicion={\"lugar\":\"centro-superior\",\"pagina\":\"primera\"}";
        App.main(new String[]{"--pin=04209217", archivos, destino, posicion});

    }
}
