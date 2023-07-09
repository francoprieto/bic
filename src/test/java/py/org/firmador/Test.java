package py.org.firmador;

import py.org.firmador.dto.Conf;
import py.org.firmador.util.ConfiguracionUtil;

import java.util.ResourceBundle;

public class Test {

    public static void main( String[] args ) throws Exception{

        String archivos = "--archivos=C:\\Users\\franco\\Downloads\\test.pdf";
        String destino = "--destino=C:\\Users\\franco\\Documents";

        if(!ConfiguracionUtil.getOS().equals(ConfiguracionUtil.WIN)){
            archivos = "--archivos=/Users/francoprieto/Downloads/test.pdf,/Users/francoprieto/Downloads/Fact Contado 0010140021559.pdf";
            destino = "--destino=/Users/francoprieto/Documents";
        }

        String posicion = "--posicion={\"lugar\":\"centro-superior\",\"pagina\":\"primera\"}";
        App.main(new String[]{"--pin=04209217", archivos, destino});

    }
}
