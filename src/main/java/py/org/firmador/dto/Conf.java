package py.org.firmador.dto;

import lombok.Data;

import java.util.List;

@Data
public class Conf {
    private Long downloadTimeout;
    private Long readTimeout;
    private List<Libs> libs;
}
