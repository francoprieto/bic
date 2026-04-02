package py.org.firmador.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.itextpdf.text.Rectangle;
import com.itextpdf.text.pdf.PdfReader;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.io.IOUtils;
import py.org.firmador.Log;

import java.io.*;
import java.util.*;

public class AparienciaUtil {

    /**
     * Calcula las coordenadas del rectángulo de firma en el PDF.
     *
     * El parámetro "posicion" es un JSON con:
     *   pagina  : "primera" | "ultima" | número
     *   lugar   : "centro-inferior" | "centro-superior" |
     *             "esquina-superior-izquierda" | "esquina-superior-derecha" |
     *             "esquina-inferior-izquierda" | "esquina-inferior-derecha"
     *   ancho   : px (opcional)
     *   alto    : px (opcional)
     *   mt/mb/ml/mr : márgenes en px (opcional)
     *   imagen  : ruta absoluta a PNG (opcional)
     */
    public static Map<String, Float> getPosicion(Map<String, String> parametros, PdfReader pdf) {
        if (pdf == null) return Map.of();

        ResourceBundle conf = ResourceBundle.getBundle("bic");
        float height = Integer.parseInt(conf.getString("firma.alto"))  * 2 * 0.75f;
        float width  = Integer.parseInt(conf.getString("firma.ancho")) * 2 * 0.75f;
        float margin = Integer.parseInt(conf.getString("firma.margen")) * 0.75f;

        float mt = margin, mb = margin, ml = margin, mr = margin;
        String lugar = "centro-inferior";
        Map<String, Float> result = new HashMap<>();
        Rectangle cropBox = null;

        String posJson = parametros.get("posicion");
        if (posJson != null) {
            try {
                @SuppressWarnings("unchecked")
                Map<String, String> p = new ObjectMapper().readValue(posJson, Map.class);

                // Página
                String pagina = p.getOrDefault("pagina", "primera");
                int numPagina = switch (pagina) {
                    case "ultima" -> pdf.getNumberOfPages();
                    default -> {
                        try { yield Math.min(Integer.parseInt(pagina), pdf.getNumberOfPages()); }
                        catch (NumberFormatException e) { yield 1; }
                    }
                };
                result.put("pagina", (float) numPagina);
                cropBox = pdf.getCropBox(numPagina);

                if (p.containsKey("lugar"))  lugar  = p.get("lugar");
                if (p.containsKey("ancho"))  width  = Integer.parseInt(p.get("ancho"))  * 2 * 0.75f;
                if (p.containsKey("alto"))   height = Integer.parseInt(p.get("alto"))   * 2 * 0.75f;
                if (p.containsKey("mt"))     mt     = Integer.parseInt(p.get("mt"))     * 0.75f;
                if (p.containsKey("mb"))     mb     = Integer.parseInt(p.get("mb"))     * 0.75f;
                if (p.containsKey("ml"))     ml     = Integer.parseInt(p.get("ml"))     * 0.75f;
                if (p.containsKey("mr"))     mr     = Integer.parseInt(p.get("mr"))     * 0.75f;

            } catch (JsonProcessingException e) {
                Log.warn("Posición de firma inválida, usando valores por defecto");
            }
        }

        if (cropBox == null) {
            cropBox = pdf.getCropBox(1);
            result.put("pagina", 1f);
        }

        float pw = cropBox.getWidth();
        float ph = cropBox.getHeight();
        float pl = cropBox.getLeft();
        float pb = cropBox.getBottom();

        float llx, lly;
        switch (lugar) {
            case "centro-superior"            -> { llx = pl + (pw - width) / 2f; lly = pb + ph - mt - height; }
            case "esquina-superior-izquierda" -> { llx = pl + ml;                lly = pb + ph - mt - height; }
            case "esquina-superior-derecha"   -> { llx = pl + pw - mr - width;   lly = pb + ph - mt - height; }
            case "esquina-inferior-izquierda" -> { llx = pl + ml;                lly = pb + mb; }
            case "esquina-inferior-derecha"   -> { llx = pl + pw - mr - width;   lly = pb + mb; }
            default /* centro-inferior */     -> { llx = pl + (pw - width) / 2f; lly = pb + mb; }
        }

        result.put("eix", llx);
        result.put("eiy", lly);
        result.put("esx", llx + width);
        result.put("esy", lly + height);
        result.put("hqr", Math.min(height, width));

        return result;
    }

    /** Devuelve los bytes de la imagen de firma personalizada, o null si no hay. */
    public static byte[] getImagen(Map<String, String> parametros) {
        String posJson = parametros.get("posicion");
        if (posJson == null) return null;
        try {
            @SuppressWarnings("unchecked")
            Map<String, String> p = new ObjectMapper().readValue(posJson, Map.class);
            String imgPath = p.get("imagen");
            if (imgPath == null) return null;
            File img = new File(imgPath);
            if (img.isFile() && "png".equalsIgnoreCase(FilenameUtils.getExtension(img.getName()))) {
                return IOUtils.toByteArray(new FileInputStream(img));
            }
        } catch (IOException e) {
            Log.warn("No se pudo leer imagen de firma: " + e.getMessage());
        }
        return null;
    }
}
