package py.org.firmador;

import org.apache.commons.net.ntp.NTPUDPClient;
import org.apache.commons.net.ntp.TimeInfo;
import org.apache.commons.net.ntp.TimeStamp;
import py.org.firmador.dto.Conf;
import py.org.firmador.util.ConfiguracionUtil;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.ResourceBundle;
import java.util.TimeZone;

public class Test {
/*
    public static void main( String[] args ) throws Exception{

        String archivos = "--archivos=C:\\Users\\franco\\Downloads\\test.pdf";
        String destino = "--destino=C:\\Users\\franco\\Documents";

        if(!ConfiguracionUtil.getOS().equals(ConfiguracionUtil.WIN)){
            archivos = "--archivos=/Users/francoprieto/Downloads/test.pdf,/Users/francoprieto/Downloads/Fact Contado 0010140021559.pdf";
            destino = "--destino=/Users/francoprieto/Documents";
        }

        String posicion = "--posicion={\"lugar\":\"centro-superior\",\"pagina\":\"primera\"}";
        App.main(new String[]{"--pin=04209217", archivos, destino});

    }*/
    public static String getCurrentDateTimeFromNTP() {
        try {
            URL url = new URL("http://worldtimeapi.org/api/timezone/Etc/UTC");
            HttpURLConnection con = (HttpURLConnection) url.openConnection();
            con.setRequestMethod("GET");
            BufferedReader in = new BufferedReader(new InputStreamReader(con.getInputStream()));
            String inputLine;
            StringBuilder content = new StringBuilder();
            while ((inputLine = in.readLine()) != null) {
                content.append(inputLine);
            }
            in.close();
            con.disconnect();
            // Parse UTC datetime from response
            String json = content.toString();
            String dateTime = json.split("\"datetime\":\"")[1].split("\"")[0];
            return dateTime;
        } catch (Exception e) {
            return "Error (HTTP Fallback): " + e.getMessage();
        }
    }

        // Example usage
        public static void main(String[] args) {
            System.out.println(getCurrentDateTimeFromNTP());
        }

}
