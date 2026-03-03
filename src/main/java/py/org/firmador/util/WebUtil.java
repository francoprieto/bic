package py.org.firmador.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.commons.io.FileUtils;
import org.apache.hc.client5.http.classic.methods.HttpPost;
import org.apache.hc.client5.http.entity.mime.HttpMultipartMode;
import org.apache.hc.client5.http.entity.mime.MultipartEntityBuilder;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.CloseableHttpResponse;
import org.apache.hc.client5.http.impl.classic.HttpClientBuilder;
import org.apache.hc.core5.http.ContentType;
import org.apache.hc.core5.http.HttpEntity;
import py.org.firmador.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.Map;

public class WebUtil {

    public static String upload(File file, String uri, Map<String,String> headers, Map<String,String> parameters){
        MultipartEntityBuilder builder = MultipartEntityBuilder.create();
        builder.setMode(HttpMultipartMode.LEGACY);

        for(Map.Entry<String,String> entry : parameters.entrySet()){
            if(entry.getValue().equals("{data}")) {
                builder.addBinaryBody(entry.getKey(), file, ContentType.DEFAULT_BINARY, file.getName());
            } else {
                builder.addTextBody(entry.getKey(), entry.getValue());
            }
        }

        HttpEntity entity = builder.build();
        HttpPost post = new HttpPost(uri);

        for(Map.Entry<String,String> entry : headers.entrySet()) {
            post.addHeader(entry.getKey(), entry.getValue());
        }

        post.setEntity(entity);

        try(CloseableHttpClient client = HttpClientBuilder.create().build();
            CloseableHttpResponse response = (CloseableHttpResponse) client.execute(post)){

            int statusCode = response.getCode();
            if(statusCode >= 200 && statusCode < 300){
                HttpEntity respuesta = response.getEntity();
                return respuesta != null ? respuesta.toString() : "";
            }
            Log.error("Error HTTP " + statusCode + " al intentar realizar el upload a " + uri);
            return null;
        }catch(IOException ex){
            Log.error("Error al intentar realizar el upload a " + uri, ex);
            return null;
        }
    }


    public static boolean descargar(String origen, String destino, Long dto, Long rto) {
        try {
            URL url = getArchivoURL(origen);
            if(url == null) {
                return false;
            }
            FileUtils.copyURLToFile(url, new File(destino), dto.intValue(), rto.intValue());
            return true;
        } catch (IOException e) {
            Log.error("Error al descargar archivo desde " + origen, e);
            return false;
        }
    }


    public static Map<String,String> getHeaders(String json) throws JsonProcessingException {
        if(json == null) return null;
        ObjectMapper mapper = new ObjectMapper();
        Map<String,String> headers =  mapper.readValue(json, Map.class);
        return headers;
    }

    public static boolean descargar(String origen, String destino, Map<String,String> headers, Long dto, Long rto) {
        try {
            URL url = new URL(origen);
            HttpURLConnection httpConn = (HttpURLConnection) url.openConnection();

            if(headers != null && !headers.isEmpty()) {
                for(Map.Entry<String,String> entry : headers.entrySet()) {
                    httpConn.setRequestProperty(entry.getKey(), entry.getValue());
                }
            }

            int responseCode = httpConn.getResponseCode();

            if (responseCode == HttpURLConnection.HTTP_OK) {
                InputStream inputStream = httpConn.getInputStream();
                FileOutputStream outputStream = new FileOutputStream(destino);

                try {
                    byte[] buffer = new byte[4096];
                    int bytesRead;
                    while ((bytesRead = inputStream.read(buffer)) != -1) {
                        outputStream.write(buffer, 0, bytesRead);
                    }
                } finally {
                    outputStream.close();
                    inputStream.close();
                }
                
                httpConn.disconnect();
                return true;
            } else {
                Log.error("No se encontró archivo para descargar. HTTP " + responseCode);
                httpConn.disconnect();
                return false;
            }
        } catch (IOException e) {
            Log.error("Error al descargar archivo desde " + origen, e);
            return false;
        }
    }

    private static URL getArchivoURL(String archivo) {
        URL url = null;
        try {
            url = new URL(archivo);
        } catch (MalformedURLException e) {
            Log.error("URL invalida: " + archivo);
        }
        return url;
    }

}
