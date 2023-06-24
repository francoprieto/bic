package py.org.firmador.dto;

import lombok.Data;
import java.util.List;

@Data
public class Libs {
    private String name;
    private List<String> files;
}
