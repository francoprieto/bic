package py.org.firmador.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.itextpdf.text.Rectangle;
import com.itextpdf.text.pdf.PdfReader;
import org.apache.commons.io.FilenameUtils;
import org.apache.commons.io.IOUtils;
import py.org.firmador.Log;
import py.org.firmador.bic.FirmadorImpl;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;
import java.util.ResourceBundle;

public class AparienciaUtil {


    /**
     * Obtiene la posición de la firma en el PDF según los parámetros.
     * @param parametros Parámetros de la firma
     * @param pdf Lector PDF
     * @return Mapa con las coordenadas y página
     */
    public static Map<String, Float> getPosicion(Map<String,String> parametros, PdfReader pdf){

        if(pdf == null) return new HashMap<>();
        ResourceBundle conf = ResourceBundle.getBundle("bic");
        Integer h = Integer.valueOf(conf.getString("firma.alto"));
        float height = h * 0.75f;
        Integer w = Integer.valueOf(conf.getString("firma.ancho"));
        float width = w * 0.75f;

        float margin = Integer.valueOf(conf.getString("firma.margen")) * 0.75f;



        float marginTop = margin;
        float marginBottom = margin;
        float marginLeft = margin;
        float marginRight = margin;


        Map<String, Float> retorno = new HashMap<>();
        Rectangle cropBox = null;
        String pos = "";

        if(parametros.containsKey(FirmadorImpl.PARAM_POSICION) && parametros.get(FirmadorImpl.PARAM_POSICION) != null){
            ObjectMapper mapper = new ObjectMapper();
            try {

                Map<String, String> cp = mapper.readValue(parametros.get(FirmadorImpl.PARAM_POSICION), Map.class);

                if(cp.containsKey("pagina")){
                    if(cp.get("pagina").equals("primera")){
                        retorno.put("pagina",1f);
                        cropBox = pdf.getCropBox(1);
                    }else if(cp.get("pagina").equals("ultima")) {
                        retorno.put("pagina", (float) pdf.getNumberOfPages());
                        cropBox = pdf.getCropBox(pdf.getNumberOfPages());
                    }else{
                        String pag = cp.get("pagina");
                        Integer ip = Integer.valueOf(pag);
                        if(ip.intValue() > pdf.getNumberOfPages()) ip = pdf.getNumberOfPages();
                        retorno.put("pagina",Float.valueOf(ip));
                        cropBox = pdf.getCropBox(ip);
                    }
                }
                if(cp.containsKey("lugar") && cp.get("lugar").trim().length() > 0)
                    pos = cp.get("lugar").trim();

                if(cp.containsKey("ancho") && cp.get("ancho") != null) {
                    w = Integer.valueOf(cp.get("ancho"));
                    width = w * 0.75f;
                }
                if(cp.containsKey("alto") && cp.get("alto") != null){
                    h = Integer.valueOf(cp.get("alto"));
                    height = h * 0.75f;
                }
                if(cp.containsKey("mt") && cp.get("mt") != null)
                    marginTop = Integer.valueOf(cp.get("mt")) * 0.75f;
                if(cp.containsKey("mb") && cp.get("mb") != null)
                    marginBottom = Integer.valueOf(cp.get("mb")) * 0.75f;
                if(cp.containsKey("ml") && cp.get("ml") != null)
                    marginLeft = Integer.valueOf(cp.get("ml")) * 0.75f;
                if(cp.containsKey("mr") && cp.get("mr") != null)
                    marginRight = Integer.valueOf(cp.get("mr")) * 0.75f;

            }catch(JsonProcessingException jpe){
                Log.warn("Posicion de la firma invalida, se asume valores por defecto!");
            }
        }

        if(cropBox == null){
            cropBox = pdf.getCropBox(1);
            retorno.put("pagina",1f);
        }

        if(cropBox != null){

            Float mitadFirmaFloat = width / 2f;
            Float mitadPaginaFloat = cropBox.getWidth() / 2f;

            retorno.put("hqr", Float.valueOf(h < w ? h : w));

            // centro-inferior (default)
            retorno.put("eix", cropBox.getLeft(mitadPaginaFloat - mitadFirmaFloat));
            retorno.put("eiy", cropBox.getBottom(marginBottom));
            retorno.put("esx", cropBox.getLeft(mitadPaginaFloat + mitadFirmaFloat));
            retorno.put("esy", cropBox.getBottom(height + marginBottom));

            switch (pos) {
                case "centro-superior":
                    retorno.put("eiy", cropBox.getTop(height + marginTop));
                    retorno.put("esy", cropBox.getTop(marginTop));
                    break;
                case "esquina-superior-izquierda":
                    retorno.put("eix", cropBox.getLeft(marginLeft));
                    retorno.put("eiy", cropBox.getTop(height + marginTop));
                    retorno.put("esx", cropBox.getLeft(marginLeft + width));
                    retorno.put("esy", cropBox.getTop(marginTop));
                    break;
                case "esquina-superior-derecha":
                    retorno.put("eix", cropBox.getRight(marginRight + width));
                    retorno.put("eiy", cropBox.getTop(marginTop + height));
                    retorno.put("esx", cropBox.getRight(marginRight));
                    retorno.put("esy", cropBox.getTop(marginTop));
                    break;
                case "esquina-inferior-izquierda":
                    retorno.put("eix", cropBox.getLeft(marginLeft));
                    retorno.put("eiy", cropBox.getBottom(marginBottom));
                    retorno.put("esx", cropBox.getLeft(width + marginLeft));
                    retorno.put("esy", cropBox.getBottom(height + marginBottom));
                    break;
                case "esquina-inferior-derecha":
                    retorno.put("eix", cropBox.getRight(width + marginRight));
                    retorno.put("eiy", cropBox.getBottom(marginBottom + height));
                    retorno.put("esx", cropBox.getRight(marginRight));
                    retorno.put("esy", cropBox.getBottom(height + marginBottom));
                    break;
                default:
                    // Ya está el default
                    break;
            }
        }
        return retorno;
    }

    public static byte[] getImagen(Map<String,String> parametros){
        if(parametros.containsKey(FirmadorImpl.PARAM_POSICION) && parametros.get(FirmadorImpl.PARAM_POSICION) != null){
            ObjectMapper mapper = new ObjectMapper();
            try {

                Map<String, String> cp = mapper.readValue(parametros.get(FirmadorImpl.PARAM_POSICION), Map.class);

                if (cp.containsKey("imagen") && cp.get("imagen") != null) {
                    File img = new File(cp.get("imagen"));
                    if(img.isFile() && FilenameUtils.getExtension(img.getName()).equalsIgnoreCase("png")){
                        return IOUtils.toByteArray(new FileInputStream(img));
                    }
                }

            }catch(IOException e){
                return null;
            }
        }
        return null;
    }

}
