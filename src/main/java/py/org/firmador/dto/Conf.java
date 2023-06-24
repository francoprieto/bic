package py.org.firmador.dto;

import lombok.Data;

@Data
public class Conf {
    private Long downloadTimeout;
    private Long uploadTimeout;
    private Libs libs;
}
