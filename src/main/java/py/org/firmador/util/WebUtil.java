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
            if(entry.getValue().equals("{data}"))
                builder.addBinaryBody(entry.getKey(), file, ContentType.DEFAULT_BINARY, file.getName());
            else
                builder.addTextBody(entry.getKey(),entry.getValue());
        }
        HttpEntity entity = builder.build();
        HttpPost post = new HttpPost(uri);

        for(Map.Entry<String,String> entry : headers.entrySet())
            post.addHeader(entry.getKey(), entry.getValue());

        post.setEntity(entity);

        try(CloseableHttpClient client = HttpClientBuilder.create().build()){

            CloseableHttpResponse response = (CloseableHttpResponse) client.execute(post);
            if((response.getCode() + "").startsWith("2")){
                HttpEntity respuesta = response.getEntity();
                return respuesta.toString();
            }
            Log.error("Error HTTP " + response.getCode() + " al intentar realizar el upload a " + uri);
            System.exit(1);
        }catch(IOException ex){
            Log.error("Error al intentar realizar el upload a " + uri, ex);
            System.exit(1);
        }
        return "";
    }

    public static boolean descargar(String origen, String destino, Long dto, Long rto) throws IOException {
        URL url = getArchivoURL(origen);
        if(url == null) return false;
        FileUtils.copyURLToFile(url, new File(destino), dto.intValue(), rto.intValue());
        return true;
    }

    public static Map<String,String> getHeaders(String json) throws JsonProcessingException {
        if(json == null) return null;
        ObjectMapper mapper = new ObjectMapper();
        Map<String,String> headers =  mapper.readValue(json, Map.class);
        return headers;
    }

    public static boolean descargar(String origen, String destino, Map<String,String> headers, Long dto, Long rto) throws IOException {
        URL url = new URL(origen);
        HttpURLConnection httpConn = (HttpURLConnection) url.openConnection();

        if(headers != null && !headers.isEmpty()) {
            for(Map.Entry<String,String> entry : headers.entrySet())
                httpConn.setRequestProperty(entry.getKey(), entry.getValue());
        }

        int responseCode = httpConn.getResponseCode();

        // always check HTTP response code first
        if (responseCode == HttpURLConnection.HTTP_OK) {
            String fileName = "";
            String disposition = httpConn.getHeaderField("Content-Disposition");
            String contentType = httpConn.getContentType();
            int contentLength = httpConn.getContentLength();

            if (disposition != null) {
                // extracts file name from header field
                int index = disposition.indexOf("filename=");
                if (index > 0) {
                    fileName = disposition.substring(index + 10,
                            disposition.length() - 1);
                }
            } else {
                // extracts file name from URL
                fileName = origen.substring(origen.lastIndexOf("/") + 1,
                        origen.length());
            }

            // opens input stream from the HTTP connection
            InputStream inputStream = httpConn.getInputStream();
            String saveFilePath = destino;

            // opens an output stream to save into file
            FileOutputStream outputStream = new FileOutputStream(saveFilePath);

            int bytesRead = -1;
            byte[] buffer = new byte[4096];
            while ((bytesRead = inputStream.read(buffer)) != -1) {
                outputStream.write(buffer, 0, bytesRead);
            }

            outputStream.close();
            inputStream.close();
        } else {
            Log.error("No se encontró archivo para descargar");
            return false;
        }
        httpConn.disconnect();
        return true;
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
