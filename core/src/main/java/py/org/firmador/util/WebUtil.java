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

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

public class WebUtil {

    /**
     * Sube un archivo firmado al callback-api.
     * Los parámetros con valor "{data}" se reemplazan por el binario del archivo.
     */
    public static String upload(File file, String uri, Map<String, String> headers, Map<String, String> parameters) {
        MultipartEntityBuilder builder = MultipartEntityBuilder.create();
        builder.setMode(HttpMultipartMode.LEGACY);

        for (Map.Entry<String, String> e : parameters.entrySet()) {
            if ("{data}".equals(e.getValue())) {
                builder.addBinaryBody(e.getKey(), file, ContentType.DEFAULT_BINARY, file.getName());
            } else {
                builder.addTextBody(e.getKey(), e.getValue());
            }
        }

        HttpPost post = new HttpPost(uri);
        headers.forEach(post::addHeader);
        post.setEntity(builder.build());

        try (CloseableHttpClient client = HttpClientBuilder.create().build();
             CloseableHttpResponse response = (CloseableHttpResponse) client.execute(post)) {
            int code = response.getCode();
            if (code >= 200 && code < 300) {
                HttpEntity entity = response.getEntity();
                return entity != null ? entity.toString() : "";
            }
            Log.error("HTTP " + code + " al subir a " + uri);
            return null;
        } catch (IOException e) {
            Log.error("Error al subir archivo a " + uri, e);
            return null;
        }
    }

    public static boolean descargar(String origen, String destino, Long dto, Long rto) {
        try {
            FileUtils.copyURLToFile(new URL(origen), new File(destino), dto.intValue(), rto.intValue());
            return true;
        } catch (IOException e) {
            Log.error("Error al descargar " + origen, e);
            return false;
        }
    }

    public static boolean descargar(String origen, String destino, Map<String, String> headers, Long dto, Long rto) {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(origen).openConnection();
            conn.setConnectTimeout(dto.intValue());
            conn.setReadTimeout(rto.intValue());
            if (headers != null) headers.forEach(conn::setRequestProperty);

            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) {
                Log.error("HTTP " + conn.getResponseCode() + " al descargar " + origen);
                return false;
            }

            try (InputStream in = conn.getInputStream();
                 FileOutputStream out = new FileOutputStream(destino)) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
            }
            conn.disconnect();
            return true;
        } catch (IOException e) {
            Log.error("Error al descargar " + origen, e);
            return false;
        }
    }

    @SuppressWarnings("unchecked")
    public static Map<String, String> getHeaders(String json) throws JsonProcessingException {
        if (json == null) return Map.of();
        return new ObjectMapper().readValue(json, Map.class);
    }
}
