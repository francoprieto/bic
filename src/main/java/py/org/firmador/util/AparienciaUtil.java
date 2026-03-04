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
        h = h * 2;
        float height = h * 0.75f;
        Integer w = Integer.valueOf(conf.getString("firma.ancho"));
        w = w * 2;
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
                if (cp.containsKey("lugar") && !cp.get("lugar").trim().isEmpty()) {
                    pos = cp.get("lugar").trim();
                }

                if(cp.containsKey("ancho") && cp.get("ancho") != null) {
                    w = Integer.valueOf(cp.get("ancho"));
                    width = (w * 2) * 0.75f;
                }
                if(cp.containsKey("alto") && cp.get("alto") != null){
                    h = Integer.valueOf(cp.get("alto"));
                    height = (h * 2) * 0.75f;
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

            // En PDF, (0,0) está en la esquina inferior izquierda
            // Rectangle(llx, lly, urx, ury) donde:
            // llx, lly = esquina inferior izquierda
            // urx, ury = esquina superior derecha
            
            float llx, lly, urx, ury;
            
            // Obtener dimensiones de la página
            float pageWidth = cropBox.getWidth();
            float pageHeight = cropBox.getHeight();
            float pageLeft = cropBox.getLeft();
            float pageBottom = cropBox.getBottom();

            switch (pos) {
                case "centro-superior":
                    llx = pageLeft + (pageWidth - width) / 2f;
                    lly = pageBottom + pageHeight - marginTop - height;
                    urx = llx + width;
                    ury = lly + height;
                    break;
                    
                case "esquina-superior-izquierda":
                    llx = pageLeft + marginLeft;
                    lly = pageBottom + pageHeight - marginTop - height;
                    urx = llx + width;
                    ury = lly + height;
                    break;
                    
                case "esquina-superior-derecha":
                    llx = pageLeft + pageWidth - marginRight - width;
                    lly = pageBottom + pageHeight - marginTop - height;
                    urx = llx + width;
                    ury = lly + height;
                    break;
                    
                case "esquina-inferior-izquierda":
                    llx = pageLeft + marginLeft;
                    lly = pageBottom + marginBottom;
                    urx = llx + width;
                    ury = lly + height;
                    break;
                    
                case "esquina-inferior-derecha":
                    llx = pageLeft + pageWidth - marginRight - width;
                    lly = pageBottom + marginBottom;
                    urx = llx + width;
                    ury = lly + height;
                    break;
                    
                default: // centro-inferior
                    llx = pageLeft + (pageWidth - width) / 2f;
                    lly = pageBottom + marginBottom;
                    urx = llx + width;
                    ury = lly + height;
                    break;
            }
            
            retorno.put("eix", llx);
            retorno.put("eiy", lly);
            retorno.put("esx", urx);
            retorno.put("esy", ury);
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
